import * as pg from 'pg'
import postgresCacheProvider from '../src'
import { promisify } from 'util'
import { promises as fs } from 'fs'
import * as path from 'path'
import { CacheItem, CacheProvider } from 'passport-saml'

const ttlMillis = 1000
const delay = (millis: number) => new Promise((resolve) => setTimeout(resolve, millis))

let pool: pg.Pool
let cache: CacheProvider
let get: (key: string) => Promise<any>
let save: (key: string, value: any) => Promise<CacheItem | null>
let remove: (key: string) => Promise<string | null>

beforeAll(async () => {
  pool = new pg.Pool({
    database: 'passport-saml-cache-postgres-unittest',
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
  })

  cache = postgresCacheProvider(pool, { ttlMillis })
  get = promisify(cache.get)
  save = promisify(cache.save)
  remove = promisify(cache.remove)

  const schema = await fs.readFile(path.join(__dirname, '../schema.sql'), 'utf-8')
  await pool.query(schema, [])
})

beforeEach(() => pool.query('DELETE FROM passport_saml_cache'))

afterAll(() => pool.end())

describe('validation', () => {
  it('throws an error if ttlMillis is not a positive integer', () => {
    expect(() => postgresCacheProvider(pool, { ttlMillis: -1 })).toThrowError('ttlMillis must be a positive integer')
    expect(() => postgresCacheProvider(pool, { ttlMillis: 1.5 })).toThrowError('ttlMillis must be a positive integer')
  })
})

describe('get()', () => {
  it('returns null if key does not exist', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const value = await get('key')
    return expect(value).toBeNull()
  })

  it('returns the value if key exists', async () => {
    await save('key', 'val')
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const value = await promisify(cache.get)('key')
    expect(value).toBe('val')
  })
})

describe('save()', () => {
  it('returns the new value & timestamp if key does not exist', async () => {
    const value = { foo: 'bar' }
    const result = await promisify(cache.save)('key', value)
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.value).toBe(value)
  })

  it('throws an error if key already exists', async () => {
    await save('key', 'val1')
    return expect(save('key', 'val2')).rejects.toThrow(
      new Error('duplicate key value violates unique constraint "passport_saml_cache_pkey"')
    )
  })
})

describe('remove()', () => {
  it('returns null if key does not exist', async () => {
    const result = await remove('key')
    expect(result).toBeNull()
  })

  it('returns the key if it existed', async () => {
    await save('key', 'val')
    const result = await remove('key')
    expect(result).toBe('key')
  })
})

describe('expiration', () => {
  it('deletes expired key automatically', async () => {
    await save('key', 'val')
    await delay(ttlMillis * 2)
    expect(await get('key')).toBeNull()
  })
})

describe('error handling', () => {
  it('calls the callback with an error object if an error occurs', async () => {
    const mockPool = {
      query: jest.fn((query: string, values: any[], callback?: (err: Error | null, result: any) => void) => {
        if (!callback) {
          // Promise API
          return Promise.reject('Boom!')
        } else {
          callback(new Error('Boom!'), null)
        }
      }),
    }
    const cache = postgresCacheProvider((mockPool as any) as pg.Pool)

    await expect(promisify(cache.get)('key')).rejects.toThrow(new Error('Boom!'))
    await expect(promisify(cache.save)('key', 'value')).rejects.toThrow(new Error('Boom!'))
    await expect(promisify(cache.remove)('key')).rejects.toThrow(new Error('Boom!'))
  })
})

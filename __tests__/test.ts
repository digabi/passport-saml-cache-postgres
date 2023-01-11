import * as pg from 'pg'
import postgresCacheProvider, { PostgresCacheProvider } from '../src'
import { promisify } from 'util'
import { promises as fs } from 'fs'
import * as path from 'path'
import { CacheItem } from 'passport-saml'

const ttlMillis = 1000
const delay = promisify(setTimeout)

let pool: pg.Pool
let cache: PostgresCacheProvider
let get: (key: string) => Promise<any>
let save: (key: string, value: any) => Promise<CacheItem | null>
let remove: (key: string) => Promise<string | null>

beforeAll(async () => {
  pool = new pg.Pool({
    database: 'passport-saml-cache-postgres-unittest',
  })

  const schema = await fs.readFile(path.join(__dirname, '../schema.sql'), 'utf-8')
  await pool.query(schema, [])
})

afterAll(() => pool.end())

beforeEach(async () => {
  await pool.query('DELETE FROM passport_saml_cache')

  cache = postgresCacheProvider(pool, { ttlMillis })
  remove = promisify(cache.remove)
  get = promisify(cache.get)
  save = promisify(cache.save)
})

afterEach(() => cache.close())

describe('validation', () => {
  it('throws an error if ttlMillis is not a positive integer', () => {
    expect(() => postgresCacheProvider(pool, { ttlMillis: -1 })).toThrowError('ttlMillis must be a positive integer')
    expect(() => postgresCacheProvider(pool, { ttlMillis: 1.5 })).toThrowError('ttlMillis must be a positive integer')
  })
})

describe('get()', () => {
  it('returns null if key does not exist', async () => expect(await get('key')).toBeNull())

  it('returns the value if key exists', async () => {
    await save('key', 'val')
    expect(await get('key')).toBe('val')
  })
})

describe('save()', () => {
  it('returns the new value & timestamp if key does not exist', async () => {
    const result = await save('key', 'val')
    expect(result?.createdAt).toBeInstanceOf(Date)
    expect(result?.value).toBe('val')
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
    expect(await remove('key')).toBeNull()
  })

  it('returns the key if it existed', async () => {
    await save('key', 'val')
    expect(await remove('key')).toBe('key')
    expect(await remove('key')).toBeNull()
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
      query: jest.fn(() => Promise.reject(new Error('Boom!'))),
    }

    const cache = postgresCacheProvider(mockPool as any, { ttlMillis })

    const error = new Error('Boom!')
    await expect(promisify(cache.get)('key')).rejects.toThrow(error)
    await expect(promisify(cache.save)('key', 'value')).rejects.toThrow(error)
    await expect(promisify(cache.remove)('key')).rejects.toThrow(error)

    await delay(ttlMillis * 2) // Wait a bit. The cleanup job error should fire as well.
    cache.close()
  })
})

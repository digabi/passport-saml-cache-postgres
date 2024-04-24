import * as pg from 'pg'
import postgresCacheProvider, { PostgresCacheProvider } from '../src'
import { promisify } from 'util'
import { promises as fs } from 'fs'
import * as path from 'path'

const ttlMillis = 1000
const delay = promisify(setTimeout)

let pool: pg.Pool
let cache: PostgresCacheProvider

beforeAll(async () => {
  pool = new pg.Pool({
    database: 'passport-saml-cache-postgres-unittest',
  })

  const schema = await fs.readFile(path.join(__dirname, '../schema.sql'), 'utf-8')
  await pool.query(schema)
})

afterAll(() => pool.end())

beforeEach(async () => {
  await pool.query('DELETE FROM passport_saml_cache')

  cache = postgresCacheProvider(pool, { ttlMillis })
})

afterEach(() => cache.close())

describe('validation', () => {
  it('throws an error if ttlMillis is not a positive integer', () => {
    expect(() => postgresCacheProvider(pool, { ttlMillis: -1 })).toThrowError('ttlMillis must be a positive integer')
    expect(() => postgresCacheProvider(pool, { ttlMillis: 1.5 })).toThrowError('ttlMillis must be a positive integer')
  })
})

describe('get()', () => {
  it('returns null if key does not exist', async () => expect(await cache.getAsync('key')).toBeNull())

  it('returns the value if key exists', async () => {
    await cache.saveAsync('key', 'val')
    expect(await cache.getAsync('key')).toBe('val')
  })
})

describe('save()', () => {
  it('returns the new value & timestamp if key does not exist', async () => {
    const result = await cache.saveAsync('_a823a9884699d6a26a8ad2d1f013f6bdf3f6c226', 'val')
    expect(result?.createdAt).not.toBeGreaterThan(new Date().getTime())
    expect(result?.value).toBe('val')
  })

  it('throws an error if key already exists', async () => {
    await cache.saveAsync('key', 'val1')
    return expect(cache.saveAsync('key', 'val2')).rejects.toThrow(
      new Error('duplicate key value violates unique constraint "passport_saml_cache_pkey"'),
    )
  })
})

describe('remove()', () => {
  it('returns null if key does not exist', async () => {
    expect(await cache.removeAsync('key')).toBeNull()
  })

  it('returns the key if it existed', async () => {
    await cache.saveAsync('key', 'val')
    expect(await cache.removeAsync('key')).toBe('key')
    expect(await cache.removeAsync('key')).toBeNull()
  })
})

describe('expiration', () => {
  it('deletes expired key automatically', async () => {
    await cache.saveAsync('key', 'val')
    await delay(ttlMillis * 2)
    expect(await cache.getAsync('key')).toBeNull()
  })
})

describe('error handling', () => {
  it('calls the callback with an error object if an error occurs', async () => {
    const mockPool = {
      query: jest.fn(() => Promise.reject(new Error('Boom!'))),
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const cache = postgresCacheProvider(mockPool as any, { ttlMillis })

    const error = new Error('Boom!')
    await expect(cache.getAsync('key')).rejects.toThrow(error)
    await expect(cache.saveAsync('key', 'value')).rejects.toThrow(error)
    await expect(cache.removeAsync('key')).rejects.toThrow(error)

    await delay(ttlMillis * 2) // Wait a bit. The cleanup job error should fire as well.
    cache.close()
  })
})

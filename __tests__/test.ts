import * as pg from 'pg'
import postgresCacheProvider from '../src'
import { promisify } from 'util'
import { promises as fs } from 'fs'
import * as path from 'path'
import { CacheItem, CacheProvider } from 'passport-saml'
import childProcess from 'child_process'

const ttlMillis = 1000
const exec = promisify(childProcess.exec)
const delay = (millis: number) => new Promise((resolve) => setTimeout(resolve, millis))

let pool: pg.Pool
let cache: CacheProvider
let get: (key: string) => Promise<any>
let save: (key: string, value: any) => Promise<CacheItem | null>
let remove: (key: string) => Promise<string | null>

beforeAll(async () => {
  await exec('createdb passport-saml-cache-postgres-unittest || true')

  pool = new pg.Pool({ database: 'passport-saml-cache-postgres-unittest' })
  cache = postgresCacheProvider(pool, { ttlMillis })
  get = promisify(cache.get)
  save = promisify(cache.save)
  remove = promisify(cache.remove)

  const schema = await fs.readFile(path.join(__dirname, '../schema.sql'), 'utf-8')
  await pool.query(schema, [])
})

beforeEach(() => pool.query('DELETE FROM passport_saml_cache'))

afterAll(() => pool.end())

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

  it('does nothing and returns null if key exists', async () => {
    // First save
    await save('key', 'val1')
    // Second save
    const result = await save('key', 'val2')
    expect(result).toBeNull()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const value = await get('key')
    expect(value).toBe('val1')
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
    // T = 0
    await save('key1', 'val1')

    // T = 0.5
    await delay(ttlMillis / 2)

    expect(await get('key1')).toBe('val1')
    expect(await get('key2')).toBeNull()
    await save('key2', 'val2')

    // T = 1.5
    await delay(ttlMillis)

    expect(await get('key1')).toBeNull()
    expect(await get('key2')).toBe('val2')
  })
})

import * as assert from 'assert'
import type { CacheItem, CacheProvider } from 'passport-saml'
import type { Pool } from 'pg'

export interface Logger {
  info: (message: string) => void
  error: (message: string, err: Error) => void
}
export interface Options {
  /**
   * The maximum age of a cache entry in milliseconds. Entries older than this are deleted automatically.
   * A scheduled job deletes old cache entries every `ttlMillis` milliseconds.
   *
   * Default value: 1 hour.
   */
  ttlMillis?: number
  /** A logger to use. By default, messages are logged to console. */
  logger?: Logger
}

const defaultOptions: Required<Options> = {
  ttlMillis: 1000 * 60 * 60,
  logger: console,
}

export interface PostgresCacheProvider extends CacheProvider {
  /** Close the cache. This stops the scheduled job that deletes old cache entries. */
  close: () => void
}

/** Create a new PostgreSQL cache provider for passport-saml. */
export default function postgresCacheProvider(pool: Pool, options?: Options): PostgresCacheProvider {
  const { ttlMillis, logger } = { ...defaultOptions, ...options }

  assert.ok(Number.isInteger(ttlMillis) && ttlMillis > 0, 'ttlMillis must be a positive integer')

  const interval = setInterval(() => {
    pool
      .query(`DELETE FROM passport_saml_cache WHERE created_at < now() - $1 * interval '1 milliseconds'`, [ttlMillis])
      .then(({ rowCount }) => logger.info(`passport-saml-cache-postgres: Deleted ${rowCount} stale cache entries`))
      .catch((err) => logger.error('passport-saml-cache-postgres: ', err as Error))
  }, ttlMillis).unref()

  return {
    get(key, callback) {
      pool
        .query<{ value: any }>('SELECT value FROM passport_saml_cache WHERE key = $1', [key])
        .then((result) => callback(null, result.rows[0]?.value ?? null))
        .catch((err) => callback(err as Error, null))
    },
    save(key, value, callback) {
      pool
        .query<{ created_at: Date }>(
          'INSERT INTO passport_saml_cache (key, value) VALUES ($1, $2) RETURNING created_at',
          [key, JSON.stringify(value)],
        )
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        .then((result) => callback(null, { createdAt: result.rows[0].created_at, value }))
        .catch((err) => callback(err as Error, null as unknown as CacheItem))
    },
    remove(key, callback) {
      pool
        .query<{ key: string }>('DELETE FROM passport_saml_cache WHERE key = $1 RETURNING key', [key])
        .then((result) => callback(null, result.rows[0]?.key ?? null))
        .catch((err) => callback(err as Error, ''))
    },
    close() {
      clearInterval(interval)
    },
  }
}

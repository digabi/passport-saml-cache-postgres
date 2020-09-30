import * as assert from 'assert'
import type { CacheProvider, CacheItem } from 'passport-saml'
import type { Pool } from 'pg'

export interface Options {
  /**
   * The maximum age of a cache entry in milliseconds. Entries older than this are deleted automatically.
   * A scheduled job deletes old cache entries every `ttlMillis` milliseconds.
   *
   * Default value: 1 hour.
   */
  ttlMillis?: number
}

const defaultOptions: Required<Options> = {
  ttlMillis: 1000 * 60 * 60,
}

/** Create a new PostgreSQL cache provider for passport-saml. */
export default function postgresCacheProvider(pool: Pool, options?: Options): CacheProvider {
  const { ttlMillis } = { ...defaultOptions, ...options }

  assert.ok(Number.isInteger(ttlMillis) && ttlMillis > 0, 'ttlMillis must be a positive integer')

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const noop = () => {}
  const timeout = setInterval(() => {
    pool
      .query(`DELETE FROM passport_saml_cache WHERE created_at < now() - $1 * interval '1 milliseconds'`, [ttlMillis])
      .then(noop)
      .catch(console.error)
  }, ttlMillis)
  timeout.unref() // Do not prevent Node from shutting down.

  return {
    get(key, callback) {
      pool.query<{ value: any }>('SELECT value FROM passport_saml_cache WHERE key = $1', [key], (err, result) => {
        if (err) {
          callback(err, null)
        } else {
          callback(null, result.rows[0]?.value ?? null)
        }
      })
    },
    save(key, value, callback) {
      pool.query<{ created_at: Date }>(
        'INSERT INTO passport_saml_cache (key, value) VALUES ($1, $2) RETURNING created_at',
        [key, JSON.stringify(value)],
        (err, result) => {
          if (err) {
            callback(err, (null as any) as CacheItem)
          } else {
            const createdAt = result.rows[0].created_at
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            callback(null, { createdAt, value })
          }
        }
      )
    },
    remove(key, callback) {
      pool.query<{ key: string }>(
        'DELETE FROM passport_saml_cache WHERE key = $1 RETURNING key',
        [key],
        (err, result) => {
          if (err) {
            callback(err, (null as any) as string)
          } else {
            callback(null, result.rows[0]?.key ?? null)
          }
        }
      )
    },
  }
}

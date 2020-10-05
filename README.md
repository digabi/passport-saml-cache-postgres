# passport-saml-cache-postgres

![CI](https://github.com/digabi/passport-saml-cache-postgres/workflows/CI/badge.svg)

A PostgreSQL-backed cache provider for [passport-saml](https://github.com/node-saml/passport-saml).

## Usage

```
$ npm install passport-saml-cache-postgres
```

Create a `passport_saml_cache` table in your database. The default schema can be found in [schema.sql](schema.sql).

```typescript
import { Strategy as SamlStrategy } from 'passport-saml'
import postgresCacheProvider from 'passport-saml-cache-postgres'

passport.use(new SamlStrategy({
    ... other passport-saml options,
    cacheProvider: postgresCacheProvider(pool) // A pg.Pool object
}))
```

## Configuration

The `postgresCacheProvider` function accepts an optional second argument. The default options are as follows:

```typescript
postgresCacheProvider(pool, {
  // The maximum age of a cache entry in milliseconds. Entries older than this are deleted automatically.
  // A scheduled job deletes old cache entries every `ttlMillis` milliseconds.
  ttlMillis: 1000 * 60 * 60, // 1 hour,
  // A logger to use. By default, messages are logged to console.
  // The logger should support at least `logger.info()` and `logger.error()` methods.
  logger: console,
})
```

## Closing the cache

The cache can be closed by calling the `.close()`-method. This stops the
scheduled job that periodically clears stale cache entries.

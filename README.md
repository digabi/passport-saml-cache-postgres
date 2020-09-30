# @digabi/passport-saml-cache-postgres

A PostgreSQL-backed cache provider for [passport-saml](https://github.com/node-saml/passport-saml)

## Usage

Create a `passport_saml_cache` table in your database. The default schema can be found in [schema.sql](schema.sql).

```typescript
import { Strategy as SamlStrategy } from 'passport-saml'
import postgresCacheProvider from 'passport-saml-cache-postgres'

passport.use(new SamlStrategy({
    ... other passport-saml options,
    cacheProvider: postgresCacheProvider(pool)
}))
```

CREATE TABLE IF NOT EXISTS passport_saml_cache (
  key varchar(255) PRIMARY KEY,
  value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)
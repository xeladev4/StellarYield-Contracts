CREATE TABLE IF NOT EXISTS api_keys (
  id         SERIAL PRIMARY KEY,
  key_hash   TEXT NOT NULL UNIQUE,
  role       TEXT NOT NULL DEFAULT 'admin',
  label      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

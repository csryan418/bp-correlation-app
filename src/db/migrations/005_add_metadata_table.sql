-- Key/value store for server-managed state (e.g. last sync timestamps)
CREATE TABLE IF NOT EXISTS metadata (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

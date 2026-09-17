-- postgres-schema.sql — schema Postgres per FASE 2 (futura, non attiva).
--
-- Stessa forma degli altri backend: store KV con collection/key/value, dove
-- value è un oggetto JSON (qui JSONB per query/indici GIN opzionali).
-- NON installare `pg` finché resta in uso l'API sincrona di store.js: il
-- driver Postgres è solo asincrono e richiederà storeAsync.js (vedi commento
-- FASE 2 in src/database/store.js). Env futura: DATABASE_URL=postgres://...
--
-- Applicazione: psql "$DATABASE_URL" -f src/database/postgres-schema.sql

CREATE TABLE IF NOT EXISTS kv (
  collection TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, key)
);

-- Lookup per collection (equivale a collection(name).all()).
CREATE INDEX IF NOT EXISTS idx_kv_collection ON kv (collection);

-- Ricerca dentro i valori JSON (opzionale; utile per leaderboard/filtri).
-- Esempio: SELECT key, value FROM kv WHERE collection = 'economy'
--          AND (value->>'balance')::bigint > 1000;
CREATE INDEX IF NOT EXISTS idx_kv_value_gin ON kv USING GIN (value);

-- Mantiene updated_at aggiornato sulle scritture (contatori/merge frequenti).
CREATE OR REPLACE FUNCTION kv_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_kv_touch ON kv;
CREATE TRIGGER trg_kv_touch
  BEFORE UPDATE ON kv
  FOR EACH ROW
  EXECUTE FUNCTION kv_touch_updated_at();

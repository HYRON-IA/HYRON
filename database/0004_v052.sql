-- HYRON 0.5.2: private cloud voice library
CREATE TABLE IF NOT EXISTS voice_models (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('rvc','piper')),
 model_name TEXT NOT NULL,
 support_name TEXT NOT NULL,
 model_bytes INTEGER NOT NULL DEFAULT 0,
 support_bytes INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready')),
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_voice_models_user ON voice_models(user_id,created_at DESC);

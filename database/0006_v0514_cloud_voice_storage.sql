-- HYRON v0.5.14: Cloud model binaries (Hugging Face private Storage Bucket).
-- Apply once AFTER database/0005_v0513_voice_library.sql.
-- Objects are addressed by opaque generated keys; metadata in D1 only.
CREATE TABLE IF NOT EXISTS voice_cloud_files (
  voice_id TEXT NOT NULL REFERENCES voice_models(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  part TEXT NOT NULL CHECK(part IN ('model','support','preview')),
  object_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK(length(sha256)=64),
  bytes INTEGER NOT NULL CHECK(bytes>=1 AND bytes<=104857600),
  content_type TEXT NOT NULL CHECK(content_type IN ('application/octet-stream','audio/wav')),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','ready')),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  verified_at INTEGER,
  PRIMARY KEY (voice_id,part)
);
CREATE INDEX IF NOT EXISTS idx_voice_cloud_owner ON voice_cloud_files(user_id,voice_id,state);

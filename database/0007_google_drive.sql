-- HYRON_GOOGLE_DRIVE_V063B: vínculos individuais. Os tokens são criptografados no Worker.
CREATE TABLE IF NOT EXISTS google_drive_connections (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 refresh_token_enc TEXT NOT NULL,
 access_token_enc TEXT,
 expires_at INTEGER NOT NULL,
 folder_id TEXT
);
CREATE TABLE IF NOT EXISTS google_drive_oauth (
 state_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 code_verifier TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS google_drive_uploads (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_url TEXT NOT NULL,
 size INTEGER NOT NULL,
 uploaded INTEGER NOT NULL DEFAULT 0,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS google_drive_upload_user ON google_drive_uploads(user_id);

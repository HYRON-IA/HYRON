-- CAPS v4.7: evento vinculado à mensagem, escopo limitado ao autor.
CREATE TABLE IF NOT EXISTS caps_experiences (
 id TEXT PRIMARY KEY,
 owner_user_id TEXT NOT NULL,
 interno_id TEXT NOT NULL,
 source_message_id TEXT NOT NULL UNIQUE,
 source_group_id TEXT NOT NULL,
 author_id TEXT NOT NULL,
 event_type TEXT NOT NULL,
 event_value TEXT NOT NULL,
 evidence_text TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_caps_experiences_owner_bot
 ON caps_experiences(owner_user_id,interno_id,created_at DESC);

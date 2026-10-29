-- HYRON v0.8.3 - Ala Coletiva: fase 2 (mensagens de texto)
CREATE TABLE IF NOT EXISTS hyron_group_messages (
 id TEXT PRIMARY KEY,
 group_id TEXT NOT NULL REFERENCES hyron_groups(id) ON DELETE CASCADE,
 sender_id TEXT NOT NULL REFERENCES users(id),
 content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 4000),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_hyron_group_messages_group_time ON hyron_group_messages(group_id,created_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS hyron_group_reads (
 group_id TEXT NOT NULL REFERENCES hyron_groups(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 last_read_at TEXT NOT NULL,
 PRIMARY KEY(group_id,user_id)
);

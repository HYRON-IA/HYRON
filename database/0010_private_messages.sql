-- HYRON 0.8.2 - Linha Direta
CREATE TABLE IF NOT EXISTS hyron_dm_threads (
 id TEXT PRIMARY KEY,
 user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 last_message_at TEXT NOT NULL DEFAULT (datetime('now')),
 CHECK(user_a <> user_b),
 CHECK(user_a < user_b),
 UNIQUE(user_a,user_b)
);
CREATE INDEX IF NOT EXISTS idx_hyron_dm_threads_a ON hyron_dm_threads(user_a,last_message_at);
CREATE INDEX IF NOT EXISTS idx_hyron_dm_threads_b ON hyron_dm_threads(user_b,last_message_at);
CREATE TABLE IF NOT EXISTS hyron_dm_messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 thread_id TEXT NOT NULL REFERENCES hyron_dm_threads(id) ON DELETE CASCADE,
 sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 4000),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_hyron_dm_messages_thread ON hyron_dm_messages(thread_id,id DESC);
CREATE INDEX IF NOT EXISTS idx_hyron_dm_unread ON hyron_dm_messages(thread_id,sender_id,read_at);

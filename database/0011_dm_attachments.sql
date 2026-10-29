-- HYRON 0.8.2 - Linha Direta multimidia. Aplicar apos 0010_private_messages.sql.
CREATE TABLE IF NOT EXISTS hyron_dm_attachments (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 message_id INTEGER NOT NULL REFERENCES hyron_dm_messages(id) ON DELETE CASCADE,
 thread_id TEXT NOT NULL REFERENCES hyron_dm_threads(id) ON DELETE CASCADE,
 sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 file_id TEXT NOT NULL,
 name TEXT NOT NULL,
 mime TEXT NOT NULL,
 size INTEGER NOT NULL CHECK(size>0 AND size<=104857600),
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_hyron_dm_attachments_msg ON hyron_dm_attachments(message_id);

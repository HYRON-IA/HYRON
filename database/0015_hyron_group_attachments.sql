-- HYRON 0.8.3 - anexos privados da Ala Coletiva. Rodar depois de 0014.
CREATE TABLE IF NOT EXISTS hyron_group_attachments (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 message_id TEXT NOT NULL REFERENCES hyron_group_messages(id) ON DELETE CASCADE,
 group_id TEXT NOT NULL REFERENCES hyron_groups(id) ON DELETE CASCADE,
 sender_id TEXT NOT NULL REFERENCES users(id),
 file_id TEXT NOT NULL,
 name TEXT NOT NULL,
 mime TEXT NOT NULL,
 size INTEGER NOT NULL CHECK(size>0 AND size<=104857600),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_hyron_group_attach_message ON hyron_group_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_hyron_group_attach_group ON hyron_group_attachments(group_id);

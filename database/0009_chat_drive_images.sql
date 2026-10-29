CREATE TABLE IF NOT EXISTS hyron_chat_drive_images (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
 drive_file_id TEXT NOT NULL,
 name TEXT NOT NULL,
 mime TEXT NOT NULL,
 size INTEGER NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 PRIMARY KEY(user_id,message_id,drive_file_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_drive_images_user ON hyron_chat_drive_images(user_id,message_id);

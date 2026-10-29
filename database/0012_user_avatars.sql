-- HYRON 0.8.3: um avatar JPEG por conta (foto pequena e compactada)
CREATE TABLE IF NOT EXISTS hyron_user_avatars (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 jpeg_base64 TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

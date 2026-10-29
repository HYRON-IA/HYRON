-- HYRON v0.8.3 - Ala Coletiva fase 1 (grupos privados)
CREATE TABLE IF NOT EXISTS hyron_groups (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL CHECK(length(name) BETWEEN 3 AND 64),
 description TEXT NOT NULL DEFAULT '' CHECK(length(description)<=500),
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 jpeg_base64 TEXT,
 CHECK(jpeg_base64 IS NULL OR length(jpeg_base64)<=130000)
);
CREATE TABLE IF NOT EXISTS hyron_group_members (
 group_id TEXT NOT NULL REFERENCES hyron_groups(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin','member')),
 joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(group_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_hyron_group_members_user ON hyron_group_members(user_id,group_id);

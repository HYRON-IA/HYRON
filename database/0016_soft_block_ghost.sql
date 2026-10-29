-- HYRON v0.8.3 - Protocolo Fantasma: apenas admin geral
CREATE TABLE IF NOT EXISTS hyron_ghost_blocks (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 reason TEXT NOT NULL DEFAULT '',
 changed_by TEXT NOT NULL REFERENCES users(id),
 changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS hyron_ghost_audit (
 id TEXT PRIMARY KEY,
 actor_id TEXT NOT NULL,
 target_id TEXT NOT NULL,
 enabled INTEGER NOT NULL,
 reason TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_hyron_ghost_audit_target ON hyron_ghost_audit(target_id,created_at);

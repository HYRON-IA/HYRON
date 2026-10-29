-- HYRON fase 4: auditoria administrativa append-only pela API
CREATE TABLE IF NOT EXISTS hyron_admin_events (
 id TEXT PRIMARY KEY,
 actor_id TEXT NOT NULL REFERENCES users(id),
 action TEXT NOT NULL,
 target_type TEXT NOT NULL,
 target_id TEXT NOT NULL,
 details TEXT NOT NULL DEFAULT '{}',
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_hyron_admin_events_created ON hyron_admin_events(created_at DESC);

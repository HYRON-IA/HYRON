-- HYRON V-0.5.0: auditoria de mudanças de permissões. Não apaga dados existentes.
CREATE TABLE IF NOT EXISTS admin_audit (
 id TEXT PRIMARY KEY,
 actor_id TEXT NOT NULL,
 target_id TEXT NOT NULL,
 old_role TEXT NOT NULL CHECK(old_role IN ('admin','user')),
 new_role TEXT NOT NULL CHECK(new_role IN ('admin','user')),
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit(target_id,created_at);

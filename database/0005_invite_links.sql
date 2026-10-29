-- HYRON: convite por link, usuário pré-definido pelo administrador.
CREATE TABLE IF NOT EXISTS invite_links (
 token_hash TEXT PRIMARY KEY,
 username TEXT NOT NULL COLLATE NOCASE,
 created_by TEXT NOT NULL REFERENCES users(id),
 expires_at INTEGER NOT NULL,
 used_by TEXT REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invite_links_expires ON invite_links(expires_at);
CREATE INDEX IF NOT EXISTS idx_invite_links_username ON invite_links(username);

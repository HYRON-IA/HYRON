-- HYRON 0.8.5 - Surto Coletivo. Execute antes da instalacao do codigo.
CREATE TABLE IF NOT EXISTS hyron_surto_settings (
 group_id TEXT PRIMARY KEY REFERENCES hyron_groups(id) ON DELETE CASCADE,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 interval_n INTEGER NOT NULL DEFAULT 5 CHECK(interval_n BETWEEN 2 AND 100),
 max_replies INTEGER NOT NULL DEFAULT 4 CHECK(max_replies BETWEEN 1 AND 8),
 chance_percent INTEGER NOT NULL DEFAULT 50 CHECK(chance_percent BETWEEN 0 AND 100)
);
CREATE TABLE IF NOT EXISTS hyron_surto_claims (
 group_id TEXT NOT NULL REFERENCES hyron_groups(id) ON DELETE CASCADE,
 milestone INTEGER NOT NULL,
 claimed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(group_id,milestone)
);

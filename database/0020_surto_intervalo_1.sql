-- HYRON 0.8.5 - permite N=1 mantendo as configuracoes por grupo.
-- Recria apenas hyron_surto_settings porque SQLite nao altera CHECK diretamente.
CREATE TABLE hyron_surto_settings_new (
 group_id TEXT PRIMARY KEY REFERENCES hyron_groups(id) ON DELETE CASCADE,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 interval_n INTEGER NOT NULL DEFAULT 5 CHECK(interval_n BETWEEN 1 AND 100),
 max_replies INTEGER NOT NULL DEFAULT 4 CHECK(max_replies BETWEEN 1 AND 8),
 chance_percent INTEGER NOT NULL DEFAULT 50 CHECK(chance_percent BETWEEN 0 AND 100)
);
INSERT INTO hyron_surto_settings_new (group_id,enabled,interval_n,max_replies,chance_percent)
 SELECT group_id,enabled,interval_n,max_replies,chance_percent FROM hyron_surto_settings;
DROP TABLE hyron_surto_settings;
ALTER TABLE hyron_surto_settings_new RENAME TO hyron_surto_settings;
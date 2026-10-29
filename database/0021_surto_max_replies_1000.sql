-- HYRON v0.8.5: permitir ate 1000 respostas por debate.
-- Executar uma unica vez no D1 depois do backup remoto.
-- Compativel com o banco inicial (N >= 2) e a migracao 0020 (N >= 1).
-- O limite de N passa a aceitar 1..100 (requer o patch intervalo-1 no codigo).
CREATE TABLE hyron_surto_settings_v085_1000 (
 group_id TEXT PRIMARY KEY REFERENCES hyron_groups(id) ON DELETE CASCADE,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 interval_n INTEGER NOT NULL DEFAULT 5 CHECK(interval_n BETWEEN 1 AND 100),
 max_replies INTEGER NOT NULL DEFAULT 4 CHECK(max_replies BETWEEN 1 AND 1000),
 chance_percent INTEGER NOT NULL DEFAULT 50 CHECK(chance_percent BETWEEN 0 AND 100)
);
INSERT INTO hyron_surto_settings_v085_1000 (group_id,enabled,interval_n,max_replies,chance_percent)
 SELECT group_id,enabled,interval_n,max_replies,chance_percent FROM hyron_surto_settings;
DROP TABLE hyron_surto_settings;
ALTER TABLE hyron_surto_settings_v085_1000 RENAME TO hyron_surto_settings;
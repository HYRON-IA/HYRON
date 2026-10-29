-- CAPS v4.3. Persistencia individual: alteracoes so via processos autorizados.
CREATE TABLE IF NOT EXISTS hyron_interno_preferences (
  personality_id TEXT NOT NULL CHECK (personality_id IN ('basilisco','bicuco','garra-de-prata','bunga')),
  category TEXT NOT NULL,
  preference_key TEXT NOT NULL,
  preference_value TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'creator' CHECK (origin IN ('creator','confirmed')),
  is_locked INTEGER NOT NULL DEFAULT 0 CHECK (is_locked IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (personality_id,category,preference_key)
);
-- Clubes definidos sao tambem fixados no prompt; registro D1 facilita auditoria futura.
INSERT OR IGNORE INTO hyron_interno_preferences
(personality_id,category,preference_key,preference_value,origin,is_locked)
VALUES
('bicuco','sports','football_team','Corinthians','creator',1),
('garra-de-prata','sports','football_team','Corinthians','creator',1);

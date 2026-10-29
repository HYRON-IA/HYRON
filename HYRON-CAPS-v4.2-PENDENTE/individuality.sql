-- Proposta de tabela adicional para Cloudflare D1. NÃO executar até validar schema atual.
CREATE TABLE IF NOT EXISTS personality_preferences (
  personality_id TEXT NOT NULL,
  category TEXT NOT NULL,
  preference_key TEXT NOT NULL,
  preference_value TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'developed',
  locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(personality_id, category, preference_key)
);
INSERT INTO personality_preferences(personality_id, category, preference_key, preference_value, source, locked)
VALUES
('garra_de_prata', 'sports', 'football_team', 'Corinthians', 'creator', 1),
('bicuco', 'sports', 'football_team', 'Corinthians', 'creator', 1)
ON CONFLICT(personality_id, category, preference_key) DO NOTHING;
-- Sem registro de clube para basilisco e bunga. Não significa que não gostem de futebol.

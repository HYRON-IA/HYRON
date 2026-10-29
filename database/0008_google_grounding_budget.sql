-- HYRON v0.6.8b - Contador global/atomico de tentativas de Grounding por dia (UTC).
-- Nao guarda pesquisas, usuarios, prompts nem credenciais.
CREATE TABLE IF NOT EXISTS hyron_google_grounding_daily (
  day TEXT PRIMARY KEY NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts >= 0)
);

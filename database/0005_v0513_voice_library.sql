-- HYRON 0.5.13: synchronized voice metadata; model files remain device-local.
ALTER TABLE voice_models ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE voice_models ADD COLUMN language TEXT NOT NULL DEFAULT 'pt-BR';
ALTER TABLE voice_models ADD COLUMN architecture TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE voice_models ADD COLUMN sample_rate INTEGER NOT NULL DEFAULT 0;
ALTER TABLE voice_models ADD COLUMN model_sha256 TEXT;
ALTER TABLE voice_models ADD COLUMN support_sha256 TEXT;
ALTER TABLE voice_models ADD COLUMN compatibility TEXT NOT NULL DEFAULT '["windows","android","web"]';
ALTER TABLE voice_models ADD COLUMN selected INTEGER NOT NULL DEFAULT 0 CHECK(selected IN (0,1));
ALTER TABLE voice_models ADD COLUMN preview_name TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_models_one_selected
  ON voice_models(user_id) WHERE selected = 1;

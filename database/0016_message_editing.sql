-- HYRON 0.8.4 - edição de mensagens
ALTER TABLE hyron_dm_messages ADD COLUMN edited_at TEXT;
ALTER TABLE hyron_group_messages ADD COLUMN edited_at TEXT;

-- HYRON 0.8.4 Fase 2: quatro identidades virtuais sem acesso a login.
-- EXECUTAR MANUALMENTE APOS BACKUP DO D1.
INSERT OR IGNORE INTO users(id,username,password_hash,salt,role,disabled) VALUES('a8400000-0000-4000-8000-000000000001','Basilisco','!NO_LOGIN_BOT!','!NO_LOGIN_BOT!','user',0);
INSERT OR IGNORE INTO users(id,username,password_hash,salt,role,disabled) VALUES('a8400000-0000-4000-8000-000000000002','Bicuco','!NO_LOGIN_BOT!','!NO_LOGIN_BOT!','user',0);
INSERT OR IGNORE INTO users(id,username,password_hash,salt,role,disabled) VALUES('a8400000-0000-4000-8000-000000000003','GarraDePrata','!NO_LOGIN_BOT!','!NO_LOGIN_BOT!','user',0);
INSERT OR IGNORE INTO users(id,username,password_hash,salt,role,disabled) VALUES('a8400000-0000-4000-8000-000000000004','Bunga','!NO_LOGIN_BOT!','!NO_LOGIN_BOT!','user',0);

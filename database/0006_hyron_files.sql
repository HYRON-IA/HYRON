-- HYRON 0.6.3: metadados de anexos privados no R2; sem alterar tabelas existentes.
CREATE TABLE IF NOT EXISTS hyron_files (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 name TEXT NOT NULL,
 size INTEGER NOT NULL,
 mime TEXT NOT NULL,
 r2_key TEXT NOT NULL UNIQUE,
 upload_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','ready')),
 created_at INTEGER NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS hyron_files_user_status ON hyron_files(user_id,status,created_at);
CREATE TABLE IF NOT EXISTS hyron_file_parts (
 file_id TEXT NOT NULL,
 part_number INTEGER NOT NULL,
 etag TEXT NOT NULL,
 PRIMARY KEY(file_id,part_number),
 FOREIGN KEY(file_id) REFERENCES hyron_files(id) ON DELETE CASCADE
);

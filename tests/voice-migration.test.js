import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { equal, ok } from "node:assert/strict";

test("v0.5.13 D1 migration preserves existing voices and enforces one default", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE users (id TEXT PRIMARY KEY);
      INSERT INTO users (id) VALUES ('user-1');
      CREATE TABLE voice_models (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('rvc','piper')),
        model_name TEXT NOT NULL,
        support_name TEXT NOT NULL,
        model_bytes INTEGER NOT NULL DEFAULT 0,
        support_bytes INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready')),
        created_at INTEGER NOT NULL
      );
      INSERT INTO voice_models
        (id,user_id,name,kind,model_name,support_name,status,created_at)
        VALUES ('voice-1','user-1','Legacy','piper','old.onnx','old.onnx.json','ready',1);
    `);
    db.exec(await readFile(new URL("../database/0005_v0513_voice_library.sql", import.meta.url), "utf8"));

    const migrated = db.prepare("SELECT * FROM voice_models WHERE id='voice-1'").get();
    equal(migrated.name, "Legacy");
    equal(migrated.architecture, "legacy");
    equal(migrated.selected, 0);
    ok(migrated.compatibility.includes("windows"));
    db.prepare("UPDATE voice_models SET selected=1 WHERE id='voice-1'").run();
    db.prepare(`
      INSERT INTO voice_models
        (id,user_id,name,kind,model_name,support_name,status,created_at,selected)
        VALUES ('voice-2','user-1','Another','piper','x.onnx','x.onnx.json','ready',2,0)
    `).run();
    let constraintError = "";
    try {
      db.prepare("UPDATE voice_models SET selected=1 WHERE id='voice-2'").run();
    } catch (error) {
      constraintError = error instanceof Error ? error.message : String(error);
    }
    ok(
      constraintError.includes("UNIQUE constraint failed"),
      `Expected unique constraint error; got "${constraintError}" and ${JSON.stringify(
        db.prepare("SELECT id,selected FROM voice_models ORDER BY id").all(),
      )}`,
    );
  } finally {
    db.close();
  }
});

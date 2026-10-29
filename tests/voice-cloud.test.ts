import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleVoiceCloud, removeCloudVoiceFiles } from '../src/voice-cloud.ts';

const OWNER = '123e4567-e89b-12d3-a456-426614174000';
const OTHER = '123e4567-e89b-12d3-a456-426614174001';
const VOICE = '123e4567-e89b-12d3-a456-426614174002';
const SHA = 'a'.repeat(64);
const ENV_STORAGE = {
  HF_S3_NAMESPACE: 'hyron-ia',
  HF_S3_BUCKET: 'hyron-voices',
  HF_S3_ACCESS_KEY_ID: 'HFAKTESTKEY123456789',
  HF_S3_SECRET_ACCESS_KEY: 'test-secret-for-testing-not-real',
};

function memoryD1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec('CREATE TABLE users (id TEXT PRIMARY KEY)');
  db.exec(`CREATE TABLE voice_models (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
    model_name TEXT, model_bytes INTEGER, model_sha256 TEXT,
    support_name TEXT NOT NULL DEFAULT '', support_bytes INTEGER DEFAULT 0,
    support_sha256 TEXT, preview_name TEXT, status TEXT
  )`);
  db.exec(readFileSync(new URL('../database/0006_v0514_cloud_voice_storage.sql', import.meta.url), 'utf8'));
  db.prepare('INSERT INTO users(id) VALUES(?)').run(OWNER);
  db.prepare('INSERT INTO users(id) VALUES(?)').run(OTHER);
  db.prepare('INSERT INTO voice_models(id,user_id,model_name,model_bytes,model_sha256,status) VALUES(?,?,?,?,?,?)')
    .run(VOICE, OWNER, 'voice.pth', 4096, SHA, 'ready');
  const wrap = (sql: string, bindings: unknown[] = []): any => ({
    bind: (...args: unknown[]) => wrap(sql, args),
    first: async () => db.prepare(sql).get(...(bindings as any[])) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...(bindings as any[])) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(bindings as any[])).changes) } }),
    _run: () => ({ meta: { changes: Number(db.prepare(sql).run(...(bindings as any[])).changes) } }),
  });
  const d1 = {
    prepare: (sql: string) => wrap(sql),
    batch: async (queries: any[]) => {
      db.exec('BEGIN');
      try {
        const results = queries.map(q => q._run());
        db.exec('COMMIT');
        return results;
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
  return { db, env: { DB: d1, ...ENV_STORAGE } } as const;
}
async function invoke(env: any, owner: string, path: string, method = 'GET', data?: unknown) {
  return handleVoiceCloud(new Request('https://hyron.test'+path, {
    method,
    ...(data !== undefined ? { body: JSON.stringify(data), headers: { 'content-type': 'application/json' } } : {}),
  }), env, owner, path);
}

test('cloud transfer requires configuration and authenticated ownership', async () => {
  const { env } = memoryD1();
  const config = await invoke({ DB: env.DB }, OWNER, '/api/voices/cloud/config');
  assert.deepEqual(await config!.json(), { provider: 'huggingface-s3', configured: false, uploadSupported: false });
  const forbidden = await invoke(env, OTHER, `/api/voices/${VOICE}/cloud/init`, 'POST', {});
  assert.equal(forbidden!.status, 404);
  const disabled = await invoke({ DB: env.DB }, OWNER, `/api/voices/${VOICE}/cloud/init`, 'POST', {});
  assert.equal(disabled!.status, 503);
});

test('cloud init, signed upload, remote HEAD size check, download and deletion', async () => {
  const { db, env } = memoryD1();
  const init = await invoke(env, OWNER, `/api/voices/${VOICE}/cloud/init`, 'POST', {});
  assert.equal(init!.status, 200);
  const manifest = await init!.json() as any;
  assert.deepEqual(manifest.parts.map((p: any) => p.part), ['model']);
  assert.equal(manifest.parts[0].bytes, 4096);
  const signed = await invoke(env, OWNER, `/api/voices/${VOICE}/cloud/upload/model`, 'POST', {});
  assert.equal(signed!.status, 200);
  const signedBody = await signed!.json() as any;
  assert.equal(new URL(signedBody.url).host, 's3.hf.co');
  assert.equal(signedBody.headers['if-none-match'], '*');
  assert.equal(signedBody.url.includes('test-secret'), false);
  const oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, requestOptions) => {
      const method = (requestOptions as RequestInit)?.method;
      if (method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-length': '4096' } });
      if (method === 'DELETE') return new Response(null, { status: 204 });
      if (method === 'GET') return new Response(new Uint8Array(4096), { status: 200, headers: { 'content-length': '4096' } });
      throw Error('Unexpected method: ' + method);
    };
    const done = await invoke(env, OWNER, `/api/voices/${VOICE}/cloud/complete`, 'POST', {});
    assert.equal(done!.status, 200);
    assert.equal((await done!.json() as any).ready, true);
    const state = await invoke(env, OWNER, '/api/voices/cloud/status');
    assert.equal((await state!.json() as any).status[VOICE].ready, true);
    const other = await invoke(env, OTHER, `/api/voices/${VOICE}/cloud/file/model`);
    assert.equal(other!.status, 404);
    const download = await invoke(env, OWNER, `/api/voices/${VOICE}/cloud/download/model`);
    const d = await download!.json() as any;
    assert.equal(d.sha256, SHA);
    assert.equal(d.bytes, 4096);
    assert.equal(new URL(d.url).host, 's3.hf.co');
    const file = await invoke(env, OWNER, `/api/voices/${VOICE}/cloud/file/model`);
    assert.equal(file!.status, 200);
    assert.equal((await file!.arrayBuffer()).byteLength, 4096);
    await removeCloudVoiceFiles(env as any, OWNER, VOICE);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM voice_cloud_files').get()!.n, 1);
  } finally { globalThis.fetch = oldFetch; }
});

test('HEAD mismatch prevents publishing upload as ready', async () => {
  const { env } = memoryD1();
  await invoke(env, OWNER, `/api/voices/${VOICE}/cloud/init`, 'POST', {});
  const oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(null, { status: 200, headers: { 'content-length': '4095' } });
    const done = await invoke(env, OWNER, `/api/voices/${VOICE}/cloud/complete`, 'POST', {});
    assert.equal(done!.status, 409);
    const state = await invoke(env, OWNER, '/api/voices/cloud/status');
    assert.equal((await state!.json() as any).status[VOICE].ready, false);
  } finally { globalThis.fetch = oldFetch; }
});

test('migration creates constrained cloud table and rejects duplicate part', () => {
  const { db } = memoryD1();
  const insert = db.prepare(`INSERT INTO voice_cloud_files
    (voice_id,user_id,part,object_key,name,bytes,sha256,content_type,expires_at,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`);
  insert.run(VOICE, OWNER, 'model', 'key1', 'voice.pth', 10, SHA, 'application/octet-stream', 1000, 0);
  assert.throws(() => insert.run(VOICE, OWNER, 'model', 'key2', 'voice.pth', 10, SHA, 'application/octet-stream', 1000, 0));
  assert.throws(() => insert.run(VOICE, OWNER, 'model', 'key3', 'voice.pth', -1, SHA, 'application/octet-stream', 1000, 0));
});


test('same-origin streaming upload relay enforces bytes and user ownership', async () => {
  const { env } = memoryD1();
  await invoke(env, OWNER, `/api/voices/${VOICE}/cloud/init`, 'POST', {});
  const oldFetch = globalThis.fetch;
  try {
    let observed = false;
    globalThis.fetch = async (_url, options) => {
      observed = true;
      assert.equal((options as RequestInit).method, 'PUT');
      assert.equal((options as RequestInit).headers &&
        (options as RequestInit).headers instanceof Object, true);
      return new Response(null, { status: 200 });
    };
    const put = new Request(`https://hyron.test/api/voices/${VOICE}/cloud/file/model`, {
      method: 'PUT',
      body: new Uint8Array(4096),
      headers: { 'content-type': 'application/octet-stream', 'content-length': '4096' },
    });
    const answer = await handleVoiceCloud(put, env as any, OWNER, new URL(put.url).pathname);
    assert.equal(answer!.status, 200);
    assert.equal(observed, true);
    const bad = await handleVoiceCloud(put.clone(), env as any, OTHER, new URL(put.url).pathname);
    assert.equal(bad!.status, 404);
  } finally { globalThis.fetch = oldFetch; }
});

test('bounded cloud range returns validated 206 and rejects out-of-range requests', async () => {
  const { env } = memoryD1();
  await invoke(env, OWNER, `/api/voices/${VOICE}/cloud/init`, 'POST', {});
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, options) => {
      if ((options as RequestInit)?.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-length': '4096' } });
      assert.equal(new Headers((options as RequestInit).headers).get('range'), 'bytes=0-1023');
      return new Response(new Uint8Array(1024), { status: 206, headers: {
        'content-range': 'bytes 0-1023/4096', 'content-length': '1024',
      } });
    };
    await invoke(env, OWNER, `/api/voices/${VOICE}/cloud/complete`, 'POST', {});
    const url = `https://hyron.test/api/voices/${VOICE}/cloud/file/model`;
    const request = new Request(url, { headers: { range: 'bytes=0-1023' } });
    const answer = await handleVoiceCloud(request, env as any, OWNER, new URL(url).pathname);
    assert.equal(answer!.status, 206);
    assert.equal(answer!.headers.get('content-range'), 'bytes 0-1023/4096');
    assert.equal((await answer!.arrayBuffer()).byteLength, 1024);
    const invalid = new Request(url, { headers: { range: 'bytes=4096-4100' } });
    const reject = await handleVoiceCloud(invalid, env as any, OWNER, new URL(url).pathname);
    assert.equal(reject!.status, 416);
  } finally { globalThis.fetch = original; }
});

test('range relay rejects a server that ignores HTTP Range', async () => {
  const { env } = memoryD1();
  await invoke(env, OWNER, `/api/voices/${VOICE}/cloud/init`, 'POST', {});
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, options) => {
      if ((options as RequestInit)?.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-length': '4096' } });
      return new Response(new Uint8Array(4096), { status: 200, headers: { 'content-length': '4096' } });
    };
    await invoke(env, OWNER, `/api/voices/${VOICE}/cloud/complete`, 'POST', {});
    const url = `https://hyron.test/api/voices/${VOICE}/cloud/file/model`;
    const r = await handleVoiceCloud(new Request(url, { headers: { range: 'bytes=0-1023' } }), env as any, OWNER, new URL(url).pathname);
    assert.equal(r!.status, 502);
    assert.match((await r!.json() as any).error, /HTTP Range/);
  } finally { globalThis.fetch = original; }
});

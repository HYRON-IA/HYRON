/** HYRON v0.5.14 — private voice binary storage, separate from D1 metadata. */
import { presignHFObject, requestHFObject, storageConfigured, type HFStorageEnv } from "./hf-bucket.ts";

export interface CloudEnv extends HFStorageEnv { DB: D1Database }
type Part = "model" | "support" | "preview";
interface VoiceRow {
  id: string; user_id: string; model_name: string; model_bytes: number; model_sha256: string | null;
  support_name: string; support_bytes: number; support_sha256: string | null;
  preview_name: string | null;
}
interface CloudFile {
  voice_id: string; user_id: string; part: Part; object_key: string; name: string;
  bytes: number; sha256: string; content_type: string; state: "pending" | "ready";
  expires_at: number;
}
const SHA = /^[a-f0-9]{64}$/i;
const NOW = () => Date.now();
const TTL = 45 * 60 * 1000;
const UPLOAD_TTL = 600;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
});
const error = (message: string, status = 400) => json({ error: message }, status);
const isPart = (value: string): value is Part => value === "model" || value === "support" || value === "preview";
const complete = (files: CloudFile[], voice: VoiceRow) => {
  const ready = new Set(files.filter(file => file.state === "ready").map(file => file.part));
  return ready.has("model") && (!voice.support_name || ready.has("support")) && (!voice.preview_name || ready.has("preview"));
};
async function getVoice(env: CloudEnv, userId: string, voiceId: string): Promise<VoiceRow | null> {
  return env.DB.prepare(`SELECT id,user_id,model_name,model_bytes,model_sha256,
    support_name,support_bytes,support_sha256,preview_name FROM voice_models
    WHERE id=? AND user_id=? AND status='ready'`).bind(voiceId, userId).first<VoiceRow>();
}
async function getFiles(env: CloudEnv, userId: string, voiceId: string) {
  const results = await env.DB.prepare(`SELECT voice_id,user_id,part,object_key,name,bytes,sha256,content_type,state,expires_at
    FROM voice_cloud_files WHERE voice_id=? AND user_id=? ORDER BY part`).bind(voiceId, userId).all<CloudFile>();
  return results.results;
}
export async function removeCloudVoiceFiles(env: CloudEnv, userId: string, voiceId: string): Promise<void> {
  const files = await getFiles(env, userId, voiceId);
  if (files.length && !storageConfigured(env)) throw new Error("Armazenamento não configurado; exclusão remota bloqueada");
  for (const file of files) {
    const response = await requestHFObject(env, "DELETE", file.object_key);
    if (!response.ok && response.status !== 404) {
      throw new Error(`Não foi possível remover o arquivo remoto (${response.status})`);
    }
  }
}

/** Call only after authenticating with the existing HYRON session. */
export async function handleVoiceCloud(request: Request, env: CloudEnv, userId: string, path: string): Promise<Response | null> {
  if (path === "/api/voices/cloud/config" && request.method === "GET") {
    return json({ provider: "huggingface-s3", configured: storageConfigured(env), uploadSupported: storageConfigured(env) });
  }
  if (path === "/api/voices/cloud/status" && request.method === "GET") {
    const voices = await env.DB.prepare(`SELECT id,user_id,model_name,model_bytes,model_sha256,
      support_name,support_bytes,support_sha256,preview_name FROM voice_models WHERE user_id=? AND status='ready'`).bind(userId).all<VoiceRow>();
    const files = await env.DB.prepare(`SELECT voice_id,user_id,part,object_key,name,bytes,sha256,content_type,state,expires_at
      FROM voice_cloud_files WHERE user_id=?`).bind(userId).all<CloudFile>();
    const status: Record<string, { ready: boolean; parts: Part[]; uploading: boolean }> = {};
    for (const v of voices.results) {
      const owned = files.results.filter(file => file.voice_id === v.id);
      status[v.id] = {
        ready: complete(owned, v),
        parts: owned.filter(file => file.state === "ready").map(file => file.part),
        uploading: owned.some(file => file.state === "pending" && file.expires_at > NOW()),
      };
    }
    return json({ status });
  }
  const match = path.match(/^\/api\/voices\/([0-9a-f-]{36})\/cloud(?:\/(init|complete|upload\/(model|support|preview)|file\/(model|support|preview)|download\/(model|support|preview)))?$/i);
  if (!match) return null;
  const voiceId = match[1];
  const action = match[2] ?? "";
  const voice = await getVoice(env, userId, voiceId);
  if (!voice) return error("Voz não encontrada", 404);
  if (!storageConfigured(env)) return error("Armazenamento de vozes não configurado", 503);

  if (action === "init" && request.method === "POST") {
    let input: { preview?: { bytes?: unknown; sha256?: unknown } };
    try {
      const length = Number(request.headers.get("content-length") || 0);
      if (length > 2048) return error("Requisição muito grande", 413);
      const str = await request.text();
      if (str.length > 2048) return error("Requisição muito grande", 413);
      input = JSON.parse(str) as typeof input;
    } catch { return error("JSON inválido"); }
    if (!input || typeof input !== "object" || Array.isArray(input)) return error("Metadados inválidos");
    const expected: Array<{ part: Part; name: string; bytes: number; sha256: string; mime: string }> = [];
    if (!SHA.test(voice.model_sha256 ?? "") || voice.model_bytes < 1024 || voice.model_bytes > 100 * 1048576) {
      return error("Modelo com metadados incompletos ou tamanho inválido");
    }
    expected.push({ part: "model", name: voice.model_name, bytes: voice.model_bytes,
      sha256: voice.model_sha256!, mime: "application/octet-stream" });
    if (voice.support_name) {
      if (!SHA.test(voice.support_sha256 ?? "") || voice.support_bytes < 1 || voice.support_bytes > 100 * 1048576) return error("Auxiliar inválido");
      expected.push({ part: "support", name: voice.support_name, bytes: voice.support_bytes,
        sha256: voice.support_sha256!, mime: "application/octet-stream" });
    }
    if (voice.preview_name) {
      const { bytes, sha256 } = input.preview || {};
      if (!Number.isSafeInteger(bytes) || (bytes as number) < 12 || (bytes as number) > 32 * 1048576 || typeof sha256 !== "string" || !SHA.test(sha256)) {
        return error("A prévia exige bytes e SHA-256 válidos");
      }
      expected.push({ part: "preview", name: voice.preview_name, bytes: bytes as number,
        sha256: sha256.toLowerCase(), mime: "audio/wav" });
    } else if (input.preview) return error("Prévia não registrada para esta voz");
    const old = await getFiles(env, userId, voiceId);
    if (complete(old, voice)) return error("A voz já está na nuvem", 409);
    if (old.length && old.every(file => file.expires_at > NOW() && file.state === "pending")) {
      const isMatching = old.length === expected.length && expected.every(part => old.some(
        file => file.part === part.part && file.sha256 === part.sha256 && file.bytes === part.bytes && file.name === part.name,
      ));
      if (!isMatching) return error("Upload existente com parâmetros diferentes. Aguarde sua expiração.", 409);
      return json({ parts: old.map(file => ({ part: file.part, bytes: file.bytes, name: file.name })),
        expiresAt: old[0].expires_at, resumed: true });
    }
    // Small per-user/global quotas protect the shared private storage allowance.
    const quota = await env.DB.prepare(`SELECT
      COALESCE(SUM(CASE WHEN user_id=? AND voice_id<>? THEN bytes ELSE 0 END),0) AS user_bytes,
      COALESCE(SUM(CASE WHEN voice_id<>? THEN bytes ELSE 0 END),0) AS global_bytes
      FROM voice_cloud_files`).bind(userId, voiceId, voiceId).first<{ user_bytes: number; global_bytes: number }>();
    const requested = expected.reduce((sum, file) => sum + file.bytes, 0);
    if ((quota?.user_bytes ?? 0) + requested > 2 * 1024 ** 3) return error("Cota individual de 2 GiB excedida", 429);
    if ((quota?.global_bytes ?? 0) + requested > 80 * 1024 ** 3) return error("Cota global de armazenamento atingida", 429);
    // Refuse to replace pending keys if old objects could not be deleted.
    if (old.length) await removeCloudVoiceFiles(env, userId, voiceId);
    const attemptId = crypto.randomUUID();
    const created = NOW();
    const expiresAt = created + TTL;
    const entries = expected.map(file => ({
      ...file, key: `users/${userId}/voices/${voiceId}/${attemptId}/${file.part}-${file.sha256}-${file.name}`,
    }));
    await env.DB.batch([
      env.DB.prepare("DELETE FROM voice_cloud_files WHERE user_id=? AND voice_id=?").bind(userId, voiceId),
      ...entries.map(file => env.DB.prepare(`INSERT INTO voice_cloud_files
        (voice_id,user_id,part,object_key,name,sha256,bytes,content_type,state,expires_at,created_at)
        VALUES(?,?,?,?,?,?,?,?, 'pending', ?,?)`).bind(voiceId, userId, file.part, file.key, file.name,
          file.sha256, file.bytes, file.mime, expiresAt, created)),
    ]);
    return json({
      parts: entries.map(file => ({ part: file.part, bytes: file.bytes, name: file.name })),
      expiresAt,
      note: "Solicite uma autorização temporária antes do envio de cada arquivo.",
    });
  }

  if (action.startsWith("upload/") && request.method === "POST") {
    const part = action.slice("upload/".length);
    if (!isPart(part)) return error("Arquivo inválido", 404);
    const files = await getFiles(env, userId, voiceId);
    const file = files.find(item => item.part === part && item.state === "pending" && item.expires_at > NOW());
    if (!file) return error("Upload não iniciado, concluído ou expirado", 409);
    const ticket = await presignHFObject(env, "PUT", file.object_key,
      { expiresSeconds: UPLOAD_TTL, contentType: file.content_type });
    return json({ url: ticket.url, headers: ticket.headers, bytes: file.bytes,
      expiresInSeconds: UPLOAD_TTL });
  }

  if (action === "complete" && request.method === "POST") {
    const files = await getFiles(env, userId, voiceId);
    if (complete(files, voice)) return json({ ready: true });
    const requiredCount = 1 + (voice.support_name ? 1 : 0) + (voice.preview_name ? 1 : 0);
    if (files.length !== requiredCount || files.some(file => file.state !== "pending" || file.expires_at < NOW())) {
      return error("Upload ausente ou expirado", 409);
    }
    // HEAD verifies presence and size. HF S3 does not retain x-amz-meta-*;
    // SHA-256 is verified by the browser on upload and again on download.
    for (const file of files) {
      const response = await requestHFObject(env, "HEAD", file.object_key);
      if (!response.ok) return error(`Arquivo ${file.part} não confirmado no armazenamento (${response.status})`, 409);
      const length = Number(response.headers.get("content-length"));
      if (!Number.isSafeInteger(length) || length !== file.bytes) return error(`Tamanho remoto divergente para ${file.part}`, 409);
    }
    await env.DB.batch(files.map(file => env.DB.prepare(
      "UPDATE voice_cloud_files SET state='ready',verified_at=? WHERE voice_id=? AND user_id=? AND part=? AND state='pending'",
    ).bind(NOW(), voiceId, userId, file.part)));
    return json({ ready: true, integrity: "size-checked; sha256-verified-by-client" });
  }

  if (action.startsWith("download/") && request.method === "GET") {
    const part = action.slice("download/".length);
    if (!isPart(part)) return error("Arquivo inválido", 404);
    const files = await getFiles(env, userId, voiceId);
    if (!complete(files, voice)) return error("Pacote ainda não está disponível", 409);
    const file = files.find(item => item.part === part && item.state === "ready");
    if (!file) return error("Arquivo não disponível", 404);
    const ticket = await presignHFObject(env, "GET", file.object_key, { expiresSeconds: 120 });
    return json({ url: ticket.url, sha256: file.sha256, bytes: file.bytes, name: file.name, expiresInSeconds: 120 });
  }

  if (action.startsWith("file/") && request.method === "PUT") {
    // Browser CORS fallback, limited to 80 MiB (below Cloudflare's request cap).
    // The Worker streams data onward: no entire checkpoint is buffered.
    const part = action.slice("file/".length);
    if (!isPart(part)) return error("Arquivo inválido", 404);
    const files = await getFiles(env, userId, voiceId);
    const file = files.find(item => item.part === part && item.state === "pending" && item.expires_at > NOW());
    if (!file) return error("Upload não iniciado ou expirado", 409);
    if (file.bytes > 80 * 1048576) return error("Upload pelo Worker limitado a 80 MiB; use envio direto ao bucket", 413);
    if (request.headers.get("content-type") !== file.content_type) return error("Content-Type incorreto", 415);
    if (Number(request.headers.get("content-length")) !== file.bytes) return error("Tamanho informado incorreto", 413);
    if (!request.body) return error("Corpo vazio", 400);
    const ticket = await presignHFObject(env, "PUT", file.object_key,
      { expiresSeconds: 300, contentType: file.content_type });
    const upstream = await fetch(ticket.url, {
      method: "PUT",
      headers: ticket.headers,
      body: request.body,
      redirect: "manual",
      // Streaming upload in Node-compatible fetch runtimes.
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    if (upstream.status === 412) return json({ ok: true, alreadyUploaded: true });
    if (!upstream.ok) return error(`Falha no envio remoto (${upstream.status})`, 502);
    return json({ ok: true });
  }

  if (action.startsWith("file/") && request.method === "GET") {
    // Same-origin streaming fallback for browsers when Hugging Face CORS blocks
    // direct presigned GET. Worker does not buffer large checkpoint files.
    const part = action.slice("file/".length);
    if (!isPart(part)) return error("Arquivo inválido", 404);
    const files = await getFiles(env, userId, voiceId);
    if (!complete(files, voice)) return error("Pacote ainda não está disponível", 409);
    const file = files.find(item => item.part === part && item.state === "ready");
    if (!file) return error("Arquivo não disponível", 404);
    const ticket = await presignHFObject(env, "GET", file.object_key, { expiresSeconds: 60 });
    const upstream = await fetch(ticket.url, { method: "GET", redirect: "follow" });
    if (!upstream.ok || !upstream.body) return error(`Download remoto indisponível (${upstream.status})`, 502);
    const headers: Record<string, string> = {
      "content-type": file.content_type,
      "content-disposition": `attachment; filename="${file.name}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    };
    if (upstream.headers.get("content-length")) headers["content-length"] = upstream.headers.get("content-length")!;
    return new Response(upstream.body, { status: 200, headers });
  }
  return error("Método não permitido", 405);
}

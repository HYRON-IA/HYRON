import { createHash, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { resolve } from "node:path";
import { KokoroEngine } from "../engines/KokoroEngine.ts";
import { PiperEngine } from "../engines/PiperEngine.ts";
import { RVCEngine } from "../engines/RVCEngine.ts";
import { WindowsSapiEngine } from "../engines/WindowsSapiEngine.ts";
import { AudioProcessor } from "../services/AudioProcessor.ts";
import {
  EngineError,
  VoicePipeline,
  type SynthesisRequest,
} from "../services/VoicePipeline.ts";
import { VoiceLibraryClient } from "../services/VoiceLibraryClient.ts";

const MAX_JSON_BYTES = 64 * 1024;

export interface VoiceEngineConfig {
  apiKey: string;
  voiceLibraryUrl: string;
  voiceLibraryApiKey: string;
  temporaryDirectory: string;
  port: number;
  maxTextLength: number;
  maxAudioBytes: number;
  maxAudioDurationSeconds: number;
  timeoutMs: number;
  maxJobs: number;
  jobTtlMs: number;
  piperExecutable?: string;
  piperModelPath?: string;
  piperModelDirectory?: string;
}

export interface VoiceEngineServerOptions {
  config: VoiceEngineConfig;
  pipeline?: VoicePipeline;
  resolveUser?: (request: IncomingMessage) => string | null;
}

export function loadVoiceEngineConfig(
  env: Record<string, string | undefined> = process.env,
): VoiceEngineConfig {
  const apiKey = env.ENGINE_API_KEY?.trim() ?? "";
  const voiceLibraryApiKey = env.VOICE_LIBRARY_API_KEY?.trim() ?? "";
  if (apiKey.length < 32 || voiceLibraryApiKey.length < 32) {
    throw new Error(
      "ENGINE_API_KEY e VOICE_LIBRARY_API_KEY devem conter ao menos 32 caracteres.",
    );
  }
  if (!sameSecret(apiKey, voiceLibraryApiKey)) {
    throw new Error(
      "ENGINE_API_KEY e VOICE_LIBRARY_API_KEY devem ser iguais para alinhar a identidade local.",
    );
  }
  const port = positiveInteger(env.ENGINE_PORT, 8792, "ENGINE_PORT");
  if (port > 65535) throw new Error("ENGINE_PORT deve estar entre 1 e 65535.");
  const maxTextLength = positiveInteger(
    env.MAX_TEXT_LENGTH,
    3000,
    "MAX_TEXT_LENGTH",
  );
  const maxAudioBytes =
    positiveInteger(env.MAX_AUDIO_SIZE_MB, 32, "MAX_AUDIO_SIZE_MB") *
    1024 *
    1024;
  if (!Number.isSafeInteger(maxAudioBytes)) {
    throw new Error("MAX_AUDIO_SIZE_MB excede o limite numérico seguro.");
  }
  const maxAudioDurationSeconds = positiveInteger(
    env.MAX_AUDIO_DURATION_SECONDS,
    300,
    "MAX_AUDIO_DURATION_SECONDS",
  );
  const timeoutMs =
    positiveInteger(env.TTS_TIMEOUT_SECONDS, 60, "TTS_TIMEOUT_SECONDS") * 1000;
  if (!Number.isSafeInteger(timeoutMs)) {
    throw new Error("TTS_TIMEOUT_SECONDS excede o limite numérico seguro.");
  }
  const maxJobs = positiveInteger(env.MAX_JOBS, 8, "MAX_JOBS");
  const jobTtlMs =
    positiveInteger(env.JOB_TTL_MINUTES, 30, "JOB_TTL_MINUTES") * 60 * 1000;
  if (!Number.isSafeInteger(jobTtlMs)) {
    throw new Error("JOB_TTL_MINUTES excede o limite numérico seguro.");
  }
  const voiceLibraryUrl =
    env.VOICE_LIBRARY_URL?.trim() || "http://127.0.0.1:8790";
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(voiceLibraryUrl);
  } catch {
    throw new Error("VOICE_LIBRARY_URL inválida.");
  }
  if (
    parsedUrl.protocol !== "http:" ||
    parsedUrl.hostname !== "127.0.0.1" ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    throw new Error("VOICE_LIBRARY_URL deve usar HTTP local em 127.0.0.1.");
  }
  return {
    apiKey,
    voiceLibraryUrl: parsedUrl.toString().replace(/\/$/, ""),
    voiceLibraryApiKey,
    temporaryDirectory: resolve(
      env.ENGINE_TEMP_DIRECTORY?.trim() || "./temporary-audio",
    ),
    port,
    maxTextLength,
    maxAudioBytes,
    maxAudioDurationSeconds,
    timeoutMs,
    maxJobs,
    jobTtlMs,
    ...(env.PIPER_EXECUTABLE?.trim()
      ? { piperExecutable: resolve(env.PIPER_EXECUTABLE.trim()) }
      : {}),
    ...(env.PIPER_MODEL_PATH?.trim()
      ? { piperModelPath: resolve(env.PIPER_MODEL_PATH.trim()) }
      : {}),
    ...(env.PIPER_MODEL_DIRECTORY?.trim()
      ? { piperModelDirectory: resolve(env.PIPER_MODEL_DIRECTORY.trim()) }
      : {}),
  };
}

export function createVoiceEngineServer(
  options: VoiceEngineServerOptions,
): Server {
  const pipeline =
    options.pipeline ?? createDefaultPipeline(options.config);
  const resolveUser =
    options.resolveUser ??
    ((request) => authenticate(request, options.config.apiKey));

  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, {
          success: true,
          data: { status: "ok", component: "HYRON Voice Engine", version: "0.5.8" },
        });
        return;
      }
      const owner = resolveUser(request);
      if (!owner) {
        throw new EngineError(401, "UNAUTHORIZED", "Autenticação local necessária.");
      }
      await pipeline.cleanup();
      await route(request, response, owner, pipeline);
    })().catch((error: unknown) => {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const mapped = mapError(error);
      if (mapped.status >= 500) {
        const kind = error instanceof Error ? error.name : "UnknownError";
        console.error(`Voice Engine request failed: ${kind}`);
      }
      sendJson(response, mapped.status, {
        success: false,
        error: { code: mapped.code, message: mapped.message },
      });
    });
  });
  const cleanupTimer = setInterval(() => {
    void pipeline.cleanup().catch((error: unknown) => {
      const kind = error instanceof Error ? error.name : "UnknownError";
      console.error(`Voice Engine cleanup failed: ${kind}`);
    });
  }, 60_000);
  server.once("close", () => clearInterval(cleanupTimer));
  return server;
}

export async function startVoiceEngineServer(
  config: VoiceEngineConfig,
): Promise<Server> {
  const server = createVoiceEngineServer({ config });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(config.port, "127.0.0.1", () => {
      server.off("error", reject);
      resolveListen();
    });
  });
  return server;
}

export function createDefaultPipeline(
  config: VoiceEngineConfig,
): VoicePipeline {
  const sapi = new WindowsSapiEngine(config.temporaryDirectory, config.timeoutMs);
  const piper = new PiperEngine({
    executable: config.piperExecutable,
    modelPath: config.piperModelPath,
    modelDirectory: config.piperModelDirectory,
    timeoutMs: config.timeoutMs,
    maxOutputBytes: config.maxAudioBytes,
  });
  const library = new VoiceLibraryClient({
    baseUrl: config.voiceLibraryUrl,
    apiKey: config.voiceLibraryApiKey,
    identity: createHash("sha256").update(config.apiKey).digest("hex"),
  });
  return new VoicePipeline({
    engines: [sapi, piper, new KokoroEngine()],
    voiceLibrary: library,
    processor: new AudioProcessor({
      maxBytes: config.maxAudioBytes,
      maxDurationSeconds: config.maxAudioDurationSeconds,
    }),
    temporaryDirectory: config.temporaryDirectory,
    timeoutMs: config.timeoutMs,
    maxTextLength: config.maxTextLength,
    maxJobs: config.maxJobs,
    jobTtlMs: config.jobTtlMs,
    sapiVoiceNames: () => sapi.listVoices(),
    conversionEngine: new RVCEngine(),
  });
}

async function route(
  request: IncomingMessage,
  response: ServerResponse,
  owner: string,
  pipeline: VoicePipeline,
): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (method === "GET" && url.pathname === "/engines") {
    sendJson(response, 200, {
      success: true,
      data: await pipeline.engineStatuses(),
    });
    return;
  }
  if (method === "GET" && url.pathname === "/voices") {
    sendJson(response, 200, { success: true, data: await pipeline.voices() });
    return;
  }
  if (method === "POST" && url.pathname === "/synthesize") {
    const body = parseSynthesisRequest(await readJson(request));
    const job = await pipeline.createSynthesisJob(owner, body);
    sendJson(response, 202, {
      success: true,
      data: job,
    });
    return;
  }
  if (method === "POST" && url.pathname === "/convert") {
    const body = await readJson(request);
    if (
      !isRecord(body) ||
      Object.keys(body).length !== 1 ||
      typeof body.voiceId !== "string"
    ) {
      throw new EngineError(400, "INVALID_BODY", "Informe apenas voiceId.");
    }
    await pipeline.convert(owner, body.voiceId);
    return;
  }

  const audioMatch = /^\/jobs\/([^/]+)\/audio$/.exec(url.pathname);
  if (audioMatch && method === "GET") {
    const result = pipeline.getAudio(owner, validateJobId(audioMatch[1]));
    if (!result) throw new EngineError(404, "AUDIO_NOT_FOUND", "Áudio não encontrado.");
    response.writeHead(200, {
      "Content-Type": result.contentType,
      "Content-Length": String(result.size),
      "Content-Disposition": `inline; filename="speech.wav"`,
      "X-Content-SHA256": result.checksum,
      "X-Audio-Duration-Seconds": String(result.durationSeconds),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    });
    await streamFile(response, result.path);
    return;
  }

  const jobMatch = /^\/jobs\/([^/]+)$/.exec(url.pathname);
  if (jobMatch) {
    const jobId = validateJobId(jobMatch[1]);
    if (method === "GET") {
      const job = pipeline.getJob(owner, jobId);
      if (!job) throw new EngineError(404, "JOB_NOT_FOUND", "Job não encontrado.");
      sendJson(response, 200, { success: true, data: job });
      return;
    }
    if (method === "DELETE") {
      const cancelled = await pipeline.cancel(owner, jobId);
      if (!cancelled) throw new EngineError(404, "JOB_NOT_FOUND", "Job não encontrado.");
      sendJson(response, 200, { success: true, data: { deleted: true } });
      return;
    }
  }
  throw new EngineError(404, "NOT_FOUND", "Rota não encontrada.");
}

function parseSynthesisRequest(value: unknown): SynthesisRequest {
  if (!isRecord(value)) {
    throw new EngineError(400, "INVALID_BODY", "O corpo deve ser um objeto JSON.");
  }
  const allowed = new Set(["text", "voiceId", "voiceName", "engineId", "convert"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new EngineError(400, "INVALID_BODY", "O corpo contém campos não permitidos.");
  }
  if (typeof value.text !== "string") {
    throw new EngineError(400, "INVALID_TEXT", "text é obrigatório.");
  }
  if (value.voiceId !== undefined && typeof value.voiceId !== "string") {
    throw new EngineError(400, "INVALID_VOICE_ID", "voiceId inválido.");
  }
  if (
    value.voiceName !== undefined &&
    (typeof value.voiceName !== "string" || value.voiceName.length > 100)
  ) {
    throw new EngineError(400, "INVALID_VOICE_NAME", "voiceName inválido.");
  }
  if (
    value.engineId !== undefined &&
    (typeof value.engineId !== "string" || value.engineId.length > 40)
  ) {
    throw new EngineError(400, "UNKNOWN_ENGINE", "engineId inválido.");
  }
  if (value.convert !== undefined && typeof value.convert !== "boolean") {
    throw new EngineError(400, "INVALID_CONVERT_OPTION", "convert deve ser booleano.");
  }
  return {
    text: value.text,
    ...(typeof value.voiceId === "string" ? { voiceId: value.voiceId } : {}),
    ...(typeof value.voiceName === "string" ? { voiceName: value.voiceName } : {}),
    ...(typeof value.engineId === "string" ? { engineId: value.engineId } : {}),
    ...(typeof value.convert === "boolean" ? { convert: value.convert } : {}),
  };
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const declared = request.headers["content-length"];
  if (typeof declared === "string" && Number(declared) > MAX_JSON_BYTES) {
    throw new EngineError(413, "BODY_TOO_LARGE", "Corpo JSON excede o limite.");
  }
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.byteLength;
    if (length > MAX_JSON_BYTES) {
      throw new EngineError(413, "BODY_TOO_LARGE", "Corpo JSON excede o limite.");
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new EngineError(400, "INVALID_JSON", "Corpo JSON inválido.");
  }
}

function mapError(error: unknown): EngineError {
  if (error instanceof EngineError) return error;
  if (error instanceof Error) {
    if (error.message.startsWith("Voice Library respondeu com HTTP 404")) {
      return new EngineError(404, "VOICE_NOT_FOUND", "Voz não encontrada.");
    }
    if (error.message.startsWith("Voice Library respondeu com HTTP 401")) {
      return new EngineError(502, "VOICE_LIBRARY_AUTH_FAILED", "A Voice Library recusou a autenticação entre serviços.");
    }
  }
  return new EngineError(500, "INTERNAL_ERROR", "Erro interno do Voice Engine.");
}

export function authenticate(
  request: IncomingMessage,
  configuredKey: string,
): string | null {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
    return null;
  }
  const provided = authorization.slice("Bearer ".length);
  if (!provided) return null;
  const expected = createHash("sha256").update(configuredKey).digest();
  const actual = createHash("sha256").update(provided).digest();
  return timingSafeEqual(expected, actual)
    ? createHash("sha256").update(provided).digest("hex")
    : null;
}

function sameSecret(left: string, right: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(left).digest(),
    createHash("sha256").update(right).digest(),
  );
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} precisa ser um inteiro positivo.`);
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateJobId(value: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new EngineError(400, "INVALID_JOB_ID", "Identificador de job inválido.");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(decoded)) {
    throw new EngineError(400, "INVALID_JOB_ID", "Identificador de job inválido.");
  }
  return decoded;
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  const encoded = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(Buffer.byteLength(encoded)),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(encoded);
}

async function streamFile(
  response: ServerResponse,
  path: string,
): Promise<void> {
  const { createReadStream } = await import("node:fs");
  for await (const chunk of createReadStream(path)) {
    if (!response.write(chunk)) {
      await new Promise<void>((resolveDrain, reject) => {
        response.once("drain", resolveDrain);
        response.once("error", reject);
      });
    }
  }
  response.end();
}

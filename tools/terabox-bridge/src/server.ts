import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { dirname, resolve } from "node:path";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { StorageProvider } from "./storage/StorageProvider.ts";
import { StorageProviderNotConfiguredError } from "./storage/StorageProvider.ts";
import { LocalStorageProvider } from "./storage/LocalStorageProvider.ts";
import { TeraBoxStorageProvider } from "./storage/TeraBoxStorageProvider.ts";
import { deleteFile, getFile, listFiles, matchFileRoute } from "./routes/files.ts";
import { healthResponse } from "./routes/health.ts";
import { matchUploadRoute } from "./routes/upload.ts";
import { isRecord, parsePositiveInteger, validateFilename, validateOpaqueId, validateSha256 } from "./utils/validation.ts";
import { userDirectoryKey } from "./utils/paths.ts";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_JSON_BYTES = 64 * 1024;

export interface BridgeConfig {
  provider: "local" | "terabox";
  storageDirectory: string;
  apiKey: string;
  maxFileSizeBytes: number;
  maxChunkSizeBytes: number;
  maxUserStorageBytes: number;
  port: number;
}

export interface BridgeServerOptions {
  config: BridgeConfig;
  provider?: StorageProvider;
  resolveUser?: (request: IncomingMessage) => string | null;
}

interface UploadSession {
  id: string;
  filename: string;
  size: number;
  checksum: string;
  modelType: "rvc" | "piper" | "unknown";
  chunkSize: number;
  receivedChunks: number[];
  createdAt: number;
  expiresAt: number;
}

class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    status: number,
    code: string,
    message: string,
  ) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const locks = new Map<string, Promise<void>>();

export function loadBridgeConfig(
  env: Record<string, string | undefined> = process.env,
): BridgeConfig {
  const provider = env.STORAGE_PROVIDER?.trim() || "local";
  if (provider !== "local" && provider !== "terabox") {
    throw new Error("STORAGE_PROVIDER deve ser local ou terabox.");
  }
  const apiKey = env.STORAGE_API_KEY?.trim() || "";
  if (apiKey.length < 32) {
    throw new Error("STORAGE_API_KEY deve conter pelo menos 32 caracteres.");
  }
  const port = parsePositiveInteger(env.PORT, 8788, "PORT");
  if (port > 65535) throw new Error("PORT deve estar entre 1 e 65535.");
  return {
    provider,
    storageDirectory: resolve(env.STORAGE_DIRECTORY?.trim() || "./storage"),
    apiKey,
    maxFileSizeBytes: megabytesToBytes(env.MAX_FILE_SIZE_MB, 512, "MAX_FILE_SIZE_MB"),
    maxChunkSizeBytes: megabytesToBytes(env.MAX_CHUNK_SIZE_MB, 8, "MAX_CHUNK_SIZE_MB"),
    maxUserStorageBytes: megabytesToBytes(
      env.MAX_USER_STORAGE_MB,
      2048,
      "MAX_USER_STORAGE_MB",
    ),
    port,
  };
}

function megabytesToBytes(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  const bytes = parsePositiveInteger(value, fallback, name) * 1024 * 1024;
  if (!Number.isSafeInteger(bytes)) {
    throw new Error(`${name} excede o limite numérico seguro.`);
  }
  return bytes;
}

export function createBridgeServer(options: BridgeServerOptions): Server {
  const provider =
    options.provider ??
    (options.config.provider === "local"
      ? new LocalStorageProvider({ directory: options.config.storageDirectory })
      : new TeraBoxStorageProvider());
  const resolveUser =
    options.resolveUser ??
    ((request) => authenticatedUser(request, options.config.apiKey));

  const server = createServer((request, response) => {
    void handleRequest(request, response, options.config, provider, resolveUser).catch(
      (error: unknown) => {
        if (response.headersSent) {
          response.destroy();
          return;
        }
        const result = errorResponse(error);
        sendJson(response, result.status, result.body);
      },
    );
  });

  return server;
}

export async function startBridgeServer(
  config: BridgeConfig,
  provider?: StorageProvider,
): Promise<Server> {
  await mkdir(config.storageDirectory, { recursive: true });
  await cleanExpiredSessions(config.storageDirectory);
  const server = createBridgeServer({ config, provider });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(config.port, "127.0.0.1", () => {
      server.off("error", reject);
      resolveListen();
    });
  });
  return server;
}

function authenticatedUser(
  request: IncomingMessage,
  configuredKey: string,
): string | null {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
    return null;
  }
  const provided = authorization.slice("Bearer ".length);
  const expectedDigest = createHash("sha256").update(configuredKey).digest();
  const providedDigest = createHash("sha256").update(provided).digest();
  if (!timingSafeEqual(expectedDigest, providedDigest) || provided.length === 0) {
    return null;
  }
  return createHash("sha256").update(provided).digest("hex");
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  config: BridgeConfig,
  provider: StorageProvider,
  resolveUser: (request: IncomingMessage) => string | null,
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const method = request.method ?? "GET";

  if (method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { success: true, data: healthResponse() });
    return;
  }

  const userId = resolveUser(request);
  if (!userId) {
    throw new HttpError(401, "UNAUTHORIZED", "Autenticação local necessária.");
  }

  try {
    if (method === "GET" && url.pathname === "/api/files") {
      const files = await listFiles(provider, userId);
      sendJson(response, 200, { success: true, data: files });
      return;
    }

    if (method === "POST" && url.pathname === "/api/uploads") {
      const body = await readJsonBody(request);
      await createUpload(response, body, userId, config, provider);
      return;
    }

    const uploadMatch = matchUploadRoute(url.pathname, method);
    if (uploadMatch && validateOpaqueId(uploadMatch.uploadId)) {
      const uploadId = uploadMatch.uploadId;
      if (uploadMatch.action === "progress") {
        const session = await loadSession(config.storageDirectory, userId, uploadId);
        sendJson(response, 200, { success: true, data: describeSession(session) });
        return;
      }
      if (uploadMatch.action === "part") {
        const session = await receiveChunk(request, config, userId, uploadId);
        sendJson(response, 200, { success: true, data: describeSession(session) });
        return;
      }
      if (uploadMatch.action === "complete") {
        const file = await completeUpload(provider, config, userId, uploadId);
        sendJson(response, 201, { success: true, data: file });
        return;
      }
      if (uploadMatch.action === "cancel") {
        await cancelUpload(config.storageDirectory, userId, uploadId);
        sendJson(response, 200, { success: true, data: { cancelled: true } });
        return;
      }
    }

    const fileId = matchFileRoute(url.pathname);
    if (fileId && validateOpaqueId(fileId)) {
      if (method === "GET") {
        const download = await getFile(provider, userId, fileId);
        if (!download) {
          throw new HttpError(404, "FILE_NOT_FOUND", "Arquivo não encontrado.");
        }
        response.writeHead(200, {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(download.file.size),
          "Content-Disposition": contentDisposition(download.file.filename),
          "X-Content-SHA256": download.file.checksum,
          "X-Model-Type": download.file.modelType,
          "X-Content-Type-Options": "nosniff",
        });
        for await (const chunk of download.stream) {
          if (!response.write(chunk)) {
            await new Promise<void>((resolveDrain, reject) => {
              response.once("drain", resolveDrain);
              response.once("error", reject);
            });
          }
        }
        response.end();
        return;
      }
      if (method === "DELETE") {
        const deleted = await deleteFile(provider, userId, fileId);
        if (!deleted) {
          throw new HttpError(404, "FILE_NOT_FOUND", "Arquivo não encontrado.");
        }
        sendJson(response, 200, { success: true, data: { deleted: true } });
        return;
      }
    }

    throw new HttpError(404, "NOT_FOUND", "Rota não encontrada.");
  } catch (error) {
    if (error instanceof StorageProviderNotConfiguredError) {
      throw new HttpError(503, "PROVIDER_NOT_CONFIGURED", error.message);
    }
    throw error;
  }
}

async function createUpload(
  response: ServerResponse,
  body: unknown,
  userId: string,
  config: BridgeConfig,
  provider: StorageProvider,
): Promise<void> {
  if (!isRecord(body)) {
    throw new HttpError(400, "INVALID_BODY", "O corpo deve ser um objeto JSON.");
  }
  const validatedName = validateFilename(body.filename);
  const size = body.size;
  if (!Number.isSafeInteger(size) || (size as number) <= 0) {
    throw new HttpError(400, "INVALID_SIZE", "size precisa ser um inteiro positivo.");
  }
  if ((size as number) > config.maxFileSizeBytes) {
    throw new HttpError(413, "FILE_TOO_LARGE", "Arquivo excede MAX_FILE_SIZE_MB.");
  }
  const checksum = validateSha256(body.checksum);
  const requestedChunkSize = body.chunkSize ?? config.maxChunkSizeBytes;
  if (
    !Number.isSafeInteger(requestedChunkSize) ||
    (requestedChunkSize as number) <= 0 ||
    (requestedChunkSize as number) > config.maxChunkSizeBytes
  ) {
    throw new HttpError(
      400,
      "INVALID_CHUNK_SIZE",
      "chunkSize deve ser positivo e não pode exceder MAX_CHUNK_SIZE_MB.",
    );
  }

  const uploadId = randomUUID();
  const directory = sessionDirectory(config.storageDirectory, userId, uploadId);
  const session: UploadSession = {
    id: uploadId,
    filename: validatedName.filename,
    size: size as number,
    checksum,
    modelType: validatedName.modelType,
    chunkSize: requestedChunkSize as number,
    receivedChunks: [],
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  };

  await withLock(`quota:${userDirectoryKey(userId)}`, async () => {
    const files = await provider.list(userId);
    const activeSessions = await listActiveSessions(
      config.storageDirectory,
      userId,
    );
    const used =
      files.reduce((total, file) => total + file.size, 0) +
      activeSessions.reduce((total, active) => total + active.size, 0);
    if (used + session.size > config.maxUserStorageBytes) {
      throw new HttpError(
        413,
        "USER_QUOTA_EXCEEDED",
        "O upload excede a quota configurada para o usuário.",
      );
    }
    await mkdir(directory, { recursive: true });
    await saveSession(config.storageDirectory, userId, session);
  });

  sendJson(response, 201, { success: true, data: describeSession(session) });
}

async function receiveChunk(
  request: IncomingMessage,
  config: BridgeConfig,
  userId: string,
  uploadId: string,
): Promise<UploadSession> {
  return withLock(`upload:${userDirectoryKey(userId)}:${uploadId}`, async () => {
    const session = await loadSession(config.storageDirectory, userId, uploadId);
    const indexHeader = request.headers["x-chunk-index"];
    const lengthHeader = request.headers["content-length"];
    if (typeof indexHeader !== "string" || !/^(0|[1-9]\d*)$/.test(indexHeader)) {
      throw new HttpError(400, "INVALID_CHUNK_INDEX", "X-Chunk-Index inválido.");
    }
    if (typeof lengthHeader !== "string" || !/^(0|[1-9]\d*)$/.test(lengthHeader)) {
      throw new HttpError(
        411,
        "CONTENT_LENGTH_REQUIRED",
        "Content-Length é obrigatório para validar a parte.",
      );
    }
    const index = Number(indexHeader);
    const expectedIndex = session.receivedChunks.length;
    if (index !== expectedIndex) {
      throw new HttpError(
        409,
        "CHUNK_SEQUENCE_INVALID",
        `Parte esperada: ${expectedIndex}. Consulte o progresso antes de retomar.`,
      );
    }
    const expectedLength = Math.min(
      session.chunkSize,
      session.size - index * session.chunkSize,
    );
    if (expectedLength <= 0 || Number(lengthHeader) !== expectedLength) {
      throw new HttpError(
        400,
        "CHUNK_SIZE_INVALID",
        `A parte ${index} deve conter exatamente ${expectedLength} bytes.`,
      );
    }
    if (expectedLength > config.maxChunkSizeBytes) {
      throw new HttpError(413, "CHUNK_TOO_LARGE", "Parte excede o limite configurado.");
    }

    const directory = sessionDirectory(config.storageDirectory, userId, uploadId);
    const temporary = resolve(directory, `${index}.part.tmp`);
    const destination = resolve(directory, `${index}.part`);
    const output = await open(temporary, "wx");
    let received = 0;
    try {
      for await (const chunk of request) {
        received += chunk.byteLength;
        if (received > expectedLength) {
          throw new HttpError(413, "CHUNK_TOO_LARGE", "A parte excedeu o tamanho esperado.");
        }
        let offset = 0;
        while (offset < chunk.byteLength) {
          const result = await output.write(
            chunk,
            offset,
            chunk.byteLength - offset,
            null,
          );
          if (result.bytesWritten <= 0) {
            throw new Error("Não foi possível concluir a gravação da parte.");
          }
          offset += result.bytesWritten;
        }
      }
      if (received !== expectedLength) {
        throw new HttpError(400, "CHUNK_INCOMPLETE", "A parte recebida está incompleta.");
      }
    } catch (error) {
      await output.close();
      await rm(temporary, { force: true });
      throw error;
    }
    await output.close();
    await rename(temporary, destination);
    session.receivedChunks.push(index);
    session.expiresAt = Date.now() + SESSION_TTL_MS;
    await saveSession(config.storageDirectory, userId, session);
    return session;
  });
}

async function completeUpload(
  provider: StorageProvider,
  config: BridgeConfig,
  userId: string,
  uploadId: string,
) {
  return withLock(`upload:${userDirectoryKey(userId)}:${uploadId}`, async () => {
    const session = await loadSession(config.storageDirectory, userId, uploadId);
    const totalChunks = Math.ceil(session.size / session.chunkSize);
    if (
      session.receivedChunks.length !== totalChunks ||
      session.receivedChunks.some((index, expected) => index !== expected)
    ) {
      throw new HttpError(
        409,
        "UPLOAD_INCOMPLETE",
        "Não é possível finalizar: ainda faltam partes.",
      );
    }
    for (let index = 0; index < totalChunks; index += 1) {
      const partPath = resolve(
        sessionDirectory(config.storageDirectory, userId, uploadId),
        `${index}.part`,
      );
      const info = await stat(partPath);
      const expectedSize = Math.min(
        session.chunkSize,
        session.size - index * session.chunkSize,
      );
      if (!info.isFile() || info.size !== expectedSize) {
        throw new HttpError(
          409,
          "UPLOAD_INCOMPLETE",
          `A parte ${index} está ausente ou incompleta.`,
        );
      }
    }

    async function* combinedStream(): AsyncGenerator<Uint8Array> {
      for (let index = 0; index < totalChunks; index += 1) {
        const partPath = resolve(
          sessionDirectory(config.storageDirectory, userId, uploadId),
          `${index}.part`,
        );
        for await (const chunk of createReadStream(partPath)) {
          yield chunk;
        }
      }
    }

    const file = await provider.upload({
      userId,
      filename: session.filename,
      modelType: session.modelType,
      checksum: session.checksum,
      size: session.size,
      stream: combinedStream(),
    });
    await rm(sessionDirectory(config.storageDirectory, userId, uploadId), {
      recursive: true,
      force: true,
    });
    return file;
  });
}

async function cancelUpload(
  storageDirectory: string,
  userId: string,
  uploadId: string,
): Promise<void> {
  await withLock(`upload:${userDirectoryKey(userId)}:${uploadId}`, async () => {
    await loadSession(storageDirectory, userId, uploadId);
    await rm(sessionDirectory(storageDirectory, userId, uploadId), {
      recursive: true,
      force: true,
    });
  });
}

function describeSession(session: UploadSession) {
  const totalChunks = Math.ceil(session.size / session.chunkSize);
  return {
    uploadId: session.id,
    filename: session.filename,
    size: session.size,
    checksum: session.checksum,
    modelType: session.modelType,
    chunkSize: session.chunkSize,
    totalChunks,
    receivedChunks: session.receivedChunks,
    nextChunkIndex: session.receivedChunks.length,
    expiresAt: new Date(session.expiresAt).toISOString(),
  };
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const declaredLength = request.headers["content-length"];
  if (typeof declaredLength === "string" && Number(declaredLength) > MAX_JSON_BYTES) {
    throw new HttpError(413, "BODY_TOO_LARGE", "Corpo JSON muito grande.");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.byteLength;
    if (size > MAX_JSON_BYTES) {
      throw new HttpError(413, "BODY_TOO_LARGE", "Corpo JSON muito grande.");
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Corpo JSON inválido.");
  }
}

async function loadSession(
  storageDirectory: string,
  userId: string,
  uploadId: string,
): Promise<UploadSession> {
  if (!validateOpaqueId(uploadId)) {
    throw new HttpError(404, "UPLOAD_NOT_FOUND", "Sessão de upload não encontrada.");
  }
  try {
    const parsed: unknown = JSON.parse(
      await readFile(sessionMetadataPath(storageDirectory, userId, uploadId), "utf8"),
    );
    if (!isUploadSession(parsed) || parsed.id !== uploadId) {
      throw new HttpError(404, "UPLOAD_NOT_FOUND", "Sessão de upload não encontrada.");
    }
    if (parsed.expiresAt <= Date.now()) {
      await rm(sessionDirectory(storageDirectory, userId, uploadId), {
        recursive: true,
        force: true,
      });
      throw new HttpError(410, "UPLOAD_EXPIRED", "A sessão de upload expirou.");
    }
    return parsed;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (isMissing(error)) {
      throw new HttpError(404, "UPLOAD_NOT_FOUND", "Sessão de upload não encontrada.");
    }
    throw error;
  }
}

async function listActiveSessions(
  storageDirectory: string,
  userId: string,
): Promise<UploadSession[]> {
  const directory = userSessionsDirectory(storageDirectory, userId);
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const sessions: UploadSession[] = [];
  for (const entry of entries) {
    if (!validateOpaqueId(entry)) continue;
    try {
      const session = await loadSession(storageDirectory, userId, entry);
      sessions.push(session);
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 404) throw error;
    }
  }
  return sessions;
}

async function cleanExpiredSessions(storageDirectory: string): Promise<void> {
  const root = resolve(storageDirectory, ".uploads");
  let users: string[];
  try {
    users = await readdir(root);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  for (const userKey of users) {
    const directory = resolve(root, userKey);
    let sessions: string[];
    try {
      sessions = await readdir(directory);
    } catch (error) {
      if (isMissing(error)) continue;
      throw error;
    }
    for (const uploadId of sessions) {
      const sessionPath = resolve(directory, uploadId, "session.json");
      try {
        const parsed: unknown = JSON.parse(await readFile(sessionPath, "utf8"));
        if (!isUploadSession(parsed) || parsed.expiresAt <= Date.now()) {
          await rm(resolve(directory, uploadId), { recursive: true, force: true });
        }
      } catch (error) {
        if (isMissing(error)) {
          await rm(resolve(directory, uploadId), { recursive: true, force: true });
          continue;
        }
        throw error;
      }
    }
  }
}

async function saveSession(
  storageDirectory: string,
  userId: string,
  session: UploadSession,
): Promise<void> {
  const path = sessionMetadataPath(storageDirectory, userId, session.id);
  const temporary = `${path}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  const file = await open(temporary, "w");
  try {
    await file.writeFile(JSON.stringify(session), "utf8");
  } finally {
    await file.close();
  }
  await rename(temporary, path);
}

function sessionDirectory(
  storageDirectory: string,
  userId: string,
  uploadId: string,
): string {
  return resolve(
    userSessionsDirectory(storageDirectory, userId),
    uploadId,
  );
}

function sessionMetadataPath(
  storageDirectory: string,
  userId: string,
  uploadId: string,
): string {
  return resolve(
    sessionDirectory(storageDirectory, userId, uploadId),
    "session.json",
  );
}

function userSessionsDirectory(storageDirectory: string, userId: string): string {
  return resolve(storageDirectory, ".uploads", userDirectoryKey(userId));
}

function isUploadSession(value: unknown): value is UploadSession {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.filename === "string" &&
    typeof value.size === "number" &&
    typeof value.checksum === "string" &&
    (value.modelType === "rvc" ||
      value.modelType === "piper" ||
      value.modelType === "unknown") &&
    typeof value.chunkSize === "number" &&
    Array.isArray(value.receivedChunks) &&
    value.receivedChunks.every((index) => Number.isSafeInteger(index)) &&
    typeof value.createdAt === "number" &&
    typeof value.expiresAt === "number"
  );
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

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function withLock<T>(key: string, action: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolveLock) => {
    release = resolveLock;
  });
  locks.set(key, current);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (locks.get(key) === current) locks.delete(key);
  }
}

export function errorResponse(
  error: unknown,
): { status: number; body: Record<string, unknown> } {
  if (error instanceof HttpError) {
    return {
      status: error.status,
      body: {
        success: false,
        error: { code: error.code, message: error.message },
      },
    };
  }
  if (error instanceof StorageProviderNotConfiguredError) {
    return {
      status: 503,
      body: {
        success: false,
        error: { code: "PROVIDER_NOT_CONFIGURED", message: error.message },
      },
    };
  }
  if (error instanceof Error) {
    if (error.message.includes("checksum SHA-256")) {
      return {
        status: 422,
        body: {
          success: false,
          error: { code: "CHECKSUM_MISMATCH", message: error.message },
        },
      };
    }
    const clientValidation = [
      "Nome de arquivo inválido.",
      "Tipo de arquivo não permitido.",
      "checksum precisa",
      "O tamanho do arquivo recebido",
    ].some((prefix) => error.message.startsWith(prefix));
    if (clientValidation) {
      return {
        status: 400,
        body: {
          success: false,
          error: { code: "VALIDATION_ERROR", message: error.message },
        },
      };
    }
  }
  return {
    status: 500,
    body: {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor." },
    },
  };
}

import type { IncomingMessage, ServerResponse } from "node:http";
import type { VoiceManager } from "../services/VoiceManager.ts";
import { VoiceManagerError } from "../services/VoiceManager.ts";
import type { VoicePreviewStore } from "../services/VoicePreview.ts";
import type { StorageAdapter } from "../services/StorageAdapter.ts";
import { StorageBridgeError } from "../services/StorageAdapter.ts";
import {
  isRecord,
  validateCreateInput,
  validatePatchInput,
  validateVoiceId,
} from "../utils/validation.ts";

const MAX_JSON_BYTES = 64 * 1024;

export interface VoiceRouteOptions {
  manager: VoiceManager;
  previews: VoicePreviewStore;
  storage: StorageAdapter;
  maxPreviewBytes: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function handleVoiceRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  userId: string,
  options: VoiceRouteOptions,
): Promise<void> {
  const method = request.method ?? "GET";
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;

  if (method === "GET" && pathname === "/health") {
    sendJson(response, 200, {
      success: true,
      data: { status: "ok", component: "HYRON Voice Library", version: "0.5.3" },
    });
    return;
  }

  if (pathname === "/voices/default") {
    if (method === "GET") {
      sendJson(response, 200, {
        success: true,
        data: await options.manager.getDefault(userId),
      });
      return;
    }
    if (method === "PUT") {
      const body = await readJson(request);
      if (!isRecord(body) || !("voiceId" in body)) {
        throw new ApiError(400, "INVALID_BODY", "voiceId é obrigatório.");
      }
      if (
        body.voiceId !== null &&
        (typeof body.voiceId !== "string" || !validateVoiceId(body.voiceId))
      ) {
        throw new ApiError(400, "INVALID_VOICE_ID", "voiceId inválido.");
      }
      const voice = await options.manager.setDefault(userId, body.voiceId);
      sendJson(response, 200, { success: true, data: voice });
      return;
    }
  }

  if (pathname === "/voices") {
    if (method === "GET") {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const voices = await options.manager.list(userId, {
        search: url.searchParams.get("search") ?? undefined,
        language: url.searchParams.get("language") ?? undefined,
        modelType: url.searchParams.get("modelType") ?? undefined,
      });
      sendJson(response, 200, { success: true, data: voices });
      return;
    }
    if (method === "POST") {
      const voice = await options.manager.create(
        userId,
        validateCreateInput(await readJson(request)),
      );
      sendJson(response, 201, { success: true, data: voice });
      return;
    }
  }

  const fileListMatch = /^\/voices\/([^/]+)\/files$/.exec(pathname);
  if (fileListMatch) {
    const voiceId = validateRouteVoiceId(fileListMatch[1]);
    if (method === "GET") {
      const voice = await options.manager.get(userId, voiceId);
      sendJson(response, 200, { success: true, data: voice.files });
      return;
    }
    if (method === "POST") {
      const body = await readJson(request);
      if (!isRecord(body) || Object.keys(body).length !== 1 || !("fileId" in body)) {
        throw new ApiError(400, "INVALID_BODY", "Informe apenas fileId.");
      }
      const voice = await options.manager.attachFile(userId, voiceId, body.fileId);
      sendJson(response, 201, { success: true, data: voice.files });
      return;
    }
  }

  const fileMatch = /^\/voices\/([^/]+)\/files\/([^/]+)$/.exec(pathname);
  if (fileMatch && method === "GET") {
    const voiceId = validateRouteVoiceId(fileMatch[1]);
    const fileId = fileMatch[2];
    const voice = await options.manager.get(userId, voiceId);
    if (!voice.files.some((file) => file.fileId === fileId)) {
      throw new ApiError(404, "FILE_NOT_FOUND", "Arquivo não associado à voz.");
    }
    const upstream = await options.storage.download(userId, fileId);
    if (!upstream || upstream.status === 404) {
      throw new ApiError(404, "FILE_NOT_FOUND", "Arquivo não encontrado.");
    }
    if (!upstream.ok || !upstream.body) {
      throw new ApiError(502, "STORAGE_DOWNLOAD_FAILED", "Falha ao baixar arquivo do armazenamento.");
    }
    const fileReference = voice.files.find((file) => file.fileId === fileId);
    if (!fileReference) {
      throw new ApiError(404, "FILE_NOT_FOUND", "Arquivo não associado à voz.");
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileReference.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    };
    const contentLength = upstream.headers.get("content-length");
    if (contentLength && /^\d+$/.test(contentLength)) {
      headers["Content-Length"] = contentLength;
    }
    const checksum = upstream.headers.get("x-content-sha256");
    if (checksum && /^[a-f0-9]{64}$/i.test(checksum)) {
      headers["X-Content-SHA256"] = checksum;
    }
    response.writeHead(200, headers);
    await writeWebStream(response, upstream.body);
    return;
  }
  if (fileMatch && method === "DELETE") {
    const voiceId = validateRouteVoiceId(fileMatch[1]);
    let result: { deletedFromStorage: boolean };
    try {
      result = await options.manager.detachFile(userId, voiceId, fileMatch[2]);
    } catch (error) {
      throw mapManagerError(error);
    }
    sendJson(response, 200, { success: true, data: result });
    return;
  }

  const previewMatch = /^\/voices\/([^/]+)\/preview$/.exec(pathname);
  if (previewMatch) {
    const voiceId = validateRouteVoiceId(previewMatch[1]);
    if (method === "GET") {
      const voice = await options.manager.get(userId, voiceId);
      if (!voice.sampleAudio) {
        throw new ApiError(404, "PREVIEW_NOT_FOUND", "Amostra não encontrada.");
      }
      const preview = await options.previews.open(userId, voice.sampleAudio);
      if (!preview) {
        throw new ApiError(404, "PREVIEW_NOT_FOUND", "Amostra não encontrada.");
      }
      response.writeHead(200, {
        "Content-Type": preview.metadata.contentType,
        "Content-Length": String(preview.metadata.size),
        "X-Content-SHA256": preview.metadata.checksum,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      });
      await writeStream(response, preview.stream);
      return;
    }
    if (method === "POST") {
      const length = parseLength(request.headers["content-length"]);
      if (length > options.maxPreviewBytes) {
        throw new ApiError(413, "PREVIEW_TOO_LARGE", "A amostra excede o limite configurado.");
      }
      const contentTypeHeader = request.headers["content-type"];
      const contentType =
        typeof contentTypeHeader === "string"
          ? contentTypeHeader.split(";")[0].trim().toLowerCase()
          : "";
      const checksumHeader = request.headers["x-content-sha256"];
      if (typeof checksumHeader !== "string") {
        throw new ApiError(400, "CHECKSUM_REQUIRED", "X-Content-SHA256 é obrigatório.");
      }
      const metadata = await options.previews.save(
        userId,
        request,
        length,
        contentType,
        checksumHeader,
      );
      let previous: string | undefined;
      try {
        previous = await options.manager.attachPreview(userId, voiceId, metadata.id);
      } catch (error) {
        await options.previews.delete(userId, metadata.id);
        throw error;
      }
      if (previous && previous !== metadata.id) {
        try {
          await options.previews.delete(userId, previous);
        } catch {
          throw new ApiError(
            500,
            "PREVIOUS_PREVIEW_CLEANUP_FAILED",
            "A nova amostra foi associada, mas a amostra anterior não pôde ser removida.",
          );
        }
      }
      sendJson(response, 201, {
        success: true,
        data: {
          id: metadata.id,
          size: metadata.size,
          checksum: metadata.checksum,
          contentType: metadata.contentType,
        },
      });
      return;
    }
    if (method === "DELETE") {
      const previous = await options.manager.detachPreview(userId, voiceId);
      if (!previous) {
        throw new ApiError(404, "PREVIEW_NOT_FOUND", "Amostra não encontrada.");
      }
      await options.previews.delete(userId, previous);
      sendJson(response, 200, { success: true, data: { deleted: true } });
      return;
    }
  }

  const voiceMatch = /^\/voices\/([^/]+)$/.exec(pathname);
  if (voiceMatch) {
    const voiceId = validateRouteVoiceId(voiceMatch[1]);
    if (method === "GET") {
      sendJson(response, 200, {
        success: true,
        data: await options.manager.get(userId, voiceId),
      });
      return;
    }
    if (method === "PATCH") {
      const voice = await options.manager.update(
        userId,
        voiceId,
        validatePatchInput(await readJson(request)),
      );
      sendJson(response, 200, { success: true, data: voice });
      return;
    }
    if (method === "DELETE") {
      const voice = await options.manager.get(userId, voiceId);
      await options.manager.delete(userId, voiceId);
      if (voice.sampleAudio) {
        try {
          await options.previews.delete(userId, voice.sampleAudio);
        } catch {
          throw new ApiError(
            500,
            "VOICE_PREVIEW_CLEANUP_FAILED",
            "A voz foi removida, mas a amostra local não pôde ser limpa.",
          );
        }
      }
      sendJson(response, 200, { success: true, data: { deleted: true } });
      return;
    }
  }

  throw new ApiError(404, "NOT_FOUND", "Rota não encontrada.");
}

export function mapRouteError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof VoiceManagerError) {
    return new ApiError(error.status, error.code, error.message);
  }
  if (error instanceof StorageBridgeError) {
    return new ApiError(
      error.status === 403 ? 403 : error.status,
      error.status === 403 ? "STORAGE_IDENTITY_MISMATCH" : "STORAGE_UNAVAILABLE",
      error.message,
    );
  }
  if (error instanceof Error) {
    const validation = [
      "O nome deve",
      "A descrição deve",
      "O idioma deve",
      "modelType deve",
      "O corpo deve",
      "O corpo contém campos não permitidos",
      "A atualização deve",
      "Formato não permitido",
      "Formato de áudio não permitido",
      "fileId inválido",
      "Tamanho",
      "O formato do arquivo",
      "A amostra excede",
      "X-Content-SHA256",
      "Tamanho ou checksum",
      "A amostra excedeu",
      "A assinatura do arquivo",
    ].some((message) => error.message.startsWith(message));
    if (validation) return new ApiError(400, "VALIDATION_ERROR", error.message);
  }
  return new ApiError(500, "INTERNAL_ERROR", "Erro interno do servidor.");
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const length = request.headers["content-length"];
  if (length !== undefined && parseLength(length) > MAX_JSON_BYTES) {
    throw new ApiError(413, "BODY_TOO_LARGE", "Corpo JSON excede o limite.");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.byteLength;
    if (size > MAX_JSON_BYTES) {
      throw new ApiError(413, "BODY_TOO_LARGE", "Corpo JSON excede o limite.");
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Corpo JSON inválido.");
  }
}

function validateRouteVoiceId(value: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new ApiError(400, "INVALID_VOICE_ID", "Identificador de voz inválido.");
  }
  if (!validateVoiceId(decoded)) {
    throw new ApiError(400, "INVALID_VOICE_ID", "Identificador de voz inválido.");
  }
  return decoded;
}

function parseLength(value: string | string[] | undefined): number {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) {
    throw new ApiError(411, "CONTENT_LENGTH_REQUIRED", "Content-Length válido é obrigatório.");
  }
  const length = Number(value);
  if (!Number.isSafeInteger(length) || length <= 0) {
    throw new ApiError(400, "INVALID_CONTENT_LENGTH", "Content-Length inválido.");
  }
  return length;
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

async function writeStream(
  response: ServerResponse,
  stream: AsyncIterable<Uint8Array>,
): Promise<void> {
  for await (const chunk of stream) {
    if (!response.write(chunk)) {
      await new Promise<void>((resolveDrain, reject) => {
        response.once("drain", resolveDrain);
        response.once("error", reject);
      });
    }
  }
  response.end();
}

async function writeWebStream(
  response: ServerResponse,
  stream: ReadableStream<Uint8Array>,
): Promise<void> {
  const reader = stream.getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      if (!response.write(result.value)) {
        await new Promise<void>((resolveDrain, reject) => {
          response.once("drain", resolveDrain);
          response.once("error", reject);
        });
      }
    }
    response.end();
  } finally {
    reader.releaseLock();
  }
}

function mapManagerError(error: unknown): ApiError {
  return mapRouteError(error);
}

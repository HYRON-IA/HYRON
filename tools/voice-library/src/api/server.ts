import { createHash, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
} from "node:http";
import { resolve } from "node:path";
import { LocalRegistryProvider } from "../providers/LocalRegistryProvider.ts";
import { VoiceManager } from "../services/VoiceManager.ts";
import { VoiceRegistry } from "../services/VoiceRegistry.ts";
import {
  BridgeStorageAdapter,
  type StorageAdapter,
} from "../services/StorageAdapter.ts";
import { VoicePreviewStore } from "../services/VoicePreview.ts";
import {
  handleVoiceRoutes,
  mapRouteError,
} from "./routes.ts";
import { parsePositiveInteger } from "../utils/config.ts";

export interface VoiceLibraryConfig {
  apiKey: string;
  bridgeUrl: string;
  bridgeApiKey: string;
  dataDirectory: string;
  previewDirectory: string;
  maxPreviewBytes: number;
  port: number;
}

export interface VoiceLibraryServerOptions {
  config: VoiceLibraryConfig;
  storage?: StorageAdapter;
  resolveUser?: (request: IncomingMessage) => string | null;
  registry?: VoiceRegistry;
  previews?: VoicePreviewStore;
  manager?: VoiceManager;
}

export function loadVoiceLibraryConfig(
  env: Record<string, string | undefined> = process.env,
): VoiceLibraryConfig {
  const apiKey = env.VOICE_API_KEY?.trim() ?? "";
  const bridgeApiKey = env.BRIDGE_API_KEY?.trim() ?? "";
  if (apiKey.length < 32 || bridgeApiKey.length < 32) {
    throw new Error("VOICE_API_KEY e BRIDGE_API_KEY devem conter ao menos 32 caracteres.");
  }
  if (!sameSecret(apiKey, bridgeApiKey)) {
    throw new Error(
      "VOICE_API_KEY e BRIDGE_API_KEY devem ser iguais até o Bridge oferecer credenciais por identidade.",
    );
  }
  const port = parsePositiveInteger(env.VOICE_PORT, 8790, "VOICE_PORT");
  if (port > 65535) throw new Error("VOICE_PORT deve estar entre 1 e 65535.");
  const maxPreviewMb = parsePositiveInteger(
    env.MAX_PREVIEW_SIZE_MB,
    32,
    "MAX_PREVIEW_SIZE_MB",
  );
  const maxPreviewBytes = maxPreviewMb * 1024 * 1024;
  if (!Number.isSafeInteger(maxPreviewBytes)) {
    throw new Error("MAX_PREVIEW_SIZE_MB excede o limite numérico seguro.");
  }
  const bridgeUrl = env.BRIDGE_URL?.trim() || "http://127.0.0.1:8788";
  let parsedBridgeUrl: URL;
  try {
    parsedBridgeUrl = new URL(bridgeUrl);
  } catch {
    throw new Error("BRIDGE_URL inválida.");
  }
  if (
    parsedBridgeUrl.protocol !== "http:" ||
    parsedBridgeUrl.hostname !== "127.0.0.1" ||
    parsedBridgeUrl.username ||
    parsedBridgeUrl.password
  ) {
    throw new Error("BRIDGE_URL deve apontar somente para HTTP em 127.0.0.1.");
  }
  return {
    apiKey,
    bridgeUrl: parsedBridgeUrl.toString().replace(/\/$/, ""),
    bridgeApiKey,
    dataDirectory: resolve(env.VOICE_DATA_DIRECTORY?.trim() || "./data"),
    previewDirectory: resolve(
      env.PREVIEW_DIRECTORY?.trim() || "./preview-storage",
    ),
    maxPreviewBytes,
    port,
  };
}

export function createVoiceLibraryServer(
  options: VoiceLibraryServerOptions,
): Server {
  const identity = createHash("sha256")
    .update(options.config.apiKey)
    .digest("hex");
  const storage =
    options.storage ??
    new BridgeStorageAdapter({
      baseUrl: options.config.bridgeUrl,
      apiKey: options.config.bridgeApiKey,
      identity,
    });
  const registry =
    options.registry ??
    new VoiceRegistry(new LocalRegistryProvider(options.config.dataDirectory));
  const previews =
    options.previews ??
    new VoicePreviewStore(
      options.config.previewDirectory,
      options.config.maxPreviewBytes,
    );
  const manager = options.manager ?? new VoiceManager(registry, storage);
  const resolveUser =
    options.resolveUser ??
    ((request) => authenticateRequest(request, options.config.apiKey));

  return createServer((request, response) => {
    void (async () => {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      if (request.method === "GET" && pathname === "/health") {
        await handleVoiceRoutes(request, response, "", {
          manager,
          previews,
          storage,
          maxPreviewBytes: options.config.maxPreviewBytes,
        });
        return;
      }
      const userId = resolveUser(request);
      if (!userId) {
        response.writeHead(401, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        response.end(
          JSON.stringify({
            success: false,
            error: { code: "UNAUTHORIZED", message: "Autenticação local necessária." },
          }),
        );
        return;
      }
      await handleVoiceRoutes(request, response, userId, {
        manager,
        previews,
        storage,
        maxPreviewBytes: options.config.maxPreviewBytes,
      });
    })().catch((error: unknown) => {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const apiError = mapRouteError(error);
      if (apiError.status >= 500) {
        const code = error instanceof Error ? error.name : "UnknownError";
        console.error(`Voice Library request failed: ${code}`);
      }
      const body = JSON.stringify({
        success: false,
        error: { code: apiError.code, message: apiError.message },
      });
      response.writeHead(apiError.status, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": String(Buffer.byteLength(body)),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(body);
    });
  });
}

export function authenticateRequest(
  request: IncomingMessage,
  configuredKey: string,
): string | null {
  const header = request.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  const provided = header.slice("Bearer ".length);
  if (!provided) return null;
  const expected = createHash("sha256").update(configuredKey).digest();
  const actual = createHash("sha256").update(provided).digest();
  if (!timingSafeEqual(expected, actual)) return null;
  return createHash("sha256").update(provided).digest("hex");
}

function sameSecret(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

export async function startVoiceLibraryServer(
  config: VoiceLibraryConfig,
): Promise<Server> {
  const server = createVoiceLibraryServer({ config });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(config.port, "127.0.0.1", () => {
      server.off("error", reject);
      resolveListen();
    });
  });
  return server;
}

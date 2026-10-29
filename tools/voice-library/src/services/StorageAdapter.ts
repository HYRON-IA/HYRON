import type { StoredFile } from "../../../terabox-bridge/src/storage/StorageProvider.ts";

export class StorageBridgeError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "StorageBridgeError";
    this.status = status;
  }
}

export interface StorageAdapter {
  list(userId: string): Promise<StoredFile[]>;
  find(userId: string, fileId: string): Promise<StoredFile | null>;
  download(userId: string, fileId: string): Promise<Response | null>;
  delete(userId: string, fileId: string): Promise<boolean>;
}

export interface BridgeStorageOptions {
  baseUrl: string;
  apiKey: string;
  identity: string;
  fetcher?: typeof fetch;
}

interface BridgeEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

export class BridgeStorageAdapter implements StorageAdapter {
  private readonly baseUrl: URL;
  private readonly fetcher: typeof fetch;
  private readonly options: BridgeStorageOptions;

  constructor(options: BridgeStorageOptions) {
    this.options = options;
    this.baseUrl = new URL(options.baseUrl);
    if (
      this.baseUrl.protocol !== "http:" ||
      this.baseUrl.hostname !== "127.0.0.1"
    ) {
      throw new Error("Storage Bridge deve estar vinculado a 127.0.0.1.");
    }
    this.fetcher = options.fetcher ?? fetch;
  }

  async list(userId: string): Promise<StoredFile[]> {
    this.assertIdentity(userId);
    const response = await this.request("/api/files");
    const payload = await this.json<unknown>(response);
    if (
      !Array.isArray(payload) ||
      !payload.every((file) => isStoredFile(file))
    ) {
      throw new StorageBridgeError(
        "Resposta inválida recebida do Storage Bridge.",
        502,
      );
    }
    return payload;
  }

  async find(userId: string, fileId: string): Promise<StoredFile | null> {
    const files = await this.list(userId);
    return files.find((file) => file.id === fileId) ?? null;
  }

  async download(userId: string, fileId: string): Promise<Response | null> {
    this.assertIdentity(userId);
    const response = await this.request(
      `/api/files/${encodeURIComponent(fileId)}`,
      { method: "GET" },
      true,
      5 * 60 * 1000,
    );
    return response.status === 404 ? null : response;
  }

  async delete(userId: string, fileId: string): Promise<boolean> {
    this.assertIdentity(userId);
    const response = await this.request(
      `/api/files/${encodeURIComponent(fileId)}`,
      { method: "DELETE" },
      true,
    );
    if (response.status === 404) return false;
    const payload = await this.json<{ deleted?: boolean }>(response);
    return payload.deleted === true;
  }

  private assertIdentity(userId: string): void {
    if (userId !== this.options.identity) {
      throw new StorageBridgeError(
        "A identidade não corresponde à identidade autorizada no Storage Bridge.",
        403,
      );
    }
  }

  private async request(
    path: string,
    init: RequestInit = {},
    allowNotFound = false,
    timeoutMs = 10000,
  ): Promise<Response> {
    let response: Response;
    try {
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${this.options.apiKey}`);
      if (init.method === "DELETE") {
        headers.set("Content-Type", "application/json");
      }
      response = await this.fetcher(new URL(path, this.baseUrl), {
        ...init,
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new StorageBridgeError(
        "Não foi possível conectar ao Storage Bridge local.",
        503,
      );
    }
    if (!response.ok && !(allowNotFound && response.status === 404)) {
      throw new StorageBridgeError(
        `Storage Bridge respondeu com HTTP ${response.status}.`,
        response.status >= 500 ? 503 : 502,
      );
    }
    return response;
  }

  private async json<T>(response: Response): Promise<T> {
    let envelope: BridgeEnvelope<T>;
    try {
      envelope = (await response.json()) as BridgeEnvelope<T>;
    } catch {
      throw new StorageBridgeError(
        "Resposta JSON inválida recebida do Storage Bridge.",
        502,
      );
    }
    if (!envelope.success || envelope.data === undefined) {
      throw new StorageBridgeError(
        "Storage Bridge retornou uma resposta de erro.",
        502,
      );
    }
    return envelope.data;
  }
}

function isStoredFile(value: unknown): value is StoredFile {
  if (typeof value !== "object" || value === null) return false;
  const file = value as Record<string, unknown>;
  return (
    typeof file.id === "string" &&
    typeof file.filename === "string" &&
    typeof file.size === "number" &&
    typeof file.checksum === "string" &&
    (file.modelType === "rvc" ||
      file.modelType === "piper" ||
      file.modelType === "unknown") &&
    typeof file.createdAt === "string"
  );
}

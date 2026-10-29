import { createHash } from "node:crypto";
import {
  mkdtemp,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { deepEqual, equal, ok } from "node:assert/strict";
import {
  createBridgeServer,
  type BridgeConfig,
} from "../../terabox-bridge/src/server.ts";
import { LocalStorageProvider } from "../../terabox-bridge/src/storage/LocalStorageProvider.ts";
import type { StoredFile, UploadFileInput } from "../../terabox-bridge/src/storage/StorageProvider.ts";
import {
  createVoiceLibraryServer,
  startVoiceLibraryServer,
  type VoiceLibraryConfig,
} from "../src/api/server.ts";
import { LocalRegistryProvider } from "../src/providers/LocalRegistryProvider.ts";
import { BridgeStorageAdapter, type StorageAdapter } from "../src/services/StorageAdapter.ts";
import type { VoiceModel } from "../src/types/VoiceModel.ts";
import type { Server } from "node:http";

const API_KEY = "voice-library-test-key-long-enough-for-local-use";
const ALICE_KEY = "alice-test-key-long-enough-for-local-use";
const BOB_KEY = "bob-test-key-long-enough-for-local-use";

interface Fixture {
  root: string;
  server: Server;
  baseUrl: string;
  close(): Promise<void>;
}

class MemoryStorage implements StorageAdapter {
  readonly files = new Map<string, StoredFile>();
  readonly deleted: string[] = [];

  async list(userId: string): Promise<StoredFile[]> {
    return [...this.files.entries()]
      .filter(([key]) => key.startsWith(`${userId}:`))
      .map(([, file]) => file);
  }

  async find(userId: string, fileId: string): Promise<StoredFile | null> {
    return this.files.get(`${userId}:${fileId}`) ?? null;
  }

  async download(userId: string, fileId: string): Promise<Response | null> {
    const file = this.files.get(`${userId}:${fileId}`);
    return file ? new Response(new Uint8Array([1, 2, 3])) : null;
  }

  async delete(userId: string, fileId: string): Promise<boolean> {
    this.deleted.push(fileId);
    return this.files.delete(`${userId}:${fileId}`);
  }

  add(
    filename: string,
    modelType: StoredFile["modelType"] = "rvc",
    userId = "alice",
  ): StoredFile {
    const file: StoredFile = {
      id: randomId(),
      filename,
      size: 12,
      checksum: "a".repeat(64),
      modelType,
      createdAt: new Date().toISOString(),
    };
    this.files.set(`${userId}:${file.id}`, file);
    return file;
  }
}

async function fixture(storage = new MemoryStorage()): Promise<Fixture & { storage: MemoryStorage }> {
  const root = await mkdtemp(join(tmpdir(), "hyron-voice-library-test-"));
  const config: VoiceLibraryConfig = {
    apiKey: API_KEY,
    bridgeApiKey: API_KEY,
    bridgeUrl: "http://127.0.0.1:8788",
    dataDirectory: join(root, "registry"),
    previewDirectory: join(root, "previews"),
    maxPreviewBytes: 1024,
    port: 0,
  };
  const server = createVoiceLibraryServer({
    config,
    storage,
    resolveUser: (request) => {
      const header = request.headers.authorization;
      if (header === `Bearer ${ALICE_KEY}`) return "alice";
      if (header === `Bearer ${BOB_KEY}`) return "bob";
      return null;
    },
  });
  const baseUrl = await listen(server);
  return {
    root,
    server,
    baseUrl,
    storage,
    async close() {
      await stopServer(server);
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function request(
  server: Pick<Fixture, "baseUrl">,
  path: string,
  init: RequestInit = {},
  key: string | null = ALICE_KEY,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (key) headers.set("Authorization", `Bearer ${key}`);
  return fetch(`${server.baseUrl}${path}`, { ...init, headers });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function data<T>(body: Record<string, unknown>): T {
  return body.data as T;
}

function randomId(): string {
  return crypto.randomUUID();
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function createVoiceBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Voz de teste",
    description: "Modelo fictício",
    language: "pt-BR",
    modelType: "RVC",
    ...overrides,
  };
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Servidor de teste sem endereço local.");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function stopServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => (error ? reject(error) : resolve()));
  });
}

test("health, autenticação, catálogo, filtros, atualização e voz padrão", async () => {
  const app = await fixture();
  try {
    const health = await request(app, "/health", {}, null);
    equal(health.status, 200);
    equal((await json(health)).success, true);

    const unauthenticated = await request(app, "/voices", {}, null);
    equal(unauthenticated.status, 401);
    equal((await json(unauthenticated)).success, false);

    const createdResponse = await request(app, "/voices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createVoiceBody()),
    });
    equal(createdResponse.status, 201);
    const created = data<VoiceModel>(await json(createdResponse));
    equal(created.name, "Voz de teste");

    const other = await request(
      app,
      "/voices",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createVoiceBody({ name: "Piper", modelType: "ONNX" })),
      },
    );
    equal(other.status, 201);

    const filtered = await request(app, "/voices?search=piper&modelType=ONNX");
    const voices = data<VoiceModel[]>(await json(filtered));
    equal(voices.length, 1);
    equal(voices[0].name, "Piper");

    const patch = await request(app, `/voices/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Voz atualizada", description: "" }),
    });
    equal(patch.status, 200);
    const updated = data<VoiceModel>(await json(patch));
    equal(updated.name, "Voz atualizada");
    equal(updated.description, undefined);

    const setDefault = await request(app, "/voices/default", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceId: created.id }),
    });
    equal(setDefault.status, 200);

    const defaultVoice = await request(app, "/voices/default");
    equal(data<VoiceModel>(await json(defaultVoice)).id, created.id);
  } finally {
    await app.close();
  }

  const upstreamFailure = new BridgeStorageAdapter({
    baseUrl: "http://127.0.0.1:8788",
    apiKey: API_KEY,
    identity: "alice",
    fetcher: async () => new Response("internal upstream details", { status: 500 }),
  });
  try {
    await upstreamFailure.list("alice");
    throw new Error("Esperava falha do serviço dependente.");
  } catch (error) {
    ok(error instanceof Error);
    equal(error.message, "Storage Bridge respondeu com HTTP 500.");
  }
});

test("smoke test: inicialização local e GET /health", async () => {
  const root = await mkdtemp(join(tmpdir(), "hyron-voice-smoke-"));
  const config: VoiceLibraryConfig = {
    apiKey: API_KEY,
    bridgeApiKey: API_KEY,
    bridgeUrl: "http://127.0.0.1:8788",
    dataDirectory: join(root, "registry"),
    previewDirectory: join(root, "previews"),
    maxPreviewBytes: 1024,
    port: 0,
  };
  const server = await startVoiceLibraryServer(config);
  try {
    const address = server.address();
    ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    equal(response.status, 200);
    const health = data<{ component: string }>(await json(response));
    equal(health.component, "HYRON Voice Library");
  } finally {
    await stopServer(server);
    await rm(root, { recursive: true, force: true });
  }
});

test("catálogo persiste após recriação do servidor e isola identidades", async () => {
  const app = await fixture();
  try {
    const created = await request(app, "/voices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createVoiceBody()),
    });
    const voice = data<VoiceModel>(await json(created));
    const bobList = await request(app, "/voices", {}, BOB_KEY);
    equal(data<VoiceModel[]>(await json(bobList)).length, 0);
    const bobLookup = await request(app, `/voices/${voice.id}`, {}, BOB_KEY);
    equal(bobLookup.status, 404);

    await stopServer(app.server);
    const restart = createVoiceLibraryServer({
      config: {
        apiKey: API_KEY,
        bridgeApiKey: API_KEY,
        bridgeUrl: "http://127.0.0.1:8788",
        dataDirectory: join(app.root, "registry"),
        previewDirectory: join(app.root, "previews"),
        maxPreviewBytes: 1024,
        port: 0,
      },
      storage: app.storage,
      resolveUser: (request) => {
        const header = request.headers.authorization;
        if (header === `Bearer ${ALICE_KEY}`) return "alice";
        if (header === `Bearer ${BOB_KEY}`) return "bob";
        return null;
      },
    });
    const baseUrl = await listen(restart);
    const restored = await request({ baseUrl }, `/voices/${voice.id}`);
    equal(data<VoiceModel>(await json(restored)).id, voice.id);
    await stopServer(restart);
  } finally {
    await rm(app.root, { recursive: true, force: true });
  }
});

test("rejeita referências inexistentes, formatos incompatíveis e entradas inválidas", async () => {
  const app = await fixture();
  try {
    const unknownFile = await request(app, "/voices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createVoiceBody({ fileIds: [randomId()] })),
    });
    equal(unknownFile.status, 404);

    const privateFile = app.storage.add("private.pth", "rvc", "alice");
    const otherIdentity = await request(
      app,
      "/voices",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createVoiceBody({ fileIds: [privateFile.id] })),
      },
      BOB_KEY,
    );
    equal(otherIdentity.status, 404);

    const piper = app.storage.add("voice.onnx", "piper");
    const wrongType = await request(app, "/voices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createVoiceBody({ fileIds: [piper.id] })),
    });
    equal(wrongType.status, 400);

    const invalid = await request(app, "/voices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createVoiceBody({ userId: "bob", name: "../bad" })),
    });
    equal(invalid.status, 400);
  } finally {
    await app.close();
  }
});

test("anexa referências verificadas, permite compartilhamento e protege exclusão", async () => {
  const app = await fixture();
  try {
    const file = app.storage.add("voice.pth");
    const create = async (name: string) => {
      const response = await request(app, "/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createVoiceBody({ name, fileIds: [file.id] })),
      });
      return data<VoiceModel>(await json(response));
    };
    const first = await create("Primeira");
    const second = await create("Segunda");
    const detachShared = await request(
      app,
      `/voices/${first.id}/files/${file.id}`,
      { method: "DELETE" },
    );
    equal(detachShared.status, 200);
    equal(data<{ deletedFromStorage: boolean }>(await json(detachShared)).deletedFromStorage, false);
    equal(app.storage.deleted.length, 0);

    const detachLast = await request(
      app,
      `/voices/${second.id}/files/${file.id}`,
      { method: "DELETE" },
    );
    equal(detachLast.status, 200);
    equal(data<{ deletedFromStorage: boolean }>(await json(detachLast)).deletedFromStorage, true);
    deepEqual(app.storage.deleted, [file.id]);
  } finally {
    await app.close();
  }
});

test("amostra de áudio é validada, armazenada separadamente, transmitida e removida", async () => {
  const app = await fixture();
  try {
    const created = await request(app, "/voices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createVoiceBody()),
    });
    const voice = data<VoiceModel>(await json(created));
    const audio = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00]);
    const upload = await request(
      app,
      `/voices/${voice.id}/preview`,
      {
        method: "POST",
        headers: {
          "Content-Type": "audio/mpeg",
          "X-Content-SHA256": sha256(audio),
        },
        body: audio,
      },
    );
    equal(upload.status, 201);
    const metadata = data<{ id: string }>(await json(upload));
    const preview = await request(app, `/voices/${voice.id}/preview`);
    equal(preview.headers.get("content-type"), "audio/mpeg");
    deepEqual(new Uint8Array(await preview.arrayBuffer()), audio);

    const remove = await request(app, `/voices/${voice.id}/preview`, {
      method: "DELETE",
    });
    equal(remove.status, 200);
    equal((await request(app, `/voices/${voice.id}/preview`)).status, 404);
    ok(metadata.id.length > 0);

    const invalidAudio = await request(
      app,
      `/voices/${voice.id}/preview`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-msdownload",
          "X-Content-SHA256": sha256(audio),
        },
        body: audio,
      },
    );
    equal(invalidAudio.status, 400);

    const invalidChecksum = await request(app, `/voices/${voice.id}/preview`, {
      method: "POST",
      headers: {
        "Content-Type": "audio/mpeg",
        "X-Content-SHA256": "0".repeat(64),
      },
      body: audio,
    });
    equal(invalidChecksum.status, 400);
  } finally {
    await app.close();
  }
});

test("exclusão de voz limpa a seleção padrão sem remover registros alheios", async () => {
  const app = await fixture();
  try {
    const stored = app.storage.add("voice.pth");
    const created = await request(app, "/voices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createVoiceBody({ fileIds: [stored.id] })),
    });
    const voice = data<VoiceModel>(await json(created));
    await request(app, "/voices/default", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceId: voice.id }),
    });
    const removed = await request(app, `/voices/${voice.id}`, {
      method: "DELETE",
    });
    equal(removed.status, 200);
    equal(await request(app, "/voices/default").then((response) => response.status), 200);
    equal(data<VoiceModel | null>(await json(await request(app, "/voices/default"))), null);
    ok(await app.storage.find("alice", stored.id));
  } finally {
    await app.close();
  }
});

test("adaptador comunica com as rotas reais do Storage Bridge v0.2", async () => {
  const root = await mkdtemp(join(tmpdir(), "hyron-voice-bridge-contract-"));
  const bridgeKey = "shared-test-key-long-enough-for-both-local-services";
  const identity = createHash("sha256").update(bridgeKey).digest("hex");
  const provider = new LocalStorageProvider({ directory: join(root, "bridge-storage") });
  const bridgeConfig: BridgeConfig = {
    provider: "local",
    storageDirectory: join(root, "bridge-storage"),
    apiKey: bridgeKey,
    maxFileSizeBytes: 1024 * 1024,
    maxChunkSizeBytes: 1024,
    maxUserStorageBytes: 2 * 1024 * 1024,
    port: 0,
  };
  const bridgeServer = createBridgeServer({ config: bridgeConfig, provider });
  const bridgeUrl = await listen(bridgeServer);
  const libraryServer = createVoiceLibraryServer({
    config: {
      apiKey: bridgeKey,
      bridgeApiKey: bridgeKey,
      bridgeUrl,
      dataDirectory: join(root, "registry"),
      previewDirectory: join(root, "previews"),
      maxPreviewBytes: 1024,
      port: 0,
    },
  });
  try {
    const bytes = new Uint8Array([4, 2, 4, 2]);
    async function* stream(): AsyncGenerator<Uint8Array> {
      yield bytes;
    }
    const stored = await provider.upload({
      userId: identity,
      filename: "model.pth",
      modelType: "rvc",
      checksum: sha256(bytes),
      size: bytes.length,
      stream: stream(),
    } satisfies UploadFileInput);
    const libraryUrl = await listen(libraryServer);
    const created = await fetch(`${libraryUrl}/voices`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bridgeKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createVoiceBody({ fileIds: [stored.id] })),
    });
    equal(created.status, 201);
    const voice = data<VoiceModel>(await json(created));
    equal(voice.files[0].filename, "model.pth");

    const download = await fetch(`${libraryUrl}/voices/${voice.id}/files/${stored.id}`, {
      headers: { Authorization: `Bearer ${bridgeKey}` },
    });
    equal(download.status, 200);
    deepEqual(new Uint8Array(await download.arrayBuffer()), bytes);

    const deleted = await fetch(
      `${libraryUrl}/voices/${voice.id}/files/${stored.id}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${bridgeKey}` } },
    );
    equal(deleted.status, 200);
    equal(await provider.exists(identity, stored.id), false);
  } finally {
    await stopServer(libraryServer);
    await stopServer(bridgeServer);
    await rm(root, { recursive: true, force: true });
  }
});

test("adaptador informa indisponibilidade sem expor detalhes de rede", async () => {
  const adapter = new BridgeStorageAdapter({
    baseUrl: "http://127.0.0.1:8788",
    apiKey: API_KEY,
    identity: "alice",
    fetcher: async () => {
      throw new Error("network failure with private details");
    },
  });
  try {
    await adapter.list("alice");
    throw new Error("Esperava falha de conexão.");
  } catch (error) {
    ok(error instanceof Error);
    equal(error.message, "Não foi possível conectar ao Storage Bridge local.");
  }
});

test("provider de catálogo mantém snapshots independentes por identidade", async () => {
  const root = await mkdtemp(join(tmpdir(), "hyron-voice-registry-test-"));
  try {
    const provider = new LocalRegistryProvider(root);
    const alice = await provider.load("alice");
    const bob = await provider.load("bob");
    alice.voices.push({
      id: randomId(),
      name: "Alice",
      language: "pt-BR",
      modelType: "OTHER",
      files: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await provider.save("alice", alice);
    equal((await provider.load("alice")).voices.length, 1);
    equal((await provider.load("bob")).voices.length, 0);
    equal(bob.voices.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

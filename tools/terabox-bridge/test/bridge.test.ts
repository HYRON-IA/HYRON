import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { deepEqual, equal, ok, rejects } from "node:assert/strict";
import {
  createBridgeServer,
  startBridgeServer,
  type BridgeConfig,
} from "../src/server.ts";
import { LocalStorageProvider } from "../src/storage/LocalStorageProvider.ts";
import type { UploadFileInput } from "../src/storage/StorageProvider.ts";
import { TeraBoxStorageProvider } from "../src/storage/TeraBoxStorageProvider.ts";
import type { Server } from "node:http";

const API_KEY = "test-api-key-that-is-long-enough-for-local-dev";

interface JsonResponse {
  success: boolean;
  data?: Record<string, unknown> | Array<Record<string, unknown>>;
  error?: { code: string; message: string };
}

interface Fixture {
  root: string;
  server: Server;
  baseUrl: string;
  close(): Promise<void>;
}

async function fixture(
  overrides: Partial<BridgeConfig> = {},
  resolveUser?: (request: import("node:http").IncomingMessage) => string | null,
): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "hyron-bridge-test-"));
  const config: BridgeConfig = {
    provider: "local",
    storageDirectory: root,
    apiKey: API_KEY,
    maxFileSizeBytes: 1024 * 1024,
    maxChunkSizeBytes: 1024,
    maxUserStorageBytes: 2 * 1024 * 1024,
    port: 0,
    ...overrides,
  };
  const server = createBridgeServer({ config, resolveUser });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Servidor de teste não obteve porta local.");
  }
  return {
    root,
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await stopServer(server);
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function request(
  server: Fixture,
  path: string,
  init: RequestInit = {},
  apiKey = API_KEY,
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (apiKey) headers.set("Authorization", "Bearer " + apiKey);
  return fetch(`${server.baseUrl}${path}`, { ...init, headers });
}

async function json(response: Response): Promise<JsonResponse> {
  return (await response.json()) as JsonResponse;
}

function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

async function createSession(
  server: Fixture,
  data: Uint8Array,
  filename = "voice.pth",
  chunkSize = 4,
  checksum = sha256(data),
): Promise<string> {
  const response = await request(server, "/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename,
      size: data.byteLength,
      checksum,
      chunkSize,
    }),
  });
  equal(response.status, 201);
  const payload = await json(response);
  ok(payload.data && !Array.isArray(payload.data));
  return String(payload.data.uploadId);
}

async function putChunk(
  server: Fixture,
  uploadId: string,
  index: number,
  chunk: Uint8Array,
): Promise<Response> {
  return request(server, `/api/uploads/${uploadId}`, {
    method: "PATCH",
    headers: { "X-Chunk-Index": String(index) },
    body: chunk,
  });
}

async function closeFixture(server: Fixture): Promise<void> {
  await server.close();
}

async function stopServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
}

test("health público e API protegida", async () => {
  const server = await fixture();
  try {
    const health = await request(server, "/health", {}, "");
    equal(health.status, 200);
    const unauthenticated = await request(server, "/api/files", {}, "");
    equal(unauthenticated.status, 401);
  } finally {
    await closeFixture(server);
  }
});

test("upload pequeno, listagem, download íntegro e exclusão", async () => {
  const server = await fixture();
  try {
    const data = Buffer.from("fake-rvc-model");
    const uploadId = await createSession(server, data, "voice.pth", data.length);
    equal((await putChunk(server, uploadId, 0, data)).status, 200);
    const completed = await request(server, `/api/uploads/${uploadId}/complete`, {
      method: "POST",
    });
    equal(completed.status, 201);
    const saved = await json(completed);
    ok(saved.data && !Array.isArray(saved.data));
    equal(saved.data.modelType, "rvc");

    const listing = await request(server, "/api/files");
    const listed = await json(listing);
    ok(Array.isArray(listed.data));
    equal(listed.data.length, 1);
    const fileId = String(listed.data[0].id);
    const downloaded = await request(server, `/api/files/${fileId}`);
    equal(downloaded.status, 200);
    const returnedBytes = new Uint8Array(await downloaded.arrayBuffer());
    deepEqual(Array.from(returnedBytes), Array.from(data));
    equal(downloaded.headers.get("x-content-sha256"), sha256(data));

    const deleted = await request(server, `/api/files/${fileId}`, {
      method: "DELETE",
    });
    equal(deleted.status, 200);
    equal((await (await request(server, "/api/files")).json() as JsonResponse).data instanceof Array, true);
    equal((await request(server, `/api/files/${fileId}`)).status, 404);
  } finally {
    await closeFixture(server);
  }
});

test("identifica modelo Piper com extensão composta .onnx.json", async () => {
  const server = await fixture();
  try {
    const data = Buffer.from("fake-piper-config");
    const uploadId = await createSession(
      server,
      data,
      "voice.onnx.json",
      data.length,
    );
    equal((await putChunk(server, uploadId, 0, data)).status, 200);
    const response = await request(
      server,
      `/api/uploads/${uploadId}/complete`,
      { method: "POST" },
    );
    equal(response.status, 201);
    const result = await json(response);
    ok(result.data && !Array.isArray(result.data));
    equal(result.data.modelType, "piper");
  } finally {
    await closeFixture(server);
  }
});

test("upload multipart e retomada após reiniciar o servidor", async () => {
  let server = await fixture();
  const data = Buffer.from("abcdefghij");
  try {
    const uploadId = await createSession(server, data, "voice.index", 4);
    equal((await putChunk(server, uploadId, 0, data.subarray(0, 4))).status, 200);
    const firstProgress = await json(
      await request(server, `/api/uploads/${uploadId}`),
    );
    ok(firstProgress.data && !Array.isArray(firstProgress.data));
    equal(firstProgress.data.nextChunkIndex, 1);

    const root = server.root;
    await stopServer(server.server);
    const restarted = await fixtureWithRoot(root);
    server = restarted;

    const resumed = await json(await request(server, `/api/uploads/${uploadId}`));
    ok(resumed.data && !Array.isArray(resumed.data));
    equal(resumed.data.nextChunkIndex, 1);
    equal((await putChunk(server, uploadId, 2, data.subarray(8))).status, 409);
    equal((await putChunk(server, uploadId, 1, data.subarray(4, 8))).status, 200);
    equal((await putChunk(server, uploadId, 2, data.subarray(8))).status, 200);
    equal(
      (await request(server, `/api/uploads/${uploadId}/complete`, {
        method: "POST",
      })).status,
      201,
    );
  } finally {
    await closeFixture(server);
  }
});

async function fixtureWithRoot(root: string): Promise<Fixture> {
  const config: BridgeConfig = {
    provider: "local",
    storageDirectory: root,
    apiKey: API_KEY,
    maxFileSizeBytes: 1024 * 1024,
    maxChunkSizeBytes: 1024,
    maxUserStorageBytes: 2 * 1024 * 1024,
    port: 0,
  };
  const server = await startBridgeServer(config);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Servidor reiniciado não obteve porta local.");
  }
  return {
    root,
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise<void>((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()));
      });
      await rm(root, { recursive: true, force: true });
    },
  };
}

test("sessões expiradas são limpas ao iniciar o servidor", async () => {
  const server = await fixture();
  let restarted: Fixture | undefined;
  try {
    const data = Buffer.from("resumable");
    const uploadId = await createSession(server, data, "voice.pth", 4);
    const userId = sha256(Buffer.from(API_KEY));
    const userDirectory = sha256(Buffer.from(userId));
    const metadataPath = join(
      server.root,
      ".uploads",
      userDirectory,
      uploadId,
      "session.json",
    );
    const session = JSON.parse(await readFile(metadataPath, "utf8")) as {
      expiresAt: number;
    };
    session.expiresAt = 1;
    await writeFile(metadataPath, JSON.stringify(session), "utf8");
    const root = server.root;
    await stopServer(server.server);
    restarted = await fixtureWithRoot(root);
    equal((await request(restarted, `/api/uploads/${uploadId}`)).status, 404);
  } finally {
    if (restarted) {
      await closeFixture(restarted);
    } else {
      await closeFixture(server);
    }
  }
});

test("partes duplicadas ou fora de sequência não são aceitas", async () => {
  const server = await fixture();
  try {
    const data = Buffer.from("abcdefgh");
    const uploadId = await createSession(server, data, "voice.pth", 4);
    equal((await putChunk(server, uploadId, 1, data.subarray(4))).status, 409);
    equal((await putChunk(server, uploadId, 0, data.subarray(0, 4))).status, 200);
    equal((await putChunk(server, uploadId, 0, data.subarray(0, 4))).status, 409);
  } finally {
    await closeFixture(server);
  }
});

test("upload incompleto não pode ser finalizado", async () => {
  const server = await fixture();
  try {
    const data = Buffer.from("abcdefgh");
    const uploadId = await createSession(server, data, "voice.pth", 4);
    equal(
      (await request(server, `/api/uploads/${uploadId}/complete`, {
        method: "POST",
      })).status,
      409,
    );
  } finally {
    await closeFixture(server);
  }
});

test("checksum incorreto é rejeitado sem publicar arquivo", async () => {
  const server = await fixture();
  try {
    const data = Buffer.from("fake model");
    const wrongChecksum = "0".repeat(64);
    const uploadId = await createSession(
      server,
      data,
      "voice.onnx",
      data.length,
      wrongChecksum,
    );
    equal((await putChunk(server, uploadId, 0, data)).status, 200);
    const completion = await request(
      server,
      `/api/uploads/${uploadId}/complete`,
      { method: "POST" },
    );
    equal(completion.status, 422);
    const listing = await json(await request(server, "/api/files"));
    ok(Array.isArray(listing.data));
    equal(listing.data.length, 0);
  } finally {
    await closeFixture(server);
  }
});

test("extensões inválidas e path traversal no nome são rejeitados", async () => {
  const server = await fixture();
  try {
    for (const filename of ["payload.exe", "..\\outside.pth", "../outside.pth"]) {
      const response = await request(server, "/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename,
          size: 5,
          checksum: "a".repeat(64),
          chunkSize: 5,
        }),
      });
      equal(response.status, 400);
    }
  } finally {
    await closeFixture(server);
  }
});

test("arquivo maior que o limite e quota por usuário são rejeitados", async () => {
  const server = await fixture({ maxFileSizeBytes: 16, maxUserStorageBytes: 8 });
  try {
    const tooLarge = await request(server, "/api/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: "voice.pth",
        size: 17,
        checksum: "a".repeat(64),
        chunkSize: 4,
      }),
    });
    equal(tooLarge.status, 413);

    const data = Buffer.from("12345678");
    const uploadId = await createSession(server, data, "voice.pth", 4);
    equal((await putChunk(server, uploadId, 0, data.subarray(0, 4))).status, 200);
    equal((await putChunk(server, uploadId, 1, data.subarray(4))).status, 200);
    equal(
      (await request(server, `/api/uploads/${uploadId}/complete`, {
        method: "POST",
      })).status,
      201,
    );
    const quotaExceeded = await request(server, "/api/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: "second.pth",
        size: 1,
        checksum: sha256(Buffer.from("x")),
        chunkSize: 1,
      }),
    });
    equal(quotaExceeded.status, 413);
  } finally {
    await closeFixture(server);
  }
});

test("arquivos e sessões são isolados por usuário", async () => {
  const keys = new Map([
    ["user-a-key", "user-a"],
    ["user-b-key", "user-b"],
  ]);
  const server = await fixture({}, (request) => {
    const authorization = request.headers.authorization;
    if (typeof authorization !== "string") return null;
    return keys.get(authorization.slice("Bearer ".length)) ?? null;
  });
  try {
    const bytes = Buffer.from("secret model");
    const input: UploadFileInput = {
      userId: "user-a",
      filename: "voice.pth",
      modelType: "rvc",
      checksum: sha256(bytes),
      size: bytes.length,
      stream: (async function* () {
        yield bytes;
      })(),
    };
    const provider = new LocalStorageProvider({ directory: server.root });
    const stored = await provider.upload(input);
    equal(await provider.exists("user-a", stored.id), true);
    equal(await provider.exists("user-b", stored.id), false);
    equal(await provider.list("user-b").then((files) => files.length), 0);

    const otherUserDownload = await request(
      server,
      `/api/files/${stored.id}`,
      {},
      "user-b-key",
    );
    equal(otherUserDownload.status, 404);
  } finally {
    await closeFixture(server);
  }
});

test("provedor TeraBox não configurado retorna erro explícito", async () => {
  const provider = new TeraBoxStorageProvider();
  await rejects(() => provider.list("user"), /não está configurado/);
  const server = await fixture({ provider: "terabox" });
  try {
    const response = await request(server, "/api/files");
    equal(response.status, 503);
    const payload = await json(response);
    equal(payload.error?.code, "PROVIDER_NOT_CONFIGURED");
  } finally {
    await closeFixture(server);
  }
});

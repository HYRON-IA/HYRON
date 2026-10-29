import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { test } from "node:test";
import { equal, ok, rejects } from "node:assert/strict";
import { createVoiceLibraryServer } from "../../voice-library/src/api/server.ts";
import type { VoiceLibraryConfig } from "../../voice-library/src/api/server.ts";
import type { StorageAdapter } from "../../voice-library/src/services/StorageAdapter.ts";
import type { VoiceLibraryVoice, TTSEngine } from "../src/types/VoiceEngine.ts";
import {
  createVoiceEngineServer,
  createDefaultPipeline,
  type VoiceEngineConfig,
} from "../src/api/server.ts";
import { WindowsSapiEngine } from "../src/engines/WindowsSapiEngine.ts";
import { KokoroEngine } from "../src/engines/KokoroEngine.ts";
import { PiperEngine } from "../src/engines/PiperEngine.ts";
import { RVCEngine } from "../src/engines/RVCEngine.ts";
import { AudioProcessor } from "../src/services/AudioProcessor.ts";
import { VoicePipeline } from "../src/services/VoicePipeline.ts";
import { VoiceLibraryClient } from "../src/services/VoiceLibraryClient.ts";
import type { Server } from "node:http";

const API_KEY = "voice-engine-test-key-long-enough-for-local-development";
const voiceFixture: VoiceLibraryVoice = {
  id: "9a7d9c27-a211-4b66-bbbe-79be85089711",
  name: "RVC fictícia",
  language: "pt-BR",
  modelType: "RVC",
  files: [
    {
      fileId: "055a3af5-1f6a-40ec-8bc3-307043fcf4b0",
      type: "pth",
      filename: "voice.pth",
    },
    {
      fileId: "0a03c577-82eb-4d49-bb4b-77bc50e1e2f0",
      type: "index",
      filename: "voice.index",
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

interface Fixture {
  root: string;
  server: Server;
  baseUrl: string;
  close(): Promise<void>;
}

class FakeEngine implements TTSEngine {
  readonly id = "fake-unit-test";
  readonly name = "Unit test fake";
  delayMs = 0;
  fail = false;
  calls = 0;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async synthesize(
    _text: string,
    options: { outputDirectory: string; signal: AbortSignal },
  ): Promise<string> {
    this.calls += 1;
    if (this.fail) throw new Error("private engine failure detail");
    if (this.delayMs > 0) {
      await new Promise<void>((resolveDelay, reject) => {
        const timer = setTimeout(resolveDelay, this.delayMs);
        options.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new Error("cancelled"));
          },
          { once: true },
        );
      });
    }
    const path = join(options.outputDirectory, "unit-test.wav");
    await writeFile(path, makeWav(), undefined);
    return path;
  }
}

class EmptyStorage implements StorageAdapter {
  async list(): Promise<[]> {
    return [];
  }
  async find(): Promise<null> {
    return null;
  }
  async download(): Promise<null> {
    return null;
  }
  async delete(): Promise<boolean> {
    return false;
  }
}

function makeWav(): Uint8Array {
  const dataLength = 8000;
  const bytes = new Uint8Array(44 + dataLength);
  const view = new DataView(bytes.buffer);
  writeAscii(bytes, 0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  writeAscii(bytes, 8, "WAVE");
  writeAscii(bytes, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(bytes, 36, "data");
  view.setUint32(40, dataLength, true);
  return bytes;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index);
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function makeConfig(root: string, voiceLibraryUrl = "http://127.0.0.1:8790"): VoiceEngineConfig {
  return {
    apiKey: API_KEY,
    voiceLibraryUrl,
    voiceLibraryApiKey: API_KEY,
    temporaryDirectory: join(root, "audio"),
    port: 0,
    maxTextLength: 300,
    maxAudioBytes: 2 * 1024 * 1024,
    maxAudioDurationSeconds: 10,
    timeoutMs: 5000,
    maxJobs: 5,
    jobTtlMs: 30000,
  };
}

function makeLibraryConfig(root: string): VoiceLibraryConfig {
  return {
    apiKey: API_KEY,
    bridgeUrl: "http://127.0.0.1:8788",
    bridgeApiKey: API_KEY,
    dataDirectory: join(root, "registry"),
    previewDirectory: join(root, "previews"),
    maxPreviewBytes: 1024,
    port: 0,
  };
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Servidor de teste não obteve porta local.");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, reject) => {
    server.close((error?: Error) =>
      error ? reject(error) : resolveClose(),
    );
  });
}

async function waitForJob(
  baseUrl: string,
  jobId: string,
  timeoutMs = 65_000,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const body = (await response.json()) as {
      data?: Record<string, unknown>;
    };
    if (body.data?.status === "completed" || body.data?.status === "failed") {
      return body.data;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error("Job de teste não terminou no prazo.");
}

function makePipeline(
  root: string,
  engine: TTSEngine,
  library: Pick<VoiceLibraryClient, "list" | "getDefault" | "get" | "resolve">,
  timeoutMs = 1000,
): VoicePipeline {
  return new VoicePipeline({
    engines: [engine],
    voiceLibrary: library as VoiceLibraryClient,
    processor: new AudioProcessor({
      maxBytes: 2 * 1024 * 1024,
      maxDurationSeconds: 10,
    }),
    temporaryDirectory: join(root, "temp"),
    timeoutMs,
    maxTextLength: 200,
    maxJobs: 4,
    jobTtlMs: 30000,
    sapiVoiceNames: async () => ["Fake"],
    conversionEngine: new RVCEngine(),
  });
}

test("jobs validam texto, usam TTS selecionado e isolam estado por identidade", async () => {
  const root = await mkdtemp(join(process.env.TEMP ?? ".", "hyron-engine-unit-"));
  const engine = new FakeEngine();
  const library = {
    list: async () => [],
    getDefault: async () => null,
    get: async () => {
      throw new Error("not found");
    },
    resolve: async () => null,
  };
  try {
    const pipeline = makePipeline(root, engine, library);
    let invalid = false;
    try {
      await pipeline.createSynthesisJob("alice", { text: "\u0001" });
    } catch (error) {
      invalid = error instanceof Error && error.message.includes("text");
    }
    equal(invalid, true);
    let textLimitRejected = false;
    try {
      await pipeline.createSynthesisJob("alice", {
        text: "x".repeat(201),
        engineId: engine.id,
      });
    } catch (error) {
      textLimitRejected = error instanceof Error && error.message.includes("text");
    }
    equal(textLimitRejected, true);

    const job = await pipeline.createSynthesisJob("alice", {
      text: "Olá, HYRON.",
      engineId: engine.id,
    });
    equal(job.status, "running");
    equal(pipeline.getJob("bob", job.id), null);
    let completed: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const current = pipeline.getJob("alice", job.id);
      if (current?.status === "completed") {
        completed = current as unknown as Record<string, unknown>;
        break;
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
    }
    ok(completed);
    equal(completed.status, "completed");
    equal(engine.calls, 1);
    equal(pipeline.getAudio("bob", job.id), null);
    const audio = pipeline.getAudio("alice", job.id);
    ok(audio);
    const info = await stat(audio.path);
    equal(info.size, audio.size);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("audio validation rejects oversized and over-duration WAV files", async () => {
  const root = await mkdtemp(join(process.env.TEMP ?? ".", "hyron-engine-audio-"));
  const path = join(root, "synthetic.wav");
  try {
    await writeFile(path, makeWav());
    await rejects(
      () => new AudioProcessor({ maxBytes: 100, maxDurationSeconds: 10 }).validateWav(path),
      /excede o limite/,
    );
    await rejects(
      () => new AudioProcessor({ maxBytes: 100_000, maxDurationSeconds: 0.25 }).validateWav(path),
      /duração/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("audio validation rejects WAV headers that claim bytes beyond the file", async () => {
  const root = await mkdtemp(join(process.env.TEMP ?? ".", "hyron-engine-invalid-wav-"));
  const path = join(root, "truncated.wav");
  const bytes = makeWav();
  new DataView(bytes.buffer).setUint32(4, bytes.length + 100, true);
  try {
    await writeFile(path, bytes);
    await rejects(
      () => new AudioProcessor({ maxBytes: 100_000, maxDurationSeconds: 10 }).validateWav(path),
      /cabeçalho WAV excede/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("timeouts and cancellation terminate jobs without exposing engine errors", async () => {
  const root = await mkdtemp(join(process.env.TEMP ?? ".", "hyron-engine-cancel-"));
  const engine = new FakeEngine();
  engine.delayMs = 500;
  const library = {
    list: async () => [],
    getDefault: async () => null,
    get: async () => {
      throw new Error("not found");
    },
    resolve: async () => null,
  };
  try {
    const pipeline = makePipeline(root, engine, library, 30);
    const timeoutJob = await pipeline.createSynthesisJob("alice", {
      text: "Timeout",
      engineId: engine.id,
    });
    let timeoutState: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const current = pipeline.getJob("alice", timeoutJob.id);
      if (current?.status === "failed") {
        timeoutState = current as unknown as Record<string, unknown>;
        break;
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
    }
    ok(timeoutState);
    equal(
      (timeoutState.error as Record<string, unknown>).code,
      "TTS_TIMEOUT",
    );

    const cancelJob = await pipeline.createSynthesisJob("alice", {
      text: "Cancel",
      engineId: engine.id,
    });
    equal(await pipeline.cancel("alice", cancelJob.id), true);
    equal(pipeline.getJob("alice", cancelJob.id), null);
    equal(await pipeline.cancel("bob", cancelJob.id), false);

    engine.fail = true;
    const failedJob = await pipeline.createSynthesisJob("alice", {
      text: "Falha de mecanismo",
      engineId: engine.id,
    });
    let failedState: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const current = pipeline.getJob("alice", failedJob.id);
      if (current?.status === "failed") {
        failedState = current as unknown as Record<string, unknown>;
        break;
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
    }
    ok(failedState);
    const errorInfo = failedState.error as { code: string; message: string };
    equal(errorInfo.code, "TTS_FAILED");
    equal(errorInfo.message.includes("private"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("RVC and unavailable local engines fail explicitly; no conversion is simulated", async () => {
  const rvc = new RVCEngine();
  const kokoro = new KokoroEngine();
  const piper = new PiperEngine({ timeoutMs: 100 });
  equal(await rvc.isAvailable(), false);
  equal(await kokoro.isAvailable(), false);
  equal(await piper.isAvailable(), false);
  let rvcError = false;
  try {
    await rvc.convert("input.wav", [], new AbortController().signal);
  } catch (error) {
    rvcError = error instanceof Error && error.message.includes("ENGINE_NOT_AVAILABLE");
  }
  equal(rvcError, true);

  const fake = new FakeEngine();
  const validLibrary = {
    list: async () => [voiceFixture],
    getDefault: async () => voiceFixture,
    get: async () => voiceFixture,
    resolve: async () => voiceFixture,
  };
  const pipeline = makePipeline(".", fake, validLibrary);
  await rejects(
    () => pipeline.convert("authorized-local-owner", voiceFixture.id),
    /RVC segura não está disponível/,
  );
  const incompleteVoice = {
    ...voiceFixture,
    files: [voiceFixture.files[0]],
  };
  const incompleteLibrary = {
    ...validLibrary,
    resolve: async () => incompleteVoice,
  };
  await rejects(
    () => makePipeline(".", fake, incompleteLibrary).convert("owner", voiceFixture.id),
    /não contém referências RVC/,
  );
});

test("Piper lists only installed ONNX models with valid metadata sidecars", async () => {
  const root = await mkdtemp(join(process.env.TEMP ?? ".", "hyron-engine-piper-"));
  const models = join(root, "models");
  try {
    await mkdir(models, { recursive: true });
    await writeFile(join(models, "pt_BR-voice.onnx"), new Uint8Array([1]));
    await writeFile(join(models, "pt_BR-voice.onnx.json"), "{}");
    await writeFile(join(models, "invalid.onnx"), new Uint8Array([1]));
    await writeFile(join(models, "invalid.onnx.json"), "{");
    await writeFile(join(models, "not-a-voice.pth"), new Uint8Array([1]));
    const piper = new PiperEngine({
      executable: join(root, "missing-piper.exe"),
      modelDirectory: models,
      timeoutMs: 1000,
    });

    equal(await piper.isAvailable(), false);
    equal(JSON.stringify(await piper.listVoices()), JSON.stringify(["pt_BR-voice"]));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("real Piper inference completes through the authenticated Voice Engine API", {
  skip: !(
    process.env.HYRON_TEST_PIPER === "1" &&
    process.env.PIPER_EXECUTABLE &&
    process.env.PIPER_MODEL_PATH
  ),
}, async () => {
  const executable = process.env.PIPER_EXECUTABLE;
  const modelPath = process.env.PIPER_MODEL_PATH;
  if (!executable || !modelPath) {
    throw new Error("Piper real requer PIPER_EXECUTABLE e PIPER_MODEL_PATH.");
  }
  const root = await mkdtemp(join(process.env.TEMP ?? ".", "hyron-engine-piper-real-"));
  const libraryRoot = await mkdtemp(
    join(process.env.TEMP ?? ".", "hyron-engine-piper-library-"),
  );
  const libraryServer = createVoiceLibraryServer({
    config: makeLibraryConfig(libraryRoot),
    storage: new EmptyStorage(),
  });
  let engineServer: Server | undefined;
  try {
    const libraryUrl = await listen(libraryServer);
    const config = {
      ...makeConfig(root, libraryUrl),
      piperExecutable: resolve(executable),
      piperModelPath: resolve(modelPath),
      timeoutMs: 180_000,
      maxAudioBytes: 64 * 1024 * 1024,
      maxAudioDurationSeconds: 30,
      jobTtlMs: 10 * 60 * 1000,
    };
    engineServer = createVoiceEngineServer({ config });
    const engineUrl = await listen(engineServer);

    const health = await fetch(`${engineUrl}/health`);
    equal(health.status, 200);
    const healthPayload = (await health.json()) as {
      data?: { version?: string };
    };
    equal(healthPayload.data?.version, "0.5.8");

    const enginesResponse = await fetch(`${engineUrl}/engines`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    equal(enginesResponse.status, 200);
    const enginesPayload = (await enginesResponse.json()) as {
      data?: Array<{ id: string; available: boolean; voices?: string[] }>;
    };
    const piperStatus = enginesPayload.data?.find((engine) => engine.id === "piper");
    ok(piperStatus?.available);
    const voiceName = basename(resolve(modelPath)).replace(/\.onnx$/i, "");
    ok(piperStatus.voices?.includes(voiceName));

    const startResponse = await fetch(`${engineUrl}/synthesize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "Olá! Eu sou o HYRON. Ideias, código e boas conversas. Agora eu tenho uma voz de verdade.",
        engineId: "piper",
        voiceName,
      }),
    });
    equal(startResponse.status, 202);
    const startPayload = (await startResponse.json()) as {
      data: { id: string; engineId: string };
    };
    equal(startPayload.data.engineId, "piper");

    const job = await waitForJob(engineUrl, startPayload.data.id, 185_000);
    equal(job.status, "completed");
    equal(job.engineId, "piper");

    const audioResponse = await fetch(
      `${engineUrl}/jobs/${startPayload.data.id}/audio`,
      { headers: { Authorization: `Bearer ${API_KEY}` } },
    );
    equal(audioResponse.status, 200);
    const audioBytes = new Uint8Array(await audioResponse.arrayBuffer());
    ok(audioBytes.byteLength > 44);
    equal(String.fromCharCode(...audioBytes.subarray(0, 4)), "RIFF");
    equal(String.fromCharCode(...audioBytes.subarray(8, 12)), "WAVE");
    equal(audioResponse.headers.get("x-content-sha256"), sha256(audioBytes));

    const sampleDirectory = resolve("tests", "output");
    await mkdir(sampleDirectory, { recursive: true });
    const samplePath = resolve(sampleDirectory, "piper-pt-br-v057.wav");
    await writeFile(samplePath, audioBytes);
    const result = await new AudioProcessor({
      maxBytes: 64 * 1024 * 1024,
      maxDurationSeconds: 30,
    }).validateWav(samplePath);
    equal(result.checksum, sha256(audioBytes));
    equal(result.size, audioBytes.byteLength);
  } finally {
    if (engineServer) await closeServer(engineServer);
    await closeServer(libraryServer);
    await rm(root, { recursive: true, force: true });
    await rm(libraryRoot, { recursive: true, force: true });
  }
});

test("Voice Library client calls real routes and rejects unauthorized file references", async () => {
  const root = await mkdtemp(join(process.env.TEMP ?? ".", "hyron-engine-library-"));
  const libraryServer = createVoiceLibraryServer({
    config: makeLibraryConfig(root),
    storage: new EmptyStorage(),
  });
  let libraryUrl = "";
  try {
    libraryUrl = await listen(libraryServer);
    const createdResponse = await fetch(`${libraryUrl}/voices`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Voice Engine test",
        language: "en-US",
        modelType: "OTHER",
      }),
    });
    equal(createdResponse.status, 201);
    const created = (await createdResponse.json()) as {
      data: { id: string };
    };
    const client = new VoiceLibraryClient({
      baseUrl: libraryUrl,
      apiKey: API_KEY,
      identity: "local-test-principal",
    });
    const voices = await client.list();
    equal(voices.length, 1);
    equal(voices[0].id, created.data.id);
    const defaultResponse = await fetch(`${libraryUrl}/voices/default`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ voiceId: created.data.id }),
    });
    equal(defaultResponse.status, 200);
    equal((await client.resolve())?.id, created.data.id);

    let unauthorizedReference = false;
    try {
      await client.getFile(created.data.id, randomUUID());
    } catch (error) {
      unauthorizedReference =
        error instanceof Error &&
        error.message.includes("associado à voz");
    }
    equal(unauthorizedReference, true);
  } finally {
    await closeServer(libraryServer);
    await rm(root, { recursive: true, force: true });
  }
});

test("real Windows SAPI integration produces a valid non-empty WAV", async () => {
  const sapi = new WindowsSapiEngine(
    join(process.env.TEMP ?? ".", "hyron-sapi-smoke"),
    15000,
  );
  const available = await sapi.isAvailable();
  if (!available) {
    equal(available, true, "Este teste requer Windows System.Speech disponível.");
    return;
  }

  const root = await mkdtemp(join(process.env.TEMP ?? ".", "hyron-engine-real-"));
  const libraryRoot = await mkdtemp(
    join(process.env.TEMP ?? ".", "hyron-engine-real-library-"),
  );
  const libraryServer = createVoiceLibraryServer({
    config: makeLibraryConfig(libraryRoot),
    storage: new EmptyStorage(),
  });
  let engineServer: Server | undefined;
  try {
    const libraryUrl = await listen(libraryServer);
    const createVoice = await fetch(`${libraryUrl}/voices`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Local SAPI voice",
        language: "en-US",
        modelType: "OTHER",
      }),
    });
    equal(createVoice.status, 201);
    const voice = (await createVoice.json()) as { data: { id: string } };

    const engineConfig = makeConfig(root, libraryUrl);
    engineServer = createVoiceEngineServer({ config: engineConfig });
    const engineUrl = await listen(engineServer);
    const start = await fetch(`${engineUrl}/synthesize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "HYRON Voice Engine real speech test.",
        voiceId: voice.data.id,
        voiceName: "Microsoft Zira Desktop",
      }),
    });
    equal(start.status, 202);
    const startPayload = (await start.json()) as { data: { id: string } };
    const job = await waitForJob(engineUrl, startPayload.data.id);
    equal(job.status, "completed");
    ok(job.result);
    equal("path" in (job.result as Record<string, unknown>), false);

    const audioResponse = await fetch(
      `${engineUrl}/jobs/${startPayload.data.id}/audio`,
      { headers: { Authorization: `Bearer ${API_KEY}` } },
    );
    equal(audioResponse.status, 200);
    equal(audioResponse.headers.get("content-type"), "audio/wav");
    const bytes = new Uint8Array(await audioResponse.arrayBuffer());
    ok(bytes.byteLength > 44);
    equal(String.fromCharCode(...bytes.subarray(0, 4)), "RIFF");
    equal(String.fromCharCode(...bytes.subarray(8, 12)), "WAVE");
    equal(audioResponse.headers.get("x-content-sha256"), sha256(bytes));
  } finally {
    if (engineServer) await closeServer(engineServer);
    await closeServer(libraryServer);
    await rm(root, { recursive: true, force: true });
    await rm(libraryRoot, { recursive: true, force: true });
  }
});

test("API smoke, authentication, engine catalog and invalid input", async () => {
  const root = await mkdtemp(join(process.env.TEMP ?? ".", "hyron-engine-api-"));
  const engine = new FakeEngine();
  const library = {
    list: async () => [],
    getDefault: async () => null,
    get: async () => {
      throw new Error("not found");
    },
    resolve: async () => null,
  };
  const pipeline = makePipeline(root, engine, library);
  const server = createVoiceEngineServer({
    config: makeConfig(root),
    pipeline,
  });
  try {
    const baseUrl = await listen(server);
    const health = await fetch(`${baseUrl}/health`);
    equal(health.status, 200);
    const unauthenticated = await fetch(`${baseUrl}/engines`);
    equal(unauthenticated.status, 401);
    const engines = await fetch(`${baseUrl}/engines`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    equal(engines.status, 200);
    const invalid = await fetch(`${baseUrl}/synthesize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: "bad", owner: "other" }),
    });
    equal(invalid.status, 400);
  } finally {
    await closeServer(server);
    await rm(root, { recursive: true, force: true });
  }
});

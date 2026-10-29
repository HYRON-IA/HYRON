import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  AudioJob,
  AudioResult,
  EngineStatus,
  TTSEngine,
} from "../types/VoiceEngine.ts";
import { AudioProcessor } from "./AudioProcessor.ts";
import { VoiceLibraryClient } from "./VoiceLibraryClient.ts";
import { RVCEngine } from "../engines/RVCEngine.ts";

export class EngineError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "EngineError";
    this.status = status;
    this.code = code;
  }
}

export interface SynthesisRequest {
  text: string;
  voiceId?: string;
  voiceName?: string;
  engineId?: string;
  convert?: boolean;
}

interface JobRecord {
  job: AudioJob;
  owner: string;
  controller: AbortController;
  directory: string;
  expiresAt: number;
  text: string;
  voiceName?: string;
  result?: AudioResult;
  execution?: Promise<void>;
}

export interface VoicePipelineOptions {
  engines: TTSEngine[];
  voiceLibrary: VoiceLibraryClient;
  processor: AudioProcessor;
  temporaryDirectory: string;
  timeoutMs: number;
  maxTextLength: number;
  maxJobs: number;
  jobTtlMs: number;
  sapiVoiceNames: () => Promise<string[]>;
  conversionEngine?: RVCEngine;
}

export class VoicePipeline {
  private readonly jobs = new Map<string, JobRecord>();
  private activeJobs = 0;
  private readonly queue: JobRecord[] = [];
  private readonly conversion: RVCEngine;
  private readonly options: VoicePipelineOptions;

  constructor(options: VoicePipelineOptions) {
    this.options = options;
    this.conversion = options.conversionEngine ?? new RVCEngine();
  }

  async engineStatuses(): Promise<EngineStatus[]> {
    const statuses = await Promise.all(
      this.options.engines.map(async (engine) => {
        const available = await engine.isAvailable();
        return {
          id: engine.id,
          name: engine.name,
          available,
          format: available ? "wav" as const : null,
          ...(available && engine.id === "piper" && engine.listVoices
            ? { voices: await engine.listVoices() }
            : {}),
          ...(!available ? { reason: "Runtime ou configuração local indisponível." } : {}),
        };
      }),
    );
    const rvcAvailable = await this.conversion.isAvailable();
    statuses.push({
      id: this.conversion.id,
      name: this.conversion.name,
      available: rvcAvailable,
      format: null,
      ...(!rvcAvailable
        ? { reason: "Conversão RVC segura não está disponível." }
        : {}),
    });
    return statuses;
  }

  async voices(): Promise<Awaited<ReturnType<VoiceLibraryClient["list"]>>> {
    return this.options.voiceLibrary.list();
  }

  async createSynthesisJob(
    owner: string,
    request: SynthesisRequest,
  ): Promise<AudioJob> {
    this.validateRequest(request);
    const voice = await this.options.voiceLibrary.resolve(request.voiceId);
    if (request.convert) {
      if (!voice || voice.modelType !== "RVC") {
        throw new EngineError(
          400,
          "INCOMPATIBLE_VOICE",
          "Conversão RVC exige uma voz RVC cadastrada na Voice Library.",
        );
      }
      if (!(await this.conversion.isAvailable())) {
        throw new EngineError(
          503,
          "ENGINE_NOT_AVAILABLE",
          "Conversão RVC segura não está disponível; nenhum modelo foi carregado.",
        );
      }
    }
    const engine = this.selectEngine(request.engineId);
    if (!(await engine.isAvailable())) {
      throw new EngineError(
        503,
        "ENGINE_NOT_AVAILABLE",
        "O mecanismo TTS selecionado não está disponível.",
      );
    }
    if (request.voiceName) {
      const voices =
        engine.id === "windows-sapi"
          ? await this.options.sapiVoiceNames()
          : await engine.listVoices?.() ?? [];
      if (!voices.includes(request.voiceName)) {
        throw new EngineError(
          400,
          "INVALID_VOICE_NAME",
          engine.id === "piper"
            ? "Voz Piper não instalada ou inválida."
            : "Voz não instalada ou não aceita por este mecanismo.",
        );
      }
    }
    await this.cleanup();
    if (this.jobs.size >= this.options.maxJobs) {
      throw new EngineError(429, "JOB_LIMIT_REACHED", "Limite de jobs atingido.");
    }
    if (this.queue.length >= this.options.maxJobs) {
      throw new EngineError(429, "QUEUE_LIMIT_REACHED", "Fila de síntese cheia.");
    }
    const id = crypto.randomUUID();
    const directory = resolve(this.options.temporaryDirectory, owner, id);
    await mkdir(directory, { recursive: true });
    const now = new Date().toISOString();
    const record: JobRecord = {
      owner,
      directory,
      controller: new AbortController(),
      expiresAt: Date.now() + this.options.jobTtlMs,
      text: request.text,
      ...(request.voiceName ? { voiceName: request.voiceName } : {}),
      job: {
        id,
        status: "queued",
        engineId: engine.id,
        ...(voice ? { voiceId: voice.id } : {}),
        createdAt: now,
        updatedAt: now,
      },
    };
    this.jobs.set(id, record);
    this.queue.push(record);
    this.startNext();
    return publicJob(record.job);
  }

  async convert(
    owner: string,
    voiceId: string,
  ): Promise<never> {
    if (!isUuid(voiceId)) {
      throw new EngineError(400, "INVALID_VOICE_ID", "voiceId inválido.");
    }
    const voice = await this.options.voiceLibrary.resolve(voiceId);
    if (!voice) {
      throw new EngineError(404, "VOICE_NOT_FOUND", "Voz não encontrada.");
    }
    if (
      voice.modelType !== "RVC" ||
      !voice.files.some((file) => file.type === "pth") ||
      !voice.files.some((file) => file.type === "index")
    ) {
      throw new EngineError(
        400,
        "INCOMPATIBLE_MODEL",
        "A voz não contém referências RVC .pth e .index compatíveis.",
      );
    }
    if (owner.length === 0) {
      throw new EngineError(403, "UNAUTHORIZED", "Identidade local inválida.");
    }
    throw new EngineError(
      503,
      "ENGINE_NOT_AVAILABLE",
      "Conversão RVC segura não está disponível; nenhum arquivo de modelo foi baixado ou carregado.",
    );
  }

  getJob(owner: string, jobId: string): AudioJob | null {
    const record = this.jobs.get(jobId);
    if (!record || record.owner !== owner) return null;
    return publicJob(record.job);
  }

  getAudio(owner: string, jobId: string): AudioResult | null {
    const record = this.jobs.get(jobId);
    if (
      !record ||
      record.owner !== owner ||
      record.job.status !== "completed" ||
      !record.result
    ) {
      return null;
    }
    return record.result;
  }

  async cancel(owner: string, jobId: string): Promise<boolean> {
    await this.pruneExpired();
    const record = this.jobs.get(jobId);
    if (!record || record.owner !== owner) return false;
    if (record.job.status === "queued" || record.job.status === "running") {
      record.controller.abort();
      record.job.status = "cancelled";
      record.job.updatedAt = new Date().toISOString();
      this.removeQueued(record);
    }
    if (record.execution) await record.execution;
    await rm(record.directory, { recursive: true, force: true });
    this.jobs.delete(jobId);
    return true;
  }

  async cleanup(): Promise<void> {
    await this.pruneExpired();
  }

  private validateRequest(request: SynthesisRequest): void {
    if (
      typeof request.text !== "string" ||
      request.text.trim().length === 0 ||
      request.text.length > this.options.maxTextLength ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(request.text)
    ) {
      throw new EngineError(
        400,
        "INVALID_TEXT",
        `text deve conter de 1 a ${this.options.maxTextLength} caracteres válidos.`,
      );
    }
    if (request.voiceId && !isUuid(request.voiceId)) {
      throw new EngineError(400, "INVALID_VOICE_ID", "voiceId inválido.");
    }
  }

  private selectEngine(engineId?: string): TTSEngine {
    const engine =
      this.options.engines.find((entry) => entry.id === (engineId ?? "windows-sapi"));
    if (!engine) {
      throw new EngineError(400, "UNKNOWN_ENGINE", "Mecanismo TTS desconhecido.");
    }
    return engine;
  }

  private startNext(): void {
    if (this.activeJobs > 0) return;
    let record = this.queue.shift();
    while (record && record.job.status !== "queued") {
      record = this.queue.shift();
    }
    if (!record) return;
    this.activeJobs += 1;
    record.execution = this.execute(record).finally(() => {
      this.activeJobs -= 1;
      this.startNext();
    });
    void record.execution;
  }

  private async execute(record: JobRecord): Promise<void> {
    if (record.controller.signal.aborted) return;
    record.job.status = "running";
    record.job.updatedAt = new Date().toISOString();
    const engine = this.options.engines.find(
      (entry) => entry.id === record.job.engineId,
    );
    if (!engine) {
      this.fail(record, "UNKNOWN_ENGINE", "Mecanismo TTS desconhecido.");
      return;
    }
    if (!record.text) {
      this.fail(record, "INTERNAL_ERROR", "Texto do job não está disponível.");
      return;
    }
    const timeout = AbortSignal.timeout(this.options.timeoutMs);
    const signal = AbortSignal.any([record.controller.signal, timeout]);
    try {
      const outputPath = await engine.synthesize(record.text, {
        signal,
        outputDirectory: record.directory,
        ...(record.voiceName
          ? { voiceName: record.voiceName }
          : {}),
      });
      if (record.controller.signal.aborted) {
        await rm(record.directory, { recursive: true, force: true });
        record.job.status = "cancelled";
        record.job.updatedAt = new Date().toISOString();
        return;
      }
      const result = await this.options.processor.validateWav(outputPath);
      record.result = result;
      const { path: _path, ...publicResult } = result;
      record.job.result = publicResult;
      record.job.status = "completed";
      record.job.updatedAt = new Date().toISOString();
      record.expiresAt = Date.now() + this.options.jobTtlMs;
    } catch (error) {
      await rm(record.directory, { recursive: true, force: true });
      if (record.controller.signal.aborted) {
        record.job.status = "cancelled";
        record.job.updatedAt = new Date().toISOString();
      } else if (timeout.aborted) {
        this.fail(record, "TTS_TIMEOUT", "A geração de áudio excedeu o timeout.");
      } else if (error instanceof Error && error.message.startsWith("ENGINE_NOT_AVAILABLE")) {
        this.fail(record, "ENGINE_NOT_AVAILABLE", error.message);
      } else {
        this.fail(record, "TTS_FAILED", "O mecanismo TTS falhou ao gerar áudio.");
      }
    }
  }

  private fail(record: JobRecord, code: string, message: string): void {
    record.job.status = "failed";
    record.job.error = { code, message };
    record.job.updatedAt = new Date().toISOString();
  }

  private removeQueued(record: JobRecord): void {
    const index = this.queue.indexOf(record);
    if (index >= 0) this.queue.splice(index, 1);
  }

  private async pruneExpired(): Promise<void> {
    const now = Date.now();
    for (const [id, record] of this.jobs) {
      if (record.expiresAt > now) continue;
      record.controller.abort();
      this.removeQueued(record);
      if (record.execution) await record.execution;
      await rm(record.directory, { recursive: true, force: true });
      this.jobs.delete(id);
    }
  }
}

function publicJob(job: AudioJob): AudioJob {
  return { ...job };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

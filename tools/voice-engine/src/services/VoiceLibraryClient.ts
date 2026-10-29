import type { VoiceLibraryVoice } from "../types/VoiceEngine.ts";

export class VoiceLibraryError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "VoiceLibraryError";
    this.status = status;
  }
}

export interface VoiceLibraryClientOptions {
  baseUrl: string;
  apiKey: string;
  identity: string;
  fetcher?: typeof fetch;
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { message?: string };
}

export class VoiceLibraryClient {
  private readonly baseUrl: URL;
  private readonly fetcher: typeof fetch;
  private readonly options: VoiceLibraryClientOptions;

  constructor(options: VoiceLibraryClientOptions) {
    this.options = options;
    this.baseUrl = new URL(options.baseUrl);
    if (
      this.baseUrl.protocol !== "http:" ||
      this.baseUrl.hostname !== "127.0.0.1"
    ) {
      throw new Error("Voice Library deve estar em HTTP no loopback 127.0.0.1.");
    }
    this.fetcher = options.fetcher ?? fetch;
  }

  async list(): Promise<VoiceLibraryVoice[]> {
    const data = await this.getJson<unknown>("/voices");
    if (!Array.isArray(data) || !data.every(isVoice)) {
      throw new VoiceLibraryError("Resposta de vozes inválida.", 502);
    }
    return data;
  }

  async getDefault(): Promise<VoiceLibraryVoice | null> {
    const data = await this.getJson<unknown>("/voices/default");
    if (data === null) return null;
    if (!isVoice(data)) {
      throw new VoiceLibraryError("Resposta de voz padrão inválida.", 502);
    }
    return data;
  }

  async get(voiceId: string): Promise<VoiceLibraryVoice> {
    const data = await this.getJson<unknown>(
      `/voices/${encodeURIComponent(voiceId)}`,
    );
    if (!isVoice(data) || data.id !== voiceId) {
      throw new VoiceLibraryError("Resposta de voz inválida.", 502);
    }
    return data;
  }

  async getFile(voiceId: string, fileId: string): Promise<Response> {
    const voice = await this.get(voiceId);
    if (!voice.files.some((file) => file.fileId === fileId)) {
      throw new VoiceLibraryError(
        "O arquivo não está associado à voz autorizada.",
        403,
      );
    }
    let response: Response;
    try {
      response = await this.fetcher(
        new URL(
          `/voices/${encodeURIComponent(voiceId)}/files/${encodeURIComponent(fileId)}`,
          this.baseUrl,
        ),
        {
          headers: { Authorization: `Bearer ${this.options.apiKey}` },
          signal: AbortSignal.timeout(5 * 60 * 1000),
        },
      );
    } catch {
      throw new VoiceLibraryError("Download da Voice Library indisponível.", 503);
    }
    if (!response.ok) {
      throw new VoiceLibraryError(
        `Voice Library respondeu com HTTP ${response.status}.`,
        response.status,
      );
    }
    return response;
  }

  async resolve(voiceId?: string): Promise<VoiceLibraryVoice | null> {
    if (voiceId) {
      const voice = await this.get(voiceId);
      this.assertVoiceFiles(voice);
      return voice;
    }
    const voice = await this.getDefault();
    if (voice) this.assertVoiceFiles(voice);
    return voice;
  }

  private async getJson<T>(path: string): Promise<T> {
    if (this.options.identity.length === 0) {
      throw new VoiceLibraryError("Identidade local inválida.", 403);
    }
    let response: Response;
    try {
      response = await this.fetcher(new URL(path, this.baseUrl), {
        headers: { Authorization: `Bearer ${this.options.apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new VoiceLibraryError(
        "Não foi possível conectar à Voice Library local.",
        503,
      );
    }
    if (!response.ok) {
      throw new VoiceLibraryError(
        `Voice Library respondeu com HTTP ${response.status}.`,
        response.status,
      );
    }
    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch {
      throw new VoiceLibraryError("Resposta JSON inválida da Voice Library.", 502);
    }
    if (!envelope.success || envelope.data === undefined) {
      throw new VoiceLibraryError("Voice Library retornou uma resposta inválida.", 502);
    }
    return envelope.data;
  }

  private assertVoiceFiles(voice: VoiceLibraryVoice): void {
    if (voice.files.length > 20) {
      throw new VoiceLibraryError("A voz referencia muitos arquivos.", 502);
    }
    for (const file of voice.files) {
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          file.fileId,
        ) ||
        /[\u0000-\u001f\u007f/\\]/.test(file.filename) ||
        !compatibleType(voice.modelType, file.type)
      ) {
        throw new VoiceLibraryError(
          "A voz contém uma referência de arquivo inválida ou incompatível.",
          502,
        );
      }
    }
  }
}

function compatibleType(
  modelType: VoiceLibraryVoice["modelType"],
  fileType: VoiceLibraryVoice["files"][number]["type"],
): boolean {
  return (
    modelType === "OTHER" ||
    (modelType === "RVC" && (fileType === "pth" || fileType === "index")) ||
    (modelType === "ONNX" &&
      (fileType === "onnx" || fileType === "onnx.json"))
  );
}

function isVoice(value: unknown): value is VoiceLibraryVoice {
  if (typeof value !== "object" || value === null) return false;
  const voice = value as Record<string, unknown>;
  return (
    typeof voice.id === "string" &&
    typeof voice.name === "string" &&
    typeof voice.language === "string" &&
    (voice.modelType === "RVC" ||
      voice.modelType === "ONNX" ||
      voice.modelType === "OTHER") &&
    Array.isArray(voice.files) &&
    voice.files.every(isVoiceFile) &&
    (voice.description === undefined || typeof voice.description === "string") &&
    (voice.sampleAudio === undefined || typeof voice.sampleAudio === "string") &&
    typeof voice.createdAt === "string" &&
    typeof voice.updatedAt === "string"
  );
}

function isVoiceFile(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const file = value as Record<string, unknown>;
  return (
    typeof file.fileId === "string" &&
    typeof file.filename === "string" &&
    (file.type === "pth" ||
      file.type === "index" ||
      file.type === "onnx" ||
      file.type === "onnx.json")
  );
}

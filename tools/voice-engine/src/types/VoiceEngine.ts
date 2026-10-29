export type AudioFormat = "wav";

export interface TTSOptions {
  voiceName?: string;
  outputDirectory: string;
  signal: AbortSignal;
}

export interface AudioResult {
  path: string;
  format: AudioFormat;
  contentType: "audio/wav";
  size: number;
  durationSeconds: number;
  checksum: string;
}

export interface TTSEngine {
  id: string;
  name: string;
  isAvailable(): Promise<boolean>;
  listVoices?(): Promise<string[]>;
  synthesize(text: string, options: TTSOptions): Promise<string>;
}

export interface VoiceConversionEngine {
  id: string;
  name: string;
  isAvailable(): Promise<boolean>;
  convert(
    inputPath: string,
    modelFiles: readonly string[],
    signal: AbortSignal,
  ): Promise<string>;
}

export interface EngineStatus {
  id: string;
  name: string;
  available: boolean;
  format: AudioFormat | null;
  voices?: string[];
  reason?: string;
}

export interface VoiceLibraryVoice {
  id: string;
  name: string;
  description?: string;
  language: string;
  modelType: "RVC" | "ONNX" | "OTHER";
  files: Array<{
    fileId: string;
    type: "pth" | "index" | "onnx" | "onnx.json";
    filename: string;
  }>;
  sampleAudio?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AudioJob {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  engineId: string;
  voiceId?: string;
  createdAt: string;
  updatedAt: string;
  result?: Omit<AudioResult, "path">;
  error?: { code: string; message: string };
}

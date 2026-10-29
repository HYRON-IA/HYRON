export type VoiceModelType = "RVC" | "ONNX" | "OTHER";
export type VoiceFileType = "pth" | "index" | "onnx" | "onnx.json";

export interface VoiceFileReference {
  fileId: string;
  type: VoiceFileType;
  filename: string;
}

export interface VoiceModel {
  id: string;
  name: string;
  description?: string;
  language: string;
  modelType: VoiceModelType;
  files: VoiceFileReference[];
  sampleAudio?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceCatalog {
  schemaVersion: 1;
  defaultVoiceId: string | null;
  voices: VoiceModel[];
}

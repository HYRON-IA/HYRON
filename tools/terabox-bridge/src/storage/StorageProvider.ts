export type ModelType = "rvc" | "piper" | "unknown";

export interface StoredFile {
  id: string;
  filename: string;
  size: number;
  checksum: string;
  modelType: ModelType;
  createdAt: string;
}

export interface UploadFileInput {
  userId: string;
  filename: string;
  modelType: ModelType;
  checksum: string;
  stream: AsyncIterable<Uint8Array>;
  size: number;
}

export interface DownloadFile {
  file: StoredFile;
  stream: AsyncIterable<Uint8Array>;
}

export interface StorageProvider {
  upload(input: UploadFileInput): Promise<StoredFile>;
  download(userId: string, fileId: string): Promise<DownloadFile | null>;
  list(userId: string): Promise<StoredFile[]>;
  delete(userId: string, fileId: string): Promise<boolean>;
  exists(userId: string, fileId: string): Promise<boolean>;
}

export class StorageProviderNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`O provedor de armazenamento "${provider}" não está configurado.`);
    this.name = "StorageProviderNotConfiguredError";
  }
}

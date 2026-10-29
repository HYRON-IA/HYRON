import {
  StorageProviderNotConfiguredError,
  type DownloadFile,
  type StorageProvider,
  type StoredFile,
  type UploadFileInput,
} from "./StorageProvider.ts";

export class TeraBoxStorageProvider implements StorageProvider {
  private unavailable(): never {
    throw new StorageProviderNotConfiguredError("terabox");
  }

  async upload(_input: UploadFileInput): Promise<StoredFile> {
    return this.unavailable();
  }

  async download(_userId: string, _fileId: string): Promise<DownloadFile | null> {
    return this.unavailable();
  }

  async list(_userId: string): Promise<StoredFile[]> {
    return this.unavailable();
  }

  async delete(_userId: string, _fileId: string): Promise<boolean> {
    return this.unavailable();
  }

  async exists(_userId: string, _fileId: string): Promise<boolean> {
    return this.unavailable();
  }
}

import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { dirname } from "node:path";
import type {
  DownloadFile,
  StorageProvider,
  StoredFile,
  UploadFileInput,
} from "./StorageProvider.ts";
import { resolveWithin, userDirectoryKey } from "../utils/paths.ts";
import {
  validateFilename,
  validateOpaqueId,
  validateSha256,
} from "../utils/validation.ts";

interface LocalStorageOptions {
  directory: string;
}

export class LocalStorageProvider implements StorageProvider {
  private readonly root: string;

  constructor(options: LocalStorageOptions) {
    this.root = options.directory;
  }

  private filePath(userId: string, id: string): string {
    return resolveWithin(this.root, "files", userDirectoryKey(userId), `${id}.blob`);
  }

  private metadataDirectory(userId: string): string {
    return resolveWithin(this.root, "metadata", userDirectoryKey(userId));
  }

  private metadataPath(userId: string, id: string): string {
    return resolveWithin(this.metadataDirectory(userId), `${id}.json`);
  }

  async upload(input: UploadFileInput): Promise<StoredFile> {
    if (
      typeof input.userId !== "string" ||
      input.userId.length === 0 ||
      !Number.isSafeInteger(input.size) ||
      input.size <= 0
    ) {
      throw new Error("Identidade ou tamanho de arquivo inválido.");
    }
    const validatedFile = validateFilename(input.filename);
    const expectedChecksum = validateSha256(input.checksum);
    const id = randomUUID();
    const destination = this.filePath(input.userId, id);
    const metadataPath = this.metadataPath(input.userId, id);
    const temporaryFile = `${destination}.tmp`;
    const metadataTemporary = `${metadataPath}.tmp`;
    const hash = createHash("sha256");
    let written = 0;

    await mkdir(dirname(destination), { recursive: true });
    await mkdir(dirname(metadataPath), { recursive: true });
    const file = await open(temporaryFile, "wx");
    try {
      for await (const chunk of input.stream) {
        if (!(chunk instanceof Uint8Array)) {
          throw new Error("O fluxo de upload contém um bloco inválido.");
        }
        written += chunk.byteLength;
        if (written > input.size) {
          throw new Error("O fluxo excedeu o tamanho declarado.");
        }
        hash.update(chunk);
        let offset = 0;
        while (offset < chunk.byteLength) {
          const result = await file.write(
            chunk,
            offset,
            chunk.byteLength - offset,
            null,
          );
          if (result.bytesWritten <= 0) {
            throw new Error("Não foi possível concluir a escrita do arquivo.");
          }
          offset += result.bytesWritten;
        }
      }
    } catch (error) {
      await file.close();
      await rm(temporaryFile, { force: true });
      throw error;
    }
    await file.close();

    const checksum = hash.digest("hex");
    if (written !== input.size) {
      await rm(temporaryFile, { force: true });
      throw new Error("O tamanho do arquivo recebido não corresponde ao declarado.");
    }
    if (checksum !== expectedChecksum) {
      await rm(temporaryFile, { force: true });
      throw new Error("O checksum SHA-256 do arquivo não corresponde.");
    }

    const stored: StoredFile = {
      id,
      filename: validatedFile.filename,
      size: written,
      checksum,
      modelType: validatedFile.modelType,
      createdAt: new Date().toISOString(),
    };
    try {
      await rename(temporaryFile, destination);
      await writeJsonAtomically(metadataPath, metadataTemporary, stored);
    } catch (error) {
      await rm(temporaryFile, { force: true });
      await rm(metadataTemporary, { force: true });
      await rm(destination, { force: true });
      throw error;
    }
    return stored;
  }

  async download(userId: string, fileId: string): Promise<DownloadFile | null> {
    const metadata = await this.readMetadata(userId, fileId);
    if (!metadata) return null;
    const path = this.filePath(userId, fileId);
    try {
      const info = await stat(path);
      if (!info.isFile() || info.size !== metadata.size) return null;
    } catch {
      return null;
    }
    return { file: metadata, stream: createReadStream(path) };
  }

  async list(userId: string): Promise<StoredFile[]> {
    const directory = this.metadataDirectory(userId);
    let entries: string[];
    try {
      entries = await readdir(directory);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const files: StoredFile[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const id = entry.slice(0, -5);
      if (!validateOpaqueId(id)) continue;
      const metadata = await this.readMetadata(userId, id);
      if (metadata && (await this.exists(userId, id))) files.push(metadata);
    }
    return files.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async delete(userId: string, fileId: string): Promise<boolean> {
    if (!validateOpaqueId(fileId)) return false;
    const metadata = await this.readMetadata(userId, fileId);
    if (!metadata) return false;
    await rm(this.filePath(userId, fileId), { force: true });
    await rm(this.metadataPath(userId, fileId), { force: true });
    return true;
  }

  async exists(userId: string, fileId: string): Promise<boolean> {
    if (!validateOpaqueId(fileId)) return false;
    const metadata = await this.readMetadata(userId, fileId);
    if (!metadata) return false;
    try {
      const info = await stat(this.filePath(userId, fileId));
      return info.isFile() && info.size === metadata.size;
    } catch (error) {
      if (isMissing(error)) return false;
      throw error;
    }
  }

  private async readMetadata(
    userId: string,
    fileId: string,
  ): Promise<StoredFile | null> {
    if (!validateOpaqueId(fileId)) return null;
    try {
      const parsed: unknown = JSON.parse(
        await readFile(this.metadataPath(userId, fileId), "utf8"),
      );
      if (!isStoredFile(parsed) || parsed.id !== fileId) return null;
      return parsed;
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
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

async function writeJsonAtomically(
  destination: string,
  temporary: string,
  value: StoredFile,
): Promise<void> {
  const file = await open(temporary, "wx");
  try {
    await file.writeFile(JSON.stringify(value), "utf8");
  } finally {
    await file.close();
  }
  await rename(temporary, destination);
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

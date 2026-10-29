import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { userDirectoryKey } from "../../../terabox-bridge/src/utils/paths.ts";

export const PREVIEW_CONTENT_TYPES = {
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
} as const;

export type PreviewContentType = keyof typeof PREVIEW_CONTENT_TYPES;

export interface PreviewMetadata {
  id: string;
  size: number;
  checksum: string;
  contentType: PreviewContentType;
  createdAt: string;
}

export interface PreviewDownload {
  metadata: PreviewMetadata;
  stream: AsyncIterable<Uint8Array>;
}

export class VoicePreviewStore {
  private readonly root: string;
  private readonly maxBytes: number;

  constructor(directory: string, maxBytes: number) {
    this.root = resolve(directory);
    this.maxBytes = maxBytes;
  }

  async save(
    userId: string,
    stream: AsyncIterable<Uint8Array>,
    size: number,
    contentType: string,
    expectedChecksum: string,
  ): Promise<PreviewMetadata> {
    if (!Number.isSafeInteger(size) || size <= 0 || size > this.maxBytes) {
      throw new Error("A amostra excede o tamanho permitido ou é inválida.");
    }
    if (!Object.hasOwn(PREVIEW_CONTENT_TYPES, contentType)) {
      throw new Error("Formato de áudio não permitido.");
    }
    if (!/^[a-f0-9]{64}$/i.test(expectedChecksum)) {
      throw new Error("X-Content-SHA256 deve conter SHA-256 hexadecimal.");
    }
    const id = randomUUID();
    const destination = this.blobPath(userId, id);
    const metadataPath = this.metadataPath(userId, id);
    const temporary = `${destination}.tmp`;
    const metadataTemporary = `${metadataPath}.${randomUUID()}.tmp`;
    const hash = createHash("sha256");
    const prefix = new Uint8Array(12);
    let prefixLength = 0;
    let written = 0;
    await mkdir(dirname(destination), { recursive: true });
    const file = await open(temporary, "wx");
    try {
      for await (const chunk of stream) {
        written += chunk.byteLength;
        if (written > size || written > this.maxBytes) {
          throw new Error("A amostra excedeu o tamanho declarado.");
        }
        const prefixPart = Math.min(prefix.length - prefixLength, chunk.byteLength);
        if (prefixPart > 0) {
          prefix.set(chunk.subarray(0, prefixPart), prefixLength);
          prefixLength += prefixPart;
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
            throw new Error("Não foi possível gravar a amostra.");
          }
          offset += result.bytesWritten;
        }
      }
    } catch (error) {
      await file.close();
      await rm(temporary, { force: true });
      throw error;
    }
    await file.close();
    const checksum = hash.digest("hex");
    if (written !== size || checksum !== expectedChecksum.toLowerCase()) {
      await rm(temporary, { force: true });
      throw new Error("Tamanho ou checksum da amostra inválido.");
    }
    if (!matchesAudioSignature(contentType, prefix, prefixLength)) {
      await rm(temporary, { force: true });
      throw new Error("A assinatura do arquivo não corresponde ao tipo de áudio informado.");
    }
    const metadata: PreviewMetadata = {
      id,
      size,
      checksum,
      contentType: contentType as PreviewContentType,
      createdAt: new Date().toISOString(),
    };
    try {
      await rename(temporary, destination);
      const metaFile = await open(metadataTemporary, "wx");
      try {
        await metaFile.writeFile(JSON.stringify(metadata), "utf8");
      } finally {
        await metaFile.close();
      }
      await rename(metadataTemporary, metadataPath);
    } catch (error) {
      await rm(temporary, { force: true });
      await rm(metadataTemporary, { force: true });
      await rm(destination, { force: true });
      throw error;
    }
    return metadata;
  }

  async open(userId: string, id: string): Promise<PreviewDownload | null> {
    if (!isUuid(id)) return null;
    const path = this.blobPath(userId, id);
    try {
      const metadata: unknown = JSON.parse(
        await readFile(this.metadataPath(userId, id), "utf8"),
      );
      if (!isPreviewMetadata(metadata, id)) return null;
      const info = await stat(path);
      if (!info.isFile() || info.size !== metadata.size) return null;
      return { metadata, stream: createReadStream(path) };
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async delete(userId: string, id: string): Promise<void> {
    if (!isUuid(id)) return;
    await rm(this.blobPath(userId, id), { force: true });
    await rm(this.metadataPath(userId, id), { force: true });
  }

  private userDirectory(userId: string): string {
    return resolve(this.root, userDirectoryKey(userId));
  }

  private blobPath(userId: string, id: string): string {
    return resolve(this.userDirectory(userId), `${id}.audio`);
  }

  private metadataPath(userId: string, id: string): string {
    return resolve(this.userDirectory(userId), `${id}.json`);
  }
}

function matchesAudioSignature(
  contentType: string,
  prefix: Uint8Array,
  length: number,
): contentType is PreviewContentType {
  if (contentType === "audio/wav") {
    return (
      length >= 12 &&
      ascii(prefix, 0, 4) === "RIFF" &&
      ascii(prefix, 8, 12) === "WAVE"
    );
  }
  if (contentType === "audio/ogg") {
    return length >= 4 && ascii(prefix, 0, 4) === "OggS";
  }
  if (contentType === "audio/mpeg") {
    return (
      (length >= 3 && ascii(prefix, 0, 3) === "ID3") ||
      (length >= 2 && prefix[0] === 0xff && (prefix[1] & 0xe0) === 0xe0)
    );
  }
  return false;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let value = "";
  for (let index = start; index < end; index += 1) {
    value += String.fromCharCode(bytes[index]);
  }
  return value;
}

function isPreviewMetadata(value: unknown, id: string): value is PreviewMetadata {
  if (typeof value !== "object" || value === null) return false;
  const metadata = value as Record<string, unknown>;
  return (
    metadata.id === id &&
    typeof metadata.size === "number" &&
    typeof metadata.checksum === "string" &&
    typeof metadata.contentType === "string" &&
    Object.hasOwn(PREVIEW_CONTENT_TYPES, metadata.contentType) &&
    typeof metadata.createdAt === "string"
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

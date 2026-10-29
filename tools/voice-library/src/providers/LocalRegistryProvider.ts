import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { VoiceCatalog } from "../types/VoiceModel.ts";
import { isVoiceModel } from "../utils/validation.ts";

export interface RegistryProvider {
  load(userId: string): Promise<VoiceCatalog>;
  save(userId: string, catalog: VoiceCatalog): Promise<void>;
}

export class LocalRegistryProvider implements RegistryProvider {
  private readonly root: string;

  constructor(directory: string) {
    this.root = resolve(directory);
  }

  async load(userId: string): Promise<VoiceCatalog> {
    const path = this.pathFor(userId);
    try {
      const raw: unknown = JSON.parse(await readFile(path, "utf8"));
      if (!isVoiceCatalog(raw)) {
        throw new Error("O catálogo persistido está corrompido ou incompatível.");
      }
      return raw;
    } catch (error) {
      if (isMissing(error)) return { schemaVersion: 1, defaultVoiceId: null, voices: [] };
      throw error;
    }
  }

  async save(userId: string, catalog: VoiceCatalog): Promise<void> {
    await mkdir(dirname(this.pathFor(userId)), { recursive: true });
    const destination = this.pathFor(userId);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    const file = await open(temporary, "wx");
    try {
      await file.writeFile(JSON.stringify(catalog), "utf8");
    } catch (error) {
      await file.close();
      await rm(temporary, { force: true });
      throw error;
    }
    await file.close();
    try {
      await rename(temporary, destination);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  private pathFor(userId: string): string {
    if (!userId) throw new Error("Identidade autenticada inválida.");
    const identity = createHash("sha256").update(userId).digest("hex");
    const target = resolve(this.root, `${identity}.json`);
    if (!target.startsWith(`${this.root}${sep}`)) {
      throw new Error("Caminho do catálogo inválido.");
    }
    return target;
  }
}

function isVoiceCatalog(value: unknown): value is VoiceCatalog {
  if (typeof value !== "object" || value === null) return false;
  const catalog = value as Record<string, unknown>;
  if (
    catalog.schemaVersion !== 1 ||
    !Array.isArray(catalog.voices) ||
    !(
      catalog.defaultVoiceId === null ||
      typeof catalog.defaultVoiceId === "string"
    )
  ) {
    return false;
  }
  const ids = new Set<string>();
  for (const voice of catalog.voices) {
    if (!isVoiceModel(voice) || ids.has(voice.id)) {
      return false;
    }
    const uniqueFileIds = new Set(voice.files.map((file) => file.fileId));
    if (uniqueFileIds.size !== voice.files.length) return false;
    ids.add(voice.id);
  }
  return (
    catalog.defaultVoiceId === null || ids.has(catalog.defaultVoiceId as string)
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

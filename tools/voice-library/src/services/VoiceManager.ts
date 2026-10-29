import { randomUUID } from "node:crypto";
import type {
  VoiceCatalog,
  VoiceFileReference,
  VoiceModel,
  VoiceModelType,
} from "../types/VoiceModel.ts";
import {
  validateDescription,
  validateFileForModel,
  validateFileId,
  validateLanguage,
  validateModelType,
  validateVoiceName,
} from "../utils/validation.ts";
import { VoiceRegistry } from "./VoiceRegistry.ts";
import type { StorageAdapter } from "./StorageAdapter.ts";

export class VoiceManagerError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "VoiceManagerError";
    this.status = status;
    this.code = code;
  }
}

export interface CreateVoiceInput {
  name: unknown;
  description?: unknown;
  language: unknown;
  modelType: unknown;
  fileIds?: unknown;
}

export interface UpdateVoiceInput {
  name?: unknown;
  description?: unknown;
  language?: unknown;
}

export class VoiceManager {
  private readonly registry: VoiceRegistry;
  private readonly storage: StorageAdapter;

  constructor(registry: VoiceRegistry, storage: StorageAdapter) {
    this.registry = registry;
    this.storage = storage;
  }

  async create(userId: string, input: CreateVoiceInput): Promise<VoiceModel> {
    const name = validateVoiceName(input.name);
    const description = validateDescription(input.description);
    const language = validateLanguage(input.language);
    const modelType = validateModelType(input.modelType);
    const fileIds = parseFileIds(input.fileIds);
    const files: VoiceFileReference[] = [];
    for (const fileId of fileIds) {
      const stored = await this.storage.find(userId, fileId);
      if (!stored) {
        throw new VoiceManagerError(404, "FILE_NOT_FOUND", "Arquivo não encontrado.");
      }
      files.push(referenceFor(modelType, stored));
    }

    return this.registry.transact(userId, (catalog) => {
      const now = new Date().toISOString();
      const voice: VoiceModel = {
        id: randomUUID(),
        name,
        ...(description === undefined ? {} : { description }),
        language,
        modelType,
        files,
        createdAt: now,
        updatedAt: now,
      };
      catalog.voices.push(voice);
      return voice;
    });
  }

  async list(
    userId: string,
    filters: { search?: string; language?: string; modelType?: string } = {},
  ): Promise<VoiceModel[]> {
    const search = filters.search?.trim().toLocaleLowerCase();
    const language = filters.language?.trim().toLocaleLowerCase();
    if (search && search.length > 100) {
      throw new VoiceManagerError(400, "INVALID_SEARCH", "Busca excede 100 caracteres.");
    }
    if (language) validateLanguage(language);
    const modelType = filters.modelType
      ? validateModelType(filters.modelType)
      : undefined;
    const catalog = await this.registry.read(userId);
    return catalog.voices.filter(
      (voice) =>
        (!search || voice.name.toLocaleLowerCase().includes(search)) &&
        (!language || voice.language.toLocaleLowerCase() === language) &&
        (!modelType || voice.modelType === modelType),
    );
  }

  async get(userId: string, voiceId: string): Promise<VoiceModel> {
    return requireVoice(await this.registry.read(userId), voiceId);
  }

  async update(
    userId: string,
    voiceId: string,
    input: UpdateVoiceInput,
  ): Promise<VoiceModel> {
    const patch: Partial<Pick<VoiceModel, "name" | "description" | "language">> =
      {};
    if (input.name !== undefined) patch.name = validateVoiceName(input.name);
    if ("description" in input) {
      patch.description = validateDescription(input.description);
    }
    if (input.language !== undefined) {
      patch.language = validateLanguage(input.language);
    }
    if (Object.keys(patch).length === 0) {
      throw new VoiceManagerError(400, "EMPTY_UPDATE", "Nenhum campo para atualizar.");
    }
    return this.registry.transact(userId, (catalog) => {
      const voice = requireVoice(catalog, voiceId);
      if (patch.name !== undefined) voice.name = patch.name;
      if ("description" in patch) {
        if (patch.description === undefined) delete voice.description;
        else voice.description = patch.description;
      }
      if (patch.language !== undefined) voice.language = patch.language;
      voice.updatedAt = new Date().toISOString();
      return voice;
    });
  }

  async delete(userId: string, voiceId: string): Promise<void> {
    await this.registry.transact(userId, (catalog) => {
      const index = catalog.voices.findIndex((voice) => voice.id === voiceId);
      if (index === -1) throw notFound();
      catalog.voices.splice(index, 1);
      if (catalog.defaultVoiceId === voiceId) catalog.defaultVoiceId = null;
    });
  }

  async getDefault(userId: string): Promise<VoiceModel | null> {
    const catalog = await this.registry.read(userId);
    return catalog.voices.find((voice) => voice.id === catalog.defaultVoiceId) ?? null;
  }

  async setDefault(userId: string, voiceId: string | null): Promise<VoiceModel | null> {
    return this.registry.transact(userId, (catalog) => {
      if (voiceId === null) {
        catalog.defaultVoiceId = null;
        return null;
      }
      const voice = requireVoice(catalog, voiceId);
      catalog.defaultVoiceId = voice.id;
      return voice;
    });
  }

  async attachFile(
    userId: string,
    voiceId: string,
    rawFileId: unknown,
  ): Promise<VoiceModel> {
    const fileId = validateFileId(rawFileId);
    const voice = await this.get(userId, voiceId);
    if (voice.files.some((file) => file.fileId === fileId)) {
      throw new VoiceManagerError(409, "FILE_ALREADY_ATTACHED", "Arquivo já associado.");
    }
    const stored = await this.storage.find(userId, fileId);
    if (!stored) throw new VoiceManagerError(404, "FILE_NOT_FOUND", "Arquivo não encontrado.");
    const reference = referenceFor(voice.modelType, stored);
    return this.registry.transact(userId, (catalog) => {
      const current = requireVoice(catalog, voiceId);
      if (current.files.some((file) => file.fileId === fileId)) {
        throw new VoiceManagerError(409, "FILE_ALREADY_ATTACHED", "Arquivo já associado.");
      }
      current.files.push(reference);
      current.updatedAt = new Date().toISOString();
      return current;
    });
  }

  async detachFile(
    userId: string,
    voiceId: string,
    fileId: string,
  ): Promise<{ deletedFromStorage: boolean }> {
    return this.registry.transact(userId, async (catalog) => {
      const voice = requireVoice(catalog, voiceId);
      if (!voice.files.some((file) => file.fileId === fileId)) {
        throw new VoiceManagerError(404, "FILE_NOT_ATTACHED", "Arquivo não associado.");
      }
      const referenceCount = catalog.voices.reduce(
        (count, entry) =>
          count + entry.files.filter((file) => file.fileId === fileId).length,
        0,
      );
      if (referenceCount === 1) {
        const deleted = await this.storage.delete(userId, fileId);
        if (!deleted) {
          throw new VoiceManagerError(
            502,
            "STORAGE_DELETE_FAILED",
            "O arquivo não pôde ser removido do Storage Bridge.",
          );
        }
      }
      voice.files = voice.files.filter((file) => file.fileId !== fileId);
      voice.updatedAt = new Date().toISOString();
      return { deletedFromStorage: referenceCount === 1 };
    });
  }

  async attachPreview(
    userId: string,
    voiceId: string,
    previewId: string,
  ): Promise<string | undefined> {
    return this.registry.transact(userId, (catalog) => {
      const voice = requireVoice(catalog, voiceId);
      const previous = voice.sampleAudio;
      voice.sampleAudio = previewId;
      voice.updatedAt = new Date().toISOString();
      return previous;
    });
  }

  async detachPreview(userId: string, voiceId: string): Promise<string | undefined> {
    return this.registry.transact(userId, (catalog) => {
      const voice = requireVoice(catalog, voiceId);
      const previous = voice.sampleAudio;
      delete voice.sampleAudio;
      voice.updatedAt = new Date().toISOString();
      return previous;
    });
  }

}

function parseFileIds(value: unknown): string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > 20 ||
    value.some((fileId) => typeof fileId !== "string")
  ) {
    throw new VoiceManagerError(400, "INVALID_FILE_IDS", "fileIds inválidos.");
  }
  const ids = value.map(validateFileId);
  if (new Set(ids).size !== ids.length) {
    throw new VoiceManagerError(400, "DUPLICATE_FILE_IDS", "fileIds duplicados.");
  }
  return ids;
}

function referenceFor(
  modelType: VoiceModelType,
  stored: { id: string; filename: string },
): VoiceFileReference {
  let validated: VoiceFileReference;
  try {
    validated = validateFileForModel(modelType, stored.filename);
  } catch (error) {
    throw new VoiceManagerError(
      400,
      "INVALID_MODEL_FILE",
      error instanceof Error ? error.message : "Formato de arquivo inválido.",
    );
  }
  return { ...validated, fileId: stored.id };
}

function requireVoice(catalog: VoiceCatalog, voiceId: string): VoiceModel {
  const voice = catalog.voices.find((entry) => entry.id === voiceId);
  if (!voice) throw notFound();
  return voice;
}

function notFound(): VoiceManagerError {
  return new VoiceManagerError(404, "VOICE_NOT_FOUND", "Modelo de voz não encontrado.");
}

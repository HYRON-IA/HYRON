import type {
  VoiceFileReference,
  VoiceFileType,
  VoiceModel,
  VoiceModelType,
} from "../types/VoiceModel.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILE_TYPES = [".onnx.json", ".pth", ".index", ".onnx"] as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateVoiceName(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.trim().length > 100 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error("O nome deve conter entre 1 e 100 caracteres válidos.");
  }
  return value.trim();
}

export function validateDescription(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (
    typeof value !== "string" ||
    value.length > 2000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  ) {
    throw new Error("A descrição deve ter no máximo 2000 caracteres válidos.");
  }
  return value.trim() || undefined;
}

export function validateLanguage(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(value.trim())
  ) {
    throw new Error("O idioma deve usar um código BCP 47 válido.");
  }
  return value.trim();
}

export function validateModelType(value: unknown): VoiceModelType {
  if (value !== "RVC" && value !== "ONNX" && value !== "OTHER") {
    throw new Error("modelType deve ser RVC, ONNX ou OTHER.");
  }
  return value;
}

export function validateVoiceId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function validateFileId(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error("fileId inválido.");
  }
  return value;
}

export function validateModelFilename(filename: unknown): {
  filename: string;
  type: VoiceFileType;
} {
  if (
    typeof filename !== "string" ||
    filename.length === 0 ||
    filename.length > 240 ||
    /[\u0000-\u001f\u007f/\\]/.test(filename) ||
    filename === "." ||
    filename === ".."
  ) {
    throw new Error("Nome de arquivo inválido.");
  }
  const lower = filename.toLowerCase();
  const extension = FILE_TYPES.find((candidate) => lower.endsWith(candidate));
  if (!extension) {
    throw new Error("Formato não permitido para arquivos de modelo.");
  }
  const type: VoiceFileType =
    extension === ".onnx.json"
      ? "onnx.json"
      : extension.slice(1) as VoiceFileType;
  return { filename, type };
}

export function validateFileForModel(
  modelType: VoiceModelType,
  filename: string,
): VoiceFileReference {
  const validated = validateModelFilename(filename);
  if (
    (modelType === "RVC" && validated.type !== "pth" && validated.type !== "index") ||
    (modelType === "ONNX" &&
      validated.type !== "onnx" &&
      validated.type !== "onnx.json")
  ) {
    throw new Error("O formato do arquivo não corresponde ao tipo do modelo.");
  }
  return { fileId: "", type: validated.type, filename: validated.filename };
}

export function validateCreateInput(value: unknown): {
  name: string;
  description?: string;
  language: string;
  modelType: VoiceModelType;
  fileIds: string[];
} {
  if (!isRecord(value)) throw new Error("O corpo deve ser um objeto JSON.");
  const allowed = new Set([
    "name",
    "description",
    "language",
    "modelType",
    "fileIds",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error("O corpo contém campos não permitidos.");
  }
  const fileIds = value.fileIds ?? [];
  if (
    !Array.isArray(fileIds) ||
    fileIds.length > 20 ||
    fileIds.some((fileId) => typeof fileId !== "string")
  ) {
    throw new Error("fileIds deve conter no máximo 20 identificadores.");
  }
  return {
    name: validateVoiceName(value.name),
    description: validateDescription(value.description),
    language: validateLanguage(value.language),
    modelType: validateModelType(value.modelType),
    fileIds: fileIds.map(validateFileId),
  };
}

export function validatePatchInput(value: unknown): Partial<
  Pick<VoiceModel, "name" | "description" | "language">
> {
  if (!isRecord(value)) throw new Error("O corpo deve ser um objeto JSON.");
  const keys = Object.keys(value);
  if (
    keys.length === 0 ||
    keys.some((key) => !["name", "description", "language"].includes(key))
  ) {
    throw new Error("A atualização deve conter somente name, description ou language.");
  }
  const patch: Partial<Pick<VoiceModel, "name" | "description" | "language">> =
    {};
  if ("name" in value) patch.name = validateVoiceName(value.name);
  if ("description" in value) {
    patch.description = validateDescription(value.description);
  }
  if ("language" in value) patch.language = validateLanguage(value.language);
  return patch;
}

export function isVoiceFileReference(value: unknown): value is VoiceFileReference {
  if (!isRecord(value)) return false;
  return (
    typeof value.fileId === "string" &&
    UUID_PATTERN.test(value.fileId) &&
    (value.type === "pth" ||
      value.type === "index" ||
      value.type === "onnx" ||
      value.type === "onnx.json") &&
    typeof value.filename === "string"
  );
}

export function isVoiceModel(value: unknown): value is VoiceModel {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    UUID_PATTERN.test(value.id) &&
    typeof value.name === "string" &&
    (value.description === undefined || typeof value.description === "string") &&
    typeof value.language === "string" &&
    (value.modelType === "RVC" ||
      value.modelType === "ONNX" ||
      value.modelType === "OTHER") &&
    Array.isArray(value.files) &&
    value.files.every(isVoiceFileReference) &&
    (value.sampleAudio === undefined ||
      (typeof value.sampleAudio === "string" &&
        UUID_PATTERN.test(value.sampleAudio))) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

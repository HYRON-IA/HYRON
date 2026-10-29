import type { ModelType } from "../storage/StorageProvider.ts";

export const MAX_FILENAME_LENGTH = 240;
export const SUPPORTED_EXTENSIONS = [".onnx.json", ".pth", ".index", ".onnx"] as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} precisa ser um inteiro positivo.`);
  }
  return parsed;
}

export function validateFilename(filename: unknown): {
  filename: string;
  modelType: ModelType;
} {
  if (
    typeof filename !== "string" ||
    filename.length === 0 ||
    filename.length > MAX_FILENAME_LENGTH ||
    /[\u0000-\u001f\u007f/\\]/.test(filename) ||
    filename === "." ||
    filename === ".."
  ) {
    throw new Error("Nome de arquivo inválido.");
  }

  const lower = filename.toLowerCase();
  const extension = SUPPORTED_EXTENSIONS.find((candidate) =>
    lower.endsWith(candidate),
  );
  if (!extension) {
    throw new Error(
      `Tipo de arquivo não permitido. Extensões aceitas: ${SUPPORTED_EXTENSIONS.join(", ")}.`,
    );
  }

  const modelType: ModelType =
    extension === ".pth" || extension === ".index"
      ? "rvc"
      : extension === ".onnx" || extension === ".onnx.json"
        ? "piper"
        : "unknown";

  return { filename, modelType };
}

export function validateSha256(checksum: unknown): string {
  if (
    typeof checksum !== "string" ||
    !/^[a-fA-F0-9]{64}$/.test(checksum)
  ) {
    throw new Error("checksum precisa ser um SHA-256 hexadecimal de 64 caracteres.");
  }
  return checksum.toLowerCase();
}

export function validateOpaqueId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
}

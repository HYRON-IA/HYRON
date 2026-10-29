export interface VoiceRegistration {
  name: string;
  kind: "rvc" | "piper";
  description: string;
  language: string;
  modelName: string;
  supportName: string;
  modelBytes: number;
  supportBytes: number;
  architecture: string;
  sampleRate: number;
  modelSha256: string;
  supportSha256: string | null;
  compatibility: string[];
  previewName: string | null;
}

const FILE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,149}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const COMPATIBILITY = new Set(["windows", "android", "web"]);

export function validateVoiceRegistration(value: unknown): VoiceRegistration | null {
  if (!isRecord(value)) return null;
  const {
    name,
    kind,
    description = "",
    language,
    modelName,
    supportName = "",
    modelBytes,
    supportBytes = 0,
    architecture,
    sampleRate,
    modelSha256,
    supportSha256 = null,
    compatibility,
    previewName = null,
  } = value;

  if (
    !isText(name, 80) ||
    (kind !== "rvc" && kind !== "piper") ||
    typeof description !== "string" ||
    description.length > 2000 ||
    !/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(String(language)) ||
    !isSafeFilename(modelName) ||
    !isSafeFilename(architecture) ||
    !isIntegerInRange(modelBytes, 1024, 100 * 1024 * 1024) ||
    !isIntegerInRange(supportBytes, 0, 100 * 1024 * 1024) ||
    !isIntegerInRange(sampleRate, 8000, 192000) ||
    typeof modelSha256 !== "string" ||
    !SHA256.test(modelSha256) ||
    !(supportSha256 === null || (typeof supportSha256 === "string" && SHA256.test(supportSha256))) ||
    !Array.isArray(compatibility) ||
    compatibility.length === 0 ||
    compatibility.length > COMPATIBILITY.size ||
    !compatibility.every(
      (target): target is string =>
        typeof target === "string" && COMPATIBILITY.has(target),
    ) ||
    new Set(compatibility).size !== compatibility.length ||
    !(previewName === null || isSafeFilename(previewName) && previewName.toLowerCase().endsWith(".wav"))
  ) {
    return null;
  }

  const normalizedSupportName = supportName === null ? "" : supportName;
  if (
    typeof normalizedSupportName !== "string" ||
    (normalizedSupportName !== "" && !isSafeFilename(normalizedSupportName))
  ) return null;
  if (kind === "rvc") {
    if (
      !["RVC-v1-40k", "RVC-v2-40k"].includes(architecture) ||
      sampleRate !== 40000 ||
      !modelName.toLowerCase().endsWith(".pth") ||
      (normalizedSupportName !== "" && !normalizedSupportName.toLowerCase().endsWith(".index")) ||
      (normalizedSupportName === "" && (supportBytes !== 0 || supportSha256 !== null)) ||
      (normalizedSupportName !== "" &&
        (!isIntegerInRange(supportBytes, 1, 100 * 1024 * 1024) ||
          typeof supportSha256 !== "string" ||
          !SHA256.test(supportSha256)))
    ) {
      return null;
    }
  } else if (
    architecture !== "Piper" ||
    !modelName.toLowerCase().endsWith(".onnx") ||
    !normalizedSupportName.toLowerCase().endsWith(".onnx.json") ||
    normalizedSupportName !== `${modelName}.json` ||
    !isIntegerInRange(supportBytes, 1, 1024 * 1024) ||
    typeof supportSha256 !== "string" ||
    !SHA256.test(supportSha256)
  ) {
    return null;
  }

  return {
    name: name.trim(),
    kind,
    description: description.trim(),
    language: String(language),
    modelName,
    supportName: normalizedSupportName,
    modelBytes,
    supportBytes,
    architecture,
    sampleRate,
    modelSha256: modelSha256.toLowerCase(),
    supportSha256: typeof supportSha256 === "string" ? supportSha256.toLowerCase() : null,
    compatibility: [...compatibility],
    previewName,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function isSafeFilename(value: unknown): value is string {
  return typeof value === "string" && FILE_NAME.test(value);
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}

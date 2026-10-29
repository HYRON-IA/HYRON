import { createHash } from "node:crypto";
import { resolve, sep } from "node:path";

export function userDirectoryKey(userId: string): string {
  return createHash("sha256").update(userId).digest("hex");
}

export function resolveWithin(root: string, ...segments: string[]): string {
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, ...segments);
  if (target !== absoluteRoot && !target.startsWith(`${absoluteRoot}${sep}`)) {
    throw new Error("Caminho fora do diretório de armazenamento.");
  }
  return target;
}

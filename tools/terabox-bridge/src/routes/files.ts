import type { StorageProvider } from "../storage/StorageProvider.ts";

export function matchFileRoute(pathname: string): string | null {
  return /^\/api\/files\/([0-9a-f-]+)$/i.exec(pathname)?.[1] ?? null;
}

export async function listFiles(
  provider: StorageProvider,
  userId: string,
) {
  return provider.list(userId);
}

export async function getFile(
  provider: StorageProvider,
  userId: string,
  fileId: string,
) {
  return provider.download(userId, fileId);
}

export async function deleteFile(
  provider: StorageProvider,
  userId: string,
  fileId: string,
): Promise<boolean> {
  return provider.delete(userId, fileId);
}

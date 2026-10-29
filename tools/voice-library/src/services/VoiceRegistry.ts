import type { RegistryProvider } from "../providers/LocalRegistryProvider.ts";
import type { VoiceCatalog } from "../types/VoiceModel.ts";

export class VoiceRegistry {
  private readonly locks = new Map<string, Promise<void>>();
  private readonly provider: RegistryProvider;

  constructor(provider: RegistryProvider) {
    this.provider = provider;
  }

  read(userId: string): Promise<VoiceCatalog> {
    return this.provider.load(userId);
  }

  async transact<T>(
    userId: string,
    operation: (catalog: VoiceCatalog) => Promise<T> | T,
  ): Promise<T> {
    const previous = this.locks.get(userId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolveLock) => {
      release = resolveLock;
    });
    this.locks.set(userId, current);
    await previous;
    try {
      const catalog = await this.provider.load(userId);
      const result = await operation(catalog);
      await this.provider.save(userId, catalog);
      return result;
    } finally {
      release();
      if (this.locks.get(userId) === current) this.locks.delete(userId);
    }
  }
}

import type { VoiceConversionEngine } from "../types/VoiceEngine.ts";

export class RVCEngine implements VoiceConversionEngine {
  readonly id = "rvc";
  readonly name = "RVC voice conversion";

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async convert(
    _inputPath: string,
    _modelFiles: readonly string[],
    _signal: AbortSignal,
  ): Promise<string> {
    throw new Error(
      "ENGINE_NOT_AVAILABLE: conversão RVC segura não está configurada; os pesos .pth nunca são desserializados.",
    );
  }
}

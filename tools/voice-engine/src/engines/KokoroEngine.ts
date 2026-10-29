import type { TTSEngine, TTSOptions } from "../types/VoiceEngine.ts";

export class KokoroEngine implements TTSEngine {
  readonly id = "kokoro";
  readonly name = "Kokoro TTS";

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async synthesize(_text: string, _options: TTSOptions): Promise<string> {
    throw new Error(
      "ENGINE_NOT_AVAILABLE: Kokoro ainda não possui runtime local configurado neste módulo.",
    );
  }
}

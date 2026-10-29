import { createHash } from "node:crypto";
import { open, stat } from "node:fs/promises";
import type { AudioResult } from "../types/VoiceEngine.ts";

export interface AudioLimits {
  maxBytes: number;
  maxDurationSeconds: number;
}

export class AudioProcessor {
  private readonly limits: AudioLimits;

  constructor(limits: AudioLimits) {
    this.limits = limits;
  }

  async validateWav(path: string): Promise<AudioResult> {
    const info = await stat(path);
    if (!info.isFile() || info.size < 44 || info.size > this.limits.maxBytes) {
      throw new Error("A saída WAV está vazia, inválida ou excede o limite.");
    }
    const handle = await open(path, "r");
    const header = new Uint8Array(Math.min(info.size, 65536));
    let bytesRead: number;
    try {
      ({ bytesRead } = await handle.read(header, 0, header.length, 0));
    } finally {
      await handle.close();
    }
    if (
      bytesRead < 44 ||
      ascii(header, 0, 4) !== "RIFF" ||
      ascii(header, 8, 12) !== "WAVE"
    ) {
      throw new Error("O arquivo resultante não contém um cabeçalho WAV válido.");
    }
    const view = new DataView(header.buffer, header.byteOffset, bytesRead);
    if (view.getUint32(4, true) + 8 > info.size) {
      throw new Error("O tamanho declarado no cabeçalho WAV excede o arquivo.");
    }
    let offset = 12;
    let byteRate: number | undefined;
    let dataLength: number | undefined;
    let dataOffset: number | undefined;
    while (offset + 8 <= bytesRead) {
      const chunkId = ascii(header, offset, offset + 4);
      const chunkSize = view.getUint32(offset + 4, true);
      const bodyOffset = offset + 8;
      if (chunkId === "fmt " && chunkSize >= 16 && bodyOffset + 16 <= bytesRead) {
        byteRate = view.getUint32(bodyOffset + 8, true);
      }
      if (chunkId === "data") {
        dataLength = chunkSize;
        dataOffset = bodyOffset;
        break;
      }
      const next = bodyOffset + chunkSize + (chunkSize % 2);
      if (next <= offset || next > bytesRead) break;
      offset = next;
    }
    if (
      !byteRate ||
      !dataLength ||
      dataOffset === undefined ||
      dataLength > info.size - dataOffset
    ) {
      throw new Error("O arquivo WAV não contém metadados de áudio válidos.");
    }
    const durationSeconds = dataLength / byteRate;
    if (
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0 ||
      durationSeconds > this.limits.maxDurationSeconds
    ) {
      throw new Error("A duração do WAV excede o limite configurado.");
    }
    const hash = createHash("sha256");
    const input = (await import("node:fs")).createReadStream(path);
    for await (const chunk of input) hash.update(chunk);
    return {
      path,
      format: "wav",
      contentType: "audio/wav",
      size: info.size,
      durationSeconds,
      checksum: hash.digest("hex"),
    };
  }
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let value = "";
  for (let index = start; index < end; index += 1) {
    value += String.fromCharCode(bytes[index]);
  }
  return value;
}

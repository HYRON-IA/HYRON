import { spawn } from "node:child_process";
import { access, readFile, readdir, rm, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { TTSEngine, TTSOptions } from "../types/VoiceEngine.ts";

export interface PiperOptions {
  executable?: string;
  modelPath?: string;
  modelDirectory?: string;
  timeoutMs: number;
  maxOutputBytes?: number;
}

interface PiperModel {
  name: string;
  path: string;
}

export class PiperEngine implements TTSEngine {
  readonly id = "piper";
  readonly name = "Piper TTS";
  private readonly options: PiperOptions;
  private availability?: Promise<boolean>;

  constructor(options: PiperOptions) {
    this.options = options;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.availability) this.availability = this.detectAvailability();
    return this.availability;
  }

  async listVoices(): Promise<string[]> {
    return (await this.getModels()).map((model) => model.name);
  }

  private async detectAvailability(): Promise<boolean> {
    if (!this.options.executable) return false;
    try {
      const executable = await stat(this.options.executable);
      if (!executable.isFile() || (await this.getModels()).length === 0) {
        return false;
      }
      return await probePiper(this.options.executable);
    } catch {
      return false;
    }
  }

  async synthesize(text: string, options: TTSOptions): Promise<string> {
    const outputPath = resolve(options.outputDirectory, "piper-speech.wav");
    try {
      const models = await this.getModels();
      const model = options.voiceName
        ? models.find((entry) => entry.name === options.voiceName)
        : models.length === 1
          ? models[0]
          : undefined;
      if (!model) {
        throw new Error(
          "INVALID_VOICE_NAME: selecione uma voz Piper instalada pelo nome do modelo.",
        );
      }
      if (!(await this.isAvailable()) || !this.options.executable) {
        throw new Error("ENGINE_NOT_AVAILABLE: runtime Piper ou modelo ONNX indisponível.");
      }
      await runPiper(
        this.options.executable,
        ["--model", model.path, "--output_file", outputPath],
        text,
        this.options.timeoutMs,
        this.options.maxOutputBytes ?? 32 * 1024 * 1024,
        options.signal,
      );
      return outputPath;
    } catch (error) {
      await rm(outputPath, { force: true });
      throw error;
    }
  }

  private async getModels(): Promise<PiperModel[]> {
    const paths: string[] = [];
    if (this.options.modelDirectory) {
      const modelDirectory = this.options.modelDirectory;
      let entries;
      try {
        entries = await readdir(modelDirectory, { withFileTypes: true });
      } catch {
        return [];
      }
      paths.push(
        ...entries
          .filter(
            (entry) =>
              entry.isFile() && entry.name.toLowerCase().endsWith(".onnx"),
          )
          .map((entry) => join(modelDirectory, entry.name))
          .sort(),
      );
    } else if (this.options.modelPath) {
      paths.push(this.options.modelPath);
    }

    const models: PiperModel[] = [];
    for (const path of paths.slice(0, 100)) {
      if (!path.toLowerCase().endsWith(".onnx")) continue;
      try {
        const [modelInfo, metadataInfo] = await Promise.all([
          stat(path),
          stat(`${path}.json`),
        ]);
        if (
          !modelInfo.isFile() ||
          modelInfo.size === 0 ||
          !metadataInfo.isFile() ||
          metadataInfo.size === 0 ||
          metadataInfo.size > 1024 * 1024
        ) {
          continue;
        }
        const metadata = JSON.parse(await readFile(`${path}.json`, "utf8")) as unknown;
        if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
          continue;
        }
        models.push({
          name: basename(path).replace(/\.onnx$/i, ""),
          path: resolve(path),
        });
      } catch {
        continue;
      }
    }
    return models;
  }
}

function probePiper(executable: string): Promise<boolean> {
  return new Promise((resolveProbe) => {
    let output = "";
    let settled = false;
    let failure = false;
    let child;
    try {
      child = spawn(executable, ["--help"], {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: safeRuntimeEnvironment(),
      });
    } catch {
      resolveProbe(false);
      return;
    }
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveProbe(
        !failure &&
          output.includes("--model") &&
          output.includes("--output_file"),
      );
    };
    const timer = setTimeout(() => {
      failure = true;
      child.kill();
    }, 3000);
    const collect = (chunk: Uint8Array): void => {
      if (output.length >= 65536) {
        failure = true;
        child.kill();
        return;
      }
      output += chunk.toString();
      if (output.length > 65536) {
        output = output.slice(0, 65536);
        failure = true;
        child.kill();
      }
    };
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);
    child.on("error", () => {
      failure = true;
      child.kill();
    });
    child.on("close", (code) => {
      if (code !== 0) failure = true;
      finish();
    });
  });
}

function runPiper(
  executable: string,
  args: string[],
  text: string,
  timeoutMs: number,
  maxOutputBytes: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    if (signal.aborted) {
      reject(new Error("A geração de áudio foi cancelada."));
      return;
    }
    let child;
    try {
      child = spawn(executable, args, {
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "ignore", "ignore"],
        env: safeRuntimeEnvironment(),
      });
    } catch {
      reject(new Error("Não foi possível iniciar Piper."));
      return;
    }
    let settled = false;
    let failure: Error | undefined;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(outputMonitor);
      signal.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else resolvePromise();
    };
    const stop = (error: Error): void => {
      if (failure) return;
      failure = error;
      child.kill();
    };
    const timer = setTimeout(
      () => stop(new Error("O mecanismo Piper excedeu o timeout.")),
      timeoutMs,
    );
    const outputPath = args[args.indexOf("--output_file") + 1];
    const outputMonitor = setInterval(() => {
      void stat(outputPath)
        .then((info) => {
          if (info.size > maxOutputBytes) {
            stop(new Error("A saída Piper excedeu o limite de tamanho."));
          }
        })
        .catch((error: unknown) => {
          if (error instanceof Error && "code" in error && error.code !== "ENOENT") {
            stop(new Error("Não foi possível verificar o tamanho da saída Piper."));
          }
        });
    }, 100);
    const abort = (): void =>
      stop(new Error("A geração de áudio foi cancelada."));
    signal.addEventListener("abort", abort, { once: true });
    child.on("error", () =>
      stop(new Error("Não foi possível iniciar Piper.")),
    );
    child.on("close", (code) => {
      if (code !== 0 && !failure) {
        failure = new Error("Piper não conseguiu gerar o áudio.");
      }
      finish();
    });
    child.stdin?.end(text + "\n");
  });
}

function safeRuntimeEnvironment(): Record<string, string | undefined> {
  const allowed = ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "HOME"];
  const environment: Record<string, string | undefined> = {};
  for (const key of allowed) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

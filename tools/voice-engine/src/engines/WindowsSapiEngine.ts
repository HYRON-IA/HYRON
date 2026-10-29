import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { TTSEngine, TTSOptions } from "../types/VoiceEngine.ts";

const POWERSHELL = "powershell.exe";
const SCRIPT =
  "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Speech; " +
  "$s=New-Object System.Speech.Synthesis.SpeechSynthesizer; " +
  "try { if ($env:HYRON_SAPI_ACTION -eq 'list') { " +
  "$s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }; " +
  "} else { $d=Get-Content -LiteralPath $env:HYRON_SAPI_REQUEST -Raw | ConvertFrom-Json; " +
  "if ($d.voiceName) { $s.SelectVoice($d.voiceName) }; " +
  "$s.SetOutputToWaveFile($env:HYRON_SAPI_OUTPUT); $s.Speak($d.text); " +
  "$s.SetOutputToNull() }; } finally { $s.Dispose() }";

export class WindowsSapiEngine implements TTSEngine {
  readonly id = "windows-sapi";
  readonly name = "Windows System.Speech (SAPI)";
  private readonly temporaryDirectory: string;
  private readonly timeoutMs: number;

  constructor(temporaryDirectory: string, timeoutMs: number) {
    this.temporaryDirectory = temporaryDirectory;
    this.timeoutMs = timeoutMs;
  }

  async isAvailable(): Promise<boolean> {
    if (process.env.OS !== "Windows_NT") return false;
    try {
      return (await this.listVoices()).length > 0;
    } catch {
      return false;
    }
  }

  async listVoices(): Promise<string[]> {
    if (process.env.OS !== "Windows_NT") return [];
    const output = await runPowerShell(
      {
        HYRON_SAPI_ACTION: "list",
      },
      this.timeoutMs,
    );
    return output
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
  }

  async synthesize(text: string, options: TTSOptions): Promise<string> {
    if (process.env.OS !== "Windows_NT") {
      throw new Error("ENGINE_NOT_AVAILABLE: Windows SAPI só existe no Windows.");
    }
    const directory = resolve(options.outputDirectory, randomUUID());
    const requestPath = resolve(directory, "request.json");
    const outputPath = resolve(directory, "speech.wav");
    await mkdir(this.temporaryDirectory, { recursive: true });
    await mkdir(directory, { recursive: true });
    await writeFile(
      requestPath,
      JSON.stringify({ text, voiceName: options.voiceName ?? null }),
      "utf8",
    );
    try {
      await runPowerShell(
        {
          HYRON_SAPI_ACTION: "synthesize",
          HYRON_SAPI_REQUEST: requestPath,
          HYRON_SAPI_OUTPUT: outputPath,
        },
        this.timeoutMs,
        options.signal,
      );
      return outputPath;
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }
}

function runPowerShell(
  variables: Record<string, string>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    if (signal?.aborted) {
      reject(new Error("A geração de áudio foi cancelada."));
      return;
    }
    const child = spawn(
      POWERSHELL,
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", SCRIPT],
      {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
        env: safeWindowsEnvironment(variables),
      },
    );
    let output = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("O mecanismo TTS excedeu o timeout."));
    }, timeoutMs);
    const abort = (): void => {
      child.kill();
      finish(new Error("A geração de áudio foi cancelada."));
    };
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolvePromise(output);
    };
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout?.on("data", (chunk) => {
      output += chunk.toString();
      if (output.length > 65536) {
        child.kill();
        finish(new Error("Resposta excessiva do mecanismo TTS."));
      }
    });
    child.on("error", () => finish(new Error("Não foi possível iniciar Windows SAPI.")));
    child.on("close", (code) => {
      if (code === 0) finish();
      else finish(new Error("Windows SAPI não conseguiu gerar o áudio."));
    });
  });
}

function safeWindowsEnvironment(
  extra: Record<string, string>,
): Record<string, string | undefined> {
  const allowed = [
    "PATH",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "PSModulePath",
  ];
  const environment: Record<string, string | undefined> = {};
  for (const key of allowed) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  return { ...environment, ...extra };
}

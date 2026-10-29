declare module "node:child_process" {
  interface ChildReadable {
    on(event: "data", listener: (chunk: Uint8Array) => void): this;
  }

  interface ChildWritable {
    end(data?: string | Uint8Array): void;
  }

  interface ChildProcess {
    stdin?: ChildWritable;
    stdout?: ChildReadable;
    stderr?: ChildReadable;
    on(event: "error", listener: (error: Error) => void): this;
    on(
      event: "close",
      listener: (code: number | null, signal: string | null) => void,
    ): this;
    kill(signal?: string): boolean;
  }

  export function spawn(
    command: string,
    args: readonly string[],
    options: {
      shell: false;
      windowsHide?: boolean;
      stdio?: ["ignore" | "pipe", "ignore" | "pipe", "ignore" | "pipe"];
      env?: Record<string, string | undefined>;
    },
  ): ChildProcess;
}

declare module "node:fs/promises" {
  interface FileHandle {
    read(
      buffer: Uint8Array,
      offset: number,
      length: number,
      position: number | null,
    ): Promise<{ bytesRead: number; buffer: Uint8Array }>;
  }

  export function access(path: string): Promise<void>;
  export function mkdtemp(prefix: string): Promise<string>;
  export function writeFile(
    path: string,
    data: string | Uint8Array,
    encoding?: "utf8",
  ): Promise<void>;
  export function mkdir(path: string, options?: { recursive?: true }): Promise<void>;
  export function rm(
    path: string,
    options: { force?: true; recursive?: true },
  ): Promise<void>;
  export function stat(path: string): Promise<{
    size: number;
    isFile(): boolean;
  }>;
  export function readdir(
    path: string,
    options: { withFileTypes: true },
  ): Promise<Array<{ name: string; isFile(): boolean }>>;
  export function open(path: string, flags: string): Promise<{
    read(
      buffer: Uint8Array,
      offset: number,
      length: number,
      position: number | null,
    ): Promise<{ bytesRead: number; buffer: Uint8Array }>;
    close(): Promise<void>;
  }>;
}

declare module "node:fs" {
  export function createReadStream(path: string): AsyncIterable<Uint8Array>;
}

declare module "node:path" {
  export function basename(path: string, suffix?: string): string;
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
}

declare module "node:test" {
  export interface TestOptions {
    skip?: boolean | string;
  }

  export function test(
    name: string,
    options: TestOptions,
    fn: () => void | Promise<void>,
  ): void;
}

declare module "node:http" {
  interface Server {
    once(event: "close", listener: () => void): this;
  }
}

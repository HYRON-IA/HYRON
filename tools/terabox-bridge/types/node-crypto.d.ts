declare module "node:crypto" {
  interface Hash {
    update(data: string | Uint8Array): Hash;
    digest(encoding: "hex"): string;
    digest(): Uint8Array;
  }

  export function createHash(algorithm: string): Hash;
  export function randomUUID(): string;
  export function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean;
}

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
  on(event: "SIGINT" | "SIGTERM", listener: () => void): void;
};

declare class Buffer extends Uint8Array {
  static from(value: string | Uint8Array, encoding?: string): Buffer;
  static concat(chunks: readonly Uint8Array[]): Buffer;
  static byteLength(value: string): number;
  toString(encoding?: string): string;
}

declare module "node:fs/promises" {
  interface FileHandle {
    write(
      buffer: Uint8Array,
      offset: number,
      length: number,
      position: number | null,
    ): Promise<{ bytesWritten: number }>;
    writeFile(data: string, encoding: "utf8"): Promise<void>;
    close(): Promise<void>;
  }

  interface FileStats {
    size: number;
    isFile(): boolean;
  }

  export function mkdir(
    path: string,
    options: { recursive: true },
  ): Promise<void | string>;
  export function open(path: string, flags: string): Promise<FileHandle>;
  export function readFile(path: string, encoding: "utf8"): Promise<string>;
  export function writeFile(
    path: string,
    data: string,
    encoding: "utf8",
  ): Promise<void>;
  export function readdir(path: string): Promise<string[]>;
  export function rename(oldPath: string, newPath: string): Promise<void>;
  export function rm(
    path: string,
    options: { force: true; recursive?: true },
  ): Promise<void>;
  export function stat(path: string): Promise<FileStats>;
}

declare module "node:fs" {
  export function createReadStream(path: string): AsyncIterable<Uint8Array>;
}

declare module "node:path" {
  export const sep: string;
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:fs/promises" {
  export function mkdtemp(prefix: string): Promise<string>;
}

declare module "node:test" {
  export function test(
    name: string,
    fn: () => void | Promise<void>,
  ): void;
}

declare module "node:assert/strict" {
  export function equal(
    actual: unknown,
    expected: unknown,
    message?: string,
  ): void;
  export function deepEqual(
    actual: unknown,
    expected: unknown,
    message?: string,
  ): void;
  export function ok(value: unknown, message?: string): asserts value;
  export function rejects(
    block: () => Promise<unknown>,
    error?: RegExp,
  ): Promise<void>;
}

declare module "node:http" {
  export interface IncomingMessage extends AsyncIterable<Uint8Array> {
    headers: Record<string, string | string[] | undefined>;
    method?: string;
    url?: string;
  }

  export interface ServerResponse {
    headersSent: boolean;
    writeHead(status: number, headers?: Record<string, string>): this;
    write(chunk: Uint8Array): boolean;
    end(data?: string): void;
    once(event: "drain", listener: () => void): this;
    once(event: "error", listener: (error: Error) => void): this;
    destroy(): void;
  }

  export interface Server {
    once(event: "error", listener: (error: Error) => void): this;
    off(event: "error", listener: (error: Error) => void): this;
    listen(port: number, hostname: string, listener: () => void): this;
    close(callback: (error?: Error) => void): void;
    address(): { port: number; address: string } | string | null;
  }

  export function createServer(
    listener: (request: IncomingMessage, response: ServerResponse) => void,
  ): Server;
}

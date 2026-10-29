/**
 * HYRON Hugging Face Storage Buckets (S3-compatible) signer.
 * SigV4 presigning uses WebCrypto, so it runs in Cloudflare Workers without AWS SDK.
 * No S3 credential is ever returned to an application client.
 * NOTE: HTTP/S3 interoperability and CORS need a real provider integration test.
 */
export interface HFStorageEnv {
  HF_S3_NAMESPACE?: string;
  HF_S3_BUCKET?: string;
  HF_S3_ACCESS_KEY_ID?: string;
  HF_S3_SECRET_ACCESS_KEY?: string;
}

export type ObjectMethod = "GET" | "PUT" | "HEAD" | "DELETE";
export type SignedObject = { url: string; headers: Record<string, string> };
const enc = new TextEncoder();
const REGION = "us-east-1";
const SERVICE = "s3";
const HOST = "s3.hf.co";

const rfc3986 = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, "0")).join("");

export function storageConfigured(env: HFStorageEnv): boolean {
  return Boolean(
    env.HF_S3_NAMESPACE && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(env.HF_S3_NAMESPACE) &&
    env.HF_S3_BUCKET && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(env.HF_S3_BUCKET) &&
    env.HF_S3_ACCESS_KEY_ID?.startsWith("HFAK") &&
    env.HF_S3_SECRET_ACCESS_KEY && env.HF_S3_SECRET_ACCESS_KEY.length >= 16,
  );
}

async function hmac(
  key: ArrayBuffer | Uint8Array | string,
  message: string
): Promise<ArrayBuffer> {

  const source = typeof key === "string"
    ? enc.encode(key)
    : new Uint8Array(key);

  const bytes = new Uint8Array(source.byteLength);
  bytes.set(source);

  const imported = await crypto.subtle.importKey(
    "raw",
    bytes.buffer,
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  return crypto.subtle.sign(
    "HMAC",
    imported,
    enc.encode(message)
  );
}

function amzTime(d: Date) { return d.toISOString().replace(/[:-]|\.\d{3}/g, ""); }

/** Only internal keys composed of generated IDs and validated filenames are accepted. */
export function safeObjectKey(key: string): boolean {
  return key.length > 0 && key.length < 650 &&
    /^(?:[a-zA-Z0-9][a-zA-Z0-9._-]*\/)*[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(key) &&
    !key.split("/").some(part => part === "." || part === "..") && !key.includes("//");
}

/**
 * Signed PUT includes Content-Type and If-None-Match to prohibit overwriting
 * the same key, even while the short-lived URL is valid.
 */
export async function presignHFObject(
  env: HFStorageEnv, method: ObjectMethod, key: string,
  options: { expiresSeconds?: number; contentType?: string; now?: Date } = {},
): Promise<SignedObject> {
  if (!storageConfigured(env)) throw new Error("Hugging Face Storage Buckets não configurado");
  if (!safeObjectKey(key)) throw new Error("Chave de objeto inválida");
  const expires = options.expiresSeconds ?? 120;
  if (!Number.isSafeInteger(expires) || expires < 1 || expires > 900) throw new Error("Prazo de URL inválido");
  if (method === "PUT" && !["application/octet-stream", "audio/wav"].includes(options.contentType ?? "")) {
    throw new Error("Content-Type inválido para upload");
  }
  const stamp = amzTime(options.now ?? new Date());
  const day = stamp.slice(0, 8);
  const scope = `${day}/${REGION}/${SERVICE}/aws4_request`;
  const objectPath = `/${rfc3986(env.HF_S3_NAMESPACE!)}/${rfc3986(env.HF_S3_BUCKET!)}/${key.split("/").map(rfc3986).join("/")}`;
  const headers: Record<string, string> = {};
  if (method === "PUT") {
    headers["content-type"] = options.contentType!;
    headers["if-none-match"] = "*";
  }
  const canonicalHeaders = { host: HOST, ...headers };
  const signedNames = Object.keys(canonicalHeaders).sort();
  const signedHeaders = signedNames.join(";");
  const params: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${env.HF_S3_ACCESS_KEY_ID}/${scope}`],
    ["X-Amz-Date", stamp],
    ["X-Amz-Expires", String(expires)],
    ["X-Amz-SignedHeaders", signedHeaders],
  ];
  const canonicalQuery = params
    .map(([k, v]) => [rfc3986(k), rfc3986(v)])
    .sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const canonicalRequest = [
    method, objectPath, canonicalQuery,
    signedNames.map(name => `${name}:${canonicalHeaders[name as keyof typeof canonicalHeaders]!.trim()}\n`).join(""),
    signedHeaders, "UNSIGNED-PAYLOAD",
  ].join("\n");
  const digest = hex(await crypto.subtle.digest("SHA-256", enc.encode(canonicalRequest)));
  const stringToSign = `AWS4-HMAC-SHA256\n${stamp}\n${scope}\n${digest}`;
  const kDate = await hmac(`AWS4${env.HF_S3_SECRET_ACCESS_KEY!}`, day);
  const kRegion = await hmac(kDate, REGION);
  const kService = await hmac(kRegion, SERVICE);
  const kSigning = await hmac(kService, "aws4_request");
  const signature = hex(await hmac(kSigning, stringToSign));
  return { url: `https://${HOST}${objectPath}?${canonicalQuery}&X-Amz-Signature=${signature}`, headers };
}

/** HEAD/DELETE use the same signed access path without passing secrets to clients. */
export async function requestHFObject(env: HFStorageEnv, method: "HEAD" | "DELETE", key: string): Promise<Response> {
  const { url } = await presignHFObject(env, method, key, { expiresSeconds: 60 });
  return fetch(url, { method, redirect: "manual" });
}

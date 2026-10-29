import { createHash } from "node:crypto";

const tokenEndpoint = "https://www.terabox.com/oauth/gettoken";
const tokenInfoEndpoint = "https://www.terabox.com/oauth/tokeninfo";
const authorizationPage = "https://www.terabox.com/wap/outside/login";
const timeoutMs = 15_000;

interface TokenResponse {
  data?: {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
  };
  errno?: unknown;
}

interface TokenInfoResponse {
  data?: {
    api_domain?: unknown;
    upload_domain?: unknown;
  };
  errno?: unknown;
}

function requiredEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function signRequest(
  clientId: string,
  timestamp: string,
  clientSecret: string,
  privateSecret: string,
): string {
  return createHash("md5")
    .update(`${clientId}_${timestamp}_${clientSecret}_${privateSecret}`)
    .digest("hex");
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`TeraBox respondeu com HTTP ${response.status}.`);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new Error("A resposta do TeraBox não é um JSON válido.");
  }
}

function assertApiSuccess(
  response: { errno?: unknown },
  operation: string,
): void {
  if (response.errno !== 0) {
    const errorCode =
      typeof response.errno === "number" || typeof response.errno === "string"
        ? ` (errno ${response.errno})`
        : "";
    throw new Error(`A operação ${operation} falhou${errorCode}.`);
  }
}

async function exchangeAuthorizationCode(
  clientId: string,
  clientSecret: string,
  privateSecret: string,
  authorizationCode: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const form = new FormData();
  form.set("client_id", clientId);
  form.set("client_secret", clientSecret);
  form.set("grant_type", "authorization_code");
  form.set("code", authorizationCode);
  form.set("timestamp", timestamp);
  form.set(
    "sign",
    signRequest(clientId, timestamp, clientSecret, privateSecret),
  );

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await readJson<TokenResponse>(response);
  assertApiSuccess(payload, "troca do código OAuth");

  const accessToken = payload.data?.access_token;
  const refreshToken = payload.data?.refresh_token;
  const expiresIn = payload.data?.expires_in;

  if (
    typeof accessToken !== "string" ||
    typeof refreshToken !== "string" ||
    typeof expiresIn !== "number"
  ) {
    throw new Error(
      "A resposta OAuth não contém os tokens e a validade esperados.",
    );
  }

  return { accessToken, expiresIn };
}

async function verifyAccessToken(accessToken: string): Promise<{
  apiDomain: string;
  uploadDomain: string;
}> {
  const form = new FormData();
  form.set("access_token", accessToken);

  const response = await fetch(tokenInfoEndpoint, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await readJson<TokenInfoResponse>(response);
  assertApiSuccess(payload, "consulta de informações do token");

  const apiDomain = payload.data?.api_domain;
  const uploadDomain = payload.data?.upload_domain;

  if (typeof apiDomain !== "string" || typeof uploadDomain !== "string") {
    throw new Error(
      "A resposta de tokeninfo não contém os domínios esperados.",
    );
  }

  return { apiDomain, uploadDomain };
}

async function main(): Promise<void> {
  const clientId = requiredEnv("TERABOX_CLIENT_ID");
  const clientSecret = requiredEnv("TERABOX_CLIENT_SECRET");
  const privateSecret = requiredEnv("TERABOX_PRIVATE_SECRET");
  const authorizationCode = requiredEnv("TERABOX_AUTH_CODE");

  if (!clientId || !clientSecret || !privateSecret) {
    const missingCredentials = [
      ["TERABOX_CLIENT_ID", clientId],
      ["TERABOX_CLIENT_SECRET", clientSecret],
      ["TERABOX_PRIVATE_SECRET", privateSecret],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);
    throw new Error(
      `Configure estas credenciais oficiais no .env: ${missingCredentials.join(", ")}. ` +
        "Elas não podem ser substituídas por e-mail e senha da conta.",
    );
  }

  if (!authorizationCode) {
    const url = new URL(authorizationPage);
    url.searchParams.set("clientId", clientId);
    console.log("Credenciais do aplicativo presentes; código OAuth não configurado.");
    console.log("Conclua a autorização na página oficial do TeraBox:");
    console.log(url.toString());
    console.log(
      "Depois de obter o code pelo fluxo/callback aprovado para o aplicativo, configure TERABOX_AUTH_CODE no .env e execute novamente.",
    );
    return;
  }

  console.log("Trocando o código de autorização OAuth...");
  const tokens = await exchangeAuthorizationCode(
    clientId,
    clientSecret,
    privateSecret,
    authorizationCode,
  );

  console.log("Consultando o domínio associado ao token...");
  const domains = await verifyAccessToken(tokens.accessToken);

  console.log("Autenticação TeraBox concluída.");
  console.log(`Validade do access_token: ${tokens.expiresIn} segundos.`);
  console.log(`api_domain: ${domains.apiDomain}`);
  console.log(`upload_domain: ${domains.uploadDomain}`);
  console.log("Tokens não foram exibidos nem gravados em disco.");
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Erro inesperado no teste OAuth.";
  console.error(`Falha no teste TeraBox: ${message}`);
  process.exitCode = 1;
});

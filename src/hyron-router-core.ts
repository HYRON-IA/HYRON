// HYRON Alfa 6 - Executor puro de fallback. Sem rede, segredos ou configuracao.
// O chamador deve selecionar SOMENTE provedores previamente autorizados.
// Este modulo e usado tanto por /api/chat quanto pelos testes deterministas.
export type ProviderFailure = Readonly<{ provider: string; reason: string }>;
export type ProviderResponse<T> =
  | ({ ok: true } & T)
  | { ok: false; reason: string };
export type RoutedResult<P, T> =
  | { ok: true; provider: P; response: T; attempts: ProviderFailure[] }
  | { ok: false; attempts: ProviderFailure[] };

export async function routeCandidates<P extends { name: string }, T extends object>(
  ordered: readonly P[],
  execute: (provider: P) => Promise<ProviderResponse<T>>,
  observe: (provider: P, ok: boolean, reason: string, elapsedMs: number) => void,
  maxAttempts = 4,
): Promise<RoutedResult<P, T>> {
  const attempts: ProviderFailure[] = [];
  // Numero de tentativas limitado mesmo com entradas inesperadas.
  const count = Number.isFinite(maxAttempts)
    ? Math.max(0, Math.min(4, Math.trunc(maxAttempts))) : 0;
  for (const provider of ordered.slice(0, count)) {
    const started = Date.now();
    let result: ProviderResponse<T>;
    try {
      result = await execute(provider);
    } catch {
      // Nao exponha mensagens de excecao que possam conter credenciais ou URLs.
      result = { ok: false, reason: 'falha interna do provedor' };
    }
    if (result.ok) {
      observe(provider, true, '', Date.now() - started);
      const { ok: _ok, ...response } = result;
      return { ok: true, provider, response: response as T, attempts };
    }
    observe(provider, false, result.reason, Date.now() - started);
    attempts.push({ provider: provider.name, reason: result.reason });
  }
  return { ok: false, attempts };
}

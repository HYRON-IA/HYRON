import { loadBridgeConfig, startBridgeServer } from "./server.ts";

try {
  const config = loadBridgeConfig();
  const server = await startBridgeServer(config);
  console.log(
    `HYRON Storage Bridge v0.2 ouvindo em http://127.0.0.1:${config.port}`,
  );
  console.log(`Provedor configurado: ${config.provider}.`);

  const shutdown = (): void => {
    server.close((error?: Error) => {
      if (error) {
        console.error(`Falha ao encerrar o servidor: ${error.message}`);
        process.exitCode = 1;
      }
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} catch (error) {
  const message =
    error instanceof Error ? error.message : "Erro ao iniciar o servidor.";
  console.error(`Não foi possível iniciar HYRON Storage Bridge: ${message}`);
  process.exitCode = 1;
}

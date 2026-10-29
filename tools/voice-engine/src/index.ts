import {
  loadVoiceEngineConfig,
  startVoiceEngineServer,
} from "./api/server.ts";

try {
  const config = loadVoiceEngineConfig();
  const server = await startVoiceEngineServer(config);
  console.log(
    `HYRON Voice Engine v0.5.8 ouvindo em http://127.0.0.1:${config.port}`,
  );
  const shutdown = (): void => {
    server.close((error?: Error) => {
      if (error) {
        console.error(`Falha ao encerrar Voice Engine: ${error.message}`);
        process.exitCode = 1;
      }
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} catch (error) {
  const message =
    error instanceof Error ? error.message : "Erro ao iniciar o servidor.";
  console.error(`Não foi possível iniciar HYRON Voice Engine: ${message}`);
  process.exitCode = 1;
}

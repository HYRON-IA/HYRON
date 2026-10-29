import {
  loadVoiceLibraryConfig,
  startVoiceLibraryServer,
} from "./api/server.ts";

try {
  const config = loadVoiceLibraryConfig();
  const server = await startVoiceLibraryServer(config);
  console.log(
    `HYRON Voice Library v0.5.3 ouvindo em http://127.0.0.1:${config.port}`,
  );
  const shutdown = (): void => {
    server.close((error?: Error) => {
      if (error) {
        console.error(`Falha ao encerrar Voice Library: ${error.message}`);
        process.exitCode = 1;
      }
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} catch (error) {
  const message =
    error instanceof Error ? error.message : "Erro ao iniciar o servidor.";
  console.error(`Não foi possível iniciar HYRON Voice Library: ${message}`);
  process.exitCode = 1;
}

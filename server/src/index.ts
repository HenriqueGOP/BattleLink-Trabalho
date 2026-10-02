import { createApplication } from "./application";
import { config } from "./config";
import { ensureCatalog } from "./game/pokeapi";

async function main(): Promise<void> {
  const application = createApplication();
  await application.listen();
  console.log(`Servidor TCP em ${config.tcpHost}:${config.tcpPort}`);
  console.log(`Ponte WebSocket em ws://${config.host}:${config.webSocketPort}`);
  console.log(`API do catálogo em http://${config.host}:${config.httpPort}/api/pokemon`);
  void ensureCatalog().catch(() =>
    console.warn(
      "[pokeapi] Catálogo indisponível; conecte à internet para preencher o cache local.",
    ),
  );
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void application.close().then(() => process.exit(0));
    });
  }
}

main().catch((error) => {
  console.error(`[erro fatal] ${error.message}`);
  process.exitCode = 1;
});

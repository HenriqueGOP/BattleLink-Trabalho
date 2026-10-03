import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import { createApplication } from "./application";
import { config } from "./config";
import { TEAM } from "./game/room.fixture";
import { speciesById } from "./contracts/catalog";

async function run() {
  const application = createApplication(
    {
      ...config,
      host: "127.0.0.1",
      tcpHost: "127.0.0.1",
      tcpPort: 0,
      webSocketPort: 0,
      httpPort: 0,
      accessToken: "terminal-test",
    },
    () => undefined,
  );
  await application.listen();
  const port = (application.addresses().tcp as AddressInfo).port;
  const clients = ["CLI Alice", "CLI Bob"].map((name) => {
    const process = spawn(
      globalThis.process.execPath,
      ["--import", "tsx", "src/client.ts", name],
      {
        cwd: resolve(__dirname, ".."),
        windowsHide: true,
        env: {
          ...globalThis.process.env,
          TCP_HOST: "127.0.0.1",
          PORT: String(port),
          BATTLE_ACCESS_TOKEN: "terminal-test",
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let output = "";
    process.stdout.setEncoding("utf8");
    process.stderr.setEncoding("utf8");
    process.stdout.on("data", (chunk) => {
      output += chunk;
    });
    process.stderr.on("data", (chunk) => {
      output += chunk;
    });
    return {
      process,
      send: (commands: string) => process.stdin.write(`${commands}\n`),
      output: () => output,
      wait: (text: string): Promise<void> =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            cleanup();
            reject(new Error(`CLI aguardava ${text}: ${output.slice(-1500)}`));
          }, 10000);
          const cleanup = () => {
            clearTimeout(timer);
            process.stdout.off("data", check);
            process.off("error", fail);
          };
          const check = () => {
            if (output.includes(text)) {
              cleanup();
              resolve();
            }
          };
          const fail = (error: Error) => {
            cleanup();
            reject(error);
          };
          process.stdout.on("data", check);
          process.on("error", fail);
          check();
        }),
    };
  });
  try {
    await Promise.all(clients.map((client) => client.wait("setup · rodada 0")));
    for (const client of clients)
      client.send(TEAM.map((pokemon) => `choose ${pokemon}`).join("\n"));
    await Promise.all(
      clients.map((client) => client.wait(`Equipe: ${TEAM.join(", ")}`)),
    );
    clients[0].send("moves smeargle seismictoss\nready");
    clients[1].send("moves smeargle splash\nready");
    await Promise.all(
      clients.map((client) => client.wait("battle · rodada 1")),
    );
    clients[0].send("attack seismictoss");
    await clients[0].wait("Ação confirmada");
    assert.ok(!clients[1].output().includes("rodada 2"));
    clients[1].send("attack splash");
    await Promise.all(
      clients.map((client) => client.wait("battle · rodada 2")),
    );
    const hp = speciesById("smeargle")!.stats.hp;
    await Promise.all(clients.map((client) => client.wait(`${hp - 50}/${hp}`)));
    clients[1].send("quit");
    await clients[0].wait("(disconnect)");
    clients[0].send("quit");
    assert.ok(
      clients.every(
        (client) =>
          !/Mensagem do servidor inválida|Versão incompatível/.test(
            client.output(),
          ),
      ),
    );
  } finally {
    for (const client of clients) {
      client.process.stdin.end();
      client.process.kill();
    }
    await application.close();
  }
  console.log(
    "Terminal clients passed: two real processes, setup, readiness, private actions, damage and disconnect.",
  );
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

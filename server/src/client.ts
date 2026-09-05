import { createConnection } from "node:net";
import { createInterface } from "node:readline";
import { ServerMessage } from "./game/types";

const name = process.argv[2] ?? `Jogador-${Math.floor(Math.random() * 100)}`;
const socket = createConnection({ host: process.env.HOST ?? "127.0.0.1", port: Number(process.env.PORT ?? 3001) });
const input = createInterface({ input: process.stdin, output: process.stdout, prompt: "ação> " });

function send(value: object): void { socket.write(`${JSON.stringify(value)}\n`); }
function print(message: ServerMessage): void {
  if (message.type === "welcome") { console.log(`Conectado via TCP. Protocolo ${message.protocol}`); send({ type: "join", name }); }
  else if (message.type === "waiting") console.log(message.message);
  else if (message.type === "match_found") console.log(`Partida ${message.roomId} encontrada.`);
  else if (message.type === "state") { console.clear(); console.log(JSON.stringify(message.state, null, 2)); console.log("Comandos: choose <pokemon> | attack [move] | defend | special | invalid | quit"); }
  else if (message.type === "error") console.log(`[erro ${message.code}] ${message.message}`);
  else console.log(message.message);
}

let buffer = "";
socket.on("data", data => {
  buffer += data.toString("utf8");
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines.filter(Boolean)) print(JSON.parse(line) as ServerMessage);
  input.prompt();
});
socket.on("error", error => console.log(`Falha de conexão: ${error.message}`));
input.on("line", line => {
  const [command, argument] = line.trim().split(/\s+/);
  if (command === "choose" && argument) send({ type: "choose_pokemon", pokemon: argument });
  else if (["attack", "defend", "special"].includes(command)) send({ type: "action", action: { type: command, move: argument } });
  else if (command === "invalid") send({ type: "unknown" });
  else if (command === "quit") { send({ type: "leave" }); input.close(); }
  else console.log("Comando inválido.");
  input.prompt();
});

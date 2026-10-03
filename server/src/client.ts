import { createConnection } from "node:net";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { config } from "./config";
import { catalog } from "./contracts/catalog";
import { PROTOCOL_VERSION } from "./contracts/protocol";
import { decodeServerMessage } from "./contracts/decode";
import type {
  ClientMessage,
  RoomSnapshot,
  ServerMessage,
} from "./contracts/protocol";

const name = (process.argv[2] ?? "Jogador").slice(0, 24);
const socket = createConnection({ host: config.tcpHost, port: config.tcpPort });
const input = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "ação> ",
});
let state: RoomSnapshot | null = null;
let awaitingWelcome = true;
let pending: Extract<ClientMessage, { type: "action" }> | null = null;
const HELP =
  "choose <id> | random [1..6] | moves <id> <golpe1,golpe2> | ready | attack <id> | switch <id> | retry | reset | state | help | quit";
function send(message: ClientMessage): void {
  socket.write(`${JSON.stringify(message)}\n`);
}
function render(snapshot: RoomSnapshot): void {
  state = snapshot;
  const request = snapshot.battle?.request;
  if (
    pending &&
    (!request || request.id !== pending.requestId || request.submitted)
  )
    pending = null;
  console.log(
    `\n${snapshot.phase} · rodada ${snapshot.battle?.round ?? 0} · ${snapshot.arena}`,
  );
  console.log(
    `Equipe: ${snapshot.team.map((member) => member.speciesId).join(", ")}`,
  );
  if (snapshot.battle) {
    for (const pokemon of [
      ...snapshot.battle.ownTeam,
      ...snapshot.battle.opponentTeam,
    ]) {
      if (!("hidden" in pokemon))
        console.log(
          `${pokemon.id}: ${pokemon.speciesId} ${pokemon.hp}/${pokemon.maxHp} ${pokemon.status ?? ""}`,
        );
    }
    console.log(
      request
        ? `${request.submitted ? "Ação confirmada" : `Escolha ${request.kind}`} · pedido ${request.id}`
        : "Aguarde o oponente.",
    );
    if (request)
      console.log(
        request.moves
          .map(
            (move) =>
              `${move.id} PP ${move.pp}/${move.maxPp}${move.disabled ? " (indisponível)" : ""}`,
          )
          .join(" · "),
        request.switches,
      );
  }
  if (snapshot.result)
    console.log(
      `Resultado: ${snapshot.result.winner ?? "empate"} (${snapshot.result.reason})`,
    );
  if (snapshot.preparation && !snapshot.preparation.ready)
    send({ type: "battle_ready", preparationId: snapshot.preparation.id }); // terminal não usa recursos visuais
}
function receive(message: ServerMessage): void {
  if (message.type === "welcome") {
    awaitingWelcome = false;
    socket.setTimeout(0);
    if (
      message.protocol !== PROTOCOL_VERSION ||
      message.catalogVersion !== catalog.version
    ) {
      console.error("Versão incompatível. Atualize servidor e cliente.");
      socket.end();
      return;
    }
    send({
      type: "join",
      name,
      protocol: PROTOCOL_VERSION,
      catalogVersion: catalog.version,
      ...(process.env.BATTLE_ACCESS_TOKEN
        ? { token: process.env.BATTLE_ACCESS_TOKEN }
        : {}),
    });
    console.log(HELP);
  } else if (message.type === "state" || message.type === "match_found")
    render(message.state);
  else if (message.type === "action_ack") {
    /* O snapshot confirma a solicitação e libera o próximo comando. */
  } else {
    if (message.type === "error" && pending?.actionId === message.actionId)
      pending = null;
    console.log(message.message);
  }
}
let buffer = "";
socket.setEncoding("utf8");
socket.setTimeout(15000, () => {
  if (awaitingWelcome) {
    console.error("Tempo de conexão esgotado.");
    socket.destroy();
  }
});
socket.on("data", (data) => {
  buffer += data;
  if (buffer.length > 1024 * 1024) {
    socket.destroy();
    return;
  }
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines.filter(Boolean)) {
    try {
      receive(decodeServerMessage(JSON.parse(line)));
    } catch {
      console.error("Mensagem do servidor inválida.");
      socket.destroy();
      return;
    }
  }
  input.prompt();
});
socket.on("error", (error) =>
  console.error(`Falha de conexão: ${error.message}`),
);
socket.on("close", () => input.close());
input.on("line", (line) => {
  const [command, ...args] = line.trim().split(/\s+/);
  if (command === "choose" && args[0])
    send({ type: "choose_pokemon", pokemon: args[0] });
  else if (command === "random")
    send({
      type: "random_team",
      count: args[0] ? Number(args[0]) : 6 - (state?.team.length ?? 0),
    });
  else if (command === "moves" && args[0] && args[1])
    send({ type: "set_moves", pokemon: args[0], moves: args[1].split(",") });
  else if (command === "ready") send({ type: "accept_team" });
  else if (command === "reset") send({ type: "reset_team" });
  else if ((command === "attack" || command === "switch") && args[0]) {
    const request = state?.battle?.request;
    const member = state?.team.find(
      (member) => member.id === args[0] || member.speciesId === args[0],
    );
    if (
      !request ||
      request.submitted ||
      pending ||
      (command === "switch" && !member)
    )
      console.log("Não há ação disponível.");
    else {
      pending = {
        type: "action",
        requestId: request.id,
        actionId: randomUUID(),
        choice:
          command === "attack"
            ? { type: "move", moveId: args[0] }
            : { type: "switch", combatantId: member!.id },
      };
      send(pending);
    }
  } else if (command === "retry" && pending) send(pending);
  else if (command === "state") send({ type: "resync" });
  else if (command === "quit") {
    send({ type: "leave" });
    socket.end();
    input.close();
  } else console.log(HELP);
  input.prompt();
});

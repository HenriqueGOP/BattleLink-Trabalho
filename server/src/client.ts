import { validateFormat } from "./contracts/formats";
import { TRAINERS } from "./contracts/trainers";
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
let inputClosed = false;
let initialQueue = true;
let pending: Extract<ClientMessage, { type: "action" }> | null = null;
const HELP =
  "choose <id> | remove <id> | order <id1,id2,...> | random [1..6] | moves <id> <golpe1,golpe2> | ready | attack <id> | switch <id> | retry | reset | state | help | queue [classic/quick/monotype] [type] | create [format] [type] | invite <code> | pve <trainer> [easy/normal/hard] [format] | again [keep/edit] | lobby | cancel | quit";
function send(message: ClientMessage): void {
  const bound = ["choose_pokemon", "remove_pokemon", "reorder_team", "random_team", "set_moves", "reset_team", "accept_team", "battle_ready", "action", "resync"].includes(message.type);
  socket.write(`${JSON.stringify(bound ? { ...message, matchId: "matchId" in message && message.matchId ? message.matchId : state?.matchId } : message)}\n`);
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
  else if (message.type === "lobby") {
    state = null; pending = null;
    console.log(message.message, message.lobby ? `Convite: ${message.lobby.code}` : "");
    if (initialQueue) { initialQueue = false; send({ type: "queue_join", format: { id: "classic" }, commandId: randomUUID() }); }
  } else if (message.type === "action_ack") {
    /* O snapshot confirma a solicitação e libera o próximo comando. */
  } else {
    if (message.type === "error" && pending?.actionId === message.actionId)
      pending = null;
    console.log(message.message);
  }
}
let buffer = "";
socket.setEncoding("utf8");
input.on("close", () => {
  inputClosed = true;
  process.stdin.destroy();
  if (!socket.destroyed && !socket.writableEnded) socket.end();
});
socket.setTimeout(15000, () => {
  if (awaitingWelcome) {
    console.error("Tempo de conexão esgotado.");
    socket.destroy();
  }
});
socket.on("data", (data) => {
  if (inputClosed) return;
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
  if (!inputClosed) input.prompt();
});
socket.on("error", (error) =>
  console.error(`Falha de conexão: ${error.message}`),
);
socket.on("close", () => input.close());
input.on("line", (line) => {
  if (inputClosed) return;
  const [command, ...args] = line.trim().split(/\s+/);
  if (["queue", "create"].includes(command)) {
    try { const format = validateFormat({ id: args[0] ?? "classic", ...(args[0] === "monotype" ? { type: args[1] } : {}) }); send({ type: "room_leave" }); send({ type: command === "queue" ? "queue_join" : "private_create", format, commandId: randomUUID() }); } catch (error) { console.log(String(error)); }
  } else if (command === "invite" && args[0]) { send({ type: "room_leave" }); send({ type: "private_join", code: args[0].toUpperCase(), commandId: randomUUID() }); }
  else if (command === "pve" && args[0]) {
    const trainer = TRAINERS.find(trainer => trainer.id === args[0]);
    if (!trainer) console.log(TRAINERS.map(trainer => `${trainer.id}: ${trainer.name}`).join(" · "));
    else { send({ type: "room_leave" }); send({ type: "pve_start", trainerId: trainer.id, difficulty: args[1] === "hard" ? "hard" : args[1] === "easy" ? "easy" : "normal", format: args[2] === "monotype" ? { id: "monotype", type: trainer.type } : { id: args[2] === "quick" ? "quick" : "classic" }, commandId: randomUUID() }); }
  } else if (command === "again" && state) send({ type: "rematch", matchId: state.matchId, accept: true, keepTeam: args[0] !== "edit" });
  else if (command === "lobby") send({ type: "room_leave" });
  else if (command === "cancel") send({ type: "queue_cancel" });
  else if (command === "choose" && args[0])
    send({ type: "choose_pokemon", pokemon: args[0] });
  else if (command === "remove" && args[0]) send({ type: "remove_pokemon", pokemon: args[0], editId: randomUUID() });
  else if (command === "order" && args[0]) send({ type: "reorder_team", pokemon: args[0].split(","), editId: randomUUID() });
  else if (command === "random")
    send({
      type: "random_team",
      count: args[0] ? Number(args[0]) : (state?.format.id === "quick" ? 3 : 6) - (state?.team.length ?? 0),
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
  if (!inputClosed) input.prompt();
});

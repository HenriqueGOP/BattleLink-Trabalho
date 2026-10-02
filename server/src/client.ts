import { createConnection } from "node:net";
import { createInterface } from "node:readline";
import { GameState, PlayerState, ServerMessage } from "./game/types";
import { config } from "./config";

const name = process.argv[2] ?? `Jogador-${Math.floor(Math.random() * 100)}`;
const socket = createConnection({ host: config.tcpHost, port: config.tcpPort });
const input = createInterface({ input: process.stdin, output: process.stdout, prompt: "ação> " });

let myId = "";

const HELP = [
  "Comandos:",
  "  choose <pokemon>            adiciona um Pokémon à equipe (precisa de 6)",
  "  moves <pokemon> <g1,g2,..>  define até 4 golpes equipados",
  "  ready                       confirma a equipe e trava os golpes",
  "  attack <golpe>              usa um golpe equipado no seu turno",
  "  switch <pokemon>            troca o Pokémon em campo",
  "  tera                        terastaliza (uma vez por partida)",
  "  reset                       refaz a equipe (só antes da batalha começar)",
  "  state                       reimprime o estado atual",
  "  help | quit",
].join("\n");

function send(value: object): void {
  socket.write(`${JSON.stringify(value)}\n`);
}

// ---------- impressão legível do estado (antes era JSON.stringify cru) ----------

function bar(hp: number, maxHp: number, width = 20): string {
  const ratio = maxHp > 0 ? Math.max(0, hp / maxHp) : 0;
  const filled = Math.round(ratio * width);
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}] ${hp}/${maxHp}`;
}

function describe(player: PlayerState, isMe: boolean): string {
  const data = player.pokemonData;
  const flags = [
    data?.status ? data.status.toUpperCase() : null,
    data?.isTerastallized ? `TERA ${data.teraType.toUpperCase()}` : null,
    data?.isShiny ? "SHINY" : null,
    data && data.confusionTurns > 0 ? "CONFUSO" : null,
  ].filter(Boolean);
  const alive = player.team.filter(member => member.hp > 0).length;
  const balls = `${"●".repeat(alive)}${"○".repeat(Math.max(0, player.team.length - alive))}`;
  return [
    `${isMe ? "VOCÊ" : "OPONENTE"}  ${player.name}  ${balls}`,
    `  ${player.pokemon ?? "-"}  ${bar(player.hp, player.maxHp)}${flags.length ? `  (${flags.join(", ")})` : ""}`,
  ].join("\n");
}

function myMoves(me: PlayerState): string {
  const data = me.pokemonData;
  if (!data || data.selectedMoves.length === 0) return "  (nenhum golpe equipado)";
  return data.selectedMoves
    .map(moveName => {
      const move = data.moves.find(item => item.name === moveName);
      const pp = data.pp[moveName] ?? "?";
      const power = move?.power != null ? `poder ${move.power}` : "status";
      return `  ${moveName.padEnd(18)} ${String(move?.type ?? "?").padEnd(9)} ${power.padEnd(11)} PP ${pp}`;
    })
    .join("\n");
}

let lastState: GameState | null = null;

function render(state: GameState): void {
  lastState = state;
  const myIndex = state.players.findIndex(player => player.id === myId);
  if (myIndex < 0) return;
  const me = state.players[myIndex];
  const foe = state.players[1 - myIndex];
  const myTurn = state.turn === myIndex;

  console.clear();
  console.log("═".repeat(58));
  console.log(describe(foe, false));
  console.log("-".repeat(58));
  console.log(describe(me, true));
  console.log("═".repeat(58));
  const field = [state.field.weather, state.field.terrain].filter(Boolean).join(" · ");
  if (field) console.log(`Campo: ${field}`);
  console.log("Golpes:");
  console.log(myMoves(me));
  for (const line of state.log.slice(-6)) console.log(`  · ${line}`);
  console.log("═".repeat(58));
  if (state.phase === "finished") {
    console.log(state.winner == null ? "EMPATE!" : state.winner === myId ? "VOCÊ VENCEU!" : "Você perdeu…");
  } else if (state.phase === "setup") {
    console.log(me.ready ? "Equipe confirmada. Aguardando o oponente…" : "Monte a equipe, configure os golpes e use: ready");
  } else if (state.pendingSwitch[myIndex]) {
    console.log("Seu Pokémon caiu! Use: switch <pokemon>");
  } else {
    console.log(myTurn ? ">> SEU TURNO" : ">> turno do oponente");
  }
  console.log('Digite "help" para ver os comandos.');
}

function print(message: ServerMessage): void {
  if (message.type === "welcome") {
    myId = message.playerId;
    console.log(`Conectado via TCP. Protocolo ${message.protocol}`);
    console.log(HELP);
    send({ type: "join", name, ...(process.env.BATTLE_ACCESS_TOKEN ? { token: process.env.BATTLE_ACCESS_TOKEN } : {}) });
  } else if (message.type === "waiting") console.log(message.message);
  else if (message.type === "match_found") {
    console.log(`Partida ${message.roomId} encontrada.`);
    render(message.state);
  } else if (message.type === "state") render(message.state);
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
  const trimmed = line.trim();
  const [command, ...rest] = trimmed.split(/\s+/);
  const argument = rest[0];

  if (command === "choose" && argument) send({ type: "choose_pokemon", pokemon: argument });
  else if (command === "moves" && argument && rest[1]) {
    // moves pikachu thunderbolt,quick-attack
    send({ type: "set_moves", pokemon: argument, moves: rest.slice(1).join(" ").split(",").map(item => item.trim()).filter(Boolean) });
  } else if (command === "attack") send({ type: "action", action: { type: "attack", move: argument } });
  else if (command === "switch" && argument) send({ type: "switch_pokemon", pokemon: argument });
  else if (command === "tera") send({ type: "terastallize" });
  else if (command === "ready") send({ type: "accept_team" });
  else if (command === "reset") send({ type: "reset_team" });
  else if (command === "state") {
    if (lastState) render(lastState);
    else console.log("Ainda não há estado — entre em uma partida primeiro.");
  } else if (command === "invalid") send({ type: "unknown" });
  else if (command === "help") console.log(HELP);
  else if (command === "quit") {
    send({ type: "leave" });
    input.close();
  } else console.log(`Comando inválido: "${trimmed}". Digite "help".`);
  input.prompt();
});

import { validateFormat } from "./formats";
import { DIFFICULTIES, trainerById } from "./trainers";
import { ARENA_IDS } from "./protocol";
import type { ServerMessage } from "./protocol";
import { speciesById, moveById } from "./catalog";

const validFormat = (value: unknown) => { try { validateFormat(value); return true; } catch { return false; } };
const matchId = (value: unknown) => typeof value === "string" && /^match-[A-Za-z0-9-]{1,58}$/.test(value);
const lobby = (value: unknown): boolean => value === null || (object(value) && text(value.roomId) && typeof value.code === "string" && /^[A-HJ-NP-Z2-9]{8}$/.test(value.code) && text(value.hostId) && validFormat(value.format) && list(value.players, 2, player => object(player) && text(player.id) && text(player.name, 24)) && value.players.length > 0);
type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue =>
  !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max = 128): value is string =>
  typeof value === "string" && value.length <= max;
const number = (
  value: unknown,
  max = Number.MAX_SAFE_INTEGER,
): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= max;
const side = (value: unknown) => value === "p1" || value === "p2";
const combatant = (value: unknown) =>
  typeof value === "string" && /^p[12]s[0-5]$/.test(value);
const identifier = (value: unknown) =>
  typeof value === "string" && /^[a-z0-9]{1,64}$/.test(value);
const move = (value: unknown) =>
  text(value) && (value === "recharge" || !!moveById(value));
const species = (value: unknown) => text(value) && !!speciesById(value);
const status = (value: unknown) =>
  value === null ||
  ["brn", "psn", "tox", "par", "slp", "frz"].includes(String(value));
const list = (
  value: unknown,
  max: number,
  check: (item: unknown) => boolean,
): value is unknown[] =>
  Array.isArray(value) && value.length <= max && value.every(check);
const ids = (value: unknown) => list(value, 100, identifier);
const boost = (value: unknown) =>
  object(value) &&
  Object.entries(value).every(
    ([key, n]) =>
      ["atk", "def", "spa", "spd", "spe", "accuracy", "evasion"].includes(
        key,
      ) &&
      typeof n === "number" &&
      Number.isInteger(n) &&
      n >= -6 &&
      n <= 6,
  );
const conditions = (value: unknown) =>
  object(value) && ids(value.p1) && ids(value.p2);
const active = (value: unknown) =>
  object(value) &&
  (value.p1 === null || combatant(value.p1)) &&
  (value.p2 === null || combatant(value.p2));
const legalMove = (value: unknown) =>
  object(value) &&
  move(value.id) &&
  number(value.pp, 256) &&
  number(value.maxPp, 256) &&
  value.pp <= value.maxPp &&
  typeof value.disabled === "boolean";
function pokemon(value: unknown): boolean {
  return (
    object(value) &&
    combatant(value.id) &&
    species(value.speciesId) &&
    number(value.hp, 65535) &&
    number(value.maxHp, 65535) &&
    value.hp <= value.maxHp &&
    number(value.level, 100) &&
    status(value.status) &&
    list(value.types, 3, identifier) &&
    boost(value.boosts) &&
    ids(value.volatiles) &&
    typeof value.fainted === "boolean"
  );
}
function request(value: unknown): boolean {
  return (
    value === null ||
    (object(value) &&
      number(value.id) &&
      ["move", "switch", "revive"].includes(String(value.kind)) &&
      list(value.moves, 4, legalMove) &&
      list(value.switches, 6, combatant) &&
      typeof value.submitted === "boolean" &&
      (value.lockedMoveId === null || move(value.lockedMoveId)))
  );
}
function result(value: unknown): boolean {
  return (
    value === null ||
    (object(value) &&
      (value.winner === null || side(value.winner)) &&
      [
        "knockout",
        "draw",
        "forfeit",
        "disconnect",
        "preparation_timeout",
        "engine_error",
      ].includes(String(value.reason)))
  );
}
function event(value: unknown): boolean {
  if (
    !object(value) ||
    !number(value.sequence) ||
    !number(value.round) ||
    !(value.audience === "public" || side(value.audience))
  )
    return false;
  switch (value.type) {
    case "battle_start":
      return true;
    case "round_start":
      return number(value.number);
    case "move":
      return (
        combatant(value.actor) &&
        (value.target === null || combatant(value.target)) &&
        move(value.moveId)
      );
    case "damage":
    case "heal":
      return (
        combatant(value.target) &&
        (value.source === null || combatant(value.source)) &&
        number(value.hpBefore, 65535) &&
        number(value.hpAfter, 65535) &&
        number(value.maxHp, 65535) &&
        number(value.amount, 65535) &&
        value.hpBefore <= value.maxHp &&
        value.hpAfter <= value.maxHp &&
        Math.abs(value.hpBefore - value.hpAfter) === value.amount &&
        (value.cause === null || identifier(value.cause))
      );
    case "critical":
    case "super_effective":
    case "resisted":
    case "immune":
    case "faint":
      return combatant(value.target);
    case "miss":
      return (
        combatant(value.actor) &&
        (value.target === null || combatant(value.target))
      );
    case "hit_count":
      return combatant(value.target) && number(value.hits, 10);
    case "switch":
      return (
        combatant(value.target) &&
        (value.previous === null || combatant(value.previous)) &&
        typeof value.forced === "boolean" &&
        pokemon(value.pokemon)
      );
    case "status":
      return combatant(value.target) && status(value.status);
    case "boost":
      return (
        combatant(value.target) &&
        identifier(value.stat) &&
        boost({ [String(value.stat)]: value.before }) &&
        boost({ [String(value.stat)]: value.after })
      );
    case "unable":
      return combatant(value.actor) && identifier(value.reason);
    case "effect":
      return (
        identifier(value.operation) &&
        (value.target === null || combatant(value.target)) &&
        (value.side === null || side(value.side)) &&
        (value.effectId === null || identifier(value.effectId))
      );
    case "state_sync":
      return (
        list(value.active, 2, pokemon) &&
        conditions(value.sideConditions) &&
        ids(value.fieldConditions)
      );
    case "battle_end":
      return value.result !== null && result(value.result);
    default:
      return false;
  }
}
function snapshot(value: unknown): boolean {
  if (!object(value) || !matchId(value.matchId) || !validFormat(value.format) || !["automatic", "private", "pve"].includes(String(value.mode)) ||
      !(value.inviteCode === null || typeof value.inviteCode === "string" && /^[A-HJ-NP-Z2-9]{8}$/.test(value.inviteCode)) ||
      !(value.trainerId === null || typeof value.trainerId === "string" && !!trainerById(value.trainerId)) ||
      !(value.difficulty === null || DIFFICULTIES.includes(value.difficulty as never)) ||
      !object(value.rematch) || !(value.rematch.expiresAt === null || number(value.rematch.expiresAt)) ||
      !Array.isArray(value.rematch.votes) || value.rematch.votes.length !== 2 || !value.rematch.votes.every(vote => typeof vote === "boolean") || typeof value.rematch.available !== "boolean") return false;
  if (
    !object(value) ||
    !text(value.roomId) ||
    !["setup", "preparing", "battle", "finished"].includes(
      String(value.phase),
    ) ||
    !side(value.viewer) ||
    !ARENA_IDS.includes(value.arena as (typeof ARENA_IDS)[number]) ||
    !number(value.sequence) ||
    !number(value.eventFloor) ||
    value.eventFloor > value.sequence ||
    !result(value.result)
  )
    return false;
  if (
    !list(
      value.players,
      2,
      (p) =>
        object(p) &&
        text(p.id) &&
        text(p.name, 24) &&
        typeof p.ready === "boolean" &&
        number(p.teamCount, 6),
    ) ||
    value.players.length !== 2 ||
    !list(
      value.team,
      6,
      (p) =>
        object(p) &&
        combatant(p.id) &&
        species(p.speciesId) &&
        list(p.moves, 4, move) &&
        typeof p.shiny === "boolean",
    ) ||
    !list(value.log, 40, (line) => text(line, 256)) ||
    !list(value.events, 240, event) ||
    !object(value.revealedShiny) ||
    !Object.entries(value.revealedShiny).every(
      ([id, shiny]) => combatant(id) && typeof shiny === "boolean",
    )
  )
    return false;
  if (
    value.preparation !== null &&
    (!object(value.preparation) ||
      !text(value.preparation.id, 64) ||
      typeof value.preparation.ready !== "boolean")
  )
    return false;
  if (value.battle !== null) {
    const battle = value.battle;
    if (
      !object(battle) ||
      !["collecting", "forced_switch", "finished"].includes(
        String(battle.phase),
      ) ||
      !number(battle.round) ||
      battle.sequence !== value.sequence ||
      !request(battle.request) ||
      !result(battle.result) ||
      !active(battle.active) ||
      !conditions(battle.sideConditions) ||
      !ids(battle.fieldConditions) ||
      !list(
        battle.ownTeam,
        6,
        (p) =>
          pokemon(p) &&
          object(p) &&
          list(p.moves, 4, legalMove) &&
          object(p.stats) &&
          Object.values(p.stats).every((n) => number(n, 65535)) &&
          ["none", "adaptability"].includes(String(p.ability)),
      ) ||
      !list(
        battle.opponentTeam,
        6,
        (p) => object(p) && (p.hidden === true ? combatant(p.id) : pokemon(p)),
      )
    )
      return false;
  }
  let previous = value.eventFloor;
  for (const item of value.events) {
    const e = item as RecordValue;
    if (
      !number(e.sequence) ||
      e.sequence <= previous ||
      e.sequence > value.sequence ||
      !(e.audience === "public" || e.audience === value.viewer)
    )
      return false;
    previous = e.sequence;
  }
  return true;
}

/** Decodificação compartilhada, sem coerção de URLs, HTML ou objetos upstream. */
export function decodeServerMessage(value: unknown): ServerMessage {
  let valid = false;
  if (object(value))
    switch (value.type) {
      case "lobby":
        valid = lobby(value.lobby) && text(value.message, 512);
        break;
      case "welcome":
        valid =
          text(value.playerId) &&
          text(value.protocol) &&
          text(value.catalogVersion);
        break;
      case "waiting":
      case "opponent_left":
        valid = text(value.message, 512);
        break;
      case "error":
        valid =
          text(value.code, 64) &&
          text(value.message, 512) &&
          (value.actionId === undefined || text(value.actionId, 64)) &&
          (value.editId === undefined || (typeof value.editId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value.editId)));
        break;
      case "action_ack":
        valid =
          matchId(value.matchId) &&
          number(value.requestId) &&
          text(value.actionId, 64) &&
          typeof value.resolved === "boolean" &&
          typeof value.duplicate === "boolean";
        break;
      case "match_found":
        valid =
          text(value.roomId) &&
          snapshot(value.state) &&
          object(value.state) &&
          value.roomId === value.state.roomId;
        break;
      case "state":
        valid = snapshot(value.state) && (value.editId === undefined || (typeof value.editId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value.editId)));
        break;
    }
  if (object(value) && value.commandId !== undefined && !(typeof value.commandId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value.commandId))) valid = false;
  if (!valid) throw new Error("Mensagem do servidor inválida ou incompatível.");
  return value as ServerMessage;
}

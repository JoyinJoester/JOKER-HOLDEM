import { JOKER_IDS, validateConfig } from "../modes";
import type { RoomSnapshot, ServerReply } from "../network-types";
import type { Card } from "../poker";

export const MAX_PACKET = 64_000;
export const COMMANDS = new Set([
  "room:join",
  "room:resume",
  "room:configure",
  "room:leave",
  "game:action",
  "game:shop",
  "game:start",
  "game:next",
  "game:lobby",
]);
export type Packet =
  | { t: "request"; id: number; event: string; payload: unknown }
  | { t: "reply"; id: number; reply: ServerReply }
  | { t: "event"; event: string; data?: unknown };

export function parsePacket(raw: unknown): Packet {
  if (typeof raw !== "string" || raw.length > MAX_PACKET)
    throw new Error("Invalid packet");
  const p = JSON.parse(raw);
  if (!p || typeof p !== "object" || Array.isArray(p))
    throw new Error("Invalid packet");
  if (
    p.t === "event" &&
    ["room:update", "room:error", "room:closed", "room:replaced"].includes(
      p.event,
    )
  )
    return p;
  if (!Number.isSafeInteger(p.id) || p.id < 1 || p.id > 2 ** 31)
    throw new Error("Invalid request id");
  if (p.t === "request" && COMMANDS.has(p.event)) return p;
  if (
    p.t === "reply" &&
    p.reply &&
    typeof p.reply.ok === "boolean" &&
    (p.reply.error === undefined ||
      (typeof p.reply.error === "string" && p.reply.error.length <= 500)) &&
    (p.reply.session === undefined || validSession(p.reply.session))
  )
    return p;
  throw new Error("Invalid packet");
}

export function validSession(
  s: unknown,
): s is NonNullable<ServerReply["session"]> {
  if (!s || typeof s !== "object") return false;
  const value = s as NonNullable<ServerReply["session"]>;
  return (
    /^[A-HJ-NP-Z2-9]{6}$/.test(value.code) &&
    /^[a-f0-9]{48}$/.test(value.token) &&
    Number.isInteger(value.seat) &&
    value.seat >= 0 &&
    value.seat < 6
  );
}
const finite = (n: unknown) =>
  typeof n === "number" &&
  Number.isFinite(n) &&
  Math.abs(n) <= Number.MAX_SAFE_INTEGER;
const text = (s: unknown, max = 500) =>
  typeof s === "string" && s.length <= max;
const cards = (c: unknown, max: number) =>
  Array.isArray(c) &&
  c.length <= max &&
  c.every(
    (v: Card) =>
      v &&
      Number.isInteger(v.rank) &&
      v.rank >= 2 &&
      v.rank <= 14 &&
      ["spades", "hearts", "clubs", "diamonds"].includes(v.suit),
  );

/** Reject incompatible snapshots before they reach the table's render path. */
export function validSnapshot(value: unknown): value is RoomSnapshot {
  try {
    const s = value as RoomSnapshot;
    validateConfig(s.config);
    const seat = (n: unknown) =>
      Number.isInteger(n) && Number(n) >= 0 && Number(n) < s.config.seats;
    if (
      !/^[A-HJ-NP-Z2-9]{6}$/.test(s.code) ||
      !seat(s.host) ||
      !["lobby", "playing"].includes(s.phase) ||
      !Array.isArray(s.members) ||
      s.members.length > s.config.seats ||
      new Set(s.members.map((m) => m.seat)).size !== s.members.length ||
      !s.members.every(
        (m) =>
          seat(m.seat) && text(m.name, 12) && typeof m.connected === "boolean",
      )
    )
      return false;
    if (s.game === null) return s.phase === "lobby";
    const g = s.game;
    validateConfig(g.config);
    if (
      s.phase !== "playing" ||
      !text(g.session, 120) ||
      !finite(g.handNumber) ||
      !Array.isArray(g.players) ||
      g.players.length !== s.config.seats ||
      !cards(g.deck, 0) ||
      !cards(g.community, 5) ||
      !["preflop", "flop", "turn", "river", "showdown", "shop"].includes(
        g.street,
      ) ||
      ![g.dealer, g.smallBlind, g.bigBlind].every(seat) ||
      (g.actor !== null && !seat(g.actor)) ||
      ![
        g.currentBet,
        g.minRaise,
        g.issuedChips,
        g.blinds.small,
        g.blinds.big,
      ].every(finite) ||
      !Array.isArray(g.pending) ||
      g.pending.length > 6 ||
      !g.pending.every(seat) ||
      !Array.isArray(g.startingStacks) ||
      g.startingStacks.length !== g.players.length ||
      !g.startingStacks.every(finite) ||
      !Array.isArray(g.lastFacedBet) ||
      g.lastFacedBet.length !== g.players.length ||
      !g.lastFacedBet.every((n) => n === null || finite(n)) ||
      !Array.isArray(g.logs) ||
      g.logs.length > 80 ||
      !g.logs.every((l) => finite(l.id) && finite(l.hand) && text(l.text)) ||
      !Array.isArray(g.bonuses) ||
      g.bonuses.length > 100 ||
      !g.bonuses.every(
        (b) => seat(b.playerId) && text(b.label) && finite(b.amount),
      )
    )
      return false;
    if (
      !g.players.every(
        (p, i) =>
          p.id === i &&
          text(p.name, 40) &&
          cards(p.cards, 2) &&
          text(p.lastAction) &&
          [p.stack, p.bet, p.contributed, p.coins].every(finite) &&
          [p.folded, p.allIn, p.eliminated, p.occupied, p.ready].every(
            (b) => typeof b === "boolean",
          ) &&
          Array.isArray(p.jokers) &&
          p.jokers.length <= 3 &&
          p.jokers.every((j) => JOKER_IDS.includes(j)),
      )
    )
      return false;
    if (
      g.shop &&
      (!Array.isArray(g.shop.offers) ||
        g.shop.offers.length > 6 ||
        !g.shop.offers.every((j) => JOKER_IDS.includes(j)))
    )
      return false;
    if (g.result) {
      const r = g.result;
      if (
        !Array.isArray(r.winners) ||
        !r.winners.every(seat) ||
        !finite(r.totalPot) ||
        typeof r.uncontested !== "boolean" ||
        !Array.isArray(r.pots) ||
        r.pots.length > 12 ||
        !r.pots.every(
          (p) =>
            finite(p.amount) &&
            Array.isArray(p.winners) &&
            p.winners.every(seat),
        ) ||
        !Object.values(r.payouts).every(finite) ||
        !Object.values(r.ranks).every(
          (h) =>
            finite(h.category) &&
            text(h.name, 50) &&
            cards(h.cards, 5) &&
            Array.isArray(h.values) &&
            h.values.every(finite),
        )
      )
        return false;
    }
    return true;
  } catch {
    return false;
  }
}

import { makeDeck, SUITS, type Suit } from "../poker";
import {
  BOSS_MAP,
  BOSSES,
  DECKS,
  HANDS,
  HAND_IDS,
  JOKERS,
  JOKER_LIST,
  SPECTRALS,
  SPECTRAL_MAP,
  TAGS,
  TAG_MAP,
  TAROTS,
  TAROT_MAP,
  VOUCHERS,
  VOUCHER_MAP,
} from "./data";
import { evaluateHand, hasFourSuits, suitsFor } from "./hands";
import type {
  Consumable,
  Edition,
  Enhancement,
  HandEvaluation,
  HandId,
  Joker,
  Offer,
  PackKind,
  PackOffer,
  PlayedHand,
  RunAction,
  RunCard,
  RunConfig,
  RunState,
  Seal,
  Trace,
} from "./types";

export function random(s: RunState): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let value = s.rng;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}
function pick<T>(s: RunState, list: readonly T[]): T {
  if (!list.length) throw new Error("随机池为空。");
  return list[Math.floor(random(s) * list.length)];
}
function shuffle<T>(s: RunState, list: readonly T[]): T[] {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function uid(s: RunState, prefix: string) {
  return `${prefix}${++s.serial}`;
}
export function newSeed(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes]
    .map((n) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[n % 32])
    .join("");
}
const copy = (s: RunState): RunState => structuredClone(s);
const count = (s: RunState, id: string) =>
  s.jokers.filter((j) => j.id === id && jokerActive(s, j)).length;
const has = (s: RunState, id: string) => count(s, id) > 0;
const voucher = (s: RunState, id: string) => s.vouchers.includes(id);
export const jokerActive = (s: RunState, j: Joker) =>
  j.perish !== 0 && (s.bossDisabled || j.uid !== s.disabledJoker);
function chance(s: RunState, n: number, d: number) {
  return random(s) < Math.min(1, (n * 2 ** count(s, "oops")) / d);
}
const values: Record<string, number> = {
  ice: 100,
  popcorn: 20,
  bean: 5,
  ramen: 2,
  seltzer: 10,
  rocket: 1,
  constellation: 1,
  madness: 1,
  vampire: 1,
  hologram: 1,
  obelisk: 1,
  cat: 1,
  campfire: 1,
  glass: 1,
  road: 1,
  canio: 1,
  yorick: 1,
};
const uncopyable = new Set([
  "fingers",
  "credit",
  "chaos",
  "delayed",
  "pareidolia",
  "egg",
  "splash",
  "sixth",
  "shortcut",
  "cloud",
  "rocket",
  "midas",
  "gift",
  "bean",
  "moon",
  "juggler",
  "drunk",
  "golden",
  "trading",
  "bones",
  "troubadour",
  "smeared",
  "showman",
  "andy",
  "oops",
  "invisible",
  "satellite",
  "astronomer",
  "chicot",
]);
interface Effect {
  physical: Joker;
  source: Joker;
  id: string;
}
function effects(s: RunState): Effect[] {
  const resolve = (
    index: number,
    visited = new Set<number>(),
  ): Joker | null => {
    const j = s.jokers[index];
    if (!j || !jokerActive(s, j) || visited.has(index)) return null;
    visited.add(index);
    if (j.id === "blueprint" || j.id === "brainstorm") {
      const result = resolve(j.id === "blueprint" ? index + 1 : 0, visited);
      return result && !uncopyable.has(result.id) ? result : null;
    }
    return j;
  };
  return s.jokers.flatMap((j, i) => {
    const source = resolve(i);
    return source ? [{ physical: j, source, id: source.id }] : [];
  });
}
export function jokerSlots(s: RunState) {
  return (
    5 +
    (s.config.deck === "black" ? 1 : 0) -
    (s.config.deck === "painted" ? 1 : 0) +
    (voucher(s, "antimatter") ? 1 : 0) +
    s.jokers.filter((j) => j.edition === "negative").length
  );
}
export function consumableSlots(s: RunState) {
  return (
    2 -
    (s.config.deck === "nebula" ? 1 : 0) +
    (voucher(s, "crystal") ? 1 : 0) +
    s.consumables.filter((c) => c.negative).length
  );
}
export function handSize(s: RunState) {
  return Math.max(
    1,
    8 +
      s.handSizeMod +
      (s.config.deck === "painted" ? 2 : 0) +
      count(s, "juggler") +
      2 * count(s, "troubadour") -
      count(s, "andy") -
      2 * count(s, "stunt") +
      s.jokers
        .filter((j) => j.id === "bean" && jokerActive(s, j))
        .reduce((n, j) => n + j.value, 0) +
      (voucher(s, "paint") ? 1 : 0) +
      (voucher(s, "palette") ? 1 : 0) +
      s.juggle -
      (bossIs(s, "manacle") ? 1 : 0),
  );
}
function startingHands(s: RunState) {
  return Math.max(
    1,
    4 +
      s.handsMod +
      (s.config.deck === "blue" ? 1 : 0) -
      (s.config.deck === "black" ? 1 : 0) -
      count(s, "troubadour") +
      (voucher(s, "grabber") ? 1 : 0) +
      (voucher(s, "nacho") ? 1 : 0),
  );
}
function startingDiscards(s: RunState) {
  return Math.max(
    0,
    3 +
      s.discardsMod +
      (s.config.deck === "red" ? 1 : 0) -
      (s.config.stake >= 4 ? 1 : 0) +
      count(s, "drunk") +
      3 * count(s, "andy") +
      (voucher(s, "wasteful") ? 1 : 0) +
      (voucher(s, "recycle") ? 1 : 0),
  );
}
export const sellJokerValue = (j: Joker) =>
  Math.max(
    1,
    Math.floor((j.rental ? 1 : JOKERS[j.id].cost + editionCost(j.edition)) / 2),
  ) + j.sellBonus;
export const sellConsumableValue = (c: Consumable) => 1 + c.sellBonus;
export const canAfford = (s: RunState, price: number) =>
  s.money - price >= (has(s, "credit") ? -20 : 0);
export function bossIs(s: RunState, id: string) {
  return (
    ["playing", "cashout"].includes(s.phase) &&
    s.blind === 2 &&
    s.boss === id &&
    !s.bossDisabled &&
    !hasChicot(s)
  );
}
function hasChicot(s: RunState) {
  return s.jokers.some((j) => j.id === "chicot" && j.perish !== 0);
}
export function isFace(s: RunState, c: RunCard) {
  return (
    c.enhancement !== "stone" &&
    ((c.rank >= 11 && c.rank <= 13) || has(s, "pareidolia"))
  );
}
export function cardDebuffed(s: RunState, c: RunCard): boolean {
  if (
    !["playing", "cashout"].includes(s.phase) ||
    s.blind !== 2 ||
    s.bossDisabled ||
    hasChicot(s)
  )
    return false;
  if (s.boss === "leaf") return true;
  if (s.boss === "plant" && isFace(s, c)) return true;
  if (s.boss === "pillar" && s.antePlayed.includes(c.uid)) return true;
  const suit: Record<string, Suit> = {
    club: "clubs",
    head: "hearts",
    window: "diamonds",
    goad: "spades",
  };
  return (
    !!suit[s.boss] && suitsFor(c, has(s, "smeared")).includes(suit[s.boss])
  );
}
export function selectedHand(s: RunState): HandEvaluation {
  return evaluateHand(
    evaluationCards(
      s,
      s.hand
        .filter((id) => s.selected.includes(id))
        .map((id) => s.deck.find((c) => c.uid === id)!),
    ),
    {
      fourFingers: has(s, "fingers"),
      shortcut: has(s, "shortcut"),
      smeared: has(s, "smeared"),
      splash: has(s, "splash"),
    },
  );
}
function evaluationCards(s: RunState, cards: RunCard[]) {
  return cards.map((c) =>
    c.enhancement === "wild" && cardDebuffed(s, c)
      ? { ...c, enhancement: "base" as const }
      : c,
  );
}
export function handValues(s: RunState, id: HandId) {
  const h = HANDS[id],
    level = s.levels[id] - 1;
  return {
    chips: h.chips + level * h.addChips,
    mult: h.mult + level * h.addMult,
  };
}
function note(s: RunState, message: string) {
  s.message = message;
  s.logs.push(message);
  s.logs = s.logs.slice(-100);
}
function discover(s: RunState, id: string) {
  if (!s.discovered.includes(id)) s.discovered.push(id);
}
function editionCost(edition: Edition) {
  return { base: 0, foil: 2, holo: 3, poly: 5, negative: 5 }[edition];
}
function cost(s: RunState, base: number) {
  return Math.max(
    1,
    Math.floor(
      base *
        (voucher(s, "liquidation") ? 0.5 : voucher(s, "clearance") ? 0.75 : 1),
    ),
  );
}
export const offerPrice = (s: RunState, o: Offer) =>
  o.kind === "planet" && has(s, "astronomer") ? 0 : o.price;
export const packPrice = (s: RunState, p: PackOffer) =>
  p.kind === "celestial" && has(s, "astronomer") ? 0 : p.price;
export const voucherPrice = (s: RunState) => cost(s, 10);
function randomEdition(s: RunState, negative = true, boost = 1): Edition {
  const roll = random(s),
    power = boost * (voucher(s, "glow") ? 4 : voucher(s, "hone") ? 2 : 1);
  if (negative && roll < 0.003) return "negative";
  if (roll < (negative ? 0.003 : 0) + 0.003 * power) return "poly";
  if (roll < (negative ? 0.003 : 0) + 0.017 * power) return "holo";
  if (roll < (negative ? 0.003 : 0) + 0.037 * power) return "foil";
  return "base";
}
function enhanced(s: RunState): Enhancement {
  return pick(s, ["bonus", "mult", "wild", "glass", "steel", "gold", "lucky"]);
}
export function makeCard(s: RunState, rank?: number, suit?: Suit): RunCard {
  return {
    uid: uid(s, "c"),
    rank: rank ?? 2 + Math.floor(random(s) * 13),
    suit: suit ?? pick(s, SUITS),
    enhancement: "base",
    edition: "base",
    seal: "none",
    bonus: 0,
  };
}
function permanentAdd(s: RunState, card: RunCard, toHand = false) {
  s.deck.push(card);
  if (toHand) s.hand.push(card.uid);
  for (const j of s.jokers)
    if (j.id === "hologram" && jokerActive(s, j)) j.value += 0.25;
}
function destroyCards(s: RunState, ids: string[]) {
  for (const c of s.deck.filter((c) => ids.includes(c.uid)))
    for (const j of s.jokers.filter((j) => jokerActive(s, j))) {
      if (j.id === "glass" && c.enhancement === "glass") j.value += 0.75;
      if (j.id === "canio" && isFace(s, c)) j.value += 1;
    }
  s.deck = s.deck.filter((c) => !ids.includes(c.uid));
  s.hand = s.hand.filter((id) => !ids.includes(id));
  s.drawPile = s.drawPile.filter((id) => !ids.includes(id));
  s.selected = s.selected.filter((id) => !ids.includes(id));
  if (s.forcedCard && ids.includes(s.forcedCard)) {
    s.forcedCard = s.hand.length ? pick(s, s.hand) : null;
    if (s.forcedCard && !s.selected.includes(s.forcedCard))
      s.selected.push(s.forcedCard);
  }
}
export function makeJoker(
  s: RunState,
  id?: string,
  rarity?: number,
  avoid: string[] = [],
  fromShop = false,
): Joker {
  const roll = random(s);
  const tier = rarity ?? (roll < 0.7 ? 1 : roll < 0.95 ? 2 : 3);
  const owned = has(s, "showman")
    ? []
    : [...s.jokers.map((j) => j.id), ...avoid];
  const eligible = JOKER_LIST.filter(
    (j) =>
      j.rarity === tier &&
      !owned.includes(j.id) &&
      (j.id !== "cavendish" || s.destroyedBanana) &&
      (j.id !== "steel" || s.deck.some((c) => c.enhancement === "steel")) &&
      (j.id !== "stone" || s.deck.some((c) => c.enhancement === "stone")) &&
      (j.id !== "glass" || s.deck.some((c) => c.enhancement === "glass")),
  );
  const chosen =
    id ??
    pick(
      s,
      eligible.length ? eligible : JOKER_LIST.filter((j) => j.rarity === tier),
    ).id;
  const ephemeral = [
    "banana",
    "cavendish",
    "ice",
    "popcorn",
    "bean",
    "seltzer",
    "ramen",
    "bones",
    "invisible",
    "luchador",
    "cola",
  ];
  const scaling = [
    "dagger",
    "bus",
    "runner",
    "constellation",
    "green",
    "red",
    "madness",
    "square",
    "vampire",
    "hologram",
    "rocket",
    "obelisk",
    "cat",
    "flash",
    "trousers",
    "castle",
    "glass",
    "wee",
  ];
  const stickerRoll = fromShop && s.config.stake >= 3 ? random(s) : -1;
  const eternal = stickerRoll >= 0.7 && !ephemeral.includes(chosen);
  const perish =
    s.config.stake >= 6 &&
    stickerRoll >= 0.4 &&
    stickerRoll < 0.7 &&
    !scaling.includes(chosen)
      ? 5
      : null;
  const ranked = s.deck.filter((c) => c.enhancement !== "stone");
  const template = pick(s, ranked.length ? ranked : [makeCard(s)]);
  return {
    uid: uid(s, "j"),
    id: chosen,
    edition: randomEdition(s),
    value: values[chosen] ?? 0,
    counter: 0,
    sellBonus: 0,
    suit: ["idol", "castle"].includes(chosen) ? template.suit : pick(s, SUITS),
    rank: ["idol", "mail"].includes(chosen)
      ? template.rank
      : 2 + Math.floor(random(s) * 13),
    hand: pick(s, HAND_IDS.slice(0, 9)),
    eternal,
    perish,
    rental: fromShop && s.config.stake >= 7 && random(s) < 0.3,
  };
}
function addJoker(s: RunState, j: Joker) {
  if (s.jokers.length >= jokerSlots(s) + (j.edition === "negative" ? 1 : 0))
    return false;
  s.jokers.push(j);
  discover(s, `joker:${j.id}`);
  return true;
}
export function makeConsumable(
  s: RunState,
  kind: Consumable["kind"],
  id?: string,
  avoid: string[] = [],
): Consumable {
  const pool =
    kind === "planet"
      ? HAND_IDS.filter((_, i) => i < 9 || s.handUses[HAND_IDS[i]] > 0)
      : kind === "tarot"
        ? TAROTS.map((t) => t.id)
        : SPECTRALS.filter((t) => !["soul", "blackhole"].includes(t.id)).map(
            (t) => t.id,
          );
  const filtered = has(s, "showman")
    ? pool
    : pool.filter(
        (v) =>
          !avoid.includes(v) &&
          !s.consumables.some((c) => c.kind === kind && c.id === v),
      );
  return {
    uid: uid(s, "u"),
    kind,
    id: id ?? pick(s, filtered.length ? filtered : pool),
    negative: false,
    sellBonus: 0,
  };
}
function addConsumable(
  s: RunState,
  kind: Consumable["kind"],
  id?: string,
  negative = false,
) {
  if (s.consumables.length >= consumableSlots(s) && !negative) return;
  const item = makeConsumable(s, kind, id);
  item.negative = negative;
  s.consumables.push(item);
  discover(s, `${kind}:${item.id}`);
}
function getBoss(s: RunState, excludeCurrent = false): string {
  const candidates = BOSSES.filter((b) =>
    s.ante % 8 === 0 ? b.min === 8 : b.min !== 8 && b.min <= s.ante,
  );
  const fresh = candidates.filter(
    (b) => !s.seenBosses.includes(b.id) && (!excludeCurrent || b.id !== s.boss),
  );
  if (!fresh.length) s.seenBosses = [];
  return pick(
    s,
    fresh.length
      ? fresh
      : candidates.filter((b) => !excludeCurrent || b.id !== s.boss),
  ).id;
}
function getTag(s: RunState) {
  const late = [
    "buffoon",
    "ethereal",
    "garbage",
    "handy",
    "meteor",
    "negative",
    "orbital",
    "standard",
    "topup",
  ];
  return pick(
    s,
    TAGS.filter((t) => s.ante >= 2 || !late.includes(t.id)),
  ).id;
}
const bases = [300, 800, 2000, 5000, 11000, 20000, 35000, 50000];
const greenBases = [300, 900, 2600, 8000, 20000, 36000, 60000, 100000];
const purpleBases = [300, 1000, 3200, 9000, 25000, 60000, 110000, 200000];
export function blindTarget(s: RunState, index = s.blind): number {
  const table =
    s.config.stake >= 5
      ? purpleBases
      : s.config.stake >= 2
        ? greenBases
        : bases;
  let base = s.ante <= 0 ? 100 : table[s.ante - 1];
  if (base === undefined) {
    const extra = s.ante - 8,
      amount = table[7] * (1.6 + (0.75 * extra) ** (1 + 0.2 * extra)) ** extra,
      unit = 10 ** (Math.floor(Math.log10(amount)) - 1);
    base = Number.isFinite(amount)
      ? Math.floor(amount / unit) * unit
      : Number.MAX_VALUE;
  }
  const multiplier =
    index === 0
      ? 1
      : index === 1
        ? 1.5
        : s.bossDisabled || hasChicot(s)
          ? 2
          : BOSS_MAP[s.boss].mult;
  return Math.min(
    Number.MAX_VALUE,
    Math.floor(base * multiplier * (s.config.deck === "plasma" ? 2 : 1)),
  );
}
function nextVoucher(s: RunState) {
  const pool = VOUCHERS.filter(
    (v) => !voucher(s, v.id) && (!v.requires || voucher(s, v.requires)),
  );
  return pool.length ? pick(s, pool).id : null;
}

export function createRun(config: Partial<RunConfig> = {}): RunState {
  const seed = (config.seed?.trim().toUpperCase() || newSeed()).slice(0, 32);
  const deck = config.deck ?? "red",
    stake = config.stake ?? 0;
  if (
    !DECKS.some((d) => d.id === deck) ||
    !Number.isInteger(stake) ||
    stake < 0 ||
    stake > 7
  )
    throw new Error("请选择有效的牌组和注级。");
  let hash = 2166136261;
  for (const char of seed)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const s: RunState = {
    version: 1,
    config: { deck, stake, seed },
    uid: `run-${seed}-${Date.now().toString(36)}`,
    rng: hash >>> 0,
    serial: 0,
    phase: "blind",
    ante: 1,
    blind: 0,
    round: 0,
    boss: "",
    seenBosses: [],
    bossDisabled: false,
    disabledJoker: null,
    forcedCard: null,
    money: deck === "yellow" ? 14 : 4,
    score: 0,
    target: 300,
    handsLeft: 0,
    discardsLeft: 0,
    handsUsed: 0,
    discardsUsed: 0,
    deck: [],
    drawPile: [],
    hand: [],
    handSort: "rank",
    played: [],
    selected: [],
    initialDeckSize: 52,
    jokers: [],
    consumables: [],
    levels: Object.fromEntries(HAND_IDS.map((id) => [id, 1])) as Record<
      HandId,
      number
    >,
    handUses: Object.fromEntries(HAND_IDS.map((id) => [id, 0])) as Record<
      HandId,
      number
    >,
    roundHands: [],
    vouchers: [],
    voucher: null,
    voucherBought: false,
    tags: [],
    skipTags: ["boss", "boss"],
    skipped: 0,
    shop: null,
    pack: null,
    lastHand: null,
    payout: null,
    totalHands: 0,
    unusedDiscards: 0,
    tarotUsed: 0,
    planetsUsed: [],
    lastConsumable: null,
    antePlayed: [],
    destroyedBanana: false,
    handSizeMod: 0,
    handsMod: 0,
    discardsMod: 0,
    ectoplasms: 0,
    juggle: 0,
    bossRerolls: 0,
    bestHand: 0,
    totalScore: 0,
    won: false,
    endless: false,
    message: "选择小盲，开始这一局。",
    logs: [],
    discovered: [],
  };
  for (const card of makeDeck()) {
    if (deck === "abandoned" && card.rank >= 11 && card.rank <= 13) continue;
    const c = makeCard(
      s,
      card.rank,
      deck === "checkered"
        ? card.suit === "clubs"
          ? "spades"
          : card.suit === "diamonds"
            ? "hearts"
            : card.suit
        : card.suit,
    );
    if (deck === "erratic") {
      c.rank = 2 + Math.floor(random(s) * 13);
      c.suit = pick(s, SUITS);
    }
    s.deck.push(c);
  }
  s.initialDeckSize = s.deck.length;
  if (deck === "magic") {
    s.vouchers.push("crystal");
    addConsumable(s, "tarot", "fool");
    addConsumable(s, "tarot", "fool");
  }
  if (deck === "nebula") s.vouchers.push("telescope");
  if (deck === "ghost") addConsumable(s, "spectral", "hex");
  if (deck === "zodiac")
    s.vouchers.push("tarotMerchant", "planetMerchant", "overstock");
  s.bossHand = "high";
  s.boss = getBoss(s);
  s.skipTags = [getTag(s), getTag(s)];
  s.voucher = nextVoucher(s);
  s.target = blindTarget(s);
  return s;
}

function sortHand(s: RunState) {
  const cards = new Map(s.deck.map((c) => [c.uid, c]));
  s.hand.sort((a, b) => {
    const ca = cards.get(a)!,
      cb = cards.get(b)!;
    // Keep hidden cards in their original relative order without revealing rank.
    if (ca.faceDown || cb.faceDown)
      return Number(!!ca.faceDown) - Number(!!cb.faceDown);
    return s.handSort === "suit"
      ? SUITS.indexOf(ca.suit) - SUITS.indexOf(cb.suit) || cb.rank - ca.rank
      : cb.rank - ca.rank || SUITS.indexOf(ca.suit) - SUITS.indexOf(cb.suit);
  });
}

function draw(
  s: RunState,
  n: number,
  reason: "initial" | "play" | "discard" = "initial",
) {
  for (let i = 0; i < n && s.drawPile.length; i++) {
    const id = s.drawPile.shift()!,
      c = s.deck.find((c) => c.uid === id)!;
    c.faceDown =
      (bossIs(s, "house") && reason === "initial") ||
      (bossIs(s, "fish") && reason === "play") ||
      (bossIs(s, "mark") && isFace(s, c)) ||
      (bossIs(s, "wheel") && chance(s, 1, 7));
    s.hand.push(id);
  }
  sortHand(s);
}
function updateBossSelection(s: RunState) {
  s.forcedCard = bossIs(s, "bell") && s.hand.length ? pick(s, s.hand) : null;
  s.selected = s.forcedCard ? [s.forcedCard] : [];
  if (bossIs(s, "heart"))
    s.disabledJoker = s.jokers.length
      ? pick(
          s,
          s.jokers.filter((j) => j.perish !== 0).length
            ? s.jokers.filter((j) => j.perish !== 0)
            : s.jokers,
        ).uid
      : null;
}
function selectBlind(s: RunState) {
  s.phase = "playing";
  s.round++;
  s.score = 0;
  s.handsUsed = s.discardsUsed = 0;
  s.roundHands = [];
  s.lastHand = null;
  s.payout = null;
  s.shop = null;
  s.hand = [];
  s.played = [];
  s.selected = [];
  s.disabledJoker = null;
  s.bossDisabled = hasChicot(s);
  s.target = blindTarget(s);
  s.handsLeft = bossIs(s, "needle") ? 1 : startingHands(s);
  s.discardsLeft = bossIs(s, "water") ? 0 : startingDiscards(s);
  s.deck.forEach((c) => (c.faceDown = false));
  for (const effect of [...effects(s)]) {
    if (!s.jokers.some((j) => j.uid === effect.physical.uid)) continue;
    const { id, source: j } = effect;
    if (id === "burglar") {
      s.handsLeft += 3;
      s.discardsLeft = 0;
    }
    if (id === "marble") {
      const c = makeCard(s);
      c.enhancement = "stone";
      permanentAdd(s, c);
    }
    if (id === "riff")
      for (let i = 0; i < 2 && s.jokers.length < jokerSlots(s); i++)
        addJoker(s, makeJoker(s, undefined, 1));
    if (id === "cartomancer") addConsumable(s, "tarot");
    if (id === "madness" && j === effect.physical && s.blind !== 2) {
      j.value += 0.5;
      const pool = s.jokers.filter(
        (other) => other.uid !== j.uid && !other.eternal,
      );
      if (pool.length) {
        const target = pick(s, pool);
        s.jokers = s.jokers.filter((o) => o.uid !== target.uid);
      }
    }
    if (id === "dagger" && j === effect.physical) {
      const right = s.jokers[s.jokers.findIndex((o) => o.uid === j.uid) + 1];
      if (right && !right.eternal) {
        j.value += sellJokerValue(right) * 2;
        s.jokers = s.jokers.filter((o) => o.uid !== right.uid);
      }
    }
  }
  s.drawPile = shuffle(
    s,
    s.deck.map((c) => c.uid),
  );
  draw(s, handSize(s));
  for (const e of effects(s))
    if (e.id === "certificate") {
      const card = makeCard(s);
      card.seal = pick(s, ["red", "blue", "purple", "gold"] as Seal[]);
      permanentAdd(s, card, true);
    }
  sortHand(s);
  if (bossIs(s, "acorn")) s.jokers = shuffle(s, s.jokers);
  updateBossSelection(s);
  note(
    s,
    `第 ${s.ante} 底注 · ${s.blind === 0 ? "小盲" : s.blind === 1 ? "大盲" : BOSS_MAP[s.boss].name}，目标 ${s.target.toLocaleString()}。`,
  );
}

function grant(s: RunState, amount: number, label: string, trace?: Trace[]) {
  s.money += amount;
  if (trace && amount) trace.push({ label, money: amount });
}
function upgrade(s: RunState, id: HandId, amount = 1) {
  s.levels[id] = Math.max(1, s.levels[id] + amount);
}
function onDiscard(s: RunState, discarded: RunCard[], forced = false) {
  if (!forced) {
    const evaluation = evaluateHand(evaluationCards(s, discarded), {
      fourFingers: has(s, "fingers"),
      shortcut: has(s, "shortcut"),
      smeared: has(s, "smeared"),
    });
    for (const e of effects(s)) {
      if (e.id === "burnt" && s.discardsUsed === 0) upgrade(s, evaluation.id);
      if (
        e.id === "faceless" &&
        discarded.filter((c) => isFace(s, c)).length >= 3
      )
        grant(s, 5, "无面小丑");
      if (e.id === "mail")
        grant(
          s,
          discarded.filter(
            (c) => c.rank === e.source.rank && c.enhancement !== "stone",
          ).length * 5,
          "邮寄返利",
        );
      if (
        e.id === "trading" &&
        s.discardsUsed === 0 &&
        discarded.length === 1
      ) {
        destroyCards(s, [discarded[0].uid]);
        grant(s, 3, "交易卡");
      }
    }
    for (const j of s.jokers.filter((j) => jokerActive(s, j))) {
      if (j.id === "green") j.value = Math.max(0, j.value - 1);
      if (j.id === "ramen")
        j.value = Math.max(1, j.value - discarded.length * 0.01);
      if (j.id === "castle")
        j.value +=
          discarded.filter((c) =>
            suitsFor(c, has(s, "smeared")).includes(j.suit),
          ).length * 3;
      if (j.id === "road")
        j.value +=
          discarded.filter((c) => c.rank === 11 && c.enhancement !== "stone")
            .length * 0.5;
      if (j.id === "yorick") {
        j.counter += discarded.length;
        j.value += Math.floor(j.counter / 23);
        j.counter %= 23;
      }
    }
    s.jokers = s.jokers.filter(
      (j) => j.eternal || j.id !== "ramen" || j.value > 1.000001,
    );
  }
  for (const c of discarded)
    if (c.seal === "purple" && !cardDebuffed(s, c)) addConsumable(s, "tarot");
  s.hand = s.hand.filter((id) => !discarded.some((c) => c.uid === id));
  s.played.push(...discarded.map((c) => c.uid));
}

function scoring(s: RunState, cards: RunCard[]): PlayedHand {
  const evaluation = evaluateHand(evaluationCards(s, cards), {
    fourFingers: has(s, "fingers"),
    shortcut: has(s, "shortcut"),
    smeared: has(s, "smeared"),
    splash: has(s, "splash"),
  });
  const trace: Trace[] = [];
  const scored = cards.filter((c) => evaluation.scoring.includes(c.uid));
  const most = Math.max(...Object.values(s.handUses));
  const repeats = s.roundHands.includes(evaluation.id);
  const blocked =
    bossIs(s, "psychic") && cards.length !== 5
      ? "灵媒：必须打出 5 张牌"
      : bossIs(s, "eye") && repeats
        ? "眼睛：本关不可重复牌型"
        : bossIs(s, "mouth") &&
            s.roundHands.length &&
            s.roundHands[0] !== evaluation.id
          ? "嘴：本关只能使用第一手牌型"
          : null;
  const bossTriggered =
    !!blocked ||
    cards.some((c) => cardDebuffed(s, c)) ||
    bossIs(s, "flint") ||
    (bossIs(s, "arm") && s.levels[evaluation.id] > 1) ||
    (bossIs(s, "ox") && evaluation.id === (s.bossHand ?? "high"));
  s.handUses[evaluation.id]++;
  s.totalHands++;
  s.handsUsed++;
  s.handsLeft--;
  s.roundHands.push(evaluation.id);
  if (bossIs(s, "arm")) {
    upgrade(s, evaluation.id, -1);
    trace.push({ label: `手臂：${HANDS[evaluation.id].name}降级` });
  }
  if (bossIs(s, "tooth")) grant(s, -cards.length, "牙齿", trace);
  if (bossIs(s, "ox") && evaluation.id === (s.bossHand ?? "high")) {
    grant(s, -s.money, "公牛：资金归零", trace);
  }
  for (const e of effects(s)) {
    if (e.id === "space" && chance(s, 1, 4)) {
      upgrade(s, evaluation.id);
      trace.push({ label: "太空小丑：牌型升级", joker: e.physical.uid });
    }
    if (e.id === "dna" && s.handsUsed === 1 && cards.length === 1) {
      const c = { ...structuredClone(cards[0]), uid: uid(s, "c") };
      permanentAdd(s, c, true);
      trace.push({ label: "DNA：永久复制", joker: e.physical.uid });
    }
    if (e.id === "vagabond" && s.money <= 4) addConsumable(s, "tarot");
    if (
      e.id === "superposition" &&
      evaluation.contains.includes("straight") &&
      cards.some((c) => c.rank === 14)
    )
      addConsumable(s, "tarot");
    if (e.id === "seance" && evaluation.id === "straightFlush")
      addConsumable(s, "spectral");
    if (e.id === "todo" && evaluation.id === e.source.hand)
      grant(s, 4, "待办清单", trace);
    if (e.id === "matador" && bossTriggered) grant(s, 8, "斗牛士", trace);
  }
  if (!blocked)
    for (const e of effects(s)) {
      if (e.id === "midas")
        for (const c of cards)
          if (!cardDebuffed(s, c) && isFace(s, c)) c.enhancement = "gold";
      if (e.id === "vampire" && e.source === e.physical)
        for (const c of scored)
          if (!cardDebuffed(s, c) && c.enhancement !== "base") {
            e.source.value += 0.1;
            c.enhancement = "base";
          }
    }
  for (const j of s.jokers.filter((j) => jokerActive(s, j))) {
    if (j.id === "green") j.value++;
    if (j.id === "runner" && evaluation.contains.includes("straight"))
      j.value += 15;
    if (j.id === "trousers" && evaluation.contains.includes("twoPair"))
      j.value += 2;
    if (j.id === "square" && cards.length === 4) j.value += 4;
    if (j.id === "bus")
      j.value = scored.some((c) => !cardDebuffed(s, c) && isFace(s, c))
        ? 0
        : j.value + 1;
    if (j.id === "obelisk")
      j.value = s.handUses[evaluation.id] - 1 === most ? 1 : j.value + 0.2;
    if (j.id === "loyalty") j.counter++;
  }
  let { chips, mult } = handValues(s, evaluation.id);
  if (bossIs(s, "flint")) {
    chips = Math.max(1, Math.round(chips / 2));
    mult = Math.max(1, Math.round(mult / 2));
  }
  trace.push({
    label: `${evaluation.name} · 等级 ${s.levels[evaluation.id]}`,
    chips,
    mult,
    totals: { chips, mult },
  });
  const add = (
    label: string,
    extraChips = 0,
    extraMult = 0,
    factor = 1,
    card?: string,
    joker?: string,
  ) => {
    if (!extraChips && !extraMult && factor === 1) return;
    chips = Math.min(Number.MAX_VALUE, chips + extraChips);
    mult = Math.min(Number.MAX_VALUE, (mult + extraMult) * factor);
    trace.push({
      label,
      ...(extraChips ? { chips: extraChips } : {}),
      ...(extraMult ? { mult: extraMult } : {}),
      ...(factor !== 1 ? { factor } : {}),
      card,
      joker,
      totals: { chips, mult },
    });
  };
  if (!blocked) {
    let firstFace: string | undefined;
    for (const c of scored) {
      if (isFace(s, c) && !cardDebuffed(s, c)) {
        firstFace = c.uid;
        break;
      }
    }
    for (const c of scored) {
      if (cardDebuffed(s, c)) {
        trace.push({ label: "Boss：此牌失效", card: c.uid });
        continue;
      }
      let repetitions = 1 + (c.seal === "red" ? 1 : 0);
      for (const e of effects(s)) {
        if (e.id === "chad" && c.uid === scored[0]?.uid) repetitions += 2;
        if (
          e.id === "hack" &&
          [2, 3, 4, 5].includes(c.rank) &&
          c.enhancement !== "stone"
        )
          repetitions++;
        if (e.id === "sock" && isFace(s, c)) repetitions++;
        if (e.id === "dusk" && s.handsLeft === 0) repetitions++;
        if (e.id === "seltzer" && e.source.value > 0) repetitions++;
      }
      for (let repeat = 0; repeat < repetitions; repeat++) {
        add(
          repeat
            ? `再次触发 · ${c.enhancement === "stone" ? "石头" : c.rank}`
            : "卡牌筹码",
          c.enhancement === "stone"
            ? 50 + c.bonus
            : (c.rank === 14 ? 11 : Math.min(10, c.rank)) + c.bonus,
          0,
          1,
          c.uid,
        );
        if (c.enhancement === "bonus") add("奖励牌", 30, 0, 1, c.uid);
        if (c.enhancement === "mult") add("倍率牌", 0, 4, 1, c.uid);
        if (c.enhancement === "glass") add("玻璃牌", 0, 0, 2, c.uid);
        if (c.enhancement === "lucky") {
          let triggered = false;
          if (chance(s, 1, 5)) {
            add("幸运牌：倍率命中", 0, 20, 1, c.uid);
            triggered = true;
          }
          if (chance(s, 1, 15)) {
            grant(s, 20, "幸运牌：+$20", trace);
            triggered = true;
          }
          if (triggered)
            for (const j of s.jokers)
              if (j.id === "cat" && jokerActive(s, j)) j.value += 0.25;
          if (!triggered)
            trace.push({ label: "幸运牌：本次未触发", card: c.uid });
        }
        if (c.edition === "foil") add("闪箔", 50, 0, 1, c.uid);
        if (c.edition === "holo") add("镭射", 0, 10, 1, c.uid);
        if (c.edition === "poly") add("多彩", 0, 0, 1.5, c.uid);
        if (c.seal === "gold") grant(s, 3, "金蜡封", trace);
        for (const e of effects(s)) {
          const id = e.id,
            j = e.source,
            label = JOKERS[id].name,
            face = isFace(s, c),
            rank = c.enhancement === "stone" ? 0 : c.rank,
            suits = suitsFor(c, has(s, "smeared"));
          const gain = (a = 0, b = 0, x = 1) =>
            add(label, a, b, x, c.uid, e.physical.uid);
          const suitMult: Record<string, Suit> = {
            greedy: "diamonds",
            lusty: "hearts",
            wrathful: "spades",
            gluttonous: "clubs",
          };
          if (suitMult[id] && suits.includes(suitMult[id])) gain(0, 3);
          if (id === "fibonacci" && [14, 2, 3, 5, 8].includes(rank)) gain(0, 8);
          if (id === "scary" && face) gain(30);
          if (id === "even" && [2, 4, 6, 8, 10].includes(rank)) gain(0, 4);
          if (id === "odd" && [14, 3, 5, 7, 9].includes(rank)) gain(31);
          if (id === "scholar" && rank === 14) gain(20, 4);
          if (id === "business" && face && chance(s, 1, 2))
            grant(s, 2, label, trace);
          if (id === "eight" && rank === 8 && chance(s, 1, 4))
            addConsumable(s, "tarot");
          if (id === "hiker") {
            c.bonus += 5;
            trace.push({
              label: "远足者：卡牌永久 +5",
              card: c.uid,
              joker: e.physical.uid,
            });
          }
          if (id === "photo" && c.uid === firstFace) gain(0, 0, 2);
          if (id === "ancient" && suits.includes(j.suit)) gain(0, 0, 1.5);
          if (id === "walkie" && [10, 4].includes(rank)) gain(10, 4);
          if (id === "smiley" && face) gain(0, 5);
          if (id === "ticket" && c.enhancement === "gold")
            grant(s, 4, label, trace);
          if (id === "gem" && suits.includes("diamonds"))
            grant(s, 1, label, trace);
          if (id === "bloodstone" && suits.includes("hearts")) {
            if (chance(s, 1, 2)) gain(0, 0, 1.5);
            else
              trace.push({
                label: "血石：本次未触发",
                card: c.uid,
                joker: e.physical.uid,
              });
          }
          if (id === "arrowhead" && suits.includes("spades")) gain(50);
          if (id === "onyx" && suits.includes("clubs")) gain(0, 7);
          if (id === "wee" && rank === 2 && e.source === e.physical)
            j.value += 8;
          if (id === "idol" && rank === j.rank && suits.includes(j.suit))
            gain(0, 0, 2);
          if (id === "triboulet" && [12, 13].includes(rank)) gain(0, 0, 2);
        }
      }
    }
    const held = s.hand
        .map((id) => s.deck.find((c) => c.uid === id)!)
        .filter(Boolean),
      rankedHeld = held.filter((c) => c.enhancement !== "stone");
    const lowest = rankedHeld.length
      ? rankedHeld.reduce((best, c) => (c.rank <= best.rank ? c : best))
      : null;
    for (const c of held) {
      if (cardDebuffed(s, c)) continue;
      const repetitions =
        1 +
        (c.seal === "red" ? 1 : 0) +
        effects(s).filter((e) => e.id === "mime").length;
      for (let r = 0; r < repetitions; r++) {
        if (c.enhancement === "steel") add("手中钢铁牌", 0, 0, 1.5, c.uid);
        for (const e of effects(s)) {
          if (e.id === "baron" && c.rank === 13 && c.enhancement !== "stone")
            add("男爵", 0, 0, 1.5, c.uid, e.physical.uid);
          if (e.id === "shoot" && c.rank === 12 && c.enhancement !== "stone")
            add("射月", 0, 13, 1, c.uid, e.physical.uid);
          if (e.id === "fist" && c.uid === lowest?.uid)
            add(
              "举起的拳头",
              0,
              2 * (c.rank === 14 ? 11 : Math.min(10, c.rank)),
              1,
              c.uid,
              e.physical.uid,
            );
          if (e.id === "parking" && isFace(s, c) && chance(s, 1, 2))
            grant(s, 1, "预留车位", trace);
        }
      }
    }
    for (const physical of s.jokers) {
      if (!jokerActive(s, physical)) {
        if (JOKERS[physical.id].rarity === 2)
          for (const baseball of effects(s).filter((e) => e.id === "baseball"))
            add("棒球卡", 0, 0, 1.5, undefined, baseball.physical.uid);
        continue;
      }
      const e = effects(s).find((e) => e.physical.uid === physical.uid);
      const id = e?.id,
        j = e?.source;
      if (physical.edition === "foil")
        add("小丑闪箔", 50, 0, 1, undefined, physical.uid);
      if (physical.edition === "holo")
        add("小丑镭射", 0, 10, 1, undefined, physical.uid);
      if (id && j) {
        const gain = (a = 0, b = 0, x = 1) =>
          add(JOKERS[id].name, a, b, x, undefined, physical.uid);
        const hasHand = (hand: HandId) => evaluation.contains.includes(hand);
        const conditional: Record<string, [HandId, number, number, number]> = {
          jolly: ["pair", 0, 8, 1],
          zany: ["trips", 0, 12, 1],
          mad: ["twoPair", 0, 10, 1],
          crazy: ["straight", 0, 12, 1],
          droll: ["flush", 0, 10, 1],
          sly: ["pair", 50, 0, 1],
          wily: ["trips", 100, 0, 1],
          clever: ["twoPair", 80, 0, 1],
          devious: ["straight", 100, 0, 1],
          crafty: ["flush", 80, 0, 1],
          duo: ["pair", 0, 0, 2],
          trio: ["trips", 0, 0, 3],
          family: ["quads", 0, 0, 4],
          order: ["straight", 0, 0, 3],
          tribe: ["flush", 0, 0, 2],
        };
        const condition = conditional[id];
        if (condition && hasHand(condition[0]))
          gain(condition[1], condition[2], condition[3]);
        if (id === "joker") gain(0, 4);
        if (id === "half" && cards.length <= 3) gain(0, 20);
        if (id === "stencil")
          gain(
            0,
            0,
            Math.max(
              1,
              jokerSlots(s) -
                s.jokers.length +
                s.jokers.filter((j) => j.id === "stencil").length,
            ),
          );
        if (id === "banner") gain(30 * s.discardsLeft);
        if (id === "summit" && s.discardsLeft === 0) gain(0, 15);
        if (id === "loyalty" && j.counter % 6 === 0) gain(0, 0, 4);
        if (id === "misprint") gain(0, Math.floor(random(s) * 24));
        if (id === "steel")
          gain(
            0,
            0,
            1 + 0.2 * s.deck.filter((c) => c.enhancement === "steel").length,
          );
        if (id === "abstract") gain(0, s.jokers.length * 3);
        if (id === "banana") gain(0, 15);
        if (id === "supernova") gain(0, s.handUses[evaluation.id]);
        if (
          [
            "dagger",
            "bus",
            "green",
            "red",
            "trousers",
            "flash",
            "popcorn",
          ].includes(id)
        )
          gain(0, j.value);
        if (["runner", "ice", "square", "wee", "castle"].includes(id))
          gain(j.value);
        if (
          [
            "constellation",
            "madness",
            "vampire",
            "hologram",
            "obelisk",
            "cat",
            "ramen",
            "campfire",
            "glass",
            "road",
            "canio",
            "yorick",
          ].includes(id)
        )
          gain(0, 0, j.value);
        if (
          id === "blackboard" &&
          held.every((c) =>
            suitsFor(c, has(s, "smeared")).some(
              (suit) => suit === "spades" || suit === "clubs",
            ),
          )
        )
          gain(0, 0, 3);
        if (id === "blue") gain(2 * s.drawPile.length);
        if (id === "cavendish") gain(0, 0, 3);
        if (id === "sharp" && repeats) gain(0, 0, 3);
        if (id === "erosion")
          gain(0, Math.max(0, s.initialDeckSize - s.deck.length) * 4);
        if (id === "fortune") gain(0, s.tarotUsed);
        if (id === "stone")
          gain(25 * s.deck.filter((c) => c.enhancement === "stone").length);
        if (id === "bull") gain(2 * Math.max(0, s.money));
        if (id === "acrobat" && s.handsLeft === 0) gain(0, 0, 3);
        if (id === "swash")
          gain(
            0,
            s.jokers
              .filter((o) => o.uid !== physical.uid)
              .reduce((n, o) => n + sellJokerValue(o), 0),
          );
        if (id === "throwback") gain(0, 0, 1 + s.skipped * 0.25);
        if (
          id === "flower" &&
          hasFourSuits(
            scored.filter((c) => !cardDebuffed(s, c)),
            has(s, "smeared"),
          )
        )
          gain(0, 0, 3);
        if (
          id === "double" &&
          scored.some(
            (c) =>
              !cardDebuffed(s, c) &&
              suitsFor(c, has(s, "smeared")).includes("clubs") &&
              scored.some(
                (other) =>
                  other.uid !== c.uid &&
                  !cardDebuffed(s, other) &&
                  suitsFor(other, has(s, "smeared")).some(
                    (suit) => suit !== "clubs",
                  ),
              ),
          )
        )
          gain(0, 0, 2);
        if (id === "stunt") gain(250);
        if (
          id === "license" &&
          s.deck.filter((c) => c.enhancement !== "base").length >= 16
        )
          gain(0, 0, 3);
        if (id === "bootstraps")
          gain(0, 2 * Math.floor(Math.max(0, s.money) / 5));
      }
      if (physical.edition === "poly")
        add("小丑多彩", 0, 0, 1.5, undefined, physical.uid);
      if (JOKERS[physical.id].rarity === 2)
        for (const baseball of effects(s).filter((e) => e.id === "baseball"))
          add("棒球卡", 0, 0, 1.5, undefined, baseball.physical.uid);
    }
    if (voucher(s, "observatory"))
      for (const c of s.consumables)
        if (c.kind === "planet" && c.id === evaluation.id)
          add("天文台", 0, 0, 1.5);
  }
  if (s.config.deck === "plasma") {
    const balanced = chips / 2 + mult / 2;
    chips = mult = balanced;
    trace.push({ label: "等离子：平衡筹码与倍率", totals: { chips, mult } });
  }
  const score = blocked
    ? 0
    : Math.min(Number.MAX_VALUE, Math.floor(chips * mult));
  for (const j of s.jokers.filter((j) => jokerActive(s, j))) {
    if (j.id === "ice") j.value = Math.max(0, j.value - 5);
    if (j.id === "seltzer") j.value--;
  }
  const destroy = cards
    .filter(
      (c) =>
        c.enhancement === "glass" &&
        evaluation.scoring.includes(c.uid) &&
        !cardDebuffed(s, c) &&
        !blocked &&
        chance(s, 1, 4),
    )
    .map((c) => c.uid);
  for (const e of effects(s))
    if (
      e.id === "sixth" &&
      s.handsUsed === 1 &&
      cards.length === 1 &&
      cards[0].rank === 6
    ) {
      destroy.push(cards[0].uid);
      addConsumable(s, "spectral");
    }
  if (destroy.length) {
    trace.push({ label: `${destroy.length} 张牌被摧毁` });
    destroyCards(s, [...new Set(destroy)]);
  }
  s.jokers = s.jokers.filter(
    (j) => j.eternal || !(["ice", "seltzer"].includes(j.id) && j.value <= 0),
  );
  return {
    name: evaluation.name,
    id: evaluation.id,
    level: s.levels[evaluation.id],
    chips,
    mult,
    score,
    cards: structuredClone(cards),
    scoring: evaluation.scoring,
    trace,
    blocked,
  };
}

function finishRound(s: RunState) {
  s.phase = "cashout";
  s.selected = [];
  s.forcedCard = null;
  s.unusedDiscards += s.discardsLeft;
  const extras: { label: string; amount: number }[] = [];
  const extra = (label: string, amount: number) => {
    if (amount) extras.push({ label, amount });
  };
  for (const c of s.hand
    .map((id) => s.deck.find((c) => c.uid === id)!)
    .filter(Boolean)) {
    if (cardDebuffed(s, c)) continue;
    const times =
      1 +
      (c.seal === "red" ? 1 : 0) +
      effects(s).filter((e) => e.id === "mime").length;
    if (c.enhancement === "gold") extra("手中黄金牌", 3 * times);
    if (c.seal === "blue" && s.lastHand)
      for (let i = 0; i < times; i++) addConsumable(s, "planet", s.lastHand.id);
  }
  for (const e of [...effects(s)]) {
    const j = e.source;
    // Cash-out income stops when a Perishable Joker expires after the fifth win.
    if (j.perish === 1) continue;
    if (e.id === "delayed" && s.discardsUsed === 0)
      extra("延迟满足", 2 * s.discardsLeft);
    if (e.id === "golden") extra("黄金小丑", 4);
    if (e.id === "cloud")
      extra(
        "九霄云外",
        s.deck.filter((c) => c.rank === 9 && c.enhancement !== "stone").length,
      );
    if (e.id === "rocket") {
      if (s.blind === 2 && j === e.physical) j.value += 2;
      extra("火箭", j.value);
    }
    if (e.id === "satellite") extra("卫星", s.planetsUsed.length);
  }
  const destroy: string[] = [];
  for (const j of s.jokers) {
    if (jokerActive(s, j)) {
      if (j.id === "egg") j.sellBonus += 3;
      if (j.id === "gift") {
        s.jokers.forEach((o) => o.sellBonus++);
        s.consumables.forEach((c) => c.sellBonus++);
      }
      if (j.id === "banana" && chance(s, 1, 6)) {
        destroy.push(j.uid);
        s.destroyedBanana = true;
      }
      if (j.id === "cavendish" && chance(s, 1, 1000)) destroy.push(j.uid);
      if (j.id === "bean") {
        j.value--;
        if (j.value <= 0) destroy.push(j.uid);
      }
      if (j.id === "popcorn") {
        j.value -= 4;
        if (j.value <= 0) destroy.push(j.uid);
      }
      if (j.id === "invisible") j.counter++;
      if (j.id === "campfire" && s.blind === 2) j.value = 1;
      if (j.id === "road") j.value = 1;
    }
    if (j.rental) extra("租赁费用", -3);
    if (j.perish !== null) j.perish = Math.max(0, j.perish - 1);
    if (["ancient", "castle"].includes(j.id))
      j.suit = pick(
        s,
        SUITS.filter((suit) => suit !== j.suit),
      );
    if (j.id === "mail")
      j.rank = pick(s, s.deck.length ? s.deck : [makeCard(s)]).rank;
    if (j.id === "idol") {
      const c = pick(s, s.deck.length ? s.deck : [makeCard(s)]);
      j.suit = c.suit;
      j.rank = c.rank;
    }
    if (j.id === "todo")
      j.hand = pick(
        s,
        HAND_IDS.slice(0, 9).filter((h) => h !== j.hand),
      );
  }
  s.jokers = s.jokers.filter((j) => j.eternal || !destroy.includes(j.uid));
  if (s.blind === 2) {
    extra("投资标签", s.tags.filter((t) => t === "investment").length * 25);
    s.tags = s.tags.filter((t) => t !== "investment");
    if (s.config.deck === "anaglyph") s.tags.push("double");
    if (s.ante === 8) s.won = true;
  }
  const cap = voucher(s, "moneyTree") ? 20 : voucher(s, "seedMoney") ? 10 : 5;
  const interest =
    s.config.deck === "green"
      ? 0
      : Math.min(
          cap,
          Math.floor(
            Math.max(
              0,
              s.money +
                extras
                  .filter(
                    (e) => e.label === "手中黄金牌" || e.label === "租赁费用",
                  )
                  .reduce((a, e) => a + e.amount, 0),
            ) / 5,
          ),
        ) *
        (1 + count(s, "moon"));
  const blind =
    s.blind === 0
      ? s.config.stake >= 1
        ? 0
        : 3
      : s.blind === 1
        ? 4
        : s.ante % 8 === 0
          ? 8
          : 5;
  const hands = s.handsLeft * (s.config.deck === "green" ? 2 : 1),
    discards = s.config.deck === "green" ? s.discardsLeft : 0;
  s.payout = {
    blind,
    hands,
    discards,
    interest,
    extras,
    total:
      blind +
      hands +
      discards +
      interest +
      extras.reduce((a, e) => a + e.amount, 0),
  };
  s.juggle = 0;
  note(
    s,
    `击败${s.blind === 2 ? BOSS_MAP[s.boss].name : s.blind === 0 ? "小盲" : "大盲"}！本关获得 $${s.payout.total}。`,
  );
}

function play(s: RunState) {
  if (!s.selected.length || s.selected.length > 5)
    throw new Error("请选择 1–5 张牌。");
  const cards = s.hand
    .filter((id) => s.selected.includes(id))
    .map((id) => s.deck.find((c) => c.uid === id)!);
  if (cards.length !== s.selected.length)
    throw new Error("选中的牌已不在手中。");
  s.hand = s.hand.filter((id) => !s.selected.includes(id));
  s.played.push(...s.selected);
  s.selected = [];
  s.lastHand = scoring(s, cards);
  // DNA can add cards during scoring; preserve manual trigger order until it ends.
  sortHand(s);
  s.score = Math.min(Number.MAX_VALUE, s.score + s.lastHand.score);
  s.bestHand = Math.max(s.bestHand, s.lastHand.score);
  s.totalScore = Math.min(Number.MAX_VALUE, s.totalScore + s.lastHand.score);
  s.antePlayed = [...new Set([...s.antePlayed, ...cards.map((c) => c.uid)])];
  note(
    s,
    `${s.lastHand.name}：${s.lastHand.score.toLocaleString()} 分${s.lastHand.blocked ? ` · ${s.lastHand.blocked}` : ""}`,
  );
  if (s.score >= s.target) {
    finishRound(s);
    return;
  }
  if (s.handsLeft > 0) {
    if (bossIs(s, "hook"))
      onDiscard(
        s,
        shuffle(s, s.hand)
          .slice(0, 2)
          .map((id) => s.deck.find((c) => c.uid === id)!),
        true,
      );
    draw(
      s,
      bossIs(s, "serpent") ? 3 : Math.max(0, handSize(s) - s.hand.length),
      "play",
    );
  }
  // Forced discards can exhaust the last cards even with plays remaining.
  if (s.handsLeft <= 0 || (!s.hand.length && !s.drawPile.length)) {
    const bones = s.jokers.find((j) => j.id === "bones" && jokerActive(s, j));
    if (bones && s.score >= s.target * 0.25) {
      s.jokers = s.jokers.filter((j) => j.uid !== bones.uid);
      finishRound(s);
      note(s, "骷髅先生救场，这关通过！");
      return;
    }
    s.phase = "lost";
    s.selected = [];
    s.forcedCard = null;
    note(
      s,
      s.handsLeft <= 0
        ? "出牌机会用尽，这一局结束。"
        : "牌堆和手牌已用尽，这一局结束。",
    );
    return;
  }
  updateBossSelection(s);
}

function nextBlind(s: RunState) {
  s.blind++;
  if (s.blind > 2) {
    s.seenBosses.push(s.boss);
    s.blind = 0;
    s.ante++;
    s.antePlayed = [];
    s.bossDisabled = false;
    s.bossHand = HAND_IDS.reduce(
      (best, h) => (s.handUses[h] > s.handUses[best] ? h : best),
      "high",
    );
    s.boss = getBoss(s);
    s.skipTags = [getTag(s), getTag(s)];
    s.voucher = nextVoucher(s);
    s.voucherBought = false;
    s.bossRerolls = 0;
  }
  s.phase = "blind";
  s.hand = [];
  s.drawPile = [];
  s.selected = [];
  s.forcedCard = null;
  s.shop = null;
  s.lastHand = null;
  s.disabledJoker = null;
  s.target = blindTarget(s);
  s.score = 0;
  s.payout = null;
  s.deck.forEach((c) => (c.faceDown = false));
}

function shopOffer(
  s: RunState,
  avoidJokers: string[] = [],
  avoidConsumables: string[] = [],
): Offer {
  const tarotWeight = voucher(s, "tarotTycoon")
      ? 16
      : voucher(s, "tarotMerchant")
        ? 8
        : 4,
    planetWeight = voucher(s, "planetTycoon")
      ? 16
      : voucher(s, "planetMerchant")
        ? 8
        : 4;
  const weights: {
    kind: "joker" | Consumable["kind"] | "card";
    weight: number;
  }[] = [
    { kind: "joker", weight: 20 },
    { kind: "tarot", weight: tarotWeight },
    { kind: "planet", weight: planetWeight },
    ...(s.config.deck === "ghost"
      ? [{ kind: "spectral" as const, weight: 2 }]
      : []),
    ...(voucher(s, "magicTrick") ? [{ kind: "card" as const, weight: 4 }] : []),
  ];
  let roll = random(s) * weights.reduce((a, b) => a + b.weight, 0);
  let kind: (typeof weights)[number]["kind"] = "joker";
  for (const item of weights) {
    roll -= item.weight;
    if (roll < 0) {
      kind = item.kind;
      break;
    }
  }
  if (kind === "joker") {
    const j = makeJoker(s, undefined, undefined, avoidJokers, true);
    return {
      uid: uid(s, "o"),
      kind,
      joker: j,
      price: j.rental ? 1 : cost(s, JOKERS[j.id].cost + editionCost(j.edition)),
      sold: false,
    };
  }
  if (kind === "card") {
    const card = makeCard(s);
    if (voucher(s, "illusion")) {
      if (random(s) < 0.4) card.enhancement = enhanced(s);
      card.edition = randomEdition(s, false, 2);
      if (random(s) < 0.2)
        card.seal = pick(s, ["red", "blue", "purple", "gold"] as Seal[]);
    }
    return {
      uid: uid(s, "o"),
      kind,
      card,
      price: cost(
        s,
        1 +
          (card.enhancement !== "base" ? 1 : 0) +
          editionCost(card.edition) +
          (card.seal !== "none" ? 1 : 0),
      ),
      sold: false,
    };
  }
  return {
    uid: uid(s, "o"),
    kind,
    item: makeConsumable(s, kind, undefined, avoidConsumables),
    price: cost(s, kind === "spectral" ? 4 : 3),
    sold: false,
  };
}
function generateOffers(s: RunState) {
  const offers: Offer[] = [];
  for (
    let i = 0;
    i <
    2 +
      (voucher(s, "overstock") ? 1 : 0) +
      (voucher(s, "overstockPlus") ? 1 : 0);
    i++
  )
    offers.push(
      shopOffer(
        s,
        offers.flatMap((o) => (o.kind === "joker" ? [o.joker.id] : [])),
        offers.flatMap((o) => ("item" in o ? [o.item.id] : [])),
      ),
    );
  for (const tag of [...s.tags]) {
    if (tag === "rare" || tag === "uncommon") {
      const index = offers.findIndex((o) => o.kind === "joker");
      const j = makeJoker(s, undefined, tag === "rare" ? 3 : 2, [], true);
      const offer: Offer = {
        uid: uid(s, "o"),
        kind: "joker",
        joker: j,
        price: 0,
        sold: false,
      };
      if (index >= 0) offers[index] = offer;
      else offers[0] = offer;
      s.tags.splice(s.tags.indexOf(tag), 1);
    } else if (["foil", "holo", "poly", "negative"].includes(tag)) {
      const target = offers.find(
        (o) => o.kind === "joker" && o.joker.edition === "base",
      );
      if (target && target.kind === "joker") {
        target.joker.edition = tag as Edition;
        target.price = 0;
        s.tags.splice(s.tags.indexOf(tag), 1);
      }
    }
  }
  return offers;
}
function packOffer(
  s: RunState,
  kind?: PackKind,
  size?: PackOffer["size"],
): PackOffer {
  const roll = random(s),
    packKind =
      kind ??
      pick(s, [
        "arcana",
        "arcana",
        "celestial",
        "celestial",
        "standard",
        "standard",
        "buffoon",
        "buffoon",
        "spectral",
      ] as PackKind[]),
    packSize = size ?? (roll < 0.6 ? "normal" : roll < 0.85 ? "jumbo" : "mega");
  return {
    uid: uid(s, "p"),
    kind: packKind,
    size: packSize,
    price: cost(s, packSize === "normal" ? 4 : packSize === "jumbo" ? 6 : 8),
    sold: false,
  };
}
function enterShop(s: RunState) {
  s.phase = "shop";
  s.hand = [];
  s.drawPile = [];
  s.selected = [];
  s.forcedCard = null;
  s.disabledJoker = null;
  s.deck.forEach((c) => (c.faceDown = false));
  const coupon = s.tags.includes("coupon"),
    dice = s.tags.includes("d6");
  const offers = generateOffers(s),
    packs = [packOffer(s), packOffer(s)];
  // The first shop always offers a normal Buffoon Pack, as in the base run.
  if (s.round === 1) packs[0] = packOffer(s, "buffoon", "normal");
  if (coupon) {
    offers.forEach((o) => (o.price = 0));
    packs.forEach((p) => (p.price = 0));
  }
  const voucherIds = s.voucher && !s.voucherBought ? [s.voucher] : [];
  for (const _ of s.tags.filter((t) => t === "voucher")) {
    void _;
    const next = VOUCHERS.filter(
      (v) =>
        !s.vouchers.includes(v.id) &&
        !voucherIds.includes(v.id) &&
        (!v.requires || voucher(s, v.requires)),
    );
    if (next.length) voucherIds.push(pick(s, next).id);
  }
  s.tags = s.tags.filter((t) => !["coupon", "d6", "voucher"].includes(t));
  s.shop = {
    offers,
    packs,
    rerolls: 0,
    freeRerolls: count(s, "chaos"),
    rerollBase: dice
      ? 0
      : Math.max(
          0,
          5 -
            (voucher(s, "rerollSurplus") ? 2 : 0) -
            (voucher(s, "rerollGlut") ? 2 : 0),
        ),
    voucherIds,
  };
  note(s, "商店开门。补强构筑，准备下一个盲注。");
}
export function rerollPrice(s: RunState) {
  return s.shop?.freeRerolls
    ? 0
    : (s.shop?.rerollBase ?? 5) + (s.shop?.rerolls ?? 0);
}

function openPack(s: RunState, p: PackOffer, returnPhase: "blind" | "shop") {
  const special = p.kind === "buffoon" || p.kind === "spectral",
    n = p.size === "normal" ? (special ? 2 : 3) : special ? 4 : 5;
  const choices: Offer[] = [];
  for (let i = 0; i < n; i++) {
    if (p.kind === "buffoon") {
      const j = makeJoker(
        s,
        undefined,
        undefined,
        choices.flatMap((o) => (o.kind === "joker" ? [o.joker.id] : [])),
        true,
      );
      choices.push({
        uid: uid(s, "o"),
        kind: "joker",
        joker: j,
        price: 0,
        sold: false,
      });
    } else if (p.kind === "standard") {
      const card = makeCard(s);
      if (random(s) < 0.4) card.enhancement = enhanced(s);
      card.edition = randomEdition(s, false, 2);
      if (random(s) < 0.2)
        card.seal = pick(s, ["red", "blue", "purple", "gold"] as Seal[]);
      choices.push({
        uid: uid(s, "o"),
        kind: "card",
        card,
        price: 0,
        sold: false,
      });
    } else {
      let kind: Consumable["kind"] =
        p.kind === "celestial"
          ? "planet"
          : p.kind === "arcana"
            ? "tarot"
            : "spectral";
      let id: string | undefined;
      if (p.kind === "arcana" && voucher(s, "omen") && random(s) < 0.2)
        kind = "spectral";
      if ((p.kind === "arcana" || p.kind === "spectral") && random(s) < 0.003) {
        kind = "spectral";
        id = "soul";
      } else if (
        (p.kind === "celestial" || p.kind === "spectral") &&
        random(s) < 0.003
      ) {
        kind = "spectral";
        id = "blackhole";
      }
      if (kind === "planet" && i === 0 && voucher(s, "telescope"))
        id = HAND_IDS.reduce(
          (best, h) => (s.handUses[h] > s.handUses[best] ? h : best),
          "high",
        );
      const item = makeConsumable(
        s,
        kind,
        id,
        choices.flatMap((o) => ("item" in o ? [o.item.id] : [])),
      );
      choices.push({ uid: uid(s, "o"), kind, item, price: 0, sold: false });
    }
  }
  s.pack = {
    kind: p.kind,
    choices,
    picks: p.size === "mega" ? 2 : 1,
    returnPhase,
  };
  s.phase = "pack";
  s.selected = [];
  if (p.kind === "arcana" || p.kind === "spectral") {
    s.hand = shuffle(
      s,
      s.deck.map((c) => c.uid),
    ).slice(0, handSize(s));
    sortHand(s);
  }
  for (const e of effects(s))
    if (e.id === "hallucination" && chance(s, 1, 2)) addConsumable(s, "tarot");
}
function closePack(s: RunState, skipped = false) {
  const returnPhase = s.pack!.returnPhase;
  if (skipped)
    for (const j of s.jokers)
      if (j.id === "red" && jokerActive(s, j)) j.value += 3;
  s.pack = null;
  s.hand = [];
  s.selected = [];
  s.phase = returnPhase;
  const queued = s.tags.find((t) => t.startsWith("pack:"));
  if (queued) {
    s.tags.splice(s.tags.indexOf(queued), 1);
    openPack(
      s,
      packOffer(
        s,
        queued.slice(5) as PackKind,
        queued === "pack:spectral" ? "normal" : "mega",
      ),
      returnPhase,
    );
  }
}
function applyTag(s: RunState, id: string) {
  const packTags: Record<string, PackKind> = {
    buffoon: "buffoon",
    charm: "arcana",
    meteor: "celestial",
    ethereal: "spectral",
    standard: "standard",
  };
  if (packTags[id]) {
    s.tags.push(`pack:${packTags[id]}`);
    return;
  }
  if (id === "boss") {
    s.boss = getBoss(s, true);
    return;
  }
  if (id === "economy") {
    grant(s, Math.min(40, Math.max(0, s.money)), "经济标签");
    return;
  }
  if (id === "garbage") {
    grant(s, s.unusedDiscards, "垃圾标签");
    return;
  }
  if (id === "handy") {
    grant(s, s.totalHands, "便捷标签");
    return;
  }
  if (id === "speed") {
    grant(s, 5 * s.skipped, "速度标签");
    return;
  }
  if (id === "juggle") {
    s.juggle += 3;
    return;
  }
  if (id === "orbital") {
    const hand = pick(s, HAND_IDS.slice(0, 9));
    upgrade(s, hand, 3);
    note(s, `轨道标签：${HANDS[hand].name} +3 级。`);
    return;
  }
  if (id === "topup") {
    for (let i = 0; i < 2 && s.jokers.length < jokerSlots(s); i++)
      addJoker(s, makeJoker(s, undefined, 1));
    return;
  }
  s.tags.push(id);
}

export function useReason(s: RunState, item: Consumable): string | null {
  if (!["blind", "playing", "shop", "pack"].includes(s.phase))
    return "当前无法使用消耗牌。";
  if (item.kind === "planet") return null;
  const meta = (item.kind === "tarot" ? TAROT_MAP : SPECTRAL_MAP)[item.id];
  if (!meta) return "未知的消耗牌。";
  if (
    meta.min > 0 &&
    (s.selected.length < meta.min || s.selected.length > meta.max)
  )
    return `需选 ${meta.min === meta.max ? meta.min : `${meta.min}–${meta.max}`} 张手牌。`;
  if (
    ["familiar", "grim", "incantation", "sigil", "ouija"].includes(item.id) &&
    !s.hand.length
  )
    return "需要手牌。";
  if (item.id === "immolate" && s.hand.length < 5) return "至少需要 5 张手牌。";
  if (item.id === "fool" && !s.lastConsumable)
    return "本局尚未使用过塔罗或星球牌。";
  if (
    ["wheel", "ectoplasm", "hex", "ankh"].includes(item.id) &&
    !s.jokers.length
  )
    return "需要持有小丑牌。";
  if (
    ["wheel", "ectoplasm", "hex"].includes(item.id) &&
    !s.jokers.some((j) => j.edition === "base")
  )
    return "需要普通版本的小丑。";
  if (
    ["judgement", "wraith", "soul"].includes(item.id) &&
    s.jokers.length >= jokerSlots(s)
  )
    return "没有空的小丑槽位。";
  const consumesSlot =
    s.consumables.some((c) => c.uid === item.uid) && !item.negative;
  if (
    ["fool", "priestess", "emperor"].includes(item.id) &&
    s.consumables.length - (consumesSlot ? 1 : 0) >= consumableSlots(s)
  )
    return "没有空的消耗牌槽位。";
  return null;
}
function useConsumable(s: RunState, item: Consumable) {
  const reason = useReason(s, item);
  if (reason) throw new Error(reason);
  s.consumables = s.consumables.filter((c) => c.uid !== item.uid);
  const chosen = s.hand
    .filter((id) => s.selected.includes(id))
    .map((id) => s.deck.find((c) => c.uid === id)!);
  discover(s, `${item.kind}:${item.id}`);
  if (item.kind === "planet") {
    const id = item.id as HandId;
    upgrade(s, id);
    if (!s.planetsUsed.includes(id)) s.planetsUsed.push(id);
    for (const j of s.jokers)
      if (j.id === "constellation" && jokerActive(s, j)) j.value += 0.1;
    s.lastConsumable = { id, kind: "planet" };
    note(s, `${HANDS[id].planet}：${HANDS[id].name}升至 ${s.levels[id]} 级。`);
    return;
  }
  const id = item.id;
  if (item.kind === "tarot") {
    s.tarotUsed++;
    const enhancement: Record<string, Enhancement> = {
      magician: "lucky",
      empress: "mult",
      hierophant: "bonus",
      lovers: "wild",
      chariot: "steel",
      justice: "glass",
      devil: "gold",
      tower: "stone",
    };
    if (enhancement[id])
      chosen.forEach((c) => (c.enhancement = enhancement[id]));
    const suits: Record<string, Suit> = {
      star: "diamonds",
      moon: "clubs",
      sun: "hearts",
      world: "spades",
    };
    if (suits[id]) {
      chosen.forEach((c) => (c.suit = suits[id]));
      sortHand(s);
    }
    if (id === "fool" && s.lastConsumable)
      addConsumable(s, s.lastConsumable.kind, s.lastConsumable.id);
    if (id === "priestess")
      for (let i = 0; i < 2; i++) addConsumable(s, "planet");
    if (id === "emperor") for (let i = 0; i < 2; i++) addConsumable(s, "tarot");
    if (id === "hermit") grant(s, Math.min(20, Math.max(0, s.money)), "隐者");
    if (id === "temperance")
      grant(
        s,
        Math.min(
          50,
          s.jokers.reduce((n, j) => n + sellJokerValue(j), 0),
        ),
        "节制",
      );
    if (id === "wheel") {
      if (chance(s, 1, 4)) {
        pick(
          s,
          s.jokers.filter((j) => j.edition === "base"),
        ).edition = pick(s, [
          "foil",
          "foil",
          "holo",
          "holo",
          "poly",
        ] as Edition[]);
        note(s, "命运之轮命中！获得特殊版本。");
      } else note(s, "命运之轮：这次没有命中。");
    }
    if (id === "strength") {
      chosen.forEach((c) => (c.rank = c.rank === 14 ? 2 : c.rank + 1));
      sortHand(s);
    }
    if (id === "hanged")
      destroyCards(
        s,
        chosen.map((c) => c.uid),
      );
    if (id === "death") {
      const own = chosen[0].uid;
      Object.assign(chosen[0], structuredClone(chosen[1]), { uid: own });
      sortHand(s);
    }
    if (id === "judgement") addJoker(s, makeJoker(s));
    if (id !== "fool") s.lastConsumable = { id, kind: "tarot" };
  } else {
    if (["familiar", "grim", "incantation"].includes(id)) {
      destroyCards(s, [pick(s, s.hand)]);
      for (
        let i = 0;
        i < (id === "familiar" ? 3 : id === "grim" ? 2 : 4);
        i++
      ) {
        const c = makeCard(
          s,
          id === "familiar"
            ? pick(s, [11, 12, 13])
            : id === "grim"
              ? 14
              : 2 + Math.floor(random(s) * 9),
        );
        c.enhancement = enhanced(s);
        permanentAdd(s, c, true);
      }
      sortHand(s);
    }
    const seals: Record<string, Seal> = {
      talisman: "gold",
      deja: "red",
      trance: "blue",
      medium: "purple",
    };
    if (seals[id]) chosen[0].seal = seals[id];
    if (id === "aura")
      chosen[0].edition = pick(s, [
        "foil",
        "foil",
        "holo",
        "holo",
        "poly",
      ] as Edition[]);
    if (id === "wraith") {
      addJoker(s, makeJoker(s, undefined, 3));
      s.money = 0;
    }
    if (id === "sigil") {
      const suit = pick(s, SUITS);
      s.deck
        .filter((c) => s.hand.includes(c.uid))
        .forEach((c) => (c.suit = suit));
      sortHand(s);
    }
    if (id === "ouija") {
      const rank = 2 + Math.floor(random(s) * 13);
      s.deck
        .filter((c) => s.hand.includes(c.uid))
        .forEach((c) => (c.rank = rank));
      s.handSizeMod--;
      sortHand(s);
    }
    if (id === "ectoplasm") {
      pick(
        s,
        s.jokers.filter((j) => j.edition === "base"),
      ).edition = "negative";
      s.ectoplasms++;
      s.handSizeMod -= s.ectoplasms;
    }
    if (id === "immolate") {
      destroyCards(s, shuffle(s, s.hand).slice(0, 5));
      grant(s, 20, "献祭");
    }
    if (id === "ankh") {
      const source = pick(s, s.jokers),
        duplicate = {
          ...structuredClone(source),
          uid: uid(s, "j"),
          edition:
            source.edition === "negative" ? ("base" as const) : source.edition,
        };
      s.jokers = s.jokers.filter((j) => j.uid === source.uid || j.eternal);
      addJoker(s, duplicate);
    }
    if (id === "hex") {
      const source = pick(
        s,
        s.jokers.filter((j) => j.edition === "base"),
      );
      source.edition = "poly";
      s.jokers = s.jokers.filter((j) => j.uid === source.uid || j.eternal);
    }
    if (id === "cryptid") {
      for (let i = 0; i < 2; i++)
        permanentAdd(
          s,
          { ...structuredClone(chosen[0]), uid: uid(s, "c") },
          true,
        );
      sortHand(s);
    }
    if (id === "soul") addJoker(s, makeJoker(s, undefined, 4));
    if (id === "blackhole") HAND_IDS.forEach((hand) => upgrade(s, hand));
  }
  if (id !== "wheel")
    note(
      s,
      `使用了${(item.kind === "tarot" ? TAROT_MAP : SPECTRAL_MAP)[id].name}。`,
    );
  if (s.phase === "playing" && ["hanged", "immolate"].includes(id)) {
    draw(s, Math.max(0, handSize(s) - s.hand.length));
    if (!s.hand.length) {
      s.phase = "lost";
      s.forcedCard = null;
      note(s, "没有可用的卡牌，这一局结束。");
    } else if (bossIs(s, "bell") && !s.forcedCard)
      s.forcedCard = pick(s, s.hand);
  }
  s.selected =
    s.forcedCard && s.hand.includes(s.forcedCard) ? [s.forcedCard] : [];
}

export function offerReason(
  s: RunState,
  o: Offer,
  pack = false,
): string | null {
  if (o.sold) return "已售出";
  if (!pack && !canAfford(s, offerPrice(s, o))) return "资金不足";
  if (
    o.kind === "joker" &&
    s.jokers.length >= jokerSlots(s) + (o.joker.edition === "negative" ? 1 : 0)
  )
    return "小丑槽位已满";
  if ("item" in o) {
    if (pack) return useReason(s, o.item);
    if (s.consumables.length >= consumableSlots(s)) return "消耗牌槽位已满";
  }
  return null;
}
function buyOffer(s: RunState, o: Offer, pack = false) {
  const reason = offerReason(s, o, pack);
  if (reason) throw new Error(reason);
  if (!pack) s.money -= offerPrice(s, o);
  if (o.kind === "joker") addJoker(s, o.joker);
  else if (o.kind === "card") permanentAdd(s, o.card);
  else if (pack) useConsumable(s, o.item);
  else {
    s.consumables.push(o.item);
    discover(s, `${o.kind}:${o.item.id}`);
  }
  o.sold = true;
}
function afterSale(s: RunState) {
  for (const j of s.jokers)
    if (j.id === "campfire" && jokerActive(s, j)) j.value += 0.25;
  if (bossIs(s, "leaf")) s.bossDisabled = true;
}

export function runAction(previous: RunState, action: RunAction): RunState {
  const s = copy(previous);
  switch (action.type) {
    case "select": {
      if (
        !["playing", "pack"].includes(s.phase) ||
        !s.hand.includes(action.uid)
      )
        throw new Error("当前不能选择这张牌。");
      if (action.uid === s.forcedCard) return previous;
      if (s.selected.includes(action.uid))
        s.selected = s.selected.filter((id) => id !== action.uid);
      else {
        if (s.selected.length >= 5) throw new Error("一次最多选择 5 张牌。");
        s.selected.push(action.uid);
      }
      break;
    }
    case "sort":
      s.handSort = action.by;
      sortHand(s);
      break;
    case "moveCard": {
      const index = s.hand.indexOf(action.uid),
        target = index + action.direction;
      if (index >= 0 && target >= 0 && target < s.hand.length)
        [s.hand[index], s.hand[target]] = [s.hand[target], s.hand[index]];
      break;
    }
    case "moveJoker": {
      const index = s.jokers.findIndex((j) => j.uid === action.uid),
        target = index + action.direction;
      if (index >= 0 && target >= 0 && target < s.jokers.length)
        [s.jokers[index], s.jokers[target]] = [
          s.jokers[target],
          s.jokers[index],
        ];
      break;
    }
    case "startBlind":
      if (s.phase !== "blind") throw new Error("请先结束当前关卡。");
      selectBlind(s);
      break;
    case "skipBlind": {
      if (s.phase !== "blind" || s.blind === 2)
        throw new Error("Boss 盲注不能跳过。");
      const tag = s.skipTags[s.blind];
      s.skipped++;
      const copies =
        tag === "double" ? 1 : 1 + s.tags.filter((t) => t === "double").length;
      if (tag !== "double") s.tags = s.tags.filter((t) => t !== "double");
      nextBlind(s);
      for (let i = 0; i < copies; i++) applyTag(s, tag);
      note(s, `获得${TAG_MAP[tag].name}${copies > 1 ? ` ×${copies}` : ""}。`);
      const queued = s.tags.find((t) => t.startsWith("pack:"));
      if (queued) {
        s.tags.splice(s.tags.indexOf(queued), 1);
        openPack(
          s,
          packOffer(
            s,
            queued.slice(5) as PackKind,
            queued === "pack:spectral" ? "normal" : "mega",
          ),
          "blind",
        );
      }
      break;
    }
    case "play":
      if (s.phase !== "playing" || s.handsLeft <= 0)
        throw new Error("当前不能出牌。");
      play(s);
      break;
    case "discard": {
      if (s.phase !== "playing" || s.discardsLeft <= 0 || !s.selected.length)
        throw new Error("需要选牌并有剩余弃牌次数。");
      const cards = s.hand
        .filter((id) => s.selected.includes(id))
        .map((id) => s.deck.find((c) => c.uid === id)!);
      onDiscard(s, cards);
      s.discardsUsed++;
      s.discardsLeft--;
      s.selected = [];
      draw(
        s,
        bossIs(s, "serpent") ? 3 : Math.max(0, handSize(s) - s.hand.length),
        "discard",
      );
      updateBossSelection(s);
      note(s, `弃掉 ${cards.length} 张牌，剩余 ${s.discardsLeft} 次弃牌。`);
      if (!s.hand.length) {
        s.phase = "lost";
        s.forcedCard = null;
        note(s, "牌堆和手牌已用尽，这一局结束。");
      }
      break;
    }
    case "cashout":
      if (s.phase !== "cashout" || !s.payout)
        throw new Error("当前没有可领取的奖励。");
      s.money += s.payout.total;
      if (s.won && !s.endless && s.ante === 8 && s.blind === 2) s.phase = "won";
      else enterShop(s);
      break;
    case "endless":
      if (s.phase !== "won") throw new Error("请先通关第 8 底注。");
      s.endless = true;
      enterShop(s);
      break;
    case "leaveShop":
      if (s.phase !== "shop") throw new Error("当前不在商店。");
      for (const e of effects(s))
        if (e.id === "perkeo" && s.consumables.length) {
          const item = pick(s, s.consumables);
          addConsumable(s, item.kind, item.id, true);
        }
      nextBlind(s);
      break;
    case "reroll": {
      if (s.phase !== "shop" || !s.shop) throw new Error("当前不在商店。");
      const price = rerollPrice(s);
      if (!canAfford(s, price)) throw new Error("资金不足以刷新商店。");
      s.money -= price;
      if (s.shop.freeRerolls) s.shop.freeRerolls--;
      else s.shop.rerolls++;
      s.shop.offers = generateOffers(s);
      for (const j of s.jokers)
        if (j.id === "flash" && jokerActive(s, j)) j.value += 2;
      note(s, "商店货架已刷新。");
      break;
    }
    case "buy": {
      if (s.phase !== "shop" || !s.shop) throw new Error("当前不能购买。");
      const o = s.shop.offers.find((o) => o.uid === action.uid);
      if (!o) throw new Error("商品已不存在。");
      buyOffer(s, o);
      note(s, "购买成功。");
      break;
    }
    case "voucher": {
      if (
        s.phase !== "shop" ||
        !s.shop?.voucherIds.includes(action.id) ||
        s.vouchers.includes(action.id)
      )
        throw new Error("这张优惠券不可购买。");
      const price = cost(s, 10);
      if (!canAfford(s, price)) throw new Error("购买优惠券需要更多资金。");
      s.money -= price;
      s.vouchers.push(action.id);
      s.shop.voucherIds = s.shop.voucherIds.filter((id) => id !== action.id);
      if (action.id === s.voucher) s.voucherBought = true;
      if (action.id === "hieroglyph") {
        s.ante--;
        s.handsMod--;
      }
      if (action.id === "petroglyph") {
        s.ante--;
        s.discardsMod--;
      }
      if (["overstock", "overstockPlus"].includes(action.id))
        s.shop.offers.push(shopOffer(s));
      if (["rerollSurplus", "rerollGlut"].includes(action.id))
        s.shop.rerollBase = Math.max(0, s.shop.rerollBase - 2);
      if (["clearance", "liquidation"].includes(action.id)) {
        const ratio = action.id === "clearance" ? 0.75 : 2 / 3;
        s.shop.offers.forEach((o) => {
          if (o.price) o.price = Math.max(1, Math.floor(o.price * ratio));
        });
        s.shop.packs.forEach((p) => {
          if (p.price) p.price = Math.max(1, Math.floor(p.price * ratio));
        });
      }
      discover(s, `voucher:${action.id}`);
      note(s, `兑换了${VOUCHER_MAP[action.id].name}。`);
      break;
    }
    case "openPack": {
      if (s.phase !== "shop" || !s.shop) throw new Error("当前不能打开卡包。");
      const p = s.shop.packs.find((p) => p.uid === action.uid);
      if (!p || p.sold) throw new Error("卡包已经打开。");
      const price = packPrice(s, p);
      if (!canAfford(s, price)) throw new Error("资金不足。");
      s.money -= price;
      p.sold = true;
      openPack(s, p, "shop");
      break;
    }
    case "pickPack": {
      if (s.phase !== "pack" || !s.pack)
        throw new Error("当前没有打开的卡包。");
      const o = s.pack.choices.find((o) => o.uid === action.uid);
      if (!o) throw new Error("卡牌不存在。");
      buyOffer(s, o, true);
      s.pack.picks--;
      if (s.pack.picks <= 0 || s.pack.choices.every((o) => o.sold))
        closePack(s);
      break;
    }
    case "skipPack":
      if (s.phase !== "pack" || !s.pack)
        throw new Error("当前没有打开的卡包。");
      closePack(s, true);
      break;
    case "use": {
      const c = s.consumables.find((c) => c.uid === action.uid);
      if (!c) throw new Error("消耗牌已不存在。");
      useConsumable(s, c);
      break;
    }
    case "sellJoker": {
      if (!["blind", "playing", "shop", "pack"].includes(s.phase))
        throw new Error("此时不能出售小丑。");
      const j = s.jokers.find((j) => j.uid === action.uid);
      if (!j || j.eternal) throw new Error("永恒小丑不能出售。");
      const saleEffect = effects(s).find((e) => e.physical.uid === j.uid)?.id;
      s.money += sellJokerValue(j);
      s.jokers = s.jokers.filter((o) => o.uid !== j.uid);
      afterSale(s);
      if (saleEffect === "luchador" && s.blind === 2 && s.phase === "playing") {
        s.bossDisabled = true;
        s.target = blindTarget(s);
        if (s.boss === "water" && !has(s, "burglar"))
          s.discardsLeft = Math.max(
            s.discardsLeft,
            startingDiscards(s) - s.discardsUsed,
          );
        if (s.boss === "needle") s.handsLeft += startingHands(s) - 1;
        s.deck.forEach((c) => (c.faceDown = false));
        if (s.boss === "manacle")
          draw(s, Math.max(0, handSize(s) - s.hand.length));
        s.forcedCard = null;
        s.disabledJoker = null;
        if (s.score >= s.target) finishRound(s);
      }
      if (saleEffect === "cola") s.tags.push("double");
      if (j.id === "invisible" && j.counter >= 2 && s.jokers.length) {
        const target = pick(s, s.jokers),
          duplicate = {
            ...structuredClone(target),
            uid: uid(s, "j"),
            edition:
              target.edition === "negative"
                ? ("base" as const)
                : target.edition,
          };
        addJoker(s, duplicate);
      }
      note(s, `售出${JOKERS[j.id].name}，获得 $${sellJokerValue(j)}。`);
      break;
    }
    case "sellConsumable": {
      if (!["blind", "playing", "shop", "pack"].includes(s.phase))
        throw new Error("此时不能出售。");
      const c = s.consumables.find((c) => c.uid === action.uid);
      if (!c) throw new Error("卡牌不存在。");
      s.money += sellConsumableValue(c);
      s.consumables = s.consumables.filter((item) => item.uid !== c.uid);
      for (const j of s.jokers)
        if (j.id === "campfire" && jokerActive(s, j)) j.value += 0.25;
      break;
    }
    case "rerollBoss": {
      if (
        s.phase !== "blind" ||
        !voucher(s, "director") ||
        (!voucher(s, "retcon") && s.bossRerolls > 0)
      )
        throw new Error("需要导演剪辑，且本底注仍有重抽次数。");
      if (!canAfford(s, 10)) throw new Error("重抽 Boss 需要 $10。");
      s.money -= 10;
      s.boss = getBoss(s, true);
      s.bossRerolls++;
      s.target = blindTarget(s);
      note(s, `新的 Boss：${BOSS_MAP[s.boss].name}。`);
      break;
    }
  }
  return s;
}

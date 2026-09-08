import {
  blindAmounts,
  DEFAULT_CONFIG,
  JOKERS,
  JOKER_IDS,
  MODE_META,
  RAINBOW_PERCENT,
  SHOP_PRICES,
  validateConfig,
  type Difficulty,
  type JokerId,
  type TableConfig,
} from "./modes";
export type { Difficulty } from "./modes";
export type Suit = "spades" | "hearts" | "clubs" | "diamonds";
export type Card = { rank: number; suit: Suit };
export type Street =
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown"
  | "shop";
export type Action =
  | { type: "fold" | "check" | "call" | "allin" }
  | { type: "raise"; amount: number };
export type ShopAction =
  | { type: "buy" | "sell"; jokerId: JokerId }
  | { type: "refresh" | "ready" };
export interface BonusEvent {
  playerId: number;
  source: JokerId | "rainbow" | "bounty-tax";
  label: string;
  amount: number;
}
export interface ShopState {
  offers: JokerId[];
}

export interface Player {
  id: number;
  name: string;
  stack: number;
  cards: Card[];
  bet: number;
  contributed: number;
  folded: boolean;
  allIn: boolean;
  eliminated: boolean;
  lastAction: string;
  occupied: boolean;
  jokers: JokerId[];
  coins: number;
  ready: boolean;
}

export interface HandRank {
  category: number;
  values: number[];
  name: string;
  cards: Card[];
}

export interface PotResult {
  amount: number;
  winners: number[];
  refund: boolean;
}

export interface HandResult {
  winners: number[];
  payouts: Record<number, number>;
  ranks: Record<number, HandRank>;
  pots: PotResult[];
  totalPot: number;
  uncontested: boolean;
}

export interface GameState {
  config: TableConfig;
  blinds: { small: number; big: number };
  bonuses: BonusEvent[];
  issuedChips: number;
  shop: ShopState | null;
  session: string;
  handNumber: number;
  players: Player[];
  deck: Card[];
  community: Card[];
  street: Street;
  dealer: number;
  smallBlind: number;
  bigBlind: number;
  currentBet: number;
  minRaise: number;
  actor: number | null;
  pending: number[];
  lastFacedBet: (number | null)[];
  logs: {
    id: number;
    hand: number;
    text: string;
    kind: "action" | "street" | "win" | "bonus" | "shop";
  }[];
  result: HandResult | null;
  startingStacks: number[];
}

export const SMALL_BLIND = 10;
export const BIG_BLIND = 20;
export const BUY_IN = 2000;
export const SUITS: Suit[] = ["spades", "hearts", "clubs", "diamonds"];
export const SUIT_SYMBOL: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  clubs: "♣",
  diamonds: "♦",
};
export const STREET_NAME: Record<Street, string> = {
  preflop: "翻牌前",
  flop: "翻牌",
  turn: "转牌",
  river: "河牌",
  showdown: "摊牌",
  shop: "小丑商店",
};
export const HAND_NAMES = [
  "高牌",
  "一对",
  "两对",
  "三条",
  "顺子",
  "同花",
  "葫芦",
  "四条",
  "同花顺",
];
export const rankLabel = (rank: number) =>
  ({ 11: "J", 12: "Q", 13: "K", 14: "A" })[rank] ?? String(rank);
export const cardId = (card: Card) => `${card.suit}-${card.rank}`;
export const money = (value: number) => value.toLocaleString("en-US");
export const potTotal = (state: GameState) =>
  state.players.reduce((sum, player) => sum + player.contributed, 0);

export function makeDeck(): Card[] {
  return SUITS.flatMap((suit) =>
    Array.from({ length: 13 }, (_, i) => ({ rank: i + 2, suit })),
  );
}

export function shuffle<T>(items: T[], random = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function straightHigh(ranks: number[]): number {
  const unique = [...new Set(ranks)].sort((a, b) => b - a);
  if (unique.includes(14)) unique.push(1);
  for (let i = 0; i <= unique.length - 5; i++) {
    if (unique[i] - unique[i + 4] === 4) return unique[i];
  }
  return 0;
}

/** Evaluates the best five cards directly, including two-trip full houses and A-2-3-4-5. */
export function evaluate(cards: Card[]): HandRank {
  if (cards.length < 5 || cards.length > 7)
    throw new Error("牌型判断需要 5–7 张牌");
  const sorted = [...cards].sort((a, b) => b.rank - a.rank);
  const groups = new Map<number, Card[]>();
  for (const card of sorted)
    groups.set(card.rank, [...(groups.get(card.rank) ?? []), card]);
  const entries = [...groups.entries()].sort(
    (a, b) => b[1].length - a[1].length || b[0] - a[0],
  );
  const flush = SUITS.map((suit) => sorted.filter((c) => c.suit === suit)).find(
    (group) => group.length >= 5,
  );
  const takeStraight = (source: Card[], high: number) =>
    Array.from(
      { length: 5 },
      (_, i) =>
        source.find((c) => c.rank === (high - i === 1 ? 14 : high - i))!,
    );
  const make = (
    category: number,
    values: number[],
    selected: Card[],
  ): HandRank => ({
    category,
    values,
    name:
      category === 8 && values[0] === 14 ? "皇家同花顺" : HAND_NAMES[category],
    cards: selected,
  });
  if (flush) {
    const high = straightHigh(flush.map((c) => c.rank));
    if (high) return make(8, [high], takeStraight(flush, high));
  }
  const four = entries.find(([, group]) => group.length === 4);
  if (four) {
    const kicker = sorted.find((c) => c.rank !== four[0])!;
    return make(7, [four[0], kicker.rank], [...four[1], kicker]);
  }
  const trips = entries.filter(([, group]) => group.length >= 3);
  if (trips.length) {
    const pair = entries
      .filter(([rank, group]) => rank !== trips[0][0] && group.length >= 2)
      .sort((a, b) => b[0] - a[0])[0];
    if (pair)
      return make(
        6,
        [trips[0][0], pair[0]],
        [...trips[0][1].slice(0, 3), ...pair[1].slice(0, 2)],
      );
  }
  if (flush)
    return make(
      5,
      flush.slice(0, 5).map((c) => c.rank),
      flush.slice(0, 5),
    );
  const straight = straightHigh(sorted.map((c) => c.rank));
  if (straight) return make(4, [straight], takeStraight(sorted, straight));
  if (trips.length) {
    const kickers = sorted.filter((c) => c.rank !== trips[0][0]).slice(0, 2);
    return make(
      3,
      [trips[0][0], ...kickers.map((c) => c.rank)],
      [...trips[0][1], ...kickers],
    );
  }
  const pairs = entries
    .filter(([, group]) => group.length === 2)
    .sort((a, b) => b[0] - a[0]);
  if (pairs.length >= 2) {
    const kicker = sorted.find(
      (c) => c.rank !== pairs[0][0] && c.rank !== pairs[1][0],
    )!;
    return make(
      2,
      [pairs[0][0], pairs[1][0], kicker.rank],
      [...pairs[0][1], ...pairs[1][1], kicker],
    );
  }
  if (pairs.length) {
    const kickers = sorted.filter((c) => c.rank !== pairs[0][0]).slice(0, 3);
    return make(
      1,
      [pairs[0][0], ...kickers.map((c) => c.rank)],
      [...pairs[0][1], ...kickers],
    );
  }
  return make(
    0,
    sorted.slice(0, 5).map((c) => c.rank),
    sorted.slice(0, 5),
  );
}

export function compareRanks(a: HandRank, b: HandRank): number {
  if (a.category !== b.category) return a.category - b.category;
  for (let i = 0; i < a.values.length; i++) {
    const difference = a.values[i] - b.values[i];
    if (difference) return difference;
  }
  return 0;
}

function log(
  state: GameState,
  text: string,
  kind: GameState["logs"][number]["kind"] = "action",
) {
  const id = (state.logs.at(-1)?.id ?? 0) + 1;
  state.logs = [
    ...state.logs.slice(-79),
    { id, hand: state.handNumber, text, kind },
  ];
}

function nextSeat(
  state: GameState,
  after: number,
  predicate: (p: Player) => boolean,
): number {
  for (let step = 1; step <= state.players.length; step++) {
    const seat = (after + step) % state.players.length;
    if (predicate(state.players[seat])) return seat;
  }
  return -1;
}

const canAct = (p: Player) => !p.folded && !p.allIn && !p.eliminated;
const inHand = (p: Player) => !p.folded && !p.eliminated;

function pay(player: Player, amount: number) {
  const paid = Math.min(amount, player.stack);
  player.stack -= paid;
  player.bet += paid;
  player.contributed += paid;
  player.allIn = player.stack === 0;
}

function selectActor(state: GameState, after: number) {
  state.pending = state.pending.filter((id) => canAct(state.players[id]));
  const able = state.players.filter(canAct);
  // No betting into an empty side pot: a lone player may only respond to an outstanding bet.
  if (able.length === 1 && able[0].bet >= state.currentBet) state.pending = [];
  const id = nextSeat(state, after, (p) => state.pending.includes(p.id));
  state.actor = id === -1 ? null : id;
}

export function createGame(
  random = Math.random,
  options: Partial<TableConfig> & {
    name?: string;
    activeSeats?: number[];
  } = {},
): GameState {
  const config = validateConfig({ ...DEFAULT_CONFIG, ...options });
  const starterJokers = shuffle(JOKER_IDS, random);
  const players = [
    options.name?.trim() || "你",
    "红桃先生",
    "幸运阿七",
    "黑桃杰克",
    "月光兔",
    "翡翠先生",
  ]
    .slice(0, config.seats)
    .map(
      (name, id): Player => ({
        id,
        name,
        stack:
          !options.activeSeats || options.activeSeats.includes(id)
            ? MODE_META[config.mode].buyIn
            : 0,
        cards: [],
        bet: 0,
        contributed: 0,
        folded: false,
        allIn: false,
        eliminated: false,
        lastAction: "",
        occupied: !options.activeSeats || options.activeSeats.includes(id),
        jokers: config.mode === "jokers" ? [starterJokers[id]] : [],
        coins: config.mode === "jokers" ? 4 : 0,
        ready: false,
      }),
    );
  return startHand(
    {
      config,
      blinds: { small: SMALL_BLIND, big: BIG_BLIND },
      bonuses: [],
      issuedChips: 0,
      shop: null,
      session: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      handNumber: 0,
      players,
      deck: [],
      community: [],
      street: "preflop",
      dealer: 0,
      smallBlind: 2,
      bigBlind: 3,
      currentBet: 0,
      minRaise: BIG_BLIND,
      actor: null,
      pending: [],
      lastFacedBet: players.map(() => null),
      logs: [],
      result: null,
      startingStacks: players.map((p) => p.stack),
    },
    random,
  );
}

export function startHand(
  previous: GameState,
  random = Math.random,
): GameState {
  if (previous.handNumber > 0 && !previous.result)
    throw new Error("当前牌局尚未结束");
  if (
    previous.config.mode === "jokers" &&
    previous.handNumber > 0 &&
    (!previous.shop || previous.players.some((p) => p.stack > 0 && !p.ready))
  )
    throw new Error("请先在小丑商店准备，再开始下一手。");
  if (previous.players.filter((p) => p.stack > 0).length < 2) return previous;
  const state: GameState = structuredClone(previous);
  state.handNumber++;
  state.blinds = blindAmounts(state.config.mode, state.handNumber);
  state.bonuses = [];
  state.shop = null;
  state.deck = shuffle(makeDeck(), random);
  state.community = [];
  state.street = "preflop";
  state.result = null;
  state.currentBet = state.blinds.big;
  state.minRaise = state.blinds.big;
  state.lastFacedBet = state.players.map(() => null);
  state.startingStacks = state.players.map((p) => p.stack);
  for (const p of state.players) {
    p.cards = [];
    p.bet = p.contributed = 0;
    p.folded = p.eliminated = p.stack === 0;
    p.allIn = false;
    p.ready = false;
    p.lastAction = p.eliminated ? "已离桌" : "";
    if (!p.eliminated && state.config.mode === "jokers")
      for (const joker of p.jokers)
        if (joker === "coin")
          grantBonus(
            state,
            p.id,
            "coin",
            "富翁 · 发牌补贴",
            state.blinds.small * 5,
          );
  }
  const seated = (p: Player) => !p.eliminated;
  state.dealer = nextSeat(state, state.dealer, seated);
  const headsUp = state.players.filter(seated).length === 2;
  state.smallBlind = headsUp
    ? state.dealer
    : nextSeat(state, state.dealer, seated);
  state.bigBlind = nextSeat(state, state.smallBlind, seated);
  for (let round = 0; round < 2; round++) {
    let seat = state.dealer;
    for (let count = 0; count < state.players.filter(seated).length; count++) {
      seat = nextSeat(state, seat, seated);
      state.players[seat].cards.push(state.deck.pop()!);
    }
  }
  pay(state.players[state.smallBlind], state.blinds.small);
  pay(state.players[state.bigBlind], state.blinds.big);
  state.players[state.smallBlind].lastAction =
    `小盲 $${state.players[state.smallBlind].bet}`;
  state.players[state.bigBlind].lastAction =
    `大盲 $${state.players[state.bigBlind].bet}`;
  state.pending = state.players.filter(canAct).map((p) => p.id);
  selectActor(state, state.bigBlind);
  log(
    state,
    `第 ${state.handNumber} 手 · 盲注 $${money(state.blinds.small)} / $${money(state.blinds.big)}`,
    "street",
  );
  return state;
}

export function legalActions(state: GameState, playerId = state.actor ?? 0) {
  const player = state.players[playerId];
  const toCall = Math.max(0, state.currentBet - player.bet);
  const maxRaise = player.bet + player.stack;
  const faced = state.lastFacedBet[playerId];
  const hasRaiseRights =
    faced === null || state.currentBet - faced >= state.minRaise;
  const active = state.actor === playerId && !state.result && canAct(player);
  const canRaise =
    active &&
    hasRaiseRights &&
    maxRaise > state.currentBet &&
    state.players.filter(canAct).length > 1;
  return {
    active,
    toCall: Math.min(toCall, player.stack),
    canCheck: toCall === 0,
    canRaise,
    canAllIn: active && (maxRaise <= state.currentBet || canRaise),
    minRaise: Math.min(state.currentBet + state.minRaise, maxRaise),
    maxRaise,
  };
}

export function act(previous: GameState, action: Action): GameState {
  if (previous.actor === null || previous.result)
    throw new Error("现在不能行动");
  const legal = legalActions(previous);
  const state: GameState = structuredClone(previous);
  const id = state.actor!;
  const player = state.players[id];
  let resolved = action;
  if (action.type === "allin") {
    if (!legal.canAllIn) throw new Error("本轮加注尚未重新开放");
    resolved =
      legal.maxRaise > state.currentBet
        ? { type: "raise", amount: legal.maxRaise }
        : { type: "call" };
  }
  state.pending = state.pending.filter((seat) => seat !== id);
  switch (resolved.type) {
    case "fold":
      player.folded = true;
      player.lastAction = "弃牌";
      break;
    case "check":
      if (!legal.canCheck) throw new Error("需要先跟注");
      player.lastAction = "过牌";
      break;
    case "call":
      if (legal.canCheck) throw new Error("当前无需跟注，请过牌");
      pay(player, legal.toCall);
      player.lastAction = player.allIn
        ? `全押 $${money(player.bet)}`
        : `跟注 $${money(legal.toCall)}`;
      break;
    case "raise": {
      const amount = resolved.amount;
      if (
        !legal.canRaise ||
        !Number.isInteger(amount) ||
        amount < legal.minRaise ||
        amount > legal.maxRaise
      ) {
        throw new Error("加注金额不在允许范围内");
      }
      const increase = amount - state.currentBet;
      const wasBet = state.currentBet === 0;
      pay(player, amount - player.bet);
      if (increase >= state.minRaise) state.minRaise = increase;
      state.currentBet = amount;
      state.pending = state.players
        .filter(
          (p) =>
            canAct(p) &&
            p.id !== id &&
            (p.bet < state.currentBet || state.pending.includes(p.id)),
        )
        .map((p) => p.id);
      player.lastAction = player.allIn
        ? `全押 $${money(amount)}`
        : `${wasBet ? "下注" : "加注至"} $${money(amount)}`;
      break;
    }
  }
  state.lastFacedBet[id] = state.currentBet;
  log(state, `${player.name} · ${player.lastAction}`);
  if (state.players.filter(inHand).length === 1) return settle(state);
  selectActor(state, id);
  return state;
}

export function advanceStreet(previous: GameState): GameState {
  if (previous.actor !== null || previous.result) return previous;
  const state: GameState = structuredClone(previous);
  if (state.street === "river") return settle(state);
  const streets: Street[] = ["preflop", "flop", "turn", "river"];
  state.street = streets[streets.indexOf(state.street) + 1];
  state.deck.pop(); // Burn a card before each community-card deal.
  const count = state.street === "flop" ? 3 : 1;
  for (let i = 0; i < count; i++) state.community.push(state.deck.pop()!);
  for (const player of state.players) {
    player.bet = 0;
    if (!player.folded && !player.allIn) player.lastAction = "";
  }
  state.currentBet = 0;
  state.minRaise = state.blinds.big;
  state.lastFacedBet = state.players.map(() => null);
  state.pending = state.players.filter(canAct).map((p) => p.id);
  selectActor(state, state.dealer);
  log(
    state,
    `${STREET_NAME[state.street]} · ${state.community
      .slice(-count)
      .map((c) => `${SUIT_SYMBOL[c.suit]}${rankLabel(c.rank)}`)
      .join(" ")}`,
    "street",
  );
  return state;
}

/** Splits main/side pots separately; odd chips start left of the dealer. */
export function settle(previous: GameState): GameState {
  if (previous.result) return previous;
  const state: GameState = structuredClone(previous);
  const contenders = state.players.filter(inHand);
  const uncontested = contenders.length === 1;
  if (!uncontested && state.community.length !== 5)
    throw new Error("公共牌未发完");
  const ranks: Record<number, HandRank> = {};
  if (!uncontested)
    for (const player of contenders)
      ranks[player.id] = evaluate([...player.cards, ...state.community]);
  const payouts: Record<number, number> = Object.fromEntries(
    state.players.map((p) => [p.id, 0]),
  );
  const levels = [
    ...new Set(state.players.map((p) => p.contributed).filter((n) => n > 0)),
  ].sort((a, b) => a - b);
  const pots: PotResult[] = [];
  let last = 0;
  for (const level of levels) {
    const contributors = state.players.filter((p) => p.contributed >= level);
    const amount = (level - last) * contributors.length;
    last = level;
    if (contributors.length === 1) {
      payouts[contributors[0].id] += amount;
      pots.push({ amount, winners: [contributors[0].id], refund: true });
      continue;
    }
    const eligible = contenders.filter((p) => p.contributed >= level);
    if (!eligible.length) throw new Error("底池没有有效争夺者");
    let winners = [eligible[0].id];
    for (const player of eligible.slice(1)) {
      const comparison = uncontested
        ? 0
        : compareRanks(ranks[player.id], ranks[winners[0]]);
      if (comparison > 0) winners = [player.id];
      else if (comparison === 0) winners.push(player.id);
    }
    winners.sort(
      (a, b) =>
        ((a - state.dealer + state.players.length - 1) % state.players.length) -
        ((b - state.dealer + state.players.length - 1) % state.players.length),
    );
    const split = Math.floor(amount / winners.length);
    const remainder = amount % winners.length;
    winners.forEach((id, index) => {
      payouts[id] += split + (index < remainder ? 1 : 0);
    });
    pots.push({ amount, winners, refund: false });
  }
  for (const player of state.players) player.stack += payouts[player.id];
  const winners = [
    ...new Set(pots.filter((p) => !p.refund).flatMap((p) => p.winners)),
  ];
  state.result = {
    winners,
    payouts,
    ranks,
    pots,
    totalPot: potTotal(state),
    uncontested,
  };
  state.actor = null;
  state.pending = [];
  state.street = "showdown";
  for (const id of winners) {
    const won = pots.filter((p) => !p.refund && p.winners.includes(id));
    const refund = pots
      .filter((p) => p.refund && p.winners.includes(id))
      .reduce((sum, p) => sum + p.amount, 0);
    log(
      state,
      `${state.players[id].name} 赢得 $${money(payouts[id] - refund)}${uncontested ? " · 其余玩家弃牌" : ` · ${ranks[id].name}`}${won.some((p) => p.winners.length > 1) ? "（平分底池）" : ""}`,
      "win",
    );
  }
  applyModeBonuses(state);
  return state;
}

function grantBonus(
  state: GameState,
  playerId: number,
  source: BonusEvent["source"],
  label: string,
  amount: number,
  minted = true,
) {
  if (amount === 0) return;
  state.players[playerId].stack += amount;
  if (minted) state.issuedChips += amount;
  state.bonuses.push({ playerId, source, label, amount });
  log(
    state,
    `${state.players[playerId].name} · ${label} ${amount >= 0 ? "+" : "−"}$${money(Math.abs(amount))}`,
    "bonus",
  );
}

export function contestedWinnings(state: GameState, playerId: number): number {
  if (!state.result) return 0;
  return (
    state.result.payouts[playerId] -
    state.result.pots
      .filter((p) => p.refund && p.winners.includes(playerId))
      .reduce((total, p) => total + p.amount, 0)
  );
}

function applyModeBonuses(state: GameState) {
  const result = state.result!;
  if (state.config.mode === "rainbow" && !result.uncontested) {
    for (const id of result.winners) {
      const percent = RAINBOW_PERCENT[result.ranks[id].category];
      grantBonus(
        state,
        id,
        "rainbow",
        `彩虹底池 ×${percent / 100} · ${result.ranks[id].name}`,
        Math.floor((contestedWinnings(state, id) * (percent - 100)) / 100),
      );
    }
  }
  if (state.config.mode !== "jokers") return;
  for (const id of result.winners) {
    const player = state.players[id];
    const won = contestedWinnings(state, id);
    for (const joker of player.jokers) {
      if (joker === "star")
        grantBonus(
          state,
          id,
          joker,
          "幸运星 · 获胜奖励",
          Math.floor(won * 0.5),
        );
      if (joker === "clover" && (result.ranks[id]?.category ?? 0) >= 4)
        grantBonus(state, id, joker, "三叶草 · 大牌奖励", won);
      if (joker === "joker")
        grantBonus(state, id, joker, "双面小丑 · 收益翻倍", won);
      if (joker === "skull") {
        let bounty = 0;
        for (const other of state.players) {
          if (other.id === id || !other.occupied) continue;
          const amount = Math.min(other.stack, state.blinds.big);
          grantBonus(
            state,
            other.id,
            "bounty-tax",
            `向${player.name}支付赏金`,
            -amount,
            false,
          );
          bounty += amount;
        }
        grantBonus(state, id, joker, "赏金头颅 · 收取赏金", bounty, false);
      }
    }
  }
  for (const player of state.players) {
    if (
      player.folded ||
      player.eliminated ||
      result.winners.includes(player.id)
    )
      continue;
    const invested =
      player.contributed -
      result.pots
        .filter((p) => p.refund && p.winners.includes(player.id))
        .reduce((sum, p) => sum + p.amount, 0);
    let refunded = 0;
    for (const joker of player.jokers) {
      const nominal =
        joker === "shield"
          ? Math.floor(invested * 0.5)
          : joker === "joker"
            ? invested
            : 0;
      const amount = Math.min(nominal, invested - refunded);
      if (amount > 0) {
        grantBonus(
          state,
          player.id,
          joker,
          `${JOKERS[joker].name} · 落败返还`,
          amount,
        );
        refunded += amount;
      }
    }
  }
}

export function openShop(previous: GameState, random = Math.random): GameState {
  if (previous.config.mode !== "jokers" || !previous.result)
    throw new Error("小丑商店只在小丑狂欢的每手结束后开放。");
  if (previous.shop || previous.players.filter((p) => p.stack > 0).length < 2)
    return previous;
  const state = structuredClone(previous);
  state.street = "shop";
  state.shop = { offers: shuffle(JOKER_IDS, random).slice(0, 3) };
  for (const p of state.players) {
    p.ready = p.stack <= 0;
    if (p.stack <= 0) continue;
    p.coins += 2 + (state.result!.winners.includes(p.id) ? 3 : 0);
    if (p.jokers.length === 0) p.jokers.push(shuffle(JOKER_IDS, random)[0]);
  }
  log(state, "小丑商店开门 · 每位在桌牌手 +2 小丑币，赢家额外 +3", "shop");
  return state;
}

export function allShopReady(state: GameState): boolean {
  return !!state.shop && state.players.every((p) => p.stack <= 0 || p.ready);
}

export function shopAction(
  previous: GameState,
  playerId: number,
  action: ShopAction,
  random = Math.random,
): GameState {
  if (
    !previous.shop ||
    previous.street !== "shop" ||
    previous.config.mode !== "jokers"
  )
    throw new Error("商店尚未开放。");
  const source = previous.players[playerId];
  if (!source || source.stack <= 0 || source.ready)
    throw new Error("已准备或已离桌的牌手不能修改装备。");
  const state = structuredClone(previous);
  const player = state.players[playerId];
  const shop = state.shop!;
  switch (action.type) {
    case "buy": {
      const index = shop.offers.indexOf(action.jokerId);
      if (index < 0) throw new Error("这张小丑牌已被买走，请选择其他卡牌。");
      if (player.jokers.length >= SHOP_PRICES.slots)
        throw new Error("最多持有 3 张小丑牌，请先出售一张。");
      if (player.coins < SHOP_PRICES.buy)
        throw new Error("小丑币不足，购买需要 5 币。");
      player.coins -= SHOP_PRICES.buy;
      player.jokers.push(shop.offers.splice(index, 1)[0]);
      log(state, `${player.name} 买入 ${JOKERS[action.jokerId].name}`, "shop");
      break;
    }
    case "sell": {
      const index = player.jokers.indexOf(action.jokerId);
      if (index < 0) throw new Error("你没有持有这张小丑牌。");
      player.jokers.splice(index, 1);
      player.coins += SHOP_PRICES.sell;
      log(state, `${player.name} 售出 ${JOKERS[action.jokerId].name}`, "shop");
      break;
    }
    case "refresh":
      if (player.coins < SHOP_PRICES.refresh)
        throw new Error("刷新货架需要 1 枚小丑币。");
      player.coins -= SHOP_PRICES.refresh;
      shop.offers = shuffle(JOKER_IDS, random).slice(0, 3);
      log(state, `${player.name} 刷新了公共货架`, "shop");
      break;
    case "ready":
      player.ready = true;
      log(state, `${player.name} 已准备`, "shop");
      break;
    default:
      throw new Error("无效的商店操作。");
  }
  return state;
}

export function shopForAi(
  previous: GameState,
  playerId: number,
  random = Math.random,
): GameState {
  let state = previous;
  if (
    !state.shop ||
    state.players[playerId].ready ||
    state.players[playerId].stack <= 0
  )
    return state;
  const priority: JokerId[] = [
    "joker",
    "coin",
    "star",
    "shield",
    "clover",
    "skull",
  ];
  if (
    state.players[playerId].jokers.length < SHOP_PRICES.slots &&
    state.players[playerId].coins >= SHOP_PRICES.buy
  ) {
    if (
      !state.shop.offers.length &&
      state.players[playerId].coins > SHOP_PRICES.buy
    )
      state = shopAction(state, playerId, { type: "refresh" }, random);
    const choice = priority.find((joker) => state.shop!.offers.includes(joker));
    if (choice)
      state = shopAction(
        state,
        playerId,
        { type: "buy", jokerId: choice },
        random,
      );
  }
  return shopAction(state, playerId, { type: "ready" }, random);
}

/** Estimates equity from this player's information only; opponents' hole cards are never read. */
export function estimateEquity(
  cards: Card[],
  board: Card[],
  opponents: number,
  trials = 72,
  random = Math.random,
): number {
  const known = new Set([...cards, ...board].map(cardId));
  const unseen = makeDeck().filter((c) => !known.has(cardId(c)));
  let equity = 0;
  for (let trial = 0; trial < trials; trial++) {
    const deck = shuffle(unseen, random);
    const fullBoard = [...board];
    while (fullBoard.length < 5) fullBoard.push(deck.pop()!);
    const mine = evaluate([...cards, ...fullBoard]);
    let beat = false;
    let ties = 0;
    for (let i = 0; i < opponents; i++) {
      const other = evaluate([deck.pop()!, deck.pop()!, ...fullBoard]);
      const comparison = compareRanks(other, mine);
      if (comparison > 0) beat = true;
      if (comparison === 0) ties++;
    }
    if (!beat) equity += 1 / (ties + 1);
  }
  return equity / trials;
}

export function chooseAiAction(
  state: GameState,
  difficulty: Difficulty = state.config.difficulty,
  random = Math.random,
): Action {
  if (state.actor === null) throw new Error("没有待行动玩家");
  const player = state.players[state.actor];
  const legal = legalActions(state);
  const opponents = state.players.filter(
    (p) => inHand(p) && p.id !== player.id,
  ).length;
  const strength = estimateEquity(
    player.cards,
    state.community,
    opponents,
    difficulty === "hard" ? 110 : 56,
    random,
  );
  const pot = potTotal(state);
  const potOdds = legal.toCall / (pot + legal.toCall || 1);
  const personality = [0, 0.035, -0.03, 0.015, 0.045, -0.015][player.id] ?? 0;
  const noise = (random() - 0.5) * (difficulty === "easy" ? 0.3 : 0.09);
  const confidence = strength + personality + noise;
  const raiseChance = difficulty === "easy" ? 0.25 : 0.55;
  const bluff = random() < (difficulty === "hard" ? 0.07 : 0.025);
  if (
    legal.canRaise &&
    (confidence > 0.57 || (bluff && legal.toCall < pot * 0.3)) &&
    random() < raiseChance
  ) {
    const size =
      Math.round(
        (state.currentBet +
          Math.max(state.blinds.big, pot * (confidence > 0.8 ? 0.75 : 0.45))) /
          10,
      ) * 10;
    const target = Math.min(legal.maxRaise, Math.max(legal.minRaise, size));
    return { type: "raise", amount: target };
  }
  if (legal.canCheck) return { type: "check" };
  const tolerance = difficulty === "easy" ? 0.13 : 0.055;
  if (
    confidence + tolerance >= potOdds ||
    (legal.toCall <= state.blinds.big && confidence > 0.15)
  )
    return { type: "call" };
  return { type: "fold" };
}

export function handDescription(cards: Card[], board: Card[]): string {
  if (cards.length < 2) return "等待发牌";
  if (cards.length + board.length >= 5)
    return evaluate([...cards, ...board]).name;
  if (cards[0].rank === cards[1].rank)
    return `口袋对子 · ${rankLabel(cards[0].rank)}`;
  return `${cards[0].suit === cards[1].suit ? "同花起手" : "高牌"} · ${rankLabel(Math.max(...cards.map((c) => c.rank)))}`;
}

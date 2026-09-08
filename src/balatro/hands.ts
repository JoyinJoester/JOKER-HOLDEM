import { HANDS } from "./data";
import type { HandEvaluation, HandId, RunCard } from "./types";
import { SUITS, type Suit } from "../poker";

export interface HandOptions {
  fourFingers?: boolean;
  shortcut?: boolean;
  smeared?: boolean;
  splash?: boolean;
}
export function suitsFor(card: RunCard, smeared = false): Suit[] {
  if (card.enhancement === "stone") return [];
  if (card.enhancement === "wild") return [...SUITS];
  if (smeared)
    return card.suit === "hearts" || card.suit === "diamonds"
      ? ["hearts", "diamonds"]
      : ["spades", "clubs"];
  return [card.suit];
}
export function evaluateHand(
  cards: RunCard[],
  options: HandOptions = {},
): HandEvaluation {
  const ranked = cards.filter((c) => c.enhancement !== "stone");
  const groups = [...new Set(ranked.map((c) => c.rank))]
    .map((rank) => ranked.filter((c) => c.rank === rank))
    .sort((a, b) => b.length - a.length || b[0].rank - a[0].rank);
  const required = options.fourFingers ? 4 : 5;
  const flush =
    SUITS.map((suit) =>
      ranked.filter((c) => suitsFor(c, options.smeared).includes(suit)),
    ).find((g) => g.length >= required) ?? [];
  const ranks = [...new Set(ranked.map((c) => c.rank))].sort((a, b) => b - a);
  if (ranks.includes(14)) ranks.push(1);
  let straightRanks: number[] = [];
  for (let i = 0; i < ranks.length; i++) {
    const sequence = [ranks[i]];
    for (let j = i + 1; j < ranks.length; j++) {
      const gap = sequence.at(-1)! - ranks[j];
      if (gap > (options.shortcut ? 2 : 1)) break;
      sequence.push(ranks[j]);
      if (sequence.length >= required) break;
    }
    if (sequence.length >= required) {
      straightRanks = sequence;
      break;
    }
  }
  const straight = ranked.filter(
    (c) =>
      straightRanks.includes(c.rank) ||
      (c.rank === 14 && straightRanks.includes(1)),
  );
  const pairs = groups.filter((g) => g.length >= 2),
    trips = groups.find((g) => g.length >= 3),
    quads = groups.find((g) => g.length >= 4),
    five = groups.find((g) => g.length >= 5);
  const full = trips && pairs.find((g) => g[0].rank !== trips[0].rank);
  const contains: HandId[] = ["high"];
  if (pairs.length) contains.push("pair");
  if (pairs.length >= 2) contains.push("twoPair");
  if (trips) contains.push("trips");
  if (straight.length) contains.push("straight");
  if (flush.length) contains.push("flush");
  if (full) contains.push("fullHouse");
  if (quads) contains.push("quads");
  if (straight.length && flush.length) contains.push("straightFlush");
  if (five) contains.push("fiveKind");
  if (full && flush.length === 5) contains.push("flushHouse");
  if (five && flush.length === 5) contains.push("flushFive");
  const id = contains.at(-1)!;
  let scored: RunCard[];
  switch (id) {
    case "pair":
      scored = pairs[0];
      break;
    case "twoPair":
      scored = pairs.slice(0, 2).flat();
      break;
    case "trips":
      scored = trips!;
      break;
    case "quads":
      scored = quads!;
      break;
    case "straight":
      scored = straight;
      break;
    case "flush":
      scored = flush;
      break;
    case "high":
      scored = ranked.length
        ? [ranked.reduce((best, c) => (c.rank > best.rank ? c : best))]
        : [];
      break;
    default:
      scored = ranked;
  }
  const ids = new Set(scored.map((c) => c.uid));
  const scoring = cards
    .filter(
      (c) => options.splash || c.enhancement === "stone" || ids.has(c.uid),
    )
    .map((c) => c.uid);
  const royal =
    id === "straightFlush" &&
    cards.length === 5 &&
    [10, 11, 12, 13, 14].every((rank) => ranked.some((c) => c.rank === rank));
  return { id, scoring, contains, name: royal ? "皇家同花顺" : HANDS[id].name };
}

/** Four separate scoring cards must be assignable to the four suits. */
export function hasFourSuits(cards: RunCard[], smeared: boolean): boolean {
  const visit = (i: number, used: Set<string>): boolean =>
    i === 4 ||
    cards.some(
      (c) =>
        !used.has(c.uid) &&
        suitsFor(c, smeared).includes(SUITS[i]) &&
        visit(i + 1, new Set([...used, c.uid])),
    );
  return visit(0, new Set());
}

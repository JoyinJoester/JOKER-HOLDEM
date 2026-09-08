import type { Card, Suit } from "../poker";

export type Enhancement =
  | "base"
  | "bonus"
  | "mult"
  | "wild"
  | "glass"
  | "steel"
  | "stone"
  | "gold"
  | "lucky";
export type Edition = "base" | "foil" | "holo" | "poly" | "negative";
export type Seal = "none" | "red" | "blue" | "purple" | "gold";
export interface RunCard extends Card {
  uid: string;
  enhancement: Enhancement;
  edition: Edition;
  seal: Seal;
  bonus: number;
  faceDown?: boolean;
}
export type HandId =
  | "high"
  | "pair"
  | "twoPair"
  | "trips"
  | "straight"
  | "flush"
  | "fullHouse"
  | "quads"
  | "straightFlush"
  | "fiveKind"
  | "flushHouse"
  | "flushFive";
export interface Joker {
  uid: string;
  id: string;
  edition: Edition;
  value: number;
  counter: number;
  sellBonus: number;
  suit: Suit;
  rank: number;
  hand: HandId;
  eternal: boolean;
  perish: number | null;
  rental: boolean;
}
export interface Consumable {
  uid: string;
  kind: "planet" | "tarot" | "spectral";
  id: string;
  negative: boolean;
  sellBonus: number;
}
export interface RunConfig {
  deck: string;
  stake: number;
  seed: string;
}
export type Offer = { uid: string; price: number; sold: boolean } & (
  | { kind: "joker"; joker: Joker }
  | { kind: "planet" | "tarot" | "spectral"; item: Consumable }
  | { kind: "card"; card: RunCard }
);
export type PackKind =
  "buffoon" | "arcana" | "celestial" | "spectral" | "standard";
export interface PackOffer {
  uid: string;
  kind: PackKind;
  size: "normal" | "jumbo" | "mega";
  price: number;
  sold: boolean;
}
export interface PackState {
  kind: PackKind;
  choices: Offer[];
  picks: number;
  returnPhase: "blind" | "shop";
}
export interface ShopState {
  offers: Offer[];
  packs: PackOffer[];
  rerolls: number;
  freeRerolls: number;
  rerollBase: number;
  voucherIds: string[];
}
export interface Trace {
  label: string;
  totals?: { chips: number; mult: number };
  chips?: number;
  mult?: number;
  factor?: number;
  money?: number;
  joker?: string;
  card?: string;
}
export interface PlayedHand {
  name: string;
  id: HandId;
  level: number;
  chips: number;
  mult: number;
  score: number;
  cards: RunCard[];
  scoring: string[];
  trace: Trace[];
  blocked: string | null;
}
export interface Payout {
  blind: number;
  hands: number;
  discards: number;
  interest: number;
  extras: { label: string; amount: number }[];
  total: number;
}
export type Phase =
  "blind" | "playing" | "cashout" | "shop" | "pack" | "lost" | "won";
export interface RunState {
  version: 1;
  config: RunConfig;
  uid: string;
  rng: number;
  serial: number;
  phase: Phase;
  ante: number;
  blind: number;
  round: number;
  boss: string;
  bossHand?: HandId;
  seenBosses: string[];
  bossDisabled: boolean;
  disabledJoker: string | null;
  forcedCard: string | null;
  money: number;
  score: number;
  target: number;
  handsLeft: number;
  discardsLeft: number;
  handsUsed: number;
  discardsUsed: number;
  deck: RunCard[];
  drawPile: string[];
  hand: string[];
  handSort?: "rank" | "suit";
  played: string[];
  selected: string[];
  initialDeckSize: number;
  jokers: Joker[];
  consumables: Consumable[];
  levels: Record<HandId, number>;
  handUses: Record<HandId, number>;
  roundHands: HandId[];
  vouchers: string[];
  voucher: string | null;
  voucherBought: boolean;
  tags: string[];
  skipTags: [string, string];
  skipped: number;
  shop: ShopState | null;
  pack: PackState | null;
  lastHand: PlayedHand | null;
  payout: Payout | null;
  totalHands: number;
  unusedDiscards: number;
  tarotUsed: number;
  planetsUsed: HandId[];
  lastConsumable: { id: string; kind: "planet" | "tarot" } | null;
  antePlayed: string[];
  destroyedBanana: boolean;
  handSizeMod: number;
  handsMod: number;
  discardsMod: number;
  ectoplasms: number;
  juggle: number;
  bossRerolls: number;
  bestHand: number;
  totalScore: number;
  won: boolean;
  endless: boolean;
  message: string;
  logs: string[];
  discovered: string[];
}
export interface HandEvaluation {
  id: HandId;
  scoring: string[];
  contains: HandId[];
  name: string;
}
export type RunAction =
  | { type: "select"; uid: string }
  | { type: "sort"; by: "rank" | "suit" }
  | { type: "moveCard"; uid: string; direction: -1 | 1 }
  | {
      type:
        | "play"
        | "discard"
        | "startBlind"
        | "skipBlind"
        | "cashout"
        | "leaveShop"
        | "reroll"
        | "skipPack"
        | "endless"
        | "rerollBoss";
    }
  | {
      type:
        | "buy"
        | "openPack"
        | "pickPack"
        | "use"
        | "sellJoker"
        | "sellConsumable";
      uid: string;
    }
  | { type: "voucher"; id: string }
  | { type: "moveJoker"; uid: string; direction: -1 | 1 };

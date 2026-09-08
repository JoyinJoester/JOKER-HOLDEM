import { SUITS } from "../poker";
import {
  BOSS_MAP,
  DECKS,
  ENHANCEMENTS,
  HAND_IDS,
  JOKERS,
  SEALS,
  SPECTRAL_MAP,
  TAG_MAP,
  TAROT_MAP,
  VOUCHER_MAP,
} from "./data";
import { runAction } from "./engine";
import type { RunCard, RunConfig, RunState } from "./types";

export const RUN_KEY = "joker-holdem.balatro.run.v1";
export const CONFIG_KEY = "joker-holdem.balatro.config.v1";
const editions = ["base", "foil", "holo", "poly", "negative"];
const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((v) => typeof v === "string");
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const validCard = (c: unknown): c is RunCard =>
  object(c) &&
  typeof c.uid === "string" &&
  Number.isInteger(c.rank) &&
  c.rank >= 2 &&
  c.rank <= 14 &&
  SUITS.includes(c.suit) &&
  c.enhancement in ENHANCEMENTS &&
  editions.includes(c.edition) &&
  c.seal in SEALS &&
  finite(c.bonus) &&
  c.bonus >= 0;
const validItem = (c: unknown) =>
  object(c) &&
  typeof c.uid === "string" &&
  finite(c.sellBonus) &&
  typeof c.negative === "boolean" &&
  (c.kind === "planet"
    ? HAND_IDS.includes(c.id)
    : c.kind === "tarot"
      ? c.id in TAROT_MAP
      : c.kind === "spectral" && c.id in SPECTRAL_MAP);
const validJoker = (j: unknown) =>
  object(j) &&
  typeof j.uid === "string" &&
  j.id in JOKERS &&
  editions.includes(j.edition) &&
  finite(j.value) &&
  finite(j.counter) &&
  finite(j.sellBonus) &&
  SUITS.includes(j.suit) &&
  finite(j.rank) &&
  HAND_IDS.includes(j.hand) &&
  typeof j.eternal === "boolean" &&
  typeof j.rental === "boolean" &&
  (j.perish === null ||
    (Number.isInteger(j.perish) && j.perish >= 0 && j.perish <= 5));
const validOffer = (o: unknown) =>
  object(o) &&
  typeof o.uid === "string" &&
  finite(o.price) &&
  typeof o.sold === "boolean" &&
  (o.kind === "joker"
    ? validJoker(o.joker)
    : o.kind === "card"
      ? validCard(o.card)
      : ["planet", "tarot", "spectral"].includes(o.kind) && validItem(o.item));

export function validRun(value: unknown): value is RunState {
  if (
    !object(value) ||
    value.version !== 1 ||
    !validConfig(value.config) ||
    typeof value.uid !== "string"
  )
    return false;
  if (
    value.handSort !== undefined &&
    value.handSort !== "rank" &&
    value.handSort !== "suit"
  )
    return false;
  if (
    !["blind", "playing", "cashout", "shop", "pack", "lost", "won"].includes(
      value.phase,
    ) ||
    !(value.boss in BOSS_MAP)
  )
    return false;
  if (
    ![
      "rng",
      "serial",
      "ante",
      "blind",
      "round",
      "money",
      "score",
      "target",
      "handsLeft",
      "discardsLeft",
      "handsUsed",
      "discardsUsed",
      "initialDeckSize",
      "skipped",
      "totalHands",
      "unusedDiscards",
      "tarotUsed",
      "handSizeMod",
      "handsMod",
      "discardsMod",
      "ectoplasms",
      "juggle",
      "bossRerolls",
      "bestHand",
      "totalScore",
    ].every((k) => finite(value[k]))
  )
    return false;
  if (
    !Number.isInteger(value.rng) ||
    value.rng < 0 ||
    value.rng > 0xffffffff ||
    !Number.isInteger(value.ante) ||
    value.ante < 0 ||
    ![0, 1, 2].includes(value.blind)
  )
    return false;
  if (
    ![
      "bossDisabled",
      "destroyedBanana",
      "voucherBought",
      "won",
      "endless",
    ].every((k) => typeof value[k] === "boolean")
  )
    return false;
  if (
    ![
      "drawPile",
      "hand",
      "played",
      "selected",
      "seenBosses",
      "vouchers",
      "tags",
      "skipTags",
      "roundHands",
      "planetsUsed",
      "antePlayed",
      "logs",
      "discovered",
    ].every((k) => strings(value[k]))
  )
    return false;
  if (
    !value.vouchers.every((id: string) => id in VOUCHER_MAP) ||
    value.skipTags.length !== 2 ||
    !value.skipTags.every((id: string) => id in TAG_MAP)
  )
    return false;
  if (
    !Array.isArray(value.deck) ||
    value.deck.length > 10000 ||
    !value.deck.every(validCard) ||
    !Array.isArray(value.jokers) ||
    !value.jokers.every(validJoker) ||
    !Array.isArray(value.consumables) ||
    !value.consumables.every(validItem)
  )
    return false;
  const deckIds = new Set(value.deck.map((c: RunCard) => c.uid));
  if (
    deckIds.size !== value.deck.length ||
    ![...value.hand, ...value.drawPile].every((id) => deckIds.has(id)) ||
    new Set([...value.hand, ...value.drawPile]).size !==
      value.hand.length + value.drawPile.length ||
    value.selected.length > 5 ||
    !value.selected.every((id: string) => value.hand.includes(id))
  )
    return false;
  if (
    !object(value.levels) ||
    !object(value.handUses) ||
    !HAND_IDS.every(
      (id) =>
        Number.isInteger(value.levels[id]) &&
        value.levels[id] >= 1 &&
        Number.isInteger(value.handUses[id]) &&
        value.handUses[id] >= 0,
    )
  )
    return false;
  if (
    value.shop !== null &&
    (!object(value.shop) ||
      !Array.isArray(value.shop.offers) ||
      !value.shop.offers.every(validOffer) ||
      !Array.isArray(value.shop.packs) ||
      !value.shop.packs.every(
        (p: any) =>
          object(p) &&
          typeof p.uid === "string" &&
          ["buffoon", "arcana", "celestial", "spectral", "standard"].includes(
            p.kind,
          ) &&
          ["normal", "jumbo", "mega"].includes(p.size) &&
          finite(p.price) &&
          typeof p.sold === "boolean",
      ) ||
      !strings(value.shop.voucherIds) ||
      !value.shop.voucherIds.every((id: string) => id in VOUCHER_MAP) ||
      !["rerolls", "freeRerolls", "rerollBase"].every((k) =>
        finite(value.shop[k]),
      ))
  )
    return false;
  if (
    value.pack !== null &&
    (!object(value.pack) ||
      !["buffoon", "arcana", "celestial", "spectral", "standard"].includes(
        value.pack.kind,
      ) ||
      !["blind", "shop"].includes(value.pack.returnPhase) ||
      !Array.isArray(value.pack.choices) ||
      !value.pack.choices.every(validOffer) ||
      ![1, 2].includes(value.pack.picks))
  )
    return false;
  if (
    value.payout !== null &&
    (!object(value.payout) ||
      !["blind", "hands", "discards", "interest", "total"].every((k) =>
        finite(value.payout[k]),
      ) ||
      !Array.isArray(value.payout.extras) ||
      !value.payout.extras.every(
        (e: any) =>
          object(e) && typeof e.label === "string" && finite(e.amount),
      ))
  )
    return false;
  if (
    value.lastHand !== null &&
    (!object(value.lastHand) ||
      !HAND_IDS.includes(value.lastHand.id) ||
      !["chips", "mult", "score", "level"].every((k) =>
        finite(value.lastHand[k]),
      ) ||
      !Array.isArray(value.lastHand.cards) ||
      !value.lastHand.cards.every(validCard) ||
      !strings(value.lastHand.scoring) ||
      !Array.isArray(value.lastHand.trace) ||
      !value.lastHand.trace.every(
        (t: any) =>
          object(t) &&
          typeof t.label === "string" &&
          ["chips", "mult", "factor", "money"].every(
            (k) => t[k] === undefined || finite(t[k]),
          ) &&
          (t.totals === undefined ||
            (object(t.totals) &&
              finite(t.totals.chips) &&
              finite(t.totals.mult))),
      ))
  )
    return false;
  if (
    value.lastConsumable !== null &&
    (!object(value.lastConsumable) ||
      !(value.lastConsumable.kind === "planet"
        ? HAND_IDS.includes(value.lastConsumable.id)
        : value.lastConsumable.kind === "tarot" &&
          value.lastConsumable.id in TAROT_MAP))
  )
    return false;
  if (
    (value.forcedCard !== null && !value.hand.includes(value.forcedCard)) ||
    (value.disabledJoker !== null && typeof value.disabledJoker !== "string")
  )
    return false;
  if (
    (value.voucher !== null && !(value.voucher in VOUCHER_MAP)) ||
    typeof value.message !== "string"
  )
    return false;
  return !(
    (value.phase === "shop" && !value.shop) ||
    (value.phase === "pack" && !value.pack) ||
    (value.phase === "cashout" && !value.payout) ||
    (value.phase === "playing" && (!value.hand.length || value.handsLeft <= 0))
  );
}

function validConfig(c: unknown): c is RunConfig {
  return (
    object(c) &&
    DECKS.some((d) => d.id === c.deck) &&
    Number.isInteger(c.stake) &&
    c.stake >= 0 &&
    c.stake <= 7 &&
    typeof c.seed === "string" &&
    c.seed.length <= 32
  );
}
export function loadRun(): RunState | null {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(RUN_KEY) ?? "null");
    if (!validRun(data)) return null;
    if (data.handSort === undefined) {
      const migrated = runAction(data, { type: "sort", by: "rank" });
      saveRun(migrated);
      return migrated;
    }
    return data;
  } catch {
    return null;
  }
}
export function saveRun(run: RunState): boolean {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
    return true;
  } catch {
    return false;
  }
}
export function loadConfig(): RunConfig {
  try {
    const data: unknown = JSON.parse(
      localStorage.getItem(CONFIG_KEY) ?? "null",
    );
    if (validConfig(data)) return { ...data, seed: "" };
  } catch {
    /* A fresh run is always available. */
  }
  return { deck: "red", stake: 0, seed: "" };
}
export function saveConfig(config: RunConfig) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...config, seed: "" }));
  } catch {
    /* Optional preference. */
  }
}

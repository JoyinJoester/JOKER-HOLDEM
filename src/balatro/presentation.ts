import { rankLabel, SUIT_SYMBOL } from "../poker";
import {
  EDITIONS,
  ENHANCEMENTS,
  HANDS,
  JOKERS,
  SEALS,
  SPECTRAL_MAP,
  TAROT_MAP,
} from "./data";
import type { Consumable, HandId, Joker, RunCard, RunState } from "./types";

export function number(value: number): string {
  if (!Number.isFinite(value)) return "∞";
  if (Math.abs(value) >= 1e10) return value.toExponential(2).replace("e+", "e");
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export const cardName = (card: RunCard) =>
  card.faceDown
    ? "背面朝上的牌"
    : card.enhancement === "stone"
      ? "石头牌"
      : `${SUIT_SYMBOL[card.suit]} ${rankLabel(card.rank)}`;
export const cardDetails = (card: RunCard) =>
  card.faceDown
    ? "打出或弃掉后才会揭晓。"
    : [
        ENHANCEMENTS[card.enhancement],
        EDITIONS[card.edition],
        SEALS[card.seal],
        card.bonus ? `永久 +${number(card.bonus)} 筹码` : "",
      ]
        .filter(Boolean)
        .join("；");
export const itemName = (item: Consumable) =>
  item.kind === "planet"
    ? HANDS[item.id as HandId].planet
    : (item.kind === "tarot" ? TAROT_MAP : SPECTRAL_MAP)[item.id].name;
export const itemDescription = (item: Consumable) =>
  item.kind === "planet"
    ? `${HANDS[item.id as HandId].name}提升 1 级：+${HANDS[item.id as HandId].addChips} 筹码、+${HANDS[item.id as HandId].addMult} 倍率。`
    : (item.kind === "tarot" ? TAROT_MAP : SPECTRAL_MAP)[item.id].desc;
export const itemKind = (item: Consumable) =>
  ({ planet: "星球牌", tarot: "塔罗牌", spectral: "幻灵牌" })[item.kind];

export function jokerStatus(j: Joker, s: RunState): string {
  if (j.perish === 0) return "易腐已到期 · 能力失效";
  if (j.uid === s.disabledJoker && !s.bossDisabled) return "本手被 Boss 禁用";
  if (
    ["bus", "dagger", "green", "red", "trousers", "flash", "popcorn"].includes(
      j.id,
    )
  )
    return `当前 +${number(j.value)} 倍率`;
  if (["runner", "ice", "square", "wee", "castle"].includes(j.id))
    return `当前 +${number(j.value)} 筹码${j.id === "castle" ? ` · ${SUIT_SYMBOL[j.suit]}` : ""}`;
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
    ].includes(j.id)
  )
    return `当前 ×${number(j.value)} 倍率${j.id === "yorick" ? ` · ${j.counter}/23 张` : ""}`;
  if (j.id === "loyalty") return `再出 ${6 - (j.counter % 6)} 手：×4 倍率`;
  if (j.id === "mail") return `本关目标：${rankLabel(j.rank)}`;
  if (j.id === "ancient") return `本关目标：${SUIT_SYMBOL[j.suit]}`;
  if (j.id === "idol")
    return `本关目标：${SUIT_SYMBOL[j.suit]} ${rankLabel(j.rank)}`;
  if (j.id === "todo") return `本关目标：${HANDS[j.hand].name}`;
  if (j.id === "rocket") return `本关收入 $${j.value}`;
  if (j.id === "bean") return `手牌上限 +${j.value}`;
  if (j.id === "seltzer") return `剩余 ${j.value} 手`;
  if (j.id === "invisible")
    return `${Math.min(2, j.counter)}/2 关${j.counter >= 2 ? " · 出售可复制" : ""}`;
  if (j.id === "fortune") return `当前 +${s.tarotUsed} 倍率`;
  if (j.id === "throwback") return `当前 ×${number(1 + s.skipped * 0.25)} 倍率`;
  if (j.id === "blueprint" || j.id === "brainstorm") {
    const index = s.jokers.findIndex((other) => other.uid === j.uid);
    const target = s.jokers[j.id === "blueprint" ? index + 1 : 0];
    return target && target.uid !== j.uid
      ? `复制目标：${JOKERS[target.id].name}`
      : "没有可复制的目标";
  }
  return "";
}

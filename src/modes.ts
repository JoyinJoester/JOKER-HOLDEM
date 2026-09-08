export type GameMode = "classic" | "jokers" | "rainbow" | "blitz";
export type Difficulty = "easy" | "normal" | "hard";
export type JokerId = "star" | "shield" | "skull" | "clover" | "coin" | "joker";

export interface TableConfig {
  mode: GameMode;
  seats: number;
  difficulty: Difficulty;
  fillBots: boolean;
}

export interface SetupOptions extends TableConfig {
  name: string;
  aiCount: number;
}

export const DEFAULT_CONFIG: TableConfig = {
  mode: "classic",
  seats: 4,
  difficulty: "normal",
  fillBots: true,
};
export const DEFAULT_SETUP: SetupOptions = {
  ...DEFAULT_CONFIG,
  name: "挑战者",
  aiCount: 3,
};
export const MODE_ORDER: GameMode[] = ["classic", "jokers", "rainbow", "blitz"];
export const MODE_META: Record<
  GameMode,
  {
    name: string;
    en: string;
    glyph: string;
    desc: string;
    detail: string;
    buyIn: number;
    accent: string;
  }
> = {
  classic: {
    name: "经典德州",
    en: "CLASSIC",
    glyph: "♠",
    desc: "读懂对手，打好每一手。",
    detail: "标准无限注德州扑克。2,000 筹码起步，盲注每 4 手翻倍。",
    buyIn: 2000,
    accent: "#85bdaf",
  },
  jokers: {
    name: "小丑狂欢",
    en: "JOKER PARTY",
    glyph: "✦",
    desc: "买下小丑，让好运叠加。",
    detail: "起手赠送一张小丑牌。局间逛商店，最多持有 3 张，加成叠加生效。",
    buyIn: 2000,
    accent: "#ed9b7e",
  },
  rainbow: {
    name: "彩虹底池",
    en: "RAINBOW POT",
    glyph: "◈",
    desc: "更大的牌型，更大的奖励。",
    detail:
      "摊牌获胜可获 1–10 倍底池收益。倍率按牌型计算，额外筹码由牌桌奖励。",
    buyIn: 2000,
    accent: "#b5a4dd",
  },
  blitz: {
    name: "闪电战",
    en: "BLITZ",
    glyph: "ϟ",
    desc: "短筹码，高压力，快决胜。",
    detail: "500 筹码起步，盲注每手翻倍。用更少的手数，决出最后的赢家。",
    buyIn: 500,
    accent: "#edc977",
  },
};

export const JOKERS: Record<
  JokerId,
  { name: string; glyph: string; desc: string; color: string }
> = {
  star: {
    name: "幸运星",
    glyph: "✦",
    desc: "获胜时，额外获得所赢底池的 50%。",
    color: "#e2bd69",
  },
  shield: {
    name: "保命符",
    glyph: "◇",
    desc: "摊牌未赢得底池时，返还本手投入的 50%。",
    color: "#85beca",
  },
  skull: {
    name: "赏金头颅",
    glyph: "♠",
    desc: "获胜时，向其他牌手各收取 1 个大盲，最多扣至零。",
    color: "#c99bb5",
  },
  clover: {
    name: "三叶草",
    glyph: "♣",
    desc: "以顺子或更大牌型获胜，额外获得所赢底池的 100%。",
    color: "#a1c77e",
  },
  coin: {
    name: "富翁",
    glyph: "♦",
    desc: "每次发牌前，获得 5 个小盲的筹码补贴。",
    color: "#dbb671",
  },
  joker: {
    name: "双面小丑",
    glyph: "★",
    desc: "获胜收益翻倍；摊牌落败时，返还全部投入。",
    color: "#e99178",
  },
};
export const JOKER_IDS = Object.keys(JOKERS) as JokerId[];
export const RAINBOW_PERCENT = [100, 120, 150, 200, 250, 300, 400, 500, 1000];
export const SHOP_PRICES = { buy: 5, sell: 2, refresh: 1, slots: 3 };

export function validateConfig(input: unknown): TableConfig {
  if (!input || typeof input !== "object")
    throw new Error("请选择有效的牌桌设置。");
  const value = input as Partial<TableConfig>;
  if (!MODE_ORDER.includes(value.mode as GameMode))
    throw new Error("请选择有效的游戏模式。");
  if (!Number.isInteger(value.seats) || value.seats! < 2 || value.seats! > 6)
    throw new Error("牌桌人数应为 2–6 人。");
  if (!["easy", "normal", "hard"].includes(value.difficulty ?? ""))
    throw new Error("请选择有效的 AI 难度。");
  if (typeof value.fillBots !== "boolean")
    throw new Error("请选择是否使用 AI 补位。");
  return {
    mode: value.mode!,
    seats: value.seats!,
    difficulty: value.difficulty!,
    fillBots: value.fillBots,
  };
}

export function blindAmounts(mode: GameMode, hand: number) {
  const level = Math.min(
    20,
    mode === "blitz" ? hand - 1 : Math.floor((hand - 1) / 4),
  );
  const small = 10 * 2 ** Math.max(0, level);
  return { small, big: small * 2 };
}

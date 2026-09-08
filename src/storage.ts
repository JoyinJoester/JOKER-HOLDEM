import { createGame, type Difficulty, type GameState } from "./poker";
import {
  DEFAULT_CONFIG,
  DEFAULT_SETUP,
  JOKER_IDS,
  blindAmounts,
  validateConfig,
  type SetupOptions,
} from "./modes";

export interface Settings {
  sound: boolean;
  volume: number;
  crt: boolean;
  fast: boolean;
  difficulty: Difficulty;
}
export interface Stats {
  hands: number;
  wins: number;
  bestPot: number;
  lastResult: string;
}
export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  volume: 0.3,
  crt: true,
  fast: false,
  difficulty: "normal",
};
export const DEFAULT_STATS: Stats = {
  hands: 0,
  wins: 0,
  bestPot: 0,
  lastResult: "",
};

export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`joker-holdem.${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(`joker-holdem.${key}`, JSON.stringify(value));
  } catch {
    /* Private browsing can disable persistence. */
  }
}

export function loadSettings(): Settings {
  const value = readStorage<Partial<Settings> | null>("settings.v1", null);
  if (!value) return DEFAULT_SETTINGS;
  return {
    sound: typeof value.sound === "boolean" ? value.sound : true,
    volume:
      typeof value.volume === "number" && value.volume >= 0 && value.volume <= 1
        ? value.volume
        : 0.3,
    crt: typeof value.crt === "boolean" ? value.crt : true,
    fast: typeof value.fast === "boolean" ? value.fast : false,
    difficulty: ["easy", "normal", "hard"].includes(value.difficulty ?? "")
      ? value.difficulty!
      : "normal",
  };
}

export function loadGame(): GameState {
  const value = readStorage<GameState | null>("game.v1", null);
  if (
    value &&
    typeof value.session === "string" &&
    value.players?.length >= 2 &&
    value.players.length <= 6 &&
    Array.isArray(value.deck) &&
    Array.isArray(value.community) &&
    Array.isArray(value.logs) &&
    Array.isArray(value.pending) &&
    Array.isArray(value.lastFacedBet) &&
    Array.isArray(value.startingStacks) &&
    ["preflop", "flop", "turn", "river", "showdown", "shop"].includes(
      value.street,
    ) &&
    (value.actor === null || value.players.some((p) => p.id === value.actor)) &&
    value.players.every(
      (p, i) =>
        p.id === i &&
        Number.isInteger(p.stack) &&
        p.stack >= 0 &&
        Array.isArray(p.cards),
    ) &&
    Number.isInteger(value.handNumber) &&
    value.handNumber > 0
  ) {
    try {
      const config = validateConfig(
        value.config ?? { ...DEFAULT_CONFIG, seats: value.players.length },
      );
      return {
        ...value,
        config,
        blinds: value.blinds ?? blindAmounts(config.mode, value.handNumber),
        bonuses: value.bonuses ?? [],
        issuedChips: value.issuedChips ?? 0,
        shop: value.shop ?? null,
        players: value.players.map((p) => ({
          ...p,
          occupied: p.occupied ?? true,
          jokers: (p.jokers ?? []).filter((id) => JOKER_IDS.includes(id)),
          coins: p.coins ?? 0,
          ready: p.ready ?? false,
        })),
      };
    } catch {
      return createGame();
    }
  }
  return createGame();
}

export function loadSetup(): SetupOptions {
  const stored = readStorage<Partial<SetupOptions> | null>("setup.v2", null);
  if (!stored)
    return {
      ...DEFAULT_SETUP,
      name: readStorage<string>("nickname.v1", DEFAULT_SETUP.name),
    };
  try {
    return {
      ...validateConfig({ ...DEFAULT_CONFIG, ...stored }),
      name:
        typeof stored.name === "string" && stored.name.trim()
          ? stored.name.slice(0, 12)
          : DEFAULT_SETUP.name,
      aiCount:
        Number.isInteger(stored.aiCount) &&
        stored.aiCount! >= 1 &&
        stored.aiCount! <= 5
          ? stored.aiCount!
          : 3,
    };
  } catch {
    return DEFAULT_SETUP;
  }
}

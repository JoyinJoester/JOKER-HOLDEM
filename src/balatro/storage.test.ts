import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRun, makeJoker, runAction } from "./engine";
import {
  CONFIG_KEY,
  loadConfig,
  loadRun,
  RUN_KEY,
  saveConfig,
  saveRun,
  validRun,
} from "./storage";
import { playingFixture, shopFixture } from "./fixtures";

describe("independent roguelike persistence", () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("round-trips cards, selection, counters and exact RNG state", () => {
    let s = runAction(createRun({ seed: "SAVE-TEST" }), { type: "startBlind" });
    s = runAction(s, { type: "select", uid: s.hand[0] });
    expect(saveRun(s)).toBe(true);
    expect(loadRun()).toEqual(s);
  });
  it("does not overwrite the existing Hold’em save", () => {
    const existing = '{"session":"holdem-progress","handNumber":15}';
    localStorage.setItem("joker-holdem.game.v1", existing);
    saveRun(createRun());
    expect(localStorage.getItem("joker-holdem.game.v1")).toBe(existing);
  });
  it("migrates an old hand to rank order without changing progress or randomness", () => {
    const legacy = playingFixture([
      [4, "clubs"],
      [14, "spades"],
      [10, "hearts"],
      [13, "diamonds"],
    ]);
    delete legacy.handSort;
    legacy.selected = [legacy.hand[2]];
    const [four, ace, ten, king] = legacy.hand;
    saveRun(legacy);
    const restored = loadRun();
    expect(restored).toEqual({
      ...legacy,
      handSort: "rank",
      hand: [ace, king, ten, four],
    });
    expect(JSON.parse(localStorage.getItem(RUN_KEY)!)).toEqual(restored);
  });
  it.each(["rank", "suit"] as const)(
    "restores %s preference and manually adjusted order exactly",
    (by) => {
      let s = runAction(createRun({ seed: "SAVE-ORDER" }), {
        type: "startBlind",
      });
      s = runAction(s, { type: "sort", by });
      s = runAction(s, { type: "moveCard", uid: s.hand[0], direction: 1 });
      s = runAction(s, { type: "select", uid: s.hand[0] });
      saveRun(s);
      expect(loadRun()).toEqual(s);
    },
  );
  it("rejects malformed sorting preferences", () => {
    for (const handSort of ["random", null, 1]) {
      const invalid = { ...createRun({ seed: "INVALID-ORDER" }), handSort };
      expect(validRun(invalid)).toBe(false);
      localStorage.setItem(RUN_KEY, JSON.stringify(invalid));
      expect(loadRun()).toBeNull();
    }
  });
  it("returns a fresh setup on corrupt or incompatible data", () => {
    for (const value of [
      "{broken",
      "null",
      "[]",
      '{"version":99}',
      JSON.stringify({ ...createRun(), boss: "not-a-boss" }),
    ]) {
      localStorage.setItem(RUN_KEY, value);
      expect(loadRun()).toBeNull();
    }
  });
  it("rejects dangling cards, duplicate physical cards and unknown joker definitions", () => {
    let s = runAction(createRun(), { type: "startBlind" });
    s.hand.push("missing");
    expect(validRun(s)).toBe(false);
    s = runAction(createRun(), { type: "startBlind" });
    s.hand.push(s.hand[0]);
    expect(validRun(s)).toBe(false);
    s = createRun();
    s.jokers = [makeJoker(s, "joker")];
    s.jokers[0].id = "missing";
    expect(validRun(s)).toBe(false);
  });
  it("rejects a shop or pack with no content state", () => {
    const s = createRun();
    s.phase = "shop";
    expect(validRun(s)).toBe(false);
    s.phase = "pack";
    expect(validRun(s)).toBe(false);
  });
  it("reloads a purchased shop without rerolling the remaining stock", () => {
    let s = shopFixture();
    s.money = 80;
    const offer = s.shop!.offers[0];
    s = runAction(s, { type: "buy", uid: offer.uid });
    saveRun(s);
    const restored = loadRun()!;
    expect(restored.shop!.offers[0].sold).toBe(true);
    expect(restored.rng).toBe(s.rng);
    expect(restored.shop).toEqual(s.shop);
  });
  it("reports unavailable storage without interrupting gameplay", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(loadRun()).toBeNull();
    expect(saveRun(createRun())).toBe(false);
  });
  it("remembers deck/stake but leaves the seed blank for the next random run", () => {
    saveConfig({ deck: "erratic", stake: 7, seed: "PREVIOUS" });
    expect(loadConfig()).toEqual({ deck: "erratic", stake: 7, seed: "" });
    expect(localStorage.getItem(CONFIG_KEY)).not.toBeNull();
  });
});

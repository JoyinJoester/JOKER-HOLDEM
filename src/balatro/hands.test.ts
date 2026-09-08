import { describe, expect, it } from "vitest";
import { makeCard, createRun } from "./engine";
import { evaluateHand, hasFourSuits } from "./hands";
import type { HandId, RunCard } from "./types";

function cards(text: string): RunCard[] {
  const s = createRun({ seed: "HANDS" });
  return text
    .split(" ")
    .map((token) =>
      makeCard(
        s,
        ({ A: 14, K: 13, Q: 12, J: 11 } as Record<string, number>)[
          token.slice(0, -1)
        ] ?? Number(token.slice(0, -1)),
        ({ s: "spades", h: "hearts", c: "clubs", d: "diamonds" } as const)[
          token.at(-1)! as "s"
        ],
      ),
    );
}

describe("Balatro hand recognition", () => {
  it.each<[string, HandId, number]>([
    ["As Kc 9d 7h 3s", "high", 1],
    ["Ah Ad Ks 8c 2h", "pair", 2],
    ["Kh Kc 2s 2d 9s", "twoPair", 4],
    ["9h 9d 9c As 3s", "trips", 3],
    ["9s 8h 7c 6d 5s", "straight", 5],
    ["As Js 9s 4s 2s", "flush", 5],
    ["7h 7d 7c 9s 9d", "fullHouse", 5],
    ["2h 2d 2c 2s As", "quads", 4],
    ["9s 8s 7s 6s 5s", "straightFlush", 5],
    ["9s 9h 9d 9c 9c", "fiveKind", 5],
    ["Qs Qs Qs 7s 7s", "flushHouse", 5],
    ["Ah Ah Ah Ah Ah", "flushFive", 5],
  ])("%s recognizes %s with %i scoring cards", (input, id, n) => {
    const hand = evaluateHand(cards(input));
    expect(hand.id).toBe(id);
    expect(hand.scoring).toHaveLength(n);
  });
  it("scores only the pair and retains the submitted trigger order", () => {
    const c = cards("9s 3h As 9d 2d");
    expect(evaluateHand(c).scoring).toEqual([c[0].uid, c[3].uid]);
  });
  it("recognizes the wheel but never a wraparound straight", () => {
    expect(evaluateHand(cards("As 2h 3d 4c 5s")).id).toBe("straight");
    expect(evaluateHand(cards("Qs Kh As 2c 3s")).id).toBe("high");
  });
  it("royal flush shares the straight-flush level and planet", () => {
    expect(evaluateHand(cards("As Ks Qs Js 10s"))).toMatchObject({
      id: "straightFlush",
      name: "皇家同花顺",
    });
  });
  it("full house contains a pair, two pair, and trips for conditional jokers", () => {
    expect(evaluateHand(cards("9s 9h 9c 4d 4h")).contains).toEqual(
      expect.arrayContaining(["pair", "twoPair", "trips", "fullHouse"]),
    );
  });
  it("Four Fingers allows distinct four-card straight and flush subsets", () => {
    expect(
      evaluateHand(cards("2h 3h 4h 5s 9h"), { fourFingers: true }).id,
    ).toBe("straightFlush");
    expect(evaluateHand(cards("2h 3h 4h 5s 9h")).id).toBe("high");
  });
  it("Shortcut permits one missing rank but does not count duplicate ranks twice", () => {
    expect(evaluateHand(cards("10s 8h 6c 5s 3h"), { shortcut: true }).id).toBe(
      "straight",
    );
    expect(evaluateHand(cards("10s 8h 6c 5s 2h"), { shortcut: true }).id).toBe(
      "high",
    );
    expect(evaluateHand(cards("9s 9h 7c 5s 3h"), { shortcut: true }).id).toBe(
      "pair",
    );
  });
  it("stones always score without contributing ranks or suits", () => {
    const c = cards("9s 9h 7c 5s 3h");
    c[4].enhancement = "stone";
    expect(evaluateHand(c).scoring).toEqual([c[0].uid, c[1].uid, c[4].uid]);
    c.forEach((card) => (card.enhancement = "stone"));
    expect(evaluateHand(c).id).toBe("high");
    expect(evaluateHand(c).scoring).toHaveLength(5);
  });
  it("wild and smeared suits affect flush recognition", () => {
    const c = cards("As 10s 8s 5s 3h");
    c[4].enhancement = "wild";
    expect(evaluateHand(c).id).toBe("flush");
    expect(evaluateHand(cards("As 10c 8c 5s 3c"), { smeared: true }).id).toBe(
      "flush",
    );
  });
  it("Splash includes off-hand cards and Flower Pot requires four distinct cards", () => {
    const c = cards("As 9h 8d 5c");
    expect(evaluateHand(c, { splash: true }).scoring).toHaveLength(4);
    c.forEach((card) => (card.enhancement = "wild"));
    expect(hasFourSuits(c.slice(0, 3), false)).toBe(false);
    expect(hasFourSuits(c, false)).toBe(true);
    expect(hasFourSuits(cards("As 9s 8h 5h"), true)).toBe(true);
  });
});

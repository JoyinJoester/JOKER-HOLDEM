import { describe, expect, it } from "vitest";
import { runAction } from "./engine";
import { playingFixture } from "./fixtures";
import { buildScoreSteps, scoringView } from "./score-playback";
import { validRun } from "./storage";

describe("recorded score playback", () => {
  it("shows base chips, card chips, held effects and joker multipliers in order", () => {
    const before = playingFixture(
      [[14, "spades"]],
      [[13, "hearts", "steel"]],
      ["joker", "cavendish"],
    );
    const after = runAction(before, { type: "play" });
    const saved = structuredClone(after);
    const steps = buildScoreSteps(after.lastHand!);
    expect(steps[0]).toMatchObject({
      phase: "deal",
      chips: 0,
      mult: 0,
      subtotal: 0,
    });
    expect(
      steps.filter((s) => s.phase === "effect").map((s) => [s.chips, s.mult]),
    ).toEqual([
      [5, 1],
      [16, 1],
      [16, 1.5],
      [16, 5.5],
      [16, 16.5],
    ]);
    expect(steps.at(-1)).toMatchObject({
      phase: "bank",
      chips: 16,
      mult: 16.5,
      subtotal: 264,
    });
    expect(
      steps.filter((s) => s.trace?.joker).map((s) => s.trace!.joker),
    ).toEqual(before.jokers.map((j) => j.uid));
    expect(after).toEqual(saved);
    expect(validRun(after)).toBe(true);
  });

  it("uses the engine's exact plasma balance instead of summing display labels", () => {
    const before = playingFixture([[14, "spades"]], [], ["stunt"]);
    before.config.deck = "plasma";
    const after = runAction(before, { type: "play" });
    const steps = buildScoreSteps(after.lastHand!);
    expect(steps.find((s) => s.label.startsWith("等离子"))).toMatchObject({
      chips: 133.5,
      mult: 133.5,
      subtotal: 17822,
    });
    expect(steps.at(-1)!.subtotal).toBe(after.lastHand!.score);
  });

  it("keeps pre-hand money effects separate from the base score", () => {
    const before = playingFixture([[2, "spades"]]);
    before.boss = "tooth";
    before.blind = 2;
    const after = runAction(before, { type: "play" });
    const steps = buildScoreSteps(after.lastHand!);
    expect(steps[1]).toMatchObject({ money: -1, chips: 0, mult: 0 });
    expect(steps.at(-1)).toMatchObject({ chips: 7, mult: 1, subtotal: 7 });
  });

  it.each(["playing", "cashout", "lost"] as const)(
    "delays %s result and refills until playback finishes",
    (phase) => {
      const before = playingFixture(
        [[14, "spades"]],
        [
          [13, "hearts"],
          [7, "clubs"],
        ],
      );
      before.score = 10;
      if (phase === "cashout") before.target = 11;
      if (phase === "lost") before.handsLeft = 1;
      const after = runAction(before, { type: "play" });
      expect(after.phase).toBe(phase);
      const snapshot = structuredClone({ before, after });
      const steps = buildScoreSteps(after.lastHand!);
      steps.forEach((step, index) => {
        const view = scoringView({ before, after, steps, index });
        expect(view.phase).toBe("playing");
        expect(view.hand).toEqual(before.hand.slice(1));
        expect(view.selected).toEqual([]);
        expect(view.score).toBe(
          step.phase === "bank" ? after.score : before.score,
        );
      });
      expect({ before, after }).toEqual(snapshot);
    },
  );

  it("plays a blocked hand without ever showing a positive award", () => {
    const before = playingFixture([[14, "spades"]]);
    before.boss = "psychic";
    before.blind = 2;
    const after = runAction(before, { type: "play" });
    const steps = buildScoreSteps(after.lastHand!);
    expect(after.lastHand!.blocked).not.toBeNull();
    expect(steps.every((s) => s.subtotal === 0)).toBe(true);
    expect(steps.at(-2)!.label).toContain("必须打出 5 张牌");
  });

  it("retains retriggers while bounding normal and fast playback duration", () => {
    const after = runAction(
      playingFixture([[13, "spades"]], [], ["photo", "chad"]),
      { type: "play" },
    );
    const hand = after.lastHand!;
    const repeated = {
      ...hand,
      trace: Array.from({ length: 80 }, () => hand.trace).flat(),
    };
    const normal = buildScoreSteps(repeated);
    const fast = buildScoreSteps(repeated, true);
    expect(normal.filter((s) => s.phase === "effect")).toHaveLength(
      repeated.trace.length,
    );
    expect(normal.reduce((sum, s) => sum + s.duration, 0)).toBeLessThan(9000);
    expect(fast.reduce((sum, s) => sum + s.duration, 0)).toBeLessThan(3500);
    expect(fast.every((s) => s.duration > 0)).toBe(true);
    expect(fast.at(-1)!.subtotal).toBe(hand.score);
  });
});

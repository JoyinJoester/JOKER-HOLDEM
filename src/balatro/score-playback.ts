import type { PlayedHand, RunState, Trace } from "./types";

export interface ScoreStep {
  phase: "deal" | "effect" | "total" | "bank";
  label: string;
  chips: number;
  mult: number;
  subtotal: number;
  money: number;
  duration: number;
  trace?: Trace;
}

export interface ScorePlayback {
  before: RunState;
  after: RunState;
  steps: ScoreStep[];
  index: number;
}

/** Replays recorded effects; it never rolls randomness or evaluates a hand again. */
export function buildScoreSteps(hand: PlayedHand, fast = false): ScoreStep[] {
  let chips = 0,
    mult = 0,
    money = 0;
  const steps: ScoreStep[] = [
    {
      phase: "deal",
      label: `${hand.name} · Lv.${hand.level}`,
      chips: 0,
      mult: 0,
      subtotal: 0,
      money: 0,
      duration: fast ? 200 : 420,
    },
  ];
  // Large retrigger combinations speed up progressively instead of blocking for minutes.
  const duration = Math.min(
    fast ? 120 : 320,
    (fast ? 2200 : 6500) / Math.max(1, hand.trace.length),
  );
  for (const trace of hand.trace) {
    chips =
      trace.totals?.chips ??
      Math.min(Number.MAX_VALUE, chips + (trace.chips ?? 0));
    mult =
      trace.totals?.mult ??
      Math.min(
        Number.MAX_VALUE,
        (mult + (trace.mult ?? 0)) * (trace.factor ?? 1),
      );
    money += trace.money ?? 0;
    steps.push({
      phase: "effect",
      label: trace.label,
      chips,
      mult,
      money,
      duration,
      trace,
      subtotal: hand.blocked
        ? 0
        : Math.min(Number.MAX_VALUE, Math.floor(chips * mult)),
    });
  }
  const result = {
    chips: hand.chips,
    mult: hand.mult,
    subtotal: hand.score,
    money,
  };
  steps.push(
    {
      ...result,
      phase: "total",
      label: hand.blocked ?? "本手得分",
      duration: fast ? 250 : 520,
    },
    {
      ...result,
      phase: "bank",
      label: hand.blocked ? "本手不计分" : "计入本关得分",
      duration: fast ? 400 : 800,
    },
  );
  return steps;
}

/** Keep the table in play until the last effect and score transfer have finished. */
export function scoringView(playback: ScorePlayback): RunState {
  const { before, after, steps, index } = playback;
  const step = steps[index];
  const playedIds = new Set(after.lastHand!.cards.map((c) => c.uid));
  return {
    ...before,
    phase: "playing",
    lastHand: after.lastHand,
    hand: before.hand.filter((id) => !playedIds.has(id)),
    selected: [],
    forcedCard: null,
    handsLeft: after.handsLeft,
    handsUsed: after.handsUsed,
    totalHands: after.totalHands,
    score: step.phase === "bank" ? after.score : before.score,
    money: before.money + step.money,
    message: "正在计分，效果依次结算…",
  };
}

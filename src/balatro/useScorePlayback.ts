import { useCallback, useEffect, useRef, useState } from "react";
import { playSound } from "../sound";
import type { Settings } from "../storage";
import { buildScoreSteps, type ScorePlayback } from "./score-playback";
import type { RunState } from "./types";

export function useScorePlayback(settings: Settings) {
  const [playback, setPlayback] = useState<ScorePlayback | null>(null);
  const active = useRef<ScorePlayback | null>(null);
  const locked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preferences = useRef(settings);
  useEffect(() => {
    preferences.current = settings;
  }, [settings]);

  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    active.current = null;
    locked.current = false;
    setPlayback(null);
  }, []);
  const finish = useCallback(() => {
    const sequence = active.current;
    cancel();
    if (sequence && preferences.current.sound)
      playSound(
        sequence.after.phase === "cashout" ? "win" : "chip",
        preferences.current.volume,
      );
  }, [cancel]);

  const start = useCallback(
    (before: RunState, after: RunState) => {
      cancel();
      if (!after.lastHand) return;
      const sequence: ScorePlayback = {
        before,
        after,
        steps: buildScoreSteps(after.lastHand, preferences.current.fast),
        index: 0,
      };
      active.current = sequence;
      locked.current = true;
      let end = 0;
      const boundaries = sequence.steps.map((step) => (end += step.duration));
      const started = performance.now();
      let index = 0;
      let lastSound = -Infinity;
      const advance = () => {
        if (active.current !== sequence) return;
        const now = performance.now();
        const elapsed = now - started;
        while (index < boundaries.length && elapsed >= boundaries[index])
          index++;
        if (index >= sequence.steps.length) {
          finish();
          return;
        }
        const step = sequence.steps[index];
        setPlayback({ ...sequence, index });
        if (
          preferences.current.sound &&
          now - lastSound >= 90 &&
          (step.phase === "deal" || step.phase === "effect")
        ) {
          playSound(
            step.phase === "deal" ? "card" : "chip",
            preferences.current.volume,
          );
          lastSound = now;
        }
        timer.current = setTimeout(
          advance,
          Math.max(16, boundaries[index] - elapsed),
        );
      };
      advance();
    },
    [cancel, finish],
  );

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
      active.current = null;
      locked.current = false;
    },
    [],
  );

  return { playback, locked, start, finish, cancel };
}

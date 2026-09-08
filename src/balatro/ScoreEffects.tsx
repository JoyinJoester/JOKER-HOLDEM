import { useEffect, useRef, useState, type CSSProperties } from "react";
import { number } from "./presentation";
import type { ScoreStep } from "./score-playback";

export function ScoreNumber({
  value,
  duration = 220,
  animate = false,
  integer = false,
}: {
  value: number;
  duration?: number;
  animate?: boolean;
  integer?: boolean;
}) {
  const [shown, setShown] = useState(value);
  const latest = useRef(value);
  useEffect(() => {
    const from = latest.current;
    if (!animate || duration <= 0 || from === value) {
      latest.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      latest.current =
        progress === 1 ? value : from * (1 - eased) + value * eased;
      setShown(latest.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, animate]);
  const label = number(integer ? Math.floor(shown) : shown);
  return (
    <span
      data-score-value={value}
      style={
        {
          "--score-digits": Math.max(label.length, number(value).length),
        } as CSSProperties
      }
    >
      {label}
    </span>
  );
}

export function ScoreCue({ step }: { step: ScoreStep }) {
  const t = step.trace;
  return (
    <div className="rg-score-cue">
      <span className="rg-score-effect-label" title={step.label}>
        {step.label}
      </span>
      {t && (
        <span className="rg-score-deltas">
          {t.chips !== undefined && (
            <b className="rg-blue">+{number(t.chips)} 筹码</b>
          )}
          {t.mult !== undefined && (
            <b className="rg-coral">+{number(t.mult)} 倍率</b>
          )}
          {t.factor !== undefined && (
            <b className="rg-coral">×{number(t.factor)} 倍率</b>
          )}
          {t.money !== undefined && (
            <b className="rg-gold">
              {t.money >= 0 ? "+" : "−"}${number(Math.abs(t.money))}
            </b>
          )}
        </span>
      )}
    </div>
  );
}

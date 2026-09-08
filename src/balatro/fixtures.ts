import type { Suit } from "../poker";
import { createRun, makeCard, makeJoker, runAction } from "./engine";
import type { Edition, Enhancement, RunState, Seal } from "./types";

export type CardSpec = [number, Suit, Enhancement?, Seal?, Edition?];

/** Deterministic fixtures shared by domain tests and isolated browser sessions. */
export function playingFixture(
  played: CardSpec[],
  held: CardSpec[] = [],
  ids: string[] = [],
): RunState {
  const s = createRun({ seed: "RULE-CHECK", deck: "red" });
  const cards = [...played, ...held].map(
    ([rank, suit, enhancement = "base", seal = "none", edition = "base"]) => ({
      ...makeCard(s, rank, suit),
      enhancement,
      seal,
      edition,
    }),
  );
  s.drawPile = s.deck.map((c) => c.uid);
  s.deck.push(...cards);
  s.initialDeckSize = s.deck.length;
  s.hand = cards.map((c) => c.uid);
  s.selected = cards.slice(0, played.length).map((c) => c.uid);
  s.jokers = ids.map((id) => ({
    ...makeJoker(s, id),
    edition: "base",
    eternal: false,
    perish: null,
    rental: false,
  }));
  s.phase = "playing";
  s.round = 1;
  s.handsLeft = 4;
  s.discardsLeft = 4;
  s.target = 1e12;
  return s;
}

export function shopFixture(seed = "SHOP-CHECK"): RunState {
  let s = runAction(createRun({ seed }), { type: "startBlind" });
  s.target = 1;
  s.selected = [s.hand[0]];
  s = runAction(s, { type: "play" });
  s = runAction(s, { type: "cashout" });
  return s;
}

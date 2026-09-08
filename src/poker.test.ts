import { describe, expect, it } from "vitest";
import {
  act,
  advanceStreet,
  BUY_IN,
  cardId,
  chooseAiAction,
  compareRanks,
  createGame,
  evaluate,
  legalActions,
  makeDeck,
  potTotal,
  settle,
  startHand,
  type Card,
  type GameState,
} from "./poker";

const cards = (text: string): Card[] =>
  text.split(" ").map((value) => ({
    rank:
      ({ A: 14, K: 13, Q: 12, J: 11, T: 10 } as Record<string, number>)[
        value[0]
      ] ?? Number(value[0]),
    suit: ({ s: "spades", h: "hearts", c: "clubs", d: "diamonds" } as const)[
      value[1] as "s" | "h" | "c" | "d"
    ],
  }));

function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

describe("hand evaluator", () => {
  it.each([
    ["As Ks Qs Js Ts 2d 3c", 8, "皇家同花顺"],
    ["9h 8h 7h 6h 5h Ac As", 8, "同花顺"],
    ["Ks Kh Kc Kd As 2d 3c", 7, "四条"],
    ["Qs Qh Qc 8s 8h 2d 3c", 6, "葫芦"],
    ["As Js 9s 5s 2s Kh Kd", 5, "同花"],
    ["9s 8h 7c 6d 5s Ac 2d", 4, "顺子"],
    ["8s 8h 8c Ad Ks 4c 2d", 3, "三条"],
    ["As Ah 8c 8d Ks 3c 2d", 2, "两对"],
    ["As Ah Jc 9d 7s 3c 2d", 1, "一对"],
    ["As Jh 9c 7d 5s 3c 2d", 0, "高牌"],
  ])("ranks %s correctly", (input, category, name) => {
    const result = evaluate(cards(input));
    expect(result.category).toBe(category);
    expect(result.name).toBe(name);
    expect(result.cards).toHaveLength(5);
  });
  it("recognizes the wheel, without wrapping Q-K-A-2-3", () => {
    expect(evaluate(cards("As 2h 3c 4d 5s Kh Qd")).values).toEqual([5]);
    expect(evaluate(cards("Qs Kh Ac 2d 3s 9c 7d")).category).toBe(0);
  });
  it("uses the higher triplet and the other triplet as the pair", () => {
    expect(evaluate(cards("As Ah Ac Kd Ks Kh 2d")).values).toEqual([14, 13]);
  });
  it("chooses the top two pairs and the best remaining kicker", () => {
    expect(evaluate(cards("As Ah Kc Kd Qs Qh 2d")).values).toEqual([
      14, 13, 12,
    ]);
  });
  it("compares kickers and never ranks suits", () => {
    expect(
      compareRanks(
        evaluate(cards("As Ah Kc Jd 9s")),
        evaluate(cards("Ad Ac Qh Js 9d")),
      ),
    ).toBeGreaterThan(0);
    expect(
      compareRanks(
        evaluate(cards("As Kh Qc Jd 9s")),
        evaluate(cards("Ad Kc Qh Js 9d")),
      ),
    ).toBe(0);
  });
});

describe("betting and transitions", () => {
  it("deals unique cards, posts blinds and gives the first decision to the human", () => {
    const game = createGame(seeded(1));
    expect(game.actor).toBe(0);
    expect(game.dealer).toBe(1);
    expect(potTotal(game)).toBe(30);
    expect(
      new Set(
        [...game.deck, ...game.players.flatMap((p) => p.cards)].map(cardId),
      ).size,
    ).toBe(52);
    expect(game.players[0].stack).toBe(BUY_IN);
  });
  it("does not allow a check facing a bet or an undersized raise", () => {
    const game = createGame();
    expect(() => act(game, { type: "check" })).toThrow();
    for (const amount of [39, -1, NaN, Infinity, 2001, 40.5])
      expect(() => act(game, { type: "raise", amount })).toThrow();
    expect(game.players[0].stack).toBe(BUY_IN);
  });
  it("keeps the big blind option and resets betting on the flop", () => {
    let game = createGame();
    for (let i = 0; i < 3; i++) game = act(game, { type: "call" });
    expect(game.actor).toBe(game.bigBlind);
    expect(legalActions(game).canCheck).toBe(true);
    game = act(game, { type: "check" });
    expect(game.actor).toBeNull();
    game = advanceStreet(game);
    expect(game.community).toHaveLength(3);
    expect(game.actor).toBe(game.smallBlind);
    expect(game.currentBet).toBe(0);
    expect(game.minRaise).toBe(20);
    expect(potTotal(game)).toBe(80);
  });
  it("a short all-in requires a call but does not reopen a full raise", () => {
    let game = createGame();
    game = act(game, { type: "raise", amount: 100 });
    game.players[1].stack = 140;
    game = act(game, { type: "allin" });
    expect(game.currentBet).toBe(140);
    expect(game.minRaise).toBe(80);
    game = act(game, { type: "call" });
    game = act(game, { type: "call" });
    expect(game.actor).toBe(0);
    expect(legalActions(game).toCall).toBe(40);
    expect(legalActions(game).canRaise).toBe(false);
    expect(() => act(game, { type: "allin" })).toThrow();
    game = act(game, { type: "call" });
    expect(game.actor).toBeNull();
  });
  it("cumulative short raises can reopen the original raiser", () => {
    let game = createGame();
    game = act(game, { type: "raise", amount: 100 });
    game.players[1].stack = 140;
    game = act(game, { type: "allin" });
    game.players[2].stack = 170;
    game = act(game, { type: "allin" });
    expect(game.currentBet).toBe(180);
    game = act(game, { type: "call" });
    expect(game.actor).toBe(0);
    expect(legalActions(game).canRaise).toBe(true);
    expect(legalActions(game).minRaise).toBe(260);
  });
  it("awards the pot immediately after all other players fold", () => {
    let game = createGame();
    for (let i = 0; i < 3; i++) game = act(game, { type: "fold" });
    expect(game.result?.winners).toEqual([3]);
    expect(game.players[3].stack).toBe(2010);
    expect(game.players.reduce((sum, p) => sum + p.stack, 0)).toBe(8000);
  });
  it("handles heads-up dealer/small blind and postflop order", () => {
    let game = createGame();
    game.result = {
      winners: [],
      payouts: {},
      ranks: {},
      pots: [],
      totalPot: 0,
      uncontested: true,
    };
    game.players[1].stack = 0;
    game.players[3].stack = 0;
    game = startHand(game);
    expect(game.dealer).toBe(2);
    expect(game.smallBlind).toBe(2);
    expect(game.bigBlind).toBe(0);
    expect(game.actor).toBe(2);
    game = act(game, { type: "call" });
    game = act(game, { type: "check" });
    game = advanceStreet(game);
    expect(game.actor).toBe(0);
  });
  it("runs out the board when only all-in players remain", () => {
    let game = createGame();
    game = act(game, { type: "allin" });
    while (game.actor !== null) game = act(game, { type: "call" });
    for (let i = 0; i < 4; i++) game = advanceStreet(game);
    expect(game.result).not.toBeNull();
    expect(game.community).toHaveLength(5);
    expect(game.players.reduce((sum, p) => sum + p.stack, 0)).toBe(8000);
  });
});

function showdown(
  contributions: number[],
  hands: string[],
  board = "2s 4h 7c 9d Js",
): GameState {
  const game = createGame();
  game.community = cards(board);
  game.actor = null;
  game.street = "river";
  game.players.forEach((p, i) => {
    p.stack = 0;
    p.contributed = contributions[i];
    p.cards = cards(hands[i]);
    p.folded = false;
    p.allIn = true;
    p.eliminated = false;
  });
  return game;
}

describe("side pots and tied pots", () => {
  it("awards the main pot and each side pot to independently eligible players", () => {
    const game = settle(
      showdown([100, 300, 500, 500], ["As Ah", "Ks Kh", "Qs Qh", "Ts Th"]),
    );
    expect(game.result?.payouts).toEqual({ 0: 400, 1: 600, 2: 400, 3: 0 });
    expect(game.players.reduce((sum, p) => sum + p.stack, 0)).toBe(1400);
  });
  it("returns unmatched overbets separately from pot wins", () => {
    const game = settle(
      showdown([100, 300, 500, 700], ["As Ah", "Ks Kh", "Qs Qh", "Ts Th"]),
    );
    expect(game.result?.payouts).toEqual({ 0: 400, 1: 600, 2: 400, 3: 200 });
    expect(game.result?.pots.at(-1)?.refund).toBe(true);
    expect(game.result?.winners).not.toContain(3);
  });
  it("keeps folded chips in pots but excludes folded hands from eligibility", () => {
    const state = showdown(
      [100, 100, 100, 100],
      ["As Ah", "Ks Kh", "Qs Qh", "Ts Th"],
    );
    state.players[0].folded = true;
    const game = settle(state);
    expect(game.result?.payouts[1]).toBe(400);
    expect(game.result?.payouts[0]).toBe(0);
  });
  it("splits tied odd pots clockwise from the dealer without losing chips", () => {
    const state = showdown(
      [5, 5, 5, 0],
      ["As Qc", "Ad Qh", "Ks Th", "3c 5c"],
      "2s 4h 7c 9d Js",
    );
    state.dealer = 3;
    state.players[2].folded = true;
    state.players[3].folded = true;
    const game = settle(state);
    expect(game.result?.payouts).toEqual({ 0: 8, 1: 7, 2: 0, 3: 0 });
  });
  it("splits a royal flush on the board across all contenders", () => {
    const game = settle(
      showdown(
        [200, 200, 200, 200],
        ["2h 3h", "4d 5d", "6c 7c", "8h 9h"],
        "As Ks Qs Js Ts",
      ),
    );
    expect(game.result?.payouts).toEqual({ 0: 200, 1: 200, 2: 200, 3: 200 });
  });
});

describe("game invariants", () => {
  it("conserves chips and terminates across hundreds of randomized hands", () => {
    const random = seeded(2918);
    let completed = 0;
    for (let match = 0; match < 30; match++) {
      let game = createGame(random);
      for (let hand = 0; hand < 15; hand++) {
        let decisions = 0;
        while (!game.result && decisions++ < 180) {
          if (game.actor === null) game = advanceStreet(game);
          else {
            const legal = legalActions(game);
            const roll = random();
            if (roll < 0.12) game = act(game, { type: "fold" });
            else if (roll > 0.86 && legal.canRaise)
              game = act(game, { type: "raise", amount: legal.minRaise });
            else if (roll > 0.98 && legal.canAllIn)
              game = act(game, { type: "allin" });
            else game = act(game, { type: legal.canCheck ? "check" : "call" });
          }
          const total =
            game.players.reduce((sum, p) => sum + p.stack, 0) +
            (game.result ? 0 : potTotal(game));
          expect(total).toBe(8000);
          expect(game.players.every((p) => p.stack >= 0)).toBe(true);
        }
        expect(game.result).not.toBeNull();
        completed++;
        if (game.players.filter((p) => p.stack > 0).length < 2) break;
        game = startHand(game, random);
      }
    }
    expect(completed).toBeGreaterThan(250);
  });
  it("makes identical AI choices when only opponents hidden cards change", () => {
    const game = act(createGame(seeded(13)), { type: "call" });
    const altered = structuredClone(game);
    altered.players
      .filter((p) => p.id !== altered.actor)
      .forEach((p) => {
        p.cards = makeDeck().slice(0, 2);
      });
    expect(chooseAiAction(game, "normal", seeded(31))).toEqual(
      chooseAiAction(altered, "normal", seeded(31)),
    );
  });
});

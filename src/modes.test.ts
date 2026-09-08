import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  MODE_META,
  MODE_ORDER,
  RAINBOW_PERCENT,
  blindAmounts,
  validateConfig,
  type GameMode,
} from "./modes";
import {
  act,
  advanceStreet,
  allShopReady,
  cardId,
  chooseAiAction,
  contestedWinnings,
  createGame,
  legalActions,
  openShop,
  settle,
  shopAction,
  shopForAi,
  startHand,
  type Card,
} from "./poker";

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}
const cards = (value: string): Card[] =>
  value.split(" ").map((card) => ({
    rank:
      ({ A: 14, K: 13, Q: 12, J: 11, T: 10 } as Record<string, number>)[
        card[0]
      ] ?? Number(card[0]),
    suit: ({ s: "spades", h: "hearts", c: "clubs", d: "diamonds" } as const)[
      card[1] as "s" | "h" | "c" | "d"
    ],
  }));

function showdown(
  mode: GameMode,
  contributions = [100, 100],
  hands = ["As Ah", "Ks Kh"],
  board = "2s 4h 7c 9d Js",
  remaining?: number[],
) {
  const state = createGame(seeded(100), { mode, seats: contributions.length });
  state.community = cards(board);
  state.actor = null;
  state.street = "river";
  state.bonuses = [];
  state.issuedChips = 0;
  state.players.forEach((p, i) => {
    p.stack = remaining?.[i] ?? 0;
    p.contributed = p.bet = contributions[i];
    p.cards = cards(hands[i]);
    p.jokers = [];
    p.eliminated = p.folded = false;
    p.allIn = p.stack === 0;
  });
  return state;
}

function shop() {
  const state = showdown(
    "jokers",
    [100, 100],
    ["As Ah", "Ks Kh"],
    "2s 4h 7c 9d Js",
    [1900, 1900],
  );
  state.players.forEach((p) => (p.jokers = ["shield"]));
  const shopping = openShop(settle(state), seeded(10));
  shopping.shop!.offers = ["star", "coin", "joker"];
  return shopping;
}

describe("table configuration and growing blinds", () => {
  it.each([2, 3, 4, 5, 6])(
    "deals %i distinct seats with legal AI decisions",
    (seats) => {
      const state = createGame(seeded(seats), { seats, difficulty: "hard" });
      expect(state.players).toHaveLength(seats);
      expect(state.players.every((p) => p.cards.length === 2)).toBe(true);
      expect(
        new Set(
          [...state.deck, ...state.players.flatMap((p) => p.cards)].map(cardId),
        ).size,
      ).toBe(52);
      expect(state.lastFacedBet).toHaveLength(seats);
      expect(() =>
        act(state, chooseAiAction(state, "hard", seeded(5))),
      ).not.toThrow();
    },
  );

  it("keeps nonconsecutive human seat IDs while vacant seats stay out of the hand", () => {
    const state = createGame(seeded(1), {
      seats: 6,
      fillBots: false,
      activeSeats: [1, 5],
    });
    expect(state.players.filter((p) => p.occupied).map((p) => p.id)).toEqual([
      1, 5,
    ]);
    expect(
      state.players
        .filter((p) => !p.occupied)
        .every((p) => !p.stack && !p.cards.length && p.eliminated),
    ).toBe(true);
    expect(
      state.players.reduce((sum, p) => sum + p.stack + p.contributed, 0),
    ).toBe(4000);
    expect(state.actor).toBe(state.smallBlind);
    expect([1, 5]).toContain(state.bigBlind);
  });

  it.each([
    { mode: "unknown" },
    { seats: 1 },
    { seats: 7 },
    { seats: 2.5 },
    { difficulty: "impossible" },
    { fillBots: "false" },
  ])("rejects invalid public configuration %j", (invalid) => {
    expect(() => validateConfig({ ...DEFAULT_CONFIG, ...invalid })).toThrow();
  });

  it.each(["classic", "blitz"] as const)(
    "applies %s buy-in and blind levels when actually dealing",
    (mode) => {
      let state = createGame(seeded(1), { seats: 2, mode });
      expect(state.players.reduce((sum, p) => sum + p.stack + p.bet, 0)).toBe(
        mode === "blitz" ? 1000 : 4000,
      );
      for (let hand = 1; hand <= 5; hand++) {
        const expected =
          mode === "blitz" ? 10 * 2 ** (hand - 1) : hand < 5 ? 10 : 20;
        expect(state.blinds).toEqual({ small: expected, big: expected * 2 });
        expect(state.currentBet).toBe(expected * 2);
        state = act(state, { type: "fold" });
        if (hand < 5) state = startHand(state, seeded(hand));
      }
      expect(blindAmounts("classic", 9)).toEqual({ small: 40, big: 80 });
    },
  );
});

describe("rainbow rewards", () => {
  it.each([
    ["As Qc", "Ks Th", "2s 4h 7c 9d Js", 0],
    ["As Ah", "Ks Qh", "2s 4h 7c 9d Js", 1],
    ["As Ah", "Ks Qh", "2s 2h 7c 9d Js", 2],
    ["As Ah", "Ks Qh", "Ac 2h 7c 9d Js", 3],
    ["As Kh", "8s 9h", "Qs Jh Tc 2d 5s", 4],
    ["As Ks", "Ah Kh", "Qs 9s 7s 4d 2c", 5],
    ["As Ah", "Ks Qh", "Ac 2h 2c 9d Js", 6],
    ["As Ah", "Ks Qh", "Ac Ad 2c 9d Js", 7],
    ["As Ks", "Ah Kh", "Qs Js Ts 2d 3c", 8],
    ["9h 8h", "As Kh", "7h 6h 5h 2d 3c", 8],
  ] as const)(
    "scales %s on %s / %s at category %i",
    (winner, loser, board, category) => {
      const game = settle(
        showdown("rainbow", [101, 101], [winner, loser], board),
      );
      expect(game.result!.winners).toEqual([0]);
      expect(game.result!.ranks[0].category).toBe(category);
      const bonus = Math.floor((202 * (RAINBOW_PERCENT[category] - 100)) / 100);
      expect(game.players[0].stack).toBe(202 + bonus);
      expect(game.issuedChips).toBe(bonus);
      expect(Number.isInteger(game.players[0].stack)).toBe(true);
    },
  );

  it("scales separate side-pot shares and excludes unmatched refunds", () => {
    const game = settle(
      showdown(
        "rainbow",
        [100, 300, 500, 700],
        ["As Ah", "Ks Kh", "Qs Qh", "Ts Th"],
      ),
    );
    expect(game.result!.payouts).toEqual({ 0: 400, 1: 600, 2: 400, 3: 200 });
    expect(game.players.map((p) => p.stack)).toEqual([480, 720, 480, 200]);
    expect(game.issuedChips).toBe(280);
    const overbet = settle(showdown("rainbow", [700, 100]));
    expect(contestedWinnings(overbet, 0)).toBe(200);
    expect(overbet.players[0].stack).toBe(840);
  });

  it("multiplies the actual odd-chip split rather than the entire pot for each winner", () => {
    const state = showdown(
      "rainbow",
      [5, 5, 5],
      ["2h 3h", "4d 5d", "6c 7c"],
      "As Ks Qs Js Ts",
    );
    state.dealer = 2;
    state.players[2].folded = true;
    const game = settle(state);
    expect(game.result!.payouts).toEqual({ 0: 8, 1: 7, 2: 0 });
    expect(game.players.map((p) => p.stack)).toEqual([80, 70, 0]);
  });

  it("does not multiply a pot won without a showdown", () => {
    const state = showdown("rainbow");
    state.players[1].folded = true;
    const game = settle(state);
    expect(game.result!.uncontested).toBe(true);
    expect(game.issuedChips).toBe(0);
    expect(game.bonuses).toEqual([]);
  });
});

describe("joker equipment", () => {
  it("stacks star, straight and double-joker bonuses on actual winning shares", () => {
    const state = showdown(
      "jokers",
      [100, 100],
      ["As Kh", "8s 9h"],
      "Qs Jh Tc 2d 5s",
    );
    state.players[0].jokers = ["star", "clover", "joker"];
    const game = settle(state);
    expect(game.issuedChips).toBe(500);
    expect(game.players[0].stack).toBe(700);
    expect(game.bonuses.map((b) => b.amount)).toEqual([100, 200, 200]);
  });

  it("does not trigger clover below a straight or on an uncontested hand", () => {
    const state = showdown("jokers");
    state.players[0].jokers = ["clover"];
    expect(settle(state).issuedChips).toBe(0);
    state.players[1].folded = true;
    expect(settle(state).issuedChips).toBe(0);
  });

  it("grants star and double-joker rewards on uncontested winnings, excluding uncalled chips", () => {
    const state = showdown("jokers", [700, 100]);
    state.players[0].jokers = ["star", "joker"];
    state.players[1].folded = true;
    const game = settle(state);
    expect(game.result!.payouts[0]).toBe(800);
    expect(game.issuedChips).toBe(300);
  });

  it("refunds only actual losses, never previously returned unmatched bets", () => {
    const state = showdown("jokers", [100, 500]);
    state.players[1].jokers = ["shield"];
    const game = settle(state);
    expect(game.players[1].stack).toBe(450);
    expect(game.bonuses[0].amount).toBe(50);
    state.players[1].jokers = ["joker"];
    expect(settle(state).players[1].stack).toBe(500);
  });

  it("caps stacked refund cards at the invested amount and excludes folds", () => {
    const state = showdown("jokers");
    state.players[1].jokers = ["shield", "joker", "shield"];
    expect(settle(state).players[1].stack).toBe(100);
    expect(settle(state).issuedChips).toBe(100);
    state.players[1].folded = true;
    expect(settle(state).players[1].stack).toBe(0);
  });

  it("transfers bounty chips with no negative stacks or minted money", () => {
    const state = showdown(
      "jokers",
      [100, 100, 100],
      ["As Ah", "Ks Kh", "Qs Qh"],
      "2s 4h 7c 9d Js",
      [900, 5, 30],
    );
    state.players[0].jokers = ["skull", "skull"];
    const game = settle(state);
    expect(game.players.map((p) => p.stack)).toEqual([1235, 0, 0]);
    expect(game.issuedChips).toBe(0);
    expect(
      game.bonuses.filter((b) => b.source === "skull").map((b) => b.amount),
    ).toEqual([25, 10]);
  });

  it("grants coin income when dealing and uses the current small blind", () => {
    let game = shop();
    game.handNumber = 4;
    game.players[0].jokers = ["coin", "coin"];
    game.players.forEach((p) => (p.ready = true));
    const before = game.players.reduce((sum, p) => sum + p.stack, 0);
    const issuedBefore = game.issuedChips;
    game = startHand(game, seeded(2));
    expect(game.blinds.small).toBe(20);
    expect(game.issuedChips - issuedBefore).toBe(200);
    expect(
      game.players.reduce((sum, p) => sum + p.stack + p.contributed, 0),
    ).toBe(before + 200);
    expect(game.bonuses.map((b) => b.amount)).toEqual([100, 100]);
  });
});

describe("shared joker shop", () => {
  it("grants participation coins once and gives empty inventories a joker", () => {
    const state = showdown(
      "jokers",
      [100, 100],
      ["As Ah", "Ks Kh"],
      "2s 4h 7c 9d Js",
      [1900, 1900],
    );
    const game = openShop(settle(state), seeded(1));
    expect(game.players.map((p) => p.coins)).toEqual([9, 6]);
    expect(game.players.every((p) => p.jokers.length === 1)).toBe(true);
    expect(new Set(game.shop!.offers).size).toBe(3);
    expect(openShop(game)).toBe(game);
    expect(() => openShop(createGame())).toThrow();
  });

  it("shares purchased stock and validates money, inventory and ownership", () => {
    let game = shop();
    game = shopAction(game, 0, { type: "buy", jokerId: "star" });
    expect(game.players[0].coins).toBe(4);
    expect(game.players[0].jokers).toEqual(["shield", "star"]);
    expect(game.shop!.offers).not.toContain("star");
    expect(() => shopAction(game, 1, { type: "buy", jokerId: "star" })).toThrow(
      /买走/,
    );
    expect(() => shopAction(game, 0, { type: "buy", jokerId: "coin" })).toThrow(
      /不足/,
    );
    expect(() =>
      shopAction(game, 0, { type: "sell", jokerId: "coin" }),
    ).toThrow(/没有/);
    game = shopAction(game, 0, { type: "sell", jokerId: "star" });
    expect(game.players[0].coins).toBe(6);
    game.players[0].jokers = ["shield", "shield", "shield"];
    expect(() => shopAction(game, 0, { type: "buy", jokerId: "coin" })).toThrow(
      /最多/,
    );
  });

  it("charges only the refresher and permits stacking duplicate equipment", () => {
    let game = shop();
    game = shopAction(game, 0, { type: "refresh" }, seeded(6));
    expect(game.players.map((p) => p.coins)).toEqual([8, 6]);
    expect(new Set(game.shop!.offers).size).toBe(3);
    game.shop!.offers = ["shield"];
    game = shopAction(game, 0, { type: "buy", jokerId: "shield" });
    expect(game.players[0].jokers).toEqual(["shield", "shield"]);
    game.players[0].coins = 0;
    expect(() => shopAction(game, 0, { type: "refresh" })).toThrow(/1 枚/);
  });

  it("requires every live player to be ready and locks equipment after readiness", () => {
    let game = shop();
    expect(() => startHand(game)).toThrow(/准备/);
    game = shopAction(game, 0, { type: "ready" });
    expect(allShopReady(game)).toBe(false);
    expect(() => shopAction(game, 0, { type: "refresh" })).toThrow(/已准备/);
    game = shopForAi(game, 1);
    expect(game.players[1].jokers).toContain("joker");
    expect(allShopReady(game)).toBe(true);
    const next = startHand(game);
    expect(next.handNumber).toBe(2);
    expect(next.shop).toBeNull();
    expect(next.result).toBeNull();
    expect(next.players.every((p) => !p.ready)).toBe(true);
  });
});

describe("multi-mode accounting and progression", () => {
  it.each(MODE_ORDER)(
    "preserves chips plus issued bonuses over randomized %s matches",
    (mode) => {
      const random = seeded(919);
      for (let match = 0; match < 10; match++) {
        const seats = 2 + (match % 5);
        let game = createGame(random, { seats, mode });
        const startingChips = MODE_META[mode].buyIn * seats;
        for (let hand = 0; hand < 10; hand++) {
          let decisions = 0;
          while (!game.result && decisions++ < 180) {
            const liquid = game.players.reduce(
              (sum, p) => sum + p.stack + p.contributed,
              0,
            );
            expect(liquid).toBe(startingChips + game.issuedChips);
            if (game.actor === null) game = advanceStreet(game);
            else {
              const legal = legalActions(game);
              const roll = random();
              game = act(
                game,
                roll < 0.08
                  ? { type: "fold" }
                  : roll < 0.12 && legal.canAllIn
                    ? { type: "allin" }
                    : roll < 0.25 && legal.canRaise
                      ? { type: "raise", amount: legal.minRaise }
                      : { type: legal.canCheck ? "check" : "call" },
              );
            }
          }
          expect(game.result).not.toBeNull();
          expect(
            game.players.every(
              (p) => Number.isInteger(p.stack) && p.stack >= 0,
            ),
          ).toBe(true);
          expect(game.players.reduce((sum, p) => sum + p.stack, 0)).toBe(
            startingChips + game.issuedChips,
          );
          if (game.players.filter((p) => p.stack > 0).length < 2) break;
          if (mode === "jokers") {
            game = openShop(game, random);
            for (const p of game.players)
              if (p.stack > 0) game = shopForAi(game, p.id, random);
          }
          game = startHand(game, random);
        }
      }
    },
  );
});

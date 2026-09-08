import { describe, expect, it } from "vitest";
import { SUITS } from "../poker";
import {
  BOSSES,
  DECKS,
  HAND_IDS,
  JOKERS,
  JOKER_LIST,
  TAROTS,
  SPECTRALS,
  VOUCHERS,
} from "./data";
import {
  blindTarget,
  canAfford,
  cardDebuffed,
  consumableSlots,
  createRun,
  handSize,
  makeConsumable,
  makeJoker,
  offerPrice,
  offerReason,
  packPrice,
  random,
  rerollPrice,
  runAction,
  selectedHand,
  useReason,
} from "./engine";
import { playingFixture, shopFixture, type CardSpec } from "./fixtures";
import { validRun } from "./storage";
import type { RunState } from "./types";

const play = (
  cards: CardSpec[],
  held: CardSpec[] = [],
  jokers: string[] = [],
) => runAction(playingFixture(cards, held, jokers), { type: "play" });
const plainJoker = (s: RunState, id: string) => ({
  ...makeJoker(s, id),
  edition: "base" as const,
  eternal: false,
  perish: null,
  rental: false,
});
const use = (
  s: RunState,
  kind: "planet" | "tarot" | "spectral",
  id: string,
) => {
  const c = makeConsumable(s, kind, id);
  s.consumables.push(c);
  return runAction(s, { type: "use", uid: c.uid });
};

describe("chips, mult, and trigger order", () => {
  it("scores the pair and excludes kickers", () => {
    const s = play([
      [10, "spades"],
      [10, "hearts"],
      [14, "clubs"],
      [4, "diamonds"],
      [3, "hearts"],
    ]);
    expect(s.lastHand).toMatchObject({
      id: "pair",
      chips: 30,
      mult: 2,
      score: 60,
    });
    expect(s.handsLeft).toBe(3);
    expect(s.discardsLeft).toBe(4);
    expect(s.hand).toHaveLength(8);
  });
  it.each<[string, number, number]>([
    ["joker", 14, 80],
    ["half", 14, 336],
    ["banner", 14, 136],
    ["abstract", 14, 64],
    ["stunt", 14, 266],
    ["fibonacci", 2, 63],
    ["even", 10, 75],
    ["odd", 14, 47],
    ["scholar", 14, 180],
    ["scary", 13, 45],
    ["photo", 13, 30],
    ["hack", 2, 9],
    ["chad", 14, 38],
    ["seltzer", 10, 25],
    ["walkie", 4, 95],
  ])("%s has its specified score on rank %i", (id, rank, score) => {
    expect(play([[rank, "spades"]], [], [id]).lastHand?.score).toBe(score);
  });
  it("jokers multiply after additions according to their physical order", () => {
    expect(
      play([[14, "spades"]], [], ["joker", "cavendish"]).lastHand?.score,
    ).toBe(240);
    expect(
      play([[14, "spades"]], [], ["cavendish", "joker"]).lastHand?.score,
    ).toBe(112);
  });
  it("Photograph triggers each time Hanging Chad repeats the first face card", () => {
    expect(
      play([[13, "hearts"]], [], ["photo", "chad"]).lastHand,
    ).toMatchObject({ chips: 35, mult: 8, score: 280 });
  });
  it("steel, red seals, Mime, and held-card effects combine", () => {
    expect(
      play([[14, "spades"]], [[2, "hearts", "steel"]], ["mime"]).lastHand
        ?.score,
    ).toBe(36);
    expect(
      play([[14, "spades"]], [[2, "hearts", "steel", "red"]], ["mime"]).lastHand
        ?.score,
    ).toBe(54);
    expect(
      play([[14, "spades"]], [[13, "hearts"]], ["baron", "blueprint", "baron"])
        .lastHand?.score,
    ).toBe(54);
    expect(
      play([[14, "spades"]], [[12, "hearts"]], ["shoot"]).lastHand?.score,
    ).toBe(224);
  });
  it("Hiker upgrades the canonical card after each trigger", () => {
    const s = play([[2, "clubs", "base", "red"]], [], ["hiker"]);
    expect(s.lastHand?.chips).toBe(14);
    const id = s.lastHand!.cards[0].uid;
    expect(s.deck.find((c) => c.uid === id)?.bonus).toBe(10);
  });
  it("enhancements, editions and gold seals affect the same card", () => {
    const s = play([[10, "spades", "bonus", "gold", "holo"]]);
    expect(s.lastHand).toMatchObject({ chips: 45, mult: 11, score: 495 });
    expect(s.money).toBe(7);
  });
  it("Plasma balances the final components, including joker chips", () => {
    const s = playingFixture([[14, "spades"]], [], ["stunt"]);
    s.config.deck = "plasma";
    expect(runAction(s, { type: "play" }).lastHand).toMatchObject({
      chips: 133.5,
      mult: 133.5,
      score: 17822,
    });
  });
  it("Blueprint follows chains, prevents cycles and leaves growth on the original", () => {
    expect(
      play([[14, "spades"]], [], ["blueprint", "blueprint", "joker"]).lastHand
        ?.score,
    ).toBe(208);
    expect(
      play([[14, "spades"]], [], ["brainstorm", "blueprint"]).lastHand?.score,
    ).toBe(16);
    const bus = play([[2, "spades"]], [], ["blueprint", "bus"]);
    expect(bus.lastHand?.score).toBe(21);
    expect(bus.jokers[1].value).toBe(1);
    const vampire = play(
      [[14, "spades", "bonus"]],
      [],
      ["blueprint", "vampire"],
    );
    expect(vampire.jokers[1].value).toBeCloseTo(1.1);
    expect(vampire.lastHand?.score).toBe(19);
  });
  it("copying Stuntman copies chips without the passive hand-size penalty", () => {
    const s = playingFixture([[14, "spades"]], [], ["blueprint", "stunt"]);
    expect(handSize(s)).toBe(6);
    expect(runAction(s, { type: "play" }).lastHand?.chips).toBe(516);
  });
  it("Midas and Vampire transformations follow joker order", () => {
    const a = play([[13, "spades"]], [], ["midas", "vampire"]);
    expect(a.jokers[1].value).toBeCloseTo(1.1);
    expect(a.lastHand?.cards[0].enhancement).toBe("base");
    const b = play([[13, "spades"]], [], ["vampire", "midas"]);
    expect(b.jokers[0].value).toBe(1);
    expect(b.lastHand?.cards[0].enhancement).toBe("gold");
  });
  it("Blueprint does not copy passive end-of-round income", () => {
    const s = playingFixture([[14, "spades"]], [], ["blueprint", "golden"]);
    s.target = 1;
    const next = runAction(s, { type: "play" });
    expect(next.payout?.extras.filter((e) => e.label === "黄金小丑")).toEqual([
      { label: "黄金小丑", amount: 4 },
    ]);
  });
  it("scoring cannot mutate the previous saved state", () => {
    const s = playingFixture([[2, "clubs", "base", "red"]], [], ["hiker"]);
    const snapshot = structuredClone(s);
    runAction(s, { type: "play" });
    expect(s).toEqual(snapshot);
  });
});

describe("randomness and repeatability", () => {
  it("new runs receive distinct seeds and deals by default", () => {
    const runs = Array.from({ length: 25 }, () =>
      runAction(createRun(), { type: "startBlind" }),
    );
    expect(new Set(runs.map((s) => s.config.seed)).size).toBe(25);
    expect(new Set(runs.map((s) => s.hand.join(","))).size).toBeGreaterThan(20);
  });
  it("the same seed and actions replay identically after JSON save/reload", () => {
    let a = runAction(createRun({ seed: "REPLAY", deck: "erratic" }), {
        type: "startBlind",
      }),
      b = JSON.parse(JSON.stringify(a)) as RunState;
    for (let i = 0; i < 3; i++) {
      for (const id of a.hand.slice(0, 3)) {
        a = runAction(a, { type: "select", uid: id });
        b = runAction(b, { type: "select", uid: id });
      }
      a = runAction(a, { type: "discard" });
      b = runAction(b, { type: "discard" });
      expect(b).toEqual(a);
    }
    a.selected = a.hand.slice(0, 5);
    b.selected = [...a.selected];
    expect(runAction(b, { type: "play" })).toEqual(
      runAction(a, { type: "play" }),
    );
  });
  it("viewing, selecting and sorting do not advance random state", () => {
    let s = runAction(createRun({ seed: "PREVIEW" }), { type: "startBlind" });
    const rng = s.rng;
    for (const id of s.hand.slice(0, 3))
      s = runAction(s, { type: "select", uid: id });
    for (let i = 0; i < 100; i++) {
      selectedHand(s);
      handSize(s);
      blindTarget(s);
    }
    s = runAction(s, { type: "sort", by: "rank" });
    s = runAction(s, { type: "moveCard", uid: s.hand[0], direction: 1 });
    expect(s.rng).toBe(rng);
  });
  it("joker rarity uses weighted sampling and excludes legendary shop rolls", () => {
    const s = createRun({ seed: "DISTRIBUTION" }),
      counts = [0, 0, 0, 0];
    for (let i = 0; i < 6000; i++) counts[JOKERS[makeJoker(s).id].rarity - 1]++;
    expect(counts[0] / 6000).toBeGreaterThan(0.67);
    expect(counts[0] / 6000).toBeLessThan(0.73);
    expect(counts[1] / 6000).toBeGreaterThan(0.22);
    expect(counts[1] / 6000).toBeLessThan(0.28);
    expect(counts[2] / 6000).toBeGreaterThan(0.035);
    expect(counts[2] / 6000).toBeLessThan(0.065);
    expect(counts[3]).toBe(0);
  });
  it("seeded probability can produce both successes and failures", () => {
    const outcomes = new Set<number>();
    for (let i = 0; i < 30; i++) {
      const s = playingFixture([[14, "hearts"]], [], ["bloodstone"]);
      s.rng = i;
      outcomes.add(runAction(s, { type: "play" }).lastHand!.score);
    }
    expect(outcomes).toEqual(new Set([16, 24]));
  });
  it("Oops doubles listed probabilities, including beneficial and harmful ones", () => {
    const lucky = play(
      [[14, "hearts", "lucky"]],
      [],
      ["oops", "oops", "oops", "oops", "cat"],
    );
    expect(lucky.money).toBe(24);
    expect(lucky.lastHand?.mult).toBe(26.25);
    expect(lucky.jokers.at(-1)?.value).toBe(1.25);
    const glass = play(
      [[14, "hearts", "glass"]],
      [],
      ["oops", "oops", "glass"],
    );
    expect(glass.deck.some((c) => c.uid === glass.lastHand!.cards[0].uid)).toBe(
      false,
    );
    expect(glass.jokers.at(-1)?.value).toBe(1.75);
  });
  it("PRNG state stays in the serializable uint32 domain", () => {
    const s = createRun({ seed: "PRNG" });
    for (let i = 0; i < 10000; i++) {
      const v = random(s);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(s.rng).toBeGreaterThanOrEqual(0);
    expect(s.rng).toBeLessThanOrEqual(0xffffffff);
  });
});

describe("hand sorting", () => {
  const handCards = (s: RunState) =>
    s.hand.map((uid) => s.deck.find((c) => c.uid === uid)!);
  const expectSorted = (s: RunState) => {
    const cards = handCards(s);
    for (let i = 1; i < cards.length; i++) {
      const left = cards[i - 1],
        right = cards[i];
      if (s.handSort === "suit" && left.suit !== right.suit)
        expect(SUITS.indexOf(left.suit)).toBeLessThan(
          SUITS.indexOf(right.suit),
        );
      else {
        expect(left.rank).toBeGreaterThanOrEqual(right.rank);
        if (left.rank === right.rank)
          expect(SUITS.indexOf(left.suit)).toBeLessThanOrEqual(
            SUITS.indexOf(right.suit),
          );
      }
    }
  };

  it("deals by rank by default without changing the random draw", () => {
    const initial = createRun({ seed: "HAND-ORDER" });
    const ranked = runAction(initial, { type: "startBlind" });
    const suited = runAction(
      { ...initial, handSort: "suit" },
      { type: "startBlind" },
    );
    expect(ranked.handSort).toBe("rank");
    expectSorted(ranked);
    expectSorted(suited);
    expect(new Set(ranked.hand)).toEqual(new Set(suited.hand));
    expect(ranked.drawPile).toEqual(suited.drawPile);
    expect(ranked.rng).toBe(suited.rng);
    expect(initial.hand).toEqual([]);
  });

  it.each<["rank" | "suit", "play" | "discard"]>([
    ["rank", "play"],
    ["rank", "discard"],
    ["suit", "play"],
    ["suit", "discard"],
  ])(
    "keeps %s order after %s and draws the next physical cards",
    (by, type) => {
      let s = runAction(createRun({ seed: "REFILL-ORDER" }), {
        type: "startBlind",
      });
      s = runAction(s, { type: "sort", by });
      s.target = 1e12;
      s.selected = s.hand.slice(0, 2);
      const next = runAction(s, { type });
      expect(next.phase).toBe("playing");
      expect(next.handSort).toBe(by);
      expectSorted(next);
      expect(new Set(next.hand)).toEqual(
        new Set([...s.hand.slice(2), ...s.drawPile.slice(0, 2)]),
      );
      expect(next.drawPile).toEqual(s.drawPile.slice(2));
    },
  );

  it("remembers suit order when starting the next blind", () => {
    let s = runAction(shopFixture("NEXT-ORDER"), { type: "sort", by: "suit" });
    s = runAction(s, { type: "leaveShop" });
    s = runAction(s, { type: "startBlind" });
    expect(s.handSort).toBe("suit");
    expectSorted(s);
  });

  it.each(["arcana", "spectral"] as const)(
    "sorts the hand in %s packs",
    (kind) => {
      for (const by of ["rank", "suit"] as const) {
        const s = shopFixture("PACK-ORDER");
        s.money = 100;
        s.handSort = by;
        s.shop!.packs[0].kind = kind;
        const next = runAction(s, {
          type: "openPack",
          uid: s.shop!.packs[0].uid,
        });
        expect(next.hand).toHaveLength(handSize(next));
        expectSorted(next);
        expect(validRun(next)).toBe(true);
      }
    },
  );

  it("sorts cards added by Certificate and Cryptid", () => {
    let s = createRun({ seed: "ADDED-ORDER" });
    s.jokers = [plainJoker(s, "certificate")];
    s = runAction(s, { type: "startBlind" });
    expect(s.hand).toHaveLength(9);
    expectSorted(s);
    s.selected = [s.hand[0]];
    s = use(s, "spectral", "cryptid");
    expect(s.hand).toHaveLength(11);
    expectSorted(s);
  });

  it("resorts rank and suit changes without dealing different cards", () => {
    const ranks = playingFixture(
      [[14, "spades"]],
      [
        [13, "hearts"],
        [10, "clubs"],
      ],
    );
    const strength = use(ranks, "tarot", "strength");
    expect(handCards(strength).map((c) => c.rank)).toEqual([13, 10, 2]);
    expect(strength.drawPile).toEqual(ranks.drawPile);
    const suits = playingFixture(
      [[14, "diamonds"]],
      [
        [2, "spades"],
        [13, "hearts"],
      ],
    );
    suits.handSort = "suit";
    const world = use(suits, "tarot", "world");
    expect(handCards(world).map((c) => [c.rank, c.suit])).toEqual([
      [14, "spades"],
      [2, "spades"],
      [13, "hearts"],
    ]);
    expect(world.drawPile).toEqual(suits.drawPile);
  });

  it("preserves selected cards and manual order until the hand is scored", () => {
    const initial = playingFixture([
      [13, "spades"],
      [14, "hearts"],
    ]);
    let s = runAction(initial, { type: "sort", by: "rank" });
    expect(s.selected).toEqual(initial.selected);
    s = runAction(s, { type: "moveCard", uid: s.hand[0], direction: 1 });
    const order = [...s.hand];
    s = runAction(s, { type: "select", uid: order[0] });
    s = runAction(s, { type: "select", uid: order[0] });
    expect(s.hand).toEqual(order);
    expect(s.rng).toBe(initial.rng);
    expect(
      runAction(s, { type: "play" }).lastHand!.cards.map((c) => c.uid),
    ).toEqual(order);
  });

  it("waits until scoring ends before sorting DNA additions", () => {
    const s = playingFixture(
      [[5, "diamonds"]],
      [
        [2, "spades"],
        [13, "hearts", "steel"],
      ],
      ["dna", "fist"],
    );
    const next = runAction(s, { type: "play" });
    // High card: (5 + 5) chips × ((1 + 4 from Fist) × 1.5 from Steel).
    expect(next.lastHand).toMatchObject({ chips: 10, mult: 7.5, score: 75 });
    expectSorted(next);
  });

  it("keeps hidden cards in stable order without sorting their secret ranks", () => {
    const s = playingFixture([
      [2, "spades"],
      [3, "hearts"],
      [14, "diamonds"],
      [13, "clubs"],
      [7, "hearts"],
    ]);
    const [hiddenLow, low, hiddenHigh, high, hiddenMid] = s.hand;
    s.deck
      .filter((c) => [hiddenLow, hiddenHigh, hiddenMid].includes(c.uid))
      .forEach((c) => (c.faceDown = true));
    const next = runAction(s, { type: "sort", by: "rank" });
    expect(next.hand).toEqual([high, low, hiddenLow, hiddenHigh, hiddenMid]);
    expect(next.selected).toEqual(s.selected);
    expect(next.rng).toBe(s.rng);
    const allHidden = structuredClone(s);
    allHidden.deck.forEach((c) => (c.faceDown = true));
    for (const by of ["rank", "suit"] as const)
      expect(runAction(allHidden, { type: "sort", by }).hand).toEqual(s.hand);
  });
});

describe("blind rules and progression", () => {
  it.each<[string, number, number, number]>([
    ["red", 52, 4, 4],
    ["blue", 52, 5, 3],
    ["black", 52, 3, 3],
    ["abandoned", 40, 4, 3],
    ["checkered", 52, 4, 3],
    ["painted", 52, 4, 3],
  ])(
    "%s deck starts with its correct cards and actions",
    (deck, n, hands, discards) => {
      const s = runAction(createRun({ seed: "DECKS", deck }), {
        type: "startBlind",
      });
      expect(s.deck).toHaveLength(n);
      expect(s.handsLeft).toBe(hands);
      expect(s.discardsLeft).toBe(discards);
      expect(s.hand).toHaveLength(deck === "painted" ? 10 : 8);
    },
  );
  it("all 15 decks initialize with coherent saves", () => {
    for (const d of DECKS) {
      const s = createRun({ seed: "DECK-" + d.id, deck: d.id });
      expect(validRun(s), d.id).toBe(true);
      expect(validRun(runAction(s, { type: "startBlind" })), d.id).toBe(true);
    }
  });
  it("base and endless targets follow ante/stake scaling", () => {
    const s = createRun({ seed: "BLINDS" });
    expect(blindTarget(s, 0)).toBe(300);
    expect(blindTarget(s, 1)).toBe(450);
    s.ante = 8;
    expect(blindTarget(s, 0)).toBe(50000);
    s.ante = 9;
    expect(blindTarget(s, 0)).toBe(110000);
    s.ante = 10;
    expect(blindTarget(s, 0)).toBe(560000);
    s.config.stake = 2;
    s.ante = 9;
    expect(blindTarget(s, 0)).toBe(230000);
    s.config.stake = 5;
    expect(blindTarget(s, 0)).toBe(460000);
    s.ante = 200;
    expect(Number.isFinite(blindTarget(s))).toBe(true);
  });
  it("Psychic rejects fewer than five cards but spends the hand", () => {
    const s = playingFixture([[14, "spades"]]);
    s.blind = 2;
    s.boss = "psychic";
    const next = runAction(s, { type: "play" });
    expect(next.lastHand?.score).toBe(0);
    expect(next.lastHand?.blocked).toContain("5");
    expect(next.handsLeft).toBe(3);
  });
  it("suit debuffs remove card chips and on-card effects, but retain hand base value", () => {
    const s = playingFixture([[14, "hearts"]], [], ["scholar"]);
    s.blind = 2;
    s.boss = "head";
    expect(runAction(s, { type: "play" }).lastHand?.score).toBe(5);
  });
  it("a debuffed wild card loses wild-suit matching", () => {
    const s = playingFixture([
      [14, "spades"],
      [10, "spades"],
      [8, "spades"],
      [6, "spades"],
      [3, "hearts", "wild"],
    ]);
    s.blind = 2;
    s.boss = "head";
    expect(selectedHand(s).id).toBe("high");
  });
  it("Flint halves hand base values and Arm never lowers a level below one", () => {
    const s = playingFixture([[14, "spades"]]);
    s.blind = 2;
    s.boss = "flint";
    expect(runAction(s, { type: "play" }).lastHand).toMatchObject({
      chips: 14,
      mult: 1,
    });
    s.boss = "arm";
    s.levels.high = 2;
    expect(runAction(s, { type: "play" }).levels.high).toBe(1);
    s.levels.high = 1;
    expect(runAction(s, { type: "play" }).levels.high).toBe(1);
  });
  it("The Ox remembers the target chosen at the start of the ante", () => {
    const s = playingFixture([[14, "spades"]]);
    s.blind = 2;
    s.boss = "ox";
    s.bossHand = "pair";
    s.handUses.high = 40;
    s.money = 20;
    expect(runAction(s, { type: "play" }).money).toBe(20);
    s.bossHand = "high";
    expect(runAction(s, { type: "play" }).money).toBe(0);
  });
  it("Pillar remembers cards played earlier in this ante only", () => {
    const s = playingFixture([[14, "spades"]]);
    s.blind = 2;
    s.boss = "pillar";
    s.antePlayed = [s.selected[0]];
    expect(
      cardDebuffed(
        s,
        s.deck.find((c) => c.uid === s.selected[0])!,
      ),
    ).toBe(true);
    expect(runAction(s, { type: "play" }).lastHand?.score).toBe(5);
  });
  it("Serpent always draws three after a play or discard", () => {
    const s = runAction(createRun({ seed: "SERPENT" }), { type: "startBlind" });
    s.blind = 2;
    s.boss = "serpent";
    s.target = 1e12;
    s.selected = [s.hand[0]];
    expect(runAction(s, { type: "discard" }).hand).toHaveLength(10);
    expect(runAction(s, { type: "play" }).hand).toHaveLength(10);
  });
  it("Bell cannot be deselected and replacements after destruction stay valid", () => {
    let s = createRun({ seed: "BELL" });
    s.blind = 2;
    s.boss = "bell";
    s = runAction(s, { type: "startBlind" });
    expect(s.selected).toContain(s.forcedCard);
    expect(runAction(s, { type: "select", uid: s.forcedCard! })).toBe(s);
    s = use(s, "tarot", "hanged");
    expect(s.hand).toContain(s.forcedCard);
    expect(s.selected).toContain(s.forcedCard);
    expect(validRun(s)).toBe(true);
  });
  it("a sold Luchador restores only the relevant boss restriction", () => {
    let s = createRun({ seed: "LUCHA" });
    s.blind = 2;
    s.boss = "wall";
    s.jokers = [plainJoker(s, "burglar"), plainJoker(s, "luchador")];
    s = runAction(s, { type: "startBlind" });
    expect(s.discardsLeft).toBe(0);
    expect(s.target).toBe(1200);
    s = runAction(s, { type: "sellJoker", uid: s.jokers[1].uid });
    expect(s.discardsLeft).toBe(0);
    expect(s.target).toBe(600);
    expect(s.bossDisabled).toBe(true);
  });
  it("no active boss effects remain on cards opened in the shop", () => {
    const s = shopFixture();
    s.blind = 2;
    s.boss = "leaf";
    expect(s.deck.every((c) => !cardDebuffed(s, c))).toBe(true);
  });
  it("cannot skip a Boss or claim a payout twice", () => {
    const s = createRun({ seed: "STATE" });
    s.blind = 2;
    expect(() => runAction(s, { type: "skipBlind" })).toThrow();
    const cash = playingFixture([[14, "spades"]]);
    cash.target = 1;
    const settled = runAction(cash, { type: "play" });
    const shop = runAction(settled, { type: "cashout" });
    expect(shop.money).toBe(settled.money + settled.payout!.total);
    expect(() => runAction(shop, { type: "cashout" })).toThrow();
  });
  it("exhausted hands and exhausted cards end a run without deadlocks", () => {
    const s = playingFixture([[14, "spades"]]);
    s.handsLeft = 1;
    expect(runAction(s, { type: "play" }).phase).toBe("lost");
    s.drawPile = [];
    expect(runAction(s, { type: "discard" }).phase).toBe("lost");
  });
  it.each([1, 2])(
    "Hook discarding the final %i cards resolves the round",
    (remaining) => {
      const held: CardSpec[] = [
        [2, "clubs"],
        [3, "diamonds"],
      ];
      const s = playingFixture([[14, "spades"]], held.slice(0, remaining));
      s.blind = 2;
      s.boss = "hook";
      s.drawPile = [];
      const lost = runAction(s, { type: "play" });
      expect(lost).toMatchObject({
        phase: "lost",
        hand: [],
        drawPile: [],
        selected: [],
      });
      expect(validRun(lost)).toBe(true);

      s.jokers = [plainJoker(s, "bones")];
      s.target = 64;
      const saved = runAction(s, { type: "play" });
      expect(saved.phase).toBe("cashout");
      expect(saved.jokers).toHaveLength(0);
      expect(saved.hand).toHaveLength(0);
      s.target = 65;
      expect(runAction(s, { type: "play" }).phase).toBe("lost");
    },
  );
  it("Mr Bones rescues only a score at least one quarter of the target", () => {
    const s = playingFixture([[14, "spades"]], [], ["bones"]);
    s.handsLeft = 1;
    s.target = 64;
    const saved = runAction(s, { type: "play" });
    expect(saved.phase).toBe("cashout");
    expect(saved.jokers).toHaveLength(0);
    s.target = 65;
    expect(runAction(s, { type: "play" }).phase).toBe("lost");
  });
  it("a complete 24-blind run reaches victory, saves, and continues to endless", () => {
    let s = createRun({ seed: "FULL-RUN" });
    s.jokers = [plainJoker(s, "chicot")];
    s.deck.forEach((c) => (c.bonus = 1e7));
    for (let round = 0; round < 24; round++) {
      s = runAction(s, { type: "startBlind" });
      s.selected = [s.hand[0]];
      s = runAction(s, { type: "play" });
      expect(s.phase).toBe("cashout");
      s = runAction(s, { type: "cashout" });
      expect(validRun(s)).toBe(true);
      if (round < 23) s = runAction(s, { type: "leaveShop" });
    }
    expect(s).toMatchObject({ phase: "won", ante: 8, round: 24, won: true });
    s = runAction(s, { type: "endless" });
    expect(s.phase).toBe("shop");
    s = runAction(s, { type: "leaveShop" });
    expect(s).toMatchObject({ phase: "blind", ante: 9, endless: true });
  });
});

describe("shop, packs, consumables, and persistent growth", () => {
  it("high-stake shop stickers are random, exclusive, and respect compatibility", () => {
    const s = createRun({ seed: "STICKERS", stake: 7 });
    let eternal = 0,
      perishable = 0,
      rental = 0;
    for (let i = 0; i < 2000; i++) {
      const j = makeJoker(s, "joker", undefined, [], true);
      eternal += Number(j.eternal);
      perishable += Number(j.perish !== null);
      rental += Number(j.rental);
      expect(j.eternal && j.perish !== null).toBe(false);
      const scaling = makeJoker(s, "bus", undefined, [], true);
      expect(scaling.perish).toBeNull();
      const temporary = makeJoker(s, "banana", undefined, [], true);
      expect(temporary.eternal).toBe(false);
    }
    for (const value of [eternal, perishable, rental]) {
      expect(value).toBeGreaterThan(490);
      expect(value).toBeLessThan(710);
    }
  });
  it("generated and legendary jokers do not inherit shop-only stickers", () => {
    const s = createRun({ seed: "GENERATED", stake: 7 });
    for (let i = 0; i < 100; i++) {
      const j = makeJoker(s);
      expect(j).toMatchObject({ eternal: false, perish: null, rental: false });
    }
    const soul = use(s, "spectral", "soul");
    expect(JOKERS[soul.jokers[0].id].rarity).toBe(4);
    expect(soul.jokers[0]).toMatchObject({
      eternal: false,
      perish: null,
      rental: false,
    });
  });
  it("Perishable scoring lasts through the fifth hand, while expired passive income stops", () => {
    const s = playingFixture([[14, "spades"]], [], ["joker", "golden", "moon"]);
    s.target = 1;
    s.money = 25;
    s.jokers.forEach((j) => (j.perish = 1));
    const next = runAction(s, { type: "play" });
    expect(next.lastHand?.score).toBe(80);
    expect(next.jokers.every((j) => j.perish === 0)).toBe(true);
    expect(next.payout?.extras.some((e) => e.label === "黄金小丑")).toBe(false);
    expect(next.payout?.interest).toBe(5);
  });
  it("cash-out bonuses do not retroactively increase the current interest payout", () => {
    const s = playingFixture([[14, "spades"]], [], ["golden"]);
    s.target = 1;
    s.money = 4;
    expect(runAction(s, { type: "play" }).payout?.interest).toBe(0);
    const gold = playingFixture([[14, "spades"]], [[2, "hearts", "gold"]]);
    gold.target = 1;
    gold.money = 4;
    expect(runAction(gold, { type: "play" }).payout?.interest).toBe(1);
  });
  it("Baseball still recognizes the rarity of a debuffed uncommon joker", () => {
    const s = playingFixture(
      [[14, "spades"]],
      [],
      ["blueprint", "blackboard", "baseball"],
    );
    s.jokers[1].perish = 0;
    expect(runAction(s, { type: "play" }).lastHand?.score).toBe(24);
  });
  it("the first shop guarantees a normal Buffoon pack; rerolls cost and change stock", () => {
    const s = shopFixture();
    expect(s.shop?.packs[0]).toMatchObject({ kind: "buffoon", size: "normal" });
    const old = s.shop!.offers.map((o) => o.uid);
    const next = runAction(s, { type: "reroll" });
    expect(next.money).toBe(s.money - 5);
    expect(rerollPrice(next)).toBe(6);
    expect(next.shop!.offers.map((o) => o.uid)).not.toEqual(old);
  });
  it("Astronomer immediately changes prices of already visible planets and celestial packs", () => {
    const s = shopFixture();
    s.shop!.offers = [
      {
        uid: "test-offer",
        price: 3,
        sold: false,
        kind: "planet",
        item: makeConsumable(s, "planet", "pair"),
      },
    ];
    s.shop!.packs[0].kind = "celestial";
    s.jokers = [plainJoker(s, "astronomer")];
    expect(offerPrice(s, s.shop!.offers[0])).toBe(0);
    expect(packPrice(s, s.shop!.packs[0])).toBe(0);
    const sold = runAction(s, { type: "sellJoker", uid: s.jokers[0].uid });
    expect(offerPrice(sold, sold.shop!.offers[0])).toBe(3);
    expect(packPrice(sold, sold.shop!.packs[0])).toBe(4);
  });
  it("Credit Card supports at most $20 debt and full joker slots reject purchase", () => {
    const s = shopFixture();
    s.money = 0;
    s.jokers = [plainJoker(s, "credit")];
    expect(canAfford(s, 20)).toBe(true);
    expect(canAfford(s, 21)).toBe(false);
    s.jokers = ["joker", "half", "banner", "blue", "abstract"].map((id) =>
      plainJoker(s, id),
    );
    const offer = {
      uid: "off",
      price: 0,
      sold: false,
      kind: "joker" as const,
      joker: plainJoker(s, "photo"),
    };
    expect(offerReason(s, offer)).toContain("槽位");
    offer.joker.edition = "negative" as "base";
    expect(offerReason(s, offer)).toBeNull();
  });
  it("Eternal jokers cannot be sold or destroyed by Ankh", () => {
    const s = playingFixture([[14, "spades"]], [], ["joker", "half"]);
    s.jokers[0].eternal = true;
    expect(() =>
      runAction(s, { type: "sellJoker", uid: s.jokers[0].uid }),
    ).toThrow();
    expect(
      use(s, "spectral", "ankh").jokers.some((j) => j.uid === s.jokers[0].uid),
    ).toBe(true);
  });
  it("Death copies left to right, irrespective of selection click order", () => {
    const s = playingFixture([
      [2, "clubs"],
      [14, "hearts", "steel", "red", "poly"],
    ]);
    s.selected.reverse();
    const original = s.hand[0];
    const next = use(s, "tarot", "death");
    expect(next.deck.find((c) => c.uid === original)).toMatchObject({
      uid: original,
      rank: 14,
      suit: "hearts",
      enhancement: "steel",
      seal: "red",
      edition: "poly",
    });
  });
  it("enhancing and destroying cards changes the permanent deck and refills a live hand", () => {
    let s = playingFixture([
      [2, "clubs"],
      [3, "hearts"],
    ]);
    const id = s.selected[0];
    s = use(s, "tarot", "magician");
    expect(s.deck.find((c) => c.uid === id)?.enhancement).toBe("lucky");
    s.selected = [id];
    const n = s.deck.length;
    s = use(s, "tarot", "hanged");
    expect(s.deck.length).toBe(n - 1);
    expect(s.deck.some((c) => c.uid === id)).toBe(false);
    expect(s.hand).toHaveLength(8);
  });
  it("planet upgrades feed Constellation, and Black Hole upgrades all hands once", () => {
    let s = playingFixture([[2, "clubs"]], [], ["constellation"]);
    s = use(s, "planet", "pair");
    expect(s.levels.pair).toBe(2);
    expect(s.jokers[0].value).toBeCloseTo(1.1);
    expect(s.planetsUsed).toEqual(["pair"]);
    s = use(s, "spectral", "blackhole");
    expect(s.levels.pair).toBe(3);
    expect(s.levels.flushFive).toBe(2);
  });
  it("generated consumables respect slots, including use from a full rack", () => {
    const s = playingFixture([[2, "clubs"]]);
    const fool = makeConsumable(s, "tarot", "fool");
    s.consumables = [fool, makeConsumable(s, "tarot", "hermit")];
    expect(useReason(s, fool)).toContain("尚未");
    s.lastConsumable = { kind: "planet", id: "pair" };
    const next = runAction(s, { type: "use", uid: fool.uid });
    expect(next.consumables).toHaveLength(2);
    expect(next.consumables.some((c) => c.id === "pair")).toBe(true);
    expect(consumableSlots(next)).toBe(2);
  });
  it("Burnt upgrades only the first discarded hand; Trading Card destroys one card", () => {
    let s = playingFixture(
      [
        [2, "clubs"],
        [2, "hearts"],
      ],
      [],
      ["burnt"],
    );
    s = runAction(s, { type: "discard" });
    expect(s.levels.pair).toBe(2);
    s.selected = s.hand.slice(0, 2);
    s = runAction(s, { type: "discard" });
    expect(Object.values(s.levels).reduce((a, b) => a + b, 0)).toBe(
      HAND_IDS.length + 1,
    );
    const t = playingFixture([[14, "spades"]], [], ["trading"]);
    const id = t.selected[0];
    const next = runAction(t, { type: "discard" });
    expect(next.deck.some((c) => c.uid === id)).toBe(false);
    expect(next.money).toBe(7);
  });
  it("Perkeo and its Blueprint copy create negative consumables on leaving shop", () => {
    const s = shopFixture();
    s.jokers = [plainJoker(s, "blueprint"), plainJoker(s, "perkeo")];
    s.consumables = [makeConsumable(s, "planet", "pair")];
    const next = runAction(s, { type: "leaveShop" });
    expect(next.consumables).toHaveLength(3);
    expect(next.consumables.filter((c) => c.negative)).toHaveLength(2);
  });
  it("card packs support multiple picks and survive save/reload between picks", () => {
    const s = shopFixture();
    s.money = 50;
    s.shop!.packs[0].kind = "standard";
    s.shop!.packs[0].size = "mega";
    let next = runAction(s, { type: "openPack", uid: s.shop!.packs[0].uid });
    const original = next.deck.length;
    expect(next.pack?.choices).toHaveLength(5);
    expect(next.pack?.picks).toBe(2);
    next = runAction(next, {
      type: "pickPack",
      uid: next.pack!.choices[0].uid,
    });
    expect(next.phase).toBe("pack");
    expect(next.deck).toHaveLength(original + 1);
    expect(validRun(next)).toBe(true);
    next = JSON.parse(JSON.stringify(next));
    next = runAction(next, {
      type: "pickPack",
      uid: next.pack!.choices[1].uid,
    });
    expect(next.phase).toBe("shop");
    expect(next.deck).toHaveLength(original + 2);
  });
  it("tarot packs save without mixing the shop sample with the old draw pile", () => {
    const s = shopFixture();
    s.money = 50;
    s.shop!.packs[0].kind = "arcana";
    const next = runAction(s, { type: "openPack", uid: s.shop!.packs[0].uid });
    expect(next.hand).toHaveLength(8);
    expect(next.drawPile).toHaveLength(0);
    expect(validRun(next)).toBe(true);
  });
  it("Double tags replicate immediate rewards and both queued packs can be opened", () => {
    let s = createRun({ seed: "DOUBLE" });
    s.tags = ["double"];
    s.skipTags[0] = "charm";
    s = runAction(s, { type: "skipBlind" });
    expect(s.phase).toBe("pack");
    expect(s.tags).toContain("pack:arcana");
    s = runAction(s, { type: "skipPack" });
    expect(s.phase).toBe("pack");
    s = runAction(s, { type: "skipPack" });
    expect(s.phase).toBe("blind");
    expect(s.blind).toBe(1);
    expect(s.tags).toHaveLength(0);
  });
  it("all consumables have valid targeted actions and preserve serializable state", () => {
    for (const [kind, pool] of [
      ["tarot", TAROTS],
      ["spectral", SPECTRALS],
    ] as const)
      for (const card of pool) {
        const s = runAction(createRun({ seed: "ITEM-" + card.id }), {
          type: "startBlind",
        });
        s.jokers = [plainJoker(s, "joker")];
        s.lastConsumable = { kind: "planet", id: "pair" };
        s.selected = s.hand.slice(0, card.min);
        const next = use(s, kind, card.id);
        expect(validRun(next), card.id).toBe(true);
      }
  });
  it("all voucher effects can be redeemed from the shop", () => {
    for (const v of VOUCHERS) {
      const s = shopFixture("VOUCHER-" + v.id);
      s.money = 100;
      if (v.requires) s.vouchers.push(v.requires);
      s.shop!.voucherIds = [v.id];
      const next = runAction(s, { type: "voucher", id: v.id });
      expect(next.vouchers, v.id).toContain(v.id);
      expect(validRun(next), v.id).toBe(true);
    }
  });
  it("all boss variants can draw, play, and preserve a valid state", () => {
    for (const b of BOSSES) {
      let s = createRun({ seed: "BOSS-" + b.id });
      s.blind = 2;
      s.boss = b.id;
      s.ante = Math.max(1, b.min);
      s = runAction(s, { type: "startBlind" });
      s.selected = [
        ...new Set([...(s.forcedCard ? [s.forcedCard] : []), ...s.hand]),
      ].slice(0, 5);
      s = runAction(s, { type: "play" });
      expect(validRun(s), b.id).toBe(true);
    }
  });
  it("all 150 jokers execute a blind and scoring path without invalid state", () => {
    expect(JOKER_LIST).toHaveLength(150);
    for (const j of JOKER_LIST) {
      let s = createRun({ seed: "JOKER-" + j.id });
      s.jokers = [plainJoker(s, j.id)];
      s = runAction(s, { type: "startBlind" });
      s.selected = s.hand.slice(0, 5);
      s = runAction(s, { type: "play" });
      expect(validRun(s), j.id).toBe(true);
      expect(Number.isFinite(s.lastHand!.score), j.id).toBe(true);
    }
  });
});

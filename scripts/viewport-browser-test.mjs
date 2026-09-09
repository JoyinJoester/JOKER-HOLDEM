import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createGame, openShop, settle } from "../src/poker.ts";
import {
  createRun,
  makeConsumable,
  makeJoker,
  runAction,
} from "../src/balatro/engine.ts";
import { playingFixture, shopFixture } from "../src/balatro/fixtures.ts";
import { validRun } from "../src/balatro/storage.ts";

const audit = process.argv.includes("--audit");
const quick = process.argv.includes("--quick");
const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const sizes = quick
  ? [
      [320, 568],
      [390, 844],
      [568, 320],
      [667, 375],
      [1366, 768],
    ]
  : [
      [320, 568],
      [360, 640],
      [375, 667],
      [390, 844],
      [430, 932],
      [568, 320],
      [667, 375],
      [844, 390],
      [768, 1024],
      [1024, 768],
      [1280, 720],
      [1366, 768],
      [1440, 900],
      [1920, 1080],
    ];
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL ?? "chrome",
  headless: true,
});
const checks = [],
  errors = [];
await mkdir("test-results/viewport", { recursive: true });
const ctx = await browser.newContext({
  reducedMotion: "reduce",
  hasTouch: true,
});
await ctx.addInitScript(() => {
  if (!/^https?:$/.test(location.protocol)) return;
  localStorage.setItem(
    "joker-holdem.network.transport",
    JSON.stringify("server"),
  );
  localStorage.setItem(
    "joker-holdem.settings.v1",
    JSON.stringify({
      sound: false,
      volume: 0,
      crt: true,
      fast: true,
      difficulty: "normal",
    }),
  );
});
let page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(base);
await page.evaluate(() => document.fonts.ready);

async function load(route, game, run) {
  if (run) assert.ok(validRun(run), "Viewport fixture is a valid saved run");
  await page.evaluate(
    ({ game, run }) => {
      if (game)
        localStorage.setItem("joker-holdem.game.v1", JSON.stringify(game));
      else localStorage.removeItem("joker-holdem.game.v1");
      if (run)
        localStorage.setItem(
          "joker-holdem.balatro.run.v1",
          JSON.stringify(run),
        );
      else localStorage.removeItem("joker-holdem.balatro.run.v1");
      localStorage.removeItem("joker-holdem.room.v1");
    },
    { game, run },
  );
  await page.goto(`${base}/#/${route}`);
  await page.reload();
  await page
    .locator(
      route === "table"
        ? ".game-table"
        : route === "balatro"
          ? run
            ? ".rg-layout"
            : ".rg-setup"
          : ".game-hall",
    )
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function fit(
  label,
  selectors,
  { table = false, dialog = false, screenshot = false } = {},
) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const issues = await page.evaluate(
    ({ selectors, table, dialog }) => {
      const issues = [];
      const w = innerWidth,
        h = visualViewport?.height ?? innerHeight;
      const root = document.documentElement;
      if (root.scrollWidth > w + 1 || root.scrollHeight > h + 1)
        issues.push(
          `page ${root.scrollWidth}×${root.scrollHeight} > screen ${w}×${h}`,
        );
      for (const selector of selectors) {
        const all = [...document.querySelectorAll(selector)];
        if (!all.length) issues.push(`missing ${selector}`);
        for (const el of all) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) {
            issues.push(`hidden ${selector}`);
            continue;
          }
          if (r.x < -1 || r.y < -1 || r.right > w + 1 || r.bottom > h + 1)
            issues.push(
              `${selector} outside screen: ${[r.x, r.y, r.width, r.height].map(Math.round).join(",")}`,
            );
        }
      }
      for (const selector of [
        ".hall-setup",
        ".rg-setup-form",
        ".rg-board",
        ".rg-playing-stage",
        ".rg-hand-area",
        ".sidebar",
        ".rg-sidebar",
        ...(dialog ? [".dialog-content"] : []),
      ]) {
        const el = document.querySelector(selector);
        if (el && el.scrollHeight > el.clientHeight + 2)
          issues.push(
            `${selector} clips ${el.scrollHeight - el.clientHeight}px vertically`,
          );
      }
      if (table) {
        const rects = [
          ...document.querySelectorAll(
            ".opponent, .community-area, .pot-eyebrow, .pot-value, .hero-area",
          ),
        ].map((el) => ({
          name: el.className,
          rect: el.getBoundingClientRect(),
        }));
        const overlap = (a, b) =>
          Math.min(a.right, b.right) - Math.max(a.left, b.left) > 3 &&
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 3;
        rects.forEach((a, i) =>
          rects.slice(i + 1).forEach((b) => {
            if (overlap(a.rect, b.rect))
              issues.push(`overlap ${a.name} / ${b.name}`);
          }),
        );
      }
      return issues;
    },
    { selectors, table, dialog },
  );
  const boxes = issues.length
    ? await page.evaluate(() =>
        Object.fromEntries(
          [
            ".app-shell",
            ".app-header",
            ".header-right",
            ".game-layout",
            ".sidebar",
            ".session-panel",
            ".wallet-panel",
            ".joker-rack",
            ".table-and-actions",
            ".game-table",
            ".opponent",
            ".opponent-cards",
            ".opponent-nameplate",
            ".pot-area",
            ".community-area",
            ".hero-area",
            ".action-panel",
            ".action-buttons",
            ".bet-adjustment",
            ".game-hall",
            ".hall-welcome",
            ".hall-setup",
            ".hall-setup > header",
            ".hall-tabs",
            ".hall-setup form",
            ".hall-input",
            ".setup-label",
            ".mode-picker",
            ".game-mode-card",
            ".mode-detail",
            ".setup-two-columns",
            ".hall-start",
            ".room-options",
            ".fill-bots-option",
            ".app-footer",
            ".rg-shell",
            ".rg-header",
            ".rg-layout",
            ".rg-sidebar",
            ".rg-main",
            ".rg-inventory",
            ".rg-joker-slots",
            ".rg-inventory-card",
            ".rg-special-card",
            ".rg-board",
            ".rg-playing-stage",
            ".rg-last-hand",
            ".rg-hand-area",
            ".rg-hand-scroller",
            ".rg-hand-toolbar",
            ".rg-hand-actions",
            ".rg-selected-note",
            ".rg-hand-card",
            ".rg-blind-cards",
            ".rg-blind-card",
            ".rg-blind-rule",
            ".rg-skip-blind",
            ".rg-run-footer",
            ".dialog",
            ".dialog-header",
            ".dialog-content",
            ".joker-shop",
            ".shop-wallet",
            ".shop-section-label",
            ".shop-offers",
            ".shop-offer",
            ".shop-inventory",
            ".inventory-joker",
            ".shop-ready-row",
            ".online-content",
            ".room-code-block",
            ".room-seats",
            ".room-seat",
            ".room-configuration",
            ".share-invite",
            ".leave-room",
            ".rg-cashout",
            ".rg-receipt",
            ".rg-end",
            ".rg-end-stats",
            ".rg-end-actions",
          ].flatMap((sel) => {
            const el = document.querySelector(sel);
            if (!el) return [];
            const r = el.getBoundingClientRect(),
              cs = getComputedStyle(el);
            return [
              [
                sel,
                {
                  rect: [r.x, r.y, r.width, r.height].map(
                    (v) => Math.round(v * 10) / 10,
                  ),
                  display: cs.display,
                  padding: cs.padding,
                  margin: cs.margin,
                  gap: cs.gap,
                  font: cs.fontSize,
                  height: cs.height,
                  minHeight: cs.minHeight,
                  grid: cs.gridTemplateRows,
                },
              ],
            ];
          }),
        ),
      )
    : undefined;
  checks.push({ label, issues, boxes });
  if (issues.length) console.log(`✗ ${label}: ${issues.join("; ")}`);
  else console.log(`✓ ${label}`);
  if (screenshot)
    await page.screenshot({
      path: `test-results/viewport/${label.replace(/[^a-zA-Z0-9-]/g, "-")}.png`,
    });
}

const equip = (s) => {
  s.jokers = ["joker", "blueprint", "bloodstone", "chad", "photo"].map(
    (id) => ({
      ...makeJoker(s, id),
      edition: "base",
      eternal: false,
      perish: null,
      rental: false,
    }),
  );
  s.consumables = [
    makeConsumable(s, "tarot", "magician"),
    makeConsumable(s, "planet", "pair"),
  ];
  return s;
};
let run = equip(
  runAction(createRun({ seed: "ONE-SCREEN" }), { type: "startBlind" }),
);
run.target = 1e12;
run.selected = run.hand.slice(0, 5);
run = runAction(run, { type: "play" });
run.blind = 2;
run.boss = "hook";
run.selected = run.hand.slice(0, 5);
const shop = equip(shopFixture("ONE-SCREEN-SHOP"));
shop.money = 100;
shop.shop.packs[0].kind = "arcana";
shop.shop.packs[0].size = "mega";
const pack = runAction(shop, { type: "openPack", uid: shop.shop.packs[0].uid });
const blind = equip(createRun({ seed: "ONE-SCREEN-BLINDS" }));
const winning = equip(playingFixture([[14, "spades"]]));
winning.target = 1;
const cashout = runAction(winning, { type: "play" });
const final = structuredClone(winning);
final.ante = 8;
final.blind = 2;
final.boss = "vessel";
const won = runAction(runAction(final, { type: "play" }), { type: "cashout" });
const losing = equip(playingFixture([[14, "spades"]]));
losing.handsLeft = 1;
const lost = runAction(losing, { type: "play" });
function showdown(mode) {
  const game = createGame(Math.random, { mode, seats: 6, name: "移动玩家" });
  game.community = [
    { rank: 12, suit: "spades" },
    { rank: 11, suit: "spades" },
    { rank: 10, suit: "spades" },
    { rank: 2, suit: "diamonds" },
    { rank: 3, suit: "clubs" },
  ];
  game.players.forEach((p, i) => {
    p.cards = i
      ? [
          { rank: 14 - i, suit: "hearts" },
          { rank: 14 - i, suit: "diamonds" },
        ]
      : [
          { rank: 14, suit: "spades" },
          { rank: 13, suit: "spades" },
        ];
    p.stack = 1900;
    p.contributed = 100;
    p.folded = false;
  });
  return settle(game);
}
const settled = showdown("rainbow");
const holdemShop = openShop(showdown("jokers"));
holdemShop.players[0].coins = 20;
holdemShop.players[0].jokers = ["joker", "star", "shield"];

try {
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    const label = `${width}x${height}`;
    const screenshot = quick || [390, 568, 844, 1366].includes(width);
    await load("");
    await fit(
      `hall-${label}`,
      [
        ".hall-start",
        ".hall-rogue-entry",
        ".game-mode-card",
        "#hall-nickname",
        ".number-choices button",
        ".difficulty-choices button",
      ],
      { screenshot },
    );
    await page.getByRole("button", { name: "创建房间", exact: true }).click();
    await fit(`hall-create-${label}`, [
      ".hall-start",
      ".game-mode-card",
      ".number-choices button",
      ".fill-bots-option",
      ".difficulty-choices button",
    ]);
    await page.getByRole("button", { name: "加入房间", exact: true }).click();
    await fit(`hall-join-${label}`, [
      ".hall-start",
      "#hall-nickname",
      "#hall-room-code",
    ]);
    for (const seats of quick ? [2, 6] : [2, 4, 6]) {
      const game = createGame(Math.random, {
        mode: "jokers",
        seats,
        aiCount: seats - 1,
        difficulty: "normal",
        name: "移动玩家",
      });
      game.actor = 0;
      await load("table", game);
      await fit(
        `holdem-${seats}-${label}`,
        [
          ".opponent",
          ".community-cards .playing-card",
          ".hero-cards .playing-card",
          ".action-buttons button",
          ".bet-presets button",
          "#raise-amount",
          ".wallet-amount",
          ".current-mode",
          ".rack-cards",
        ],
        { table: true, screenshot },
      );
    }
    await load("table", settled);
    await fit(
      `showdown-${label}`,
      [
        ".opponent .playing-card",
        ".community-cards .playing-card",
        ".next-hand-button",
        ".bonus-summary",
      ],
      { table: true, screenshot },
    );
    await load("table", holdemShop);
    await page.locator(".joker-shop").waitFor();
    await fit(
      `holdem-shop-${label}`,
      [
        ".shop-offer button",
        ".inventory-joker button",
        ".shop-ready-row button",
        ".dialog-header button",
      ],
      { dialog: true, screenshot },
    );
    await load("balatro");
    await fit(
      `setup-${label}`,
      [
        ".rg-deck-options button",
        ".rg-stake-options button",
        "#rg-seed",
        ".rg-start-run",
      ],
      { screenshot },
    );
    await load("balatro", null, blind);
    await fit(
      `blinds-${label}`,
      [
        ".rg-blind-card",
        ".rg-blind-card > button",
        ".rg-skip-blind > button:first-child",
      ],
      { screenshot },
    );
    await load("balatro", null, run);
    await fit(
      `run-${label}`,
      [
        ".rg-target",
        ".rg-formula",
        ".rg-inventory-card",
        ".rg-hand-card",
        ".rg-hand-actions button",
        ".rg-hand-toolbar button",
        ".rg-boss-notice",
      ],
      { screenshot },
    );
    if (await page.locator(".rg-menu-toggle").isVisible())
      await page.locator(".rg-menu-toggle").click();
    await page.getByRole("button", { name: /^新的一局/ }).click();
    await fit(
      `resume-${label}`,
      [
        ".rg-deck-options button",
        ".rg-stake-options button",
        "#rg-seed",
        ".rg-start-run",
        ".rg-resume",
        ".dialog-header button",
      ],
      { dialog: true, screenshot },
    );
    await load("balatro", null, shop);
    await fit(
      `shop-${label}`,
      [
        ".rg-inventory-card",
        ".rg-offer-buy",
        ".rg-voucher button",
        ".rg-pack-offer button",
        ".rg-reroll",
        ".rg-stage-heading > button",
      ],
      { screenshot },
    );
    await load("balatro", null, pack);
    await fit(
      `pack-${label}`,
      [".rg-offer-buy", ".rg-offer-art", ".rg-hand-card", ".rg-skip-pack"],
      { screenshot },
    );
    for (const [phase, state] of [
      ["cashout", cashout],
      ["won", won],
      ["lost", lost],
    ]) {
      await load("balatro", null, state);
      await fit(
        `${phase}-${label}`,
        [
          phase === "cashout"
            ? ".rg-cashout > button"
            : ".rg-end-actions button",
        ],
        { screenshot },
      );
    }
  }
  // One live room survives every resize; no mocked room state or user storage is used.
  await page.setViewportSize({ width: 390, height: 844 });
  await load("");
  await page.getByRole("button", { name: "创建房间", exact: true }).click();
  await page.getByRole("button", { name: "6 人牌桌", exact: true }).click();
  await page.getByLabel("空位由 AI 补齐").check();
  await page.getByRole("button", { name: "创建这张牌桌", exact: true }).click();
  await page.getByTestId("room-code").waitFor();
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await fit(
      `room-${width}x${height}`,
      [
        ".room-seat",
        ".room-code-block strong",
        "#invite-url",
        ".online-content > .primary-button",
        ".leave-room",
        ".dialog-header button",
      ],
      { dialog: true, screenshot: quick || width === 390 || width === 568 },
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "开始对局", exact: true }).tap();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await fit(
    "room-start-touch",
    [".hero-cards .playing-card", ".opponent", ".action-buttons button"],
    { table: true },
  );
  await page.locator(".lan-button").tap();
  await page
    .getByRole("button", { name: "离开房间，返回大厅", exact: true })
    .click();

  // Emulate a mobile browser and tap exposed card edges, including overlapping cards.
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  await mobile.addInitScript(() => {
    if (/^https?:$/.test(location.protocol))
      localStorage.setItem(
        "joker-holdem.settings.v1",
        JSON.stringify({
          sound: false,
          volume: 0,
          crt: true,
          fast: true,
          difficulty: "normal",
        }),
      );
  });
  page = await mobile.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  const readRun = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("joker-holdem.balatro.run.v1")),
    );
  const readGame = () =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("joker-holdem.game.v1")),
    );
  const behavior = (label, ok) => {
    checks.push({ label, issues: ok ? [] : ["behavior assertion failed"] });
    assert.ok(ok, label);
    console.log(`✓ ${label}`);
  };
  const tapCard = async (index) => {
    const cards = page.locator(".rg-hand-card");
    const box = await cards.nth(index).boundingBox();
    const next =
      index < (await cards.count()) - 1
        ? await cards.nth(index + 1).boundingBox()
        : null;
    const exposed = next ? Math.min(box.width, next.x - box.x) : box.width;
    assert.ok(exposed >= 12, "Every hand card exposes a usable touch area");
    await page.touchscreen.tap(box.x + exposed / 2, box.y + box.height * 0.65);
  };
  const mobileRun = equip(
    runAction(createRun({ seed: "TOUCH-AND-ROTATE" }), { type: "startBlind" }),
  );
  mobileRun.target = 1e12;
  await load("balatro", null, mobileRun);
  for (let i = 0; i < mobileRun.hand.length; i++) {
    await tapCard(i);
    assert.deepEqual(
      (await readRun()).selected,
      [mobileRun.hand[i]],
      `Touch selects card ${i + 1}`,
    );
    await tapCard(i);
    assert.deepEqual(
      (await readRun()).selected,
      [],
      `Touch deselects card ${i + 1}`,
    );
  }
  behavior("touch-every-hand-card", true);
  await tapCard(0);
  await tapCard(1);
  const beforeRotation = await readRun();
  await page.setViewportSize({ width: 844, height: 390 });
  await fit("touch-landscape-run", [
    ".rg-hand-card",
    ".rg-hand-actions button",
    ".rg-sidebar-links button",
  ]);
  behavior(
    "rotation-preserves-hand-and-selection",
    JSON.stringify(await readRun()) === JSON.stringify(beforeRotation),
  );
  await page.locator(".rg-discard-button").tap();
  behavior(
    "landscape-touch-discard",
    (await readRun()).discardsLeft === beforeRotation.discardsLeft - 1 &&
      (await readRun()).hand.length === mobileRun.hand.length,
  );
  await tapCard(0);
  await tapCard(1);
  await tapCard(2);
  const beforePlay = await readRun();
  await page.setViewportSize({ width: 320, height: 568 });
  await fit("touch-portrait-selected-run", [
    ".rg-hand-card",
    ".rg-hand-actions button",
    ".rg-selected-note",
  ]);
  behavior(
    "rotate-back-preserves-selection",
    JSON.stringify((await readRun()).selected) ===
      JSON.stringify(beforePlay.selected),
  );
  await page.locator(".rg-play-button").tap();
  behavior(
    "portrait-touch-play",
    (await readRun()).totalHands === beforePlay.totalHands + 1 &&
      (await readRun()).score > 0,
  );
  await page.locator('.rg-layout[data-scoring="false"]').waitFor();
  await fit("touch-played-hand", [
    ".rg-last-cards",
    ".rg-last-result",
    ".rg-hand-actions button",
  ]);
  await page.locator(".rg-joker-slots button").first().tap();
  const beforeDialog = await readRun();
  await page.keyboard.press("1");
  await page.keyboard.press("Enter");
  await page.keyboard.press("KeyD");
  behavior(
    "dialog-blocks-game-shortcuts",
    JSON.stringify(await readRun()) === JSON.stringify(beforeDialog),
  );
  await page.getByRole("button", { name: "关闭弹窗", exact: true }).tap();
  behavior(
    "dialog-restores-focus",
    await page
      .locator(".rg-joker-slots button")
      .first()
      .evaluate((el) => document.activeElement === el),
  );
  await load("balatro", null, shop);
  await page.locator(".rg-offer-art").first().tap();
  await fit("touch-offer-details", [
    ".rg-offer-detail",
    ".dialog-header button",
  ]);
  await page.keyboard.press("Escape");
  behavior(
    "offer-details-restore-focus",
    await page
      .locator(".rg-offer-art")
      .first()
      .evaluate((el) => document.activeElement === el),
  );
  await load("balatro", null, pack);
  await page.locator(".rg-offer-art").first().tap();
  const beforePackDialog = await readRun();
  await page.keyboard.press("1");
  await page.keyboard.press("Enter");
  behavior(
    "pack-detail-does-not-select-underlying-cards",
    JSON.stringify(await readRun()) === JSON.stringify(beforePackDialog),
  );
  await page.getByRole("button", { name: "关闭弹窗", exact: true }).tap();
  await page.locator(".rg-skip-pack").tap();
  behavior("touch-exits-pack", (await readRun()).phase === "shop");

  const touchGame = createGame(Math.random, {
    mode: "classic",
    seats: 2,
    aiCount: 1,
    name: "触屏玩家",
  });
  touchGame.actor = 0;
  await page.setViewportSize({ width: 390, height: 844 });
  await load("table", touchGame);
  const slider = page.locator("#raise-amount");
  const sliderBox = await slider.boundingBox();
  await page.touchscreen.tap(
    sliderBox.x + sliderBox.width * 0.6,
    sliderBox.y + sliderBox.height / 2,
  );
  behavior(
    "touch-adjusts-raise-slider",
    Number(await slider.inputValue()) >
      Number(await slider.getAttribute("min")),
  );
  const handBefore = await readGame();
  await page.setViewportSize({ width: 667, height: 375 });
  await fit(
    "touch-holdem-landscape",
    [".hero-cards .playing-card", ".action-buttons button", "#raise-amount"],
    { table: true },
  );
  behavior(
    "holdem-rotation-preserves-deal",
    JSON.stringify(await readGame()) === JSON.stringify(handBefore),
  );
  await page.locator(".fold-button").tap();
  await page.locator(".next-hand-button").waitFor();
  await page.locator(".next-hand-button").tap();
  behavior(
    "touch-starts-next-hand",
    (await readGame()).handNumber === handBefore.handNumber + 1,
  );
} finally {
  await browser.close();
  await writeFile(
    "test-results/viewport/report.json",
    JSON.stringify({ checks, errors }, null, 2),
  );
}
const failed = checks.filter((c) => c.issues.length);
console.log(
  `\n${checks.length - failed.length}/${checks.length} viewport checks passed, ${errors.length} runtime errors.`,
);
if (!audit) {
  assert.deepEqual(errors, [], "No browser errors");
  assert.equal(failed.length, 0, "Every game screen fits the viewport");
}

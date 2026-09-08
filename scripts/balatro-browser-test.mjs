import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import {
  blindTarget,
  createRun,
  makeConsumable,
  makeJoker,
  runAction,
} from "../src/balatro/engine.ts";
import { playingFixture, shopFixture } from "../src/balatro/fixtures.ts";
import { validRun } from "../src/balatro/storage.ts";

const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const key = "joker-holdem.balatro.run.v1";
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL ?? "chrome",
  headless: true,
});
const checks = [],
  errors = [];
const check = (name, pass) => {
  assert.ok(pass, name);
  checks.push(name);
  console.log(`✓ ${name}`);
};
await mkdir("test-results", { recursive: true });
const settings = {
  sound: false,
  volume: 0,
  crt: true,
  fast: true,
  difficulty: "normal",
};

async function context(
  viewport = { width: 1440, height: 1000 },
  mobile = false,
) {
  const ctx = await browser.newContext({
    viewport,
    reducedMotion: "reduce",
    hasTouch: mobile,
    isMobile: mobile,
  });
  await ctx.addInitScript((settings) => {
    // Init scripts also run in the storage-less about:blank document.
    if (!/^https?:$/.test(location.protocol)) return;
    if (!localStorage.getItem("joker-holdem.settings.v1"))
      localStorage.setItem(
        "joker-holdem.settings.v1",
        JSON.stringify(settings),
      );
  }, settings);
  ctx.on("page", (p) => {
    p.on("pageerror", (e) => errors.push(`${p.url()} ${e.stack ?? e.message}`));
    p.on("requestfailed", (r) => {
      if (/\.(js|css|ttf)(\?|$)/.test(r.url()))
        errors.push(`${r.url()} ${r.failure()?.errorText}`);
    });
  });
  return ctx;
}
async function state(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
}
async function checkRankOrder(page, label) {
  const s = await state(page);
  const ranks = s.hand.map((uid) => s.deck.find((c) => c.uid === uid).rank);
  assert.deepEqual(
    ranks,
    [...ranks].sort((a, b) => b - a),
    label,
  );
  assert.deepEqual(
    await page
      .locator(".rg-hand-card")
      .evaluateAll((cards) => cards.map((c) => c.dataset.cardId)),
    s.hand,
    "Rendered cards follow the saved hand order",
  );
  check(
    label,
    s.handSort === "rank" &&
      (await page
        .getByRole("button", { name: "点数", exact: true })
        .getAttribute("aria-pressed")) === "true",
  );
}
async function inject(page, s) {
  assert.ok(validRun(s), "browser fixture must be a valid save");
  await page.evaluate(
    ({ key, s }) => localStorage.setItem(key, JSON.stringify(s)),
    { key, s },
  );
  await page.reload();
  await page.locator(`.rg-layout[data-phase="${s.phase}"]`).waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function card(page, index) {
  const target = page.locator(".rg-hand-card").nth(index);
  const bounds = await target.boundingBox();
  await target.click({ position: { x: 8, y: bounds.height - 9 } });
}
async function noOverflow(page, label) {
  const size = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  check(`${label}: no horizontal overflow`, size.scroll <= size.width);
}
async function close(page) {
  await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
}
const plainJoker = (s, id) => ({
  ...makeJoker(s, id),
  edition: "base",
  eternal: false,
  perish: null,
  rental: false,
});

try {
  const ctx = await context(),
    page = await ctx.newPage();
  await page.goto(`${base}/#/`);
  await page.locator(".game-hall").waitFor();
  await page.evaluate(() =>
    localStorage.setItem("joker-holdem.game.v1", '{"preserve":"holdem-save"}'),
  );
  await page.locator(".hall-rogue-entry").click();
  await page.locator(".rg-setup").waitFor();
  check(
    "Hall opens an independent roguelike route",
    page.url().endsWith("#/balatro"),
  );
  check(
    "Setup exposes all 15 decks and 8 stakes",
    (await page.locator(".rg-deck-options button").count()) === 15 &&
      (await page.locator(".rg-stake-options button").count()) === 8,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: "test-results/balatro-setup.png",
    fullPage: true,
  });
  await page.locator("#rg-seed").fill("BROWSER-RANDOM");
  await page.locator(".rg-start-run").click();
  check(
    "Explicit seed is saved",
    (await state(page)).config.seed === "BROWSER-RANDOM",
  );
  await page.locator(".rg-blind-selection").waitFor();
  check(
    "Exactly one blind is currently playable",
    (await page.locator(".rg-blind-card > button:not([disabled])").count()) ===
      1,
  );
  await page.screenshot({
    path: "test-results/balatro-blinds.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "选择盲注", exact: true }).click();
  check(
    "First blind deals eight real cards",
    (await page.locator(".rg-hand-card").count()) === 8,
  );
  const dealt = await state(page);
  await checkRankOrder(
    page,
    "Initial hand is sorted by rank with rank mode selected",
  );
  for (let i = 0; i < 5; i++) await card(page, i);
  await card(page, 5);
  check(
    "Selection is limited to five cards",
    (await state(page)).selected.length === 5,
  );
  check(
    "Selection does not advance the random stream",
    (await state(page)).rng === dealt.rng,
  );
  await page.getByRole("button", { name: "点数", exact: true }).click();
  check(
    "Sorting keeps the RNG stream unchanged",
    (await state(page)).rng === dealt.rng,
  );
  await page.locator(".rg-discard-button").click();
  const discarded = await state(page);
  check(
    "Discard removes five cards and refills the hand",
    discarded.discardsLeft === 3 &&
      discarded.hand.length === 8 &&
      discarded.drawPile.length === 39 &&
      discarded.handsLeft === 4,
  );
  await checkRankOrder(page, "Discard automatically sorts the refilled hand");
  await page.keyboard.press("1");
  check(
    "Number shortcut selects a card",
    (await state(page)).selected.length === 1,
  );
  await page.keyboard.press("Enter");
  const played = await state(page);
  check(
    "Enter plays once and shows the score",
    played.totalHands === 1 &&
      played.handsLeft === 3 &&
      played.lastHand.score > 0,
  );
  await page.locator('.rg-layout[data-scoring="false"]').waitFor();
  await checkRankOrder(
    page,
    "Playing automatically sorts the remaining and new cards",
  );
  await page.getByRole("button", { name: /^计分明细/ }).click();
  check(
    "Score explanation shows the completed trigger chain",
    (await page.locator(".rg-trace li").count()) >= 2,
  );
  await close(page);
  await page.reload();
  await page.locator(".rg-layout").waitFor();
  assert.deepEqual(await state(page), played);
  check(
    "Reload preserves exact hand, score, selection and future randomness",
    true,
  );
  await page.getByRole("button", { name: /^游戏大厅|^← 游戏大厅/ }).click();
  await page.locator(".game-hall").waitFor();
  await page.locator(".hall-rogue-entry").click();
  await page.locator(".rg-layout").waitFor();
  assert.deepEqual(await state(page), played);
  check("Returning through the hall resumes the saved run", true);
  check(
    "Hold’em uses a different save key",
    (await page.evaluate(() =>
      localStorage.getItem("joker-holdem.game.v1"),
    )) === '{"preserve":"holdem-save"}',
  );
  await page.getByRole("button", { name: /^新的一局/ }).click();
  check(
    "Opening new-run setup does not replace the save",
    (await state(page)).uid === played.uid,
  );
  await page.getByRole("button", { name: "生成随机种子", exact: true }).click();
  const seed = await page.locator("#rg-seed").inputValue();
  check(
    "Random seed button produces a new eight-character seed",
    /^[A-Z2-9]{8}$/.test(seed) && seed !== played.config.seed,
  );
  await page.locator(".rg-start-run").click();
  check(
    "Confirmed new run gets the newly generated seed",
    (await state(page)).config.seed === seed,
  );
  await page
    .locator(".rg-header")
    .getByRole("button", { name: "图鉴", exact: true })
    .click();
  check(
    "Collection lists the full 150-joker pool",
    (await page.locator(".rg-joker-reference article").count()) === 150,
  );
  await page.getByRole("textbox", { name: "搜索图鉴" }).fill("概率");
  check(
    "Collection can filter chance-related abilities",
    (await page.locator(".rg-joker-reference article").count()) > 0 &&
      (await page.locator(".rg-joker-reference article").count()) < 150,
  );
  await page.getByRole("tab", { name: "牌型 / 星球", exact: true }).click();
  check(
    "Reference includes twelve hand/planet types",
    (await page.locator(".rg-hands-table tbody tr").count()) === 12,
  );
  await close(page);

  // Real UI cash-out path, with a deterministic boosted hand as the test setup.
  const winning = playingFixture([
    [14, "spades"],
    [14, "hearts"],
  ]);
  winning.target = 300;
  winning.deck
    .filter((c) => winning.selected.includes(c.uid))
    .forEach((c) => (c.bonus = 100));
  await inject(page, winning);
  await page.locator(".rg-play-button").click();
  await page.locator(".rg-cashout").waitFor();
  const cash = await state(page);
  check(
    "Reaching the target presents a detailed payout",
    cash.phase === "cashout" &&
      (await page.locator(".rg-receipt > div").count()) >= 5,
  );
  await page.locator(".rg-cashout > button").click();
  await page.locator(".rg-shop").waitFor();
  check(
    "Cash-out deposits the reward exactly once",
    (await state(page)).money === cash.money + cash.payout.total,
  );

  const shop = shopFixture("BROWSER-SHOP");
  shop.money = 60;
  shop.shop.offers = [
    {
      uid: "shop-joker",
      kind: "joker",
      joker: plainJoker(shop, "joker"),
      price: 2,
      sold: false,
    },
    {
      uid: "shop-planet",
      kind: "planet",
      item: makeConsumable(shop, "planet", "pair"),
      price: 3,
      sold: false,
    },
  ];
  shop.shop.voucherIds = ["overstock"];
  await inject(page, shop);
  await page.locator('[data-offer-id="shop-joker"]').click();
  check(
    "Buying a joker changes both inventory and money",
    (await state(page)).jokers.length === 1 && (await state(page)).money === 58,
  );
  await page.locator('[data-offer-id="shop-planet"]').click();
  await page
    .getByRole("button", { name: "使用或出售水星", exact: true })
    .click();
  await page.getByRole("button", { name: "使用这张牌", exact: true }).click();
  check(
    "Buying and using a planet permanently levels its hand",
    (await state(page)).levels.pair === 2 &&
      (await state(page)).consumables.length === 0,
  );
  await page.locator(".rg-voucher .rg-button").click();
  check(
    "Redeeming Overstock adds a live shop slot",
    (await state(page)).shop.offers.length === 3 &&
      (await state(page)).vouchers.includes("overstock"),
  );
  const beforeReroll = await state(page);
  await page.locator(".rg-reroll").click();
  const afterReroll = await state(page);
  check(
    "Reroll replaces shop cards and increases the next price",
    afterReroll.money === beforeReroll.money - 5 &&
      afterReroll.shop.rerolls === 1 &&
      afterReroll.shop.offers[0].uid !== beforeReroll.shop.offers[0].uid,
  );
  await page.locator(".rg-pack-offer .rg-button").first().click();
  await page.locator(".rg-pack-selection").waitFor();
  check(
    "A Buffoon pack reveals real random choices",
    (await state(page)).pack.kind === "buffoon" &&
      (await page.locator(".rg-pack-choices .rg-offer").count()) === 2,
  );
  await page
    .locator(".rg-pack-choices .rg-offer-buy:not([disabled])")
    .first()
    .click();
  await page.locator(".rg-shop").waitFor();
  check(
    "Picking a pack joker returns to the shop with the card",
    (await state(page)).jokers.length === 2,
  );
  const orderBefore = (await state(page)).jokers.map((j) => j.uid);
  await page.locator(".rg-joker-slots button").first().click();
  await page.getByRole("button", { name: "向右 →", exact: true }).click();
  check(
    "Jokers can be reordered for score multiplication",
    (await state(page)).jokers[1].uid === orderBefore[0],
  );
  await close(page);
  await page.locator(".rg-joker-slots button").first().click();
  await page.getByRole("button", { name: /^出售 ·/ }).click();
  check(
    "Selling a joker returns money and frees its slot",
    (await state(page)).jokers.length === 1,
  );
  await page.screenshot({
    path: "test-results/balatro-shop.png",
    fullPage: true,
  });
  await page.locator(".rg-shop .rg-stage-heading > button").click();
  check(
    "Leaving shop advances to the next blind",
    (await state(page)).phase === "blind" && (await state(page)).blind === 1,
  );

  const arcana = shopFixture("TARGETED-PACK");
  arcana.money = 50;
  arcana.shop.packs[0].kind = "arcana";
  arcana.shop.packs[0].size = "mega";
  let pack = runAction(arcana, {
    type: "openPack",
    uid: arcana.shop.packs[0].uid,
  });
  pack.pack.choices = [
    {
      uid: "pack-magic",
      kind: "tarot",
      item: makeConsumable(pack, "tarot", "magician"),
      price: 0,
      sold: false,
    },
    {
      uid: "pack-hermit",
      kind: "tarot",
      item: makeConsumable(pack, "tarot", "hermit"),
      price: 0,
      sold: false,
    },
    {
      uid: "pack-death",
      kind: "tarot",
      item: makeConsumable(pack, "tarot", "death"),
      price: 0,
      sold: false,
    },
  ];
  await inject(page, pack);
  check(
    "Targeted tarot cannot be used before selecting a card",
    await page.locator('[data-offer-id="pack-magic"]').isDisabled(),
  );
  await card(page, 0);
  const target = (await state(page)).selected[0];
  await page.locator('[data-offer-id="pack-magic"]').click();
  check(
    "Tarot pack modifies the selected physical card",
    (await state(page)).deck.find((c) => c.uid === target).enhancement ===
      "lucky" && (await state(page)).pack.picks === 1,
  );
  const midway = await state(page);
  await page.reload();
  await page.locator(".rg-pack-selection").waitFor();
  assert.deepEqual(await state(page), midway);
  check(
    "Reloading halfway through a mega pack preserves picks and contents",
    true,
  );
  await page.locator('[data-offer-id="pack-hermit"]').click();
  check(
    "Second mega-pack pick returns to its original shop",
    (await state(page)).phase === "shop",
  );

  // Phone and tablet checks use a separate storage partition from desktop and from the user.
  const mobile = await context({ width: 390, height: 844 }, true),
    phone = await mobile.newPage();
  await phone.goto(`${base}/#/balatro`);
  await phone.locator(".rg-setup").waitFor();
  await noOverflow(phone, "Phone setup");
  await phone.screenshot({
    path: "test-results/balatro-mobile-setup.png",
    fullPage: true,
  });
  let mobileRun = runAction(createRun({ seed: "PHONE-CARDS" }), {
    type: "startBlind",
  });
  mobileRun.jokers = ["joker", "blueprint", "bloodstone", "chad", "photo"].map(
    (id) => plainJoker(mobileRun, id),
  );
  mobileRun.consumables = [makeConsumable(mobileRun, "tarot", "magician")];
  await inject(phone, mobileRun);
  await noOverflow(phone, "Phone live hand");
  const controls = await phone.locator(".rg-hand-actions").boundingBox();
  check(
    "Phone play and discard controls are initially within reach",
    controls.y + controls.height <= 844,
  );
  await phone.screenshot({
    path: "test-results/balatro-mobile.png",
    fullPage: true,
  });
  for (let i = 0; i < 5; i++) await card(phone, i);
  check(
    "Overlapping mobile cards are all individually tappable",
    (await state(phone)).selected.length === 5,
  );
  await phone.locator(".rg-discard-button").tap();
  check(
    "Touch discard refills eight cards",
    (await state(phone)).hand.length === 8 &&
      (await state(phone)).discardsLeft === 3,
  );
  await checkRankOrder(
    phone,
    "Touch discard retains default rank order on phones",
  );
  await phone.getByRole("button", { name: "花色", exact: true }).tap();
  check(
    "Touch can switch the automatic sorting preference",
    (await state(phone)).handSort === "suit" &&
      (await phone
        .getByRole("button", { name: "花色", exact: true })
        .getAttribute("aria-pressed")) === "true",
  );
  await phone.getByRole("button", { name: "游戏设置", exact: true }).tap();
  await phone.getByRole("button", { name: /^查看玩法说明/ }).tap();
  check(
    "Rules remain reachable on small phones",
    await phone.locator(".rg-rules").isVisible(),
  );
  await phone.keyboard.press("Tab");
  check(
    "Dialog keyboard focus stays inside the dialog",
    await phone.evaluate(
      () => !!document.activeElement.closest('[role="dialog"]'),
    ),
  );
  await phone.keyboard.press("Escape");
  await phone.getByRole("button", { name: /^查看牌组/ }).tap();
  check(
    "Deck reference lists the permanent deck",
    (await phone.locator(".rg-deck-grid > div").count()) === 52,
  );
  await noOverflow(phone, "Phone deck dialog");
  await close(phone);
  await inject(phone, pack);
  await noOverflow(phone, "Phone tarot pack");
  await phone.screenshot({
    path: "test-results/balatro-mobile-pack.png",
    fullPage: true,
  });
  await inject(phone, shop);
  await noOverflow(phone, "Phone shop");
  await phone.screenshot({
    path: "test-results/balatro-mobile-shop.png",
    fullPage: true,
  });
  for (const viewport of [
    { width: 320, height: 740 },
    { width: 768, height: 1024 },
    { width: 844, height: 390 },
  ]) {
    await phone.setViewportSize(viewport);
    await inject(phone, mobileRun);
    await noOverflow(phone, `${viewport.width}px live table`);
    await inject(phone, shop);
    await noOverflow(phone, `${viewport.width}px shop`);
  }

  let hidden = createRun({ seed: "HIDDEN-HAND" });
  hidden.blind = 2;
  hidden.boss = "house";
  hidden = runAction(hidden, { type: "startBlind" });
  await inject(page, hidden);
  check(
    "Face-down cards do not reveal ranks in visible or accessible labels",
    (
      await page
        .locator(".rg-hand-card")
        .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")))
    ).every((text) => text === "背面朝上的牌"),
  );
  await card(page, 0);
  check(
    "Face-down selection keeps its hand prediction unknown",
    (await page.locator(".rg-hand-name").innerText()).includes("未知牌型"),
  );
  let acorn = createRun({ seed: "HIDDEN-JOKERS" });
  acorn.blind = 2;
  acorn.ante = 8;
  acorn.boss = "acorn";
  acorn.jokers = ["blueprint", "joker"].map((id) => plainJoker(acorn, id));
  acorn = runAction(acorn, { type: "startBlind" });
  await inject(page, acorn);
  await page.locator(".rg-joker-slots button").first().click();
  check(
    "Acorn joker detail respects the hidden card state",
    (await page.getByRole("dialog").innerText()).includes("背面朝上的小丑") &&
      !(await page.getByRole("dialog").innerText()).includes("蓝图"),
  );
  await close(page);
  const losing = playingFixture([[14, "spades"]]);
  losing.handsLeft = 1;
  await inject(page, losing);
  await page.locator(".rg-play-button").click();
  await page.locator(".rg-end").waitFor();
  check(
    "Failure has a reachable new-run action",
    (await state(page)).phase === "lost" &&
      (await page.getByRole("button", { name: /^再开一局/ }).isVisible()),
  );
  const final = playingFixture([[14, "spades"]]);
  final.ante = 8;
  final.blind = 2;
  final.boss = "vessel";
  final.target = blindTarget(final);
  final.deck.find((c) => c.uid === final.selected[0]).bonus = 1e6;
  await inject(page, final);
  await page.locator(".rg-play-button").click();
  await page.locator(".rg-cashout > button").click();
  check(
    "Ante-eight boss cash-out reaches victory",
    (await state(page)).phase === "won",
  );
  await page.getByRole("button", { name: /^继续无尽模式/ }).click();
  await page.locator(".rg-shop .rg-stage-heading > button").click();
  check(
    "Endless continues the same run into ante nine",
    (await state(page)).ante === 9 && (await state(page)).endless,
  );
  const legacy = playingFixture([
    [4, "clubs"],
    [14, "spades"],
    [10, "hearts"],
    [13, "diamonds"],
  ]);
  delete legacy.handSort;
  legacy.selected = [legacy.hand[2]];
  await inject(page, legacy);
  await checkRankOrder(
    page,
    "Existing saves immediately restore in default rank order",
  );
  const migrated = await state(page);
  assert.deepEqual(migrated.selected, legacy.selected);
  assert.deepEqual(migrated.drawPile, legacy.drawPile);
  check(
    "Old-save migration keeps selection and random state",
    migrated.rng === legacy.rng,
  );
  await page.getByRole("button", { name: "花色", exact: true }).click();
  const suited = await state(page);
  assert.deepEqual(suited.hand, [
    legacy.hand[1],
    legacy.hand[2],
    legacy.hand[0],
    legacy.hand[3],
  ]);
  assert.deepEqual(suited.selected, legacy.selected);
  check(
    "Suit sorting updates card order while keeping the selected card",
    suited.handSort === "suit",
  );
  await page
    .getByRole("button", { name: "将选中手牌向右移动", exact: true })
    .click();
  const manual = await state(page);
  assert.notDeepEqual(manual.hand, suited.hand);
  await page.reload();
  await page.locator(".rg-hand-card").first().waitFor();
  assert.deepEqual(await state(page), manual);
  check("Reload preserves suit preference and manual card positioning", true);
  await page.getByRole("button", { name: "点数", exact: true }).click();
  await checkRankOrder(
    page,
    "Rank sorting can be restored after manual positioning",
  );

  await inject(page, mobileRun);
  await page.screenshot({
    path: "test-results/balatro-table.png",
    fullPage: true,
  });
  await noOverflow(page, "Desktop final table");
  await ctx.close();
  await mobile.close();
  assert.deepEqual(errors, [], "No browser runtime or missing-asset errors");
  check("No browser runtime or missing-asset errors", true);
  console.log(`\n${checks.length} roguelike browser checks passed.`);
} finally {
  await browser.close();
  await writeFile(
    "test-results/balatro-browser-report.json",
    JSON.stringify({ checks, errors }, null, 2),
  );
}

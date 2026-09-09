import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, firefox } from "playwright";
import { staticSite } from "./static-site.mjs";
import {
  createRun,
  makeConsumable,
  makeJoker,
  runAction,
} from "../src/balatro/engine.ts";
import { shopFixture } from "../src/balatro/fixtures.ts";
import { validRun } from "../src/balatro/storage.ts";

const site = process.env.MOBILE_SITE_URL
  ? {
      url: process.env.MOBILE_SITE_URL.replace(/\/?$/, "/"),
      close: async () => {},
    }
  : await staticSite();
const output = "test-results/mobile-balatro";
const auditOnly = process.argv.includes("--audit");
await mkdir(output, { recursive: true });
const checks = [],
  errors = [];
function equip(run) {
  run.jokers = ["joker", "runner", "green", "loyalty", "trousers"].map((id) =>
    makeJoker(run, id),
  );
  run.consumables = [
    makeConsumable(run, "tarot", "magician"),
    makeConsumable(run, "planet", "pair"),
  ];
  return run;
}
let playing = equip(
  runAction(createRun({ seed: "MOBILE-LAYOUT" }), { type: "startBlind" }),
);
playing.target = 100000;
playing.selected = playing.hand.slice(0, 5);
playing = runAction(playing, { type: "play" });
playing.blind = 2;
playing.boss = "hook";
playing.selected = playing.hand.slice(0, 5);
const shop = equip(shopFixture());
shop.money = 100;
shop.shop.packs[0].kind = "arcana";
shop.shop.packs[0].size = "mega";
const pack = runAction(shop, { type: "openPack", uid: shop.shop.packs[0].uid });
const blind = equip(createRun({ seed: "MOBILE-BLINDS" }));
const sizes = [
  [320, 568],
  [360, 480],
  [360, 540],
  [390, 660],
  [390, 844],
  [568, 320],
  [844, 390],
];

async function load(page, state) {
  assert.ok(validRun(state));
  await page.evaluate(
    (state) =>
      localStorage.setItem(
        "joker-holdem.balatro.run.v1",
        JSON.stringify(state),
      ),
    state,
  );
  // Let the first route transition finish loading its lazy CSS before any reload.
  if (new URL(page.url()).hash === "#/balatro")
    await page.reload({ waitUntil: "domcontentloaded" });
  else
    await page.goto(site.url + "#/balatro", { waitUntil: "domcontentloaded" });
  await page.locator(".rg-layout").waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function audit(page, label) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const issues = await page.evaluate(() => {
    const issues = [];
    const w = innerWidth,
      h = visualViewport?.height ?? innerHeight;
    const visible = (el) =>
      el.checkVisibility() && el.getBoundingClientRect().width > 0;
    const within = (el, bounds, label) => {
      const r = el.getBoundingClientRect();
      if (
        r.left < bounds.left - 2 ||
        r.right > bounds.right + 2 ||
        r.top < bounds.top - 2 ||
        r.bottom > bounds.bottom + 2
      )
        issues.push(`${label} leaves its allocated area`);
    };
    const groups = [
      [
        ".rg-header",
        ".rg-sidebar",
        ".rg-inventory",
        ".rg-board",
        ".rg-run-footer",
      ],
      [
        ".rg-table-caption",
        ".rg-boss-notice",
        ".rg-last-cards",
        ".rg-last-result",
        ".rg-hand-toolbar",
        ".rg-hand-row",
        ".rg-selected-note",
        ".rg-hand-actions",
      ],
      [
        ".rg-shop .rg-stage-heading",
        ".rg-shelf-heading",
        ".rg-shop-offers",
        ".rg-voucher",
        ".rg-pack-shelf",
      ],
    ];
    for (const group of groups) {
      const elements = group.flatMap((selector) =>
        [...document.querySelectorAll(selector)]
          .filter(visible)
          .map((el) => ({ el, selector, r: el.getBoundingClientRect() })),
      );
      for (const [i, a] of elements.entries()) {
        within(a.el, { left: 0, top: 0, right: w, bottom: h }, a.selector);
        for (const b of elements.slice(i + 1))
          if (
            Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left) > 2 &&
            Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top) > 2
          )
            issues.push(`${a.selector} overlaps ${b.selector}`);
      }
    }
    for (const el of document.querySelectorAll(
      ".rg-last-result, .rg-last-cards",
    )) {
      within(
        el,
        document.querySelector(".rg-playing-stage").getBoundingClientRect(),
        el.className,
      );
    }
    for (const el of document.querySelectorAll(".rg-last-cards > div")) {
      if (el.getBoundingClientRect().height < (w < h ? 32 : 22))
        issues.push("Played cards collapse below a readable size");
    }
    for (const offer of document.querySelectorAll(
      ".rg-shop-offers .rg-offer",
    )) {
      const art = offer.querySelector(".rg-offer-art");
      if (art.getBoundingClientRect().width < 24)
        issues.push("Shop artwork collapses");
      for (const el of offer.children)
        if (visible(el))
          within(el, offer.getBoundingClientRect(), "Shop offer content");
    }
    for (const art of document.querySelectorAll(
      ".rg-pack-choices .rg-offer-art",
    ))
      if (art.getBoundingClientRect().width < (w < h ? 24 : 18))
        issues.push("Pack artwork collapses");
    for (const el of document.querySelectorAll(
      ".rg-board button:not(:disabled), .rg-menu-toggle, .rg-header-actions .rg-home-button",
    )) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      within(el, { left: 0, top: 0, right: w, bottom: h }, "Button");
      // Overlapping hand cards must each retain an exposed, tappable edge.
      if (el.matches(".rg-hand-card")) {
        const exposed = [0.12, 0.5, 0.88].some((x) =>
          [0.2, 0.5, 0.8].some((y) =>
            el.contains(
              document.elementFromPoint(r.x + r.width * x, r.y + r.height * y),
            ),
          ),
        );
        if (!exposed)
          issues.push(`Hand card is covered: ${el.getAttribute("aria-label")}`);
        continue;
      }
      const hit = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2,
      );
      if (!hit || !el.contains(hit))
        issues.push(
          `Button is covered: ${el.getAttribute("aria-label") ?? el.textContent.trim().slice(0, 25)}`,
        );
    }
    return [...new Set(issues)];
  });
  checks.push({ label, issues });
  await page.screenshot({ path: `${output}/${label}.png` });
  if (!auditOnly) assert.deepEqual(issues, [], label);
  console.log(
    `${issues.length ? "!" : "✓"} ${label}${issues.length ? ": " + issues.join("; ") : ""}`,
  );
}

try {
  for (const [name, engine] of [
    ["chromium", chromium],
    ["firefox", firefox],
  ]) {
    const browser = await engine.launch({
      headless: true,
      ...(name === "chromium" && process.env.BROWSER_CHANNEL !== "chromium"
        ? { channel: process.env.BROWSER_CHANNEL ?? "chrome" }
        : {}),
    });
    try {
      const context = await browser.newContext({
        hasTouch: true,
        reducedMotion: "reduce",
        ...(name === "chromium" ? { isMobile: true } : {}),
      });
      await context.addInitScript(() => {
        if (!localStorage.getItem("joker-holdem.settings.v1"))
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
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(site.url, { waitUntil: "domcontentloaded" });
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        for (const [phase, state] of [
          ["playing", playing],
          ["shop", shop],
          ["pack", pack],
          ["blinds", blind],
        ]) {
          await load(page, state);
          await audit(page, `${name}-${phase}-${width}x${height}`);
        }
      }

      await page.setViewportSize({ width: 360, height: 540 });
      await load(page, playing);
      await page.getByRole("button", { name: "查看选中手牌详情" }).tap();
      await page.locator(".rg-selected-card-detail .playing-card").waitFor();
      await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
      await page.locator(".rg-menu-toggle").tap();
      await page.getByRole("button", { name: /^查看牌组/ }).click();
      await page
        .getByRole("heading", { name: "我的牌组", exact: true })
        .waitFor();
      await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
      console.log(
        `✓ ${name}: card details and reference menu remain accessible`,
      );

      for (const [width, height] of [
        [360, 480],
        [568, 320],
      ]) {
        await page.setViewportSize({ width, height });
        await load(page, pack);
        await page.locator(".rg-hand-card").last().tap();
        await audit(page, `${name}-pack-selected-${width}x${height}`);
      }

      // Mobile browser bars can change visual height without changing CSS media queries.
      await page.setViewportSize({ width: 390, height: 844 });
      await load(page, playing);
      const before = await page.evaluate(() =>
        localStorage.getItem("joker-holdem.balatro.run.v1"),
      );
      await page.evaluate(() => {
        Object.defineProperty(visualViewport, "height", {
          configurable: true,
          value: 500,
        });
        visualViewport.dispatchEvent(new Event("resize"));
      });
      await audit(page, `${name}-browser-bars-expanded`);
      await page.evaluate(() => {
        delete visualViewport.height;
        visualViewport.dispatchEvent(new Event("resize"));
      });
      await audit(page, `${name}-browser-bars-collapsed`);
      assert.equal(
        await page.evaluate(() =>
          localStorage.getItem("joker-holdem.balatro.run.v1"),
        ),
        before,
      );

      await page.emulateMedia({ reducedMotion: "no-preference" });
      for (const [width, height] of [
        [360, 480],
        [360, 540],
        [568, 320],
      ]) {
        await page.setViewportSize({ width, height });
        await load(page, playing);
        await page.locator(".rg-play-button").tap();
        await page.locator(".rg-scoring").waitFor();
        assert.ok(await page.locator(".rg-discard-button").isDisabled());
        await audit(page, `${name}-scoring-${width}x${height}`);
        await page.getByRole("button", { name: "跳过计分动效" }).click();
        await page.locator(".rg-scoring").waitFor({ state: "detached" });
        await audit(page, `${name}-scored-${width}x${height}`);
      }
      await context.close();
    } finally {
      await browser.close();
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(
    checks.filter((check) => check.issues.length),
    [],
  );
  console.log(
    `\n${checks.length} mobile Balatro layouts passed in Chromium and Firefox.`,
  );
} finally {
  await site.close();
  await writeFile(
    `${output}/report.json`,
    JSON.stringify({ checks, errors }, null, 2),
  );
}

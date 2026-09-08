import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { runAction } from "../src/balatro/engine.ts";
import { playingFixture } from "../src/balatro/fixtures.ts";
import { buildScoreSteps } from "../src/balatro/score-playback.ts";
import { validRun } from "../src/balatro/storage.ts";

const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
const key = "joker-holdem.balatro.run.v1";
const sizesOnly = process.argv.includes("--sizes-only");
const audit = process.argv.includes("--audit");
const layouts = [];
const checks = [],
  errors = [];
const check = (label, ok = true) => {
  assert.ok(ok, label);
  checks.push(label);
  console.log(`✓ ${label}`);
};
const plain = (value) => JSON.parse(JSON.stringify(value));
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL ?? "chrome",
  headless: true,
});
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  hasTouch: true,
});
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.stack ?? e.message));
page.on("requestfailed", (r) => {
  if (/\.(js|css|ttf)(\?|$)/.test(r.url()))
    errors.push(`${r.url()} ${r.failure()?.errorText}`);
});
await mkdir("test-results/scoring", { recursive: true });
const epoch = new Date("2030-01-01T00:00:00Z");
await page.clock.install({ time: epoch });
await page.clock.pauseAt(new Date(epoch.getTime() + 60_000));
await page.goto(`${base}/#/balatro`);

async function saved() {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
}
async function ready(selector = ".rg-layout") {
  // React's lazy-route commit and viewport RAF also use the paused browser clock.
  for (let i = 0; i < 80; i++) {
    await page.clock.runFor(50);
    if (await page.locator(selector).isVisible()) return;
  }
  assert.fail(
    `Page did not render ${selector}: ${(await page.locator("body").innerText()).slice(0, 400)}`,
  );
}
async function load(s, { fast = false, reduce = false } = {}) {
  assert.ok(validRun(s), "Valid isolated animation fixture");
  await page.emulateMedia({
    reducedMotion: reduce ? "reduce" : "no-preference",
  });
  await page.evaluate(
    ({ key, s, fast }) => {
      localStorage.setItem(key, JSON.stringify(s));
      localStorage.setItem(
        "joker-holdem.settings.v1",
        JSON.stringify({
          sound: false,
          volume: 0,
          crt: true,
          fast,
          difficulty: "normal",
        }),
      );
    },
    { key, s, fast },
  );
  await page.goto(`${base}/#/balatro`);
  await page.reload();
  await ready('.rg-layout[data-phase="playing"]');
  await page.evaluate(() => document.fonts.ready);
  await page.clock.runFor(40);
}
async function start() {
  await page.locator(".rg-play-button").tap();
  await page.locator('.rg-layout[data-scoring="true"]').waitFor();
  return page.evaluate(() => performance.now());
}
async function to(origin, elapsed) {
  const now = await page.evaluate(() => performance.now());
  await page.clock.runFor(Math.max(0, origin + elapsed - now));
}
const offset = (steps, index) =>
  steps.slice(0, index).reduce((n, s) => n + s.duration, 0);
const displayed = async (selector) =>
  Number((await page.locator(selector).innerText()).replace(/[+,]/g, ""));
const targetNumber = async (selector) =>
  Number(
    await page
      .locator(`${selector} [data-score-value]`)
      .getAttribute("data-score-value"),
  );
async function fit(label) {
  const issues = await page.evaluate(() => {
    const issues = [],
      w = innerWidth,
      h = visualViewport?.height ?? innerHeight;
    if (
      document.documentElement.scrollWidth > w + 1 ||
      document.documentElement.scrollHeight > h + 1
    )
      issues.push("page overflows viewport");
    for (const selector of [
      ".rg-last-cards",
      ".rg-tally-result",
      ".rg-score-cue",
      ".rg-skip-scoring",
      ".rg-hand-actions",
      ".rg-chip-value",
      ".rg-mult-value",
    ]) {
      const el = document.querySelector(selector),
        r = el?.getBoundingClientRect();
      if (!r || !r.width || !r.height) issues.push(`${selector} missing`);
      else if (r.left < -1 || r.top < -1 || r.right > w + 1 || r.bottom > h + 1)
        issues.push(`${selector} outside screen`);
    }
    for (const selector of [
      ".rg-board",
      ".rg-playing-stage",
      ".rg-hand-area",
      ".rg-sidebar",
    ]) {
      const el = document.querySelector(selector);
      if (el.scrollHeight > el.clientHeight + 3)
        issues.push(`${selector} clips ${el.scrollHeight - el.clientHeight}px`);
    }
    const cards = document
      .querySelector(".rg-last-cards")
      .getBoundingClientRect();
    const result = document
      .querySelector(".rg-tally-result")
      .getBoundingClientRect();
    if (
      Math.min(cards.right, result.right) - Math.max(cards.left, result.left) >
        3 &&
      Math.min(cards.bottom, result.bottom) - Math.max(cards.top, result.top) >
        3
    )
      issues.push("played cards overlap the score");
    return issues;
  });
  await page.screenshot({
    path: `test-results/scoring/${label}.png`,
    animations: "disabled",
  });
  layouts.push({ label, issues });
  if (audit && issues.length) {
    console.log(`! ${label}: ${issues.join(", ")}`);
    return;
  }
  assert.deepEqual(issues, [], label);
  check(label);
}

try {
  let origin = 0;
  if (!sizesOnly) {
    const before = playingFixture(
      [[13, "hearts", "base", "red"]],
      [
        [2, "spades"],
        [13, "clubs", "steel"],
        [11, "spades"],
        [8, "hearts"],
        [7, "spades"],
        [5, "clubs"],
        [3, "diamonds"],
      ],
      ["photo", "chad", "fist", "joker", "cavendish"],
    );
    before.target = 300;
    const after = runAction(before, { type: "play" });
    const steps = buildScoreSteps(after.lastHand);
    await load(before);
    origin = await start();
    check(
      "A winning hand stays on the table during scoring",
      (await page.locator(".rg-layout").getAttribute("data-phase")) ===
        "playing" && (await page.locator(".rg-cashout").count()) === 0,
    );
    check(
      "Initial counters do not reveal the final award",
      (await targetNumber(".rg-chip-value")) === 0 &&
        (await displayed(".rg-score-meter b")) === before.score,
    );
    assert.deepEqual(await saved(), plain(after));
    check("The completed result is saved once before visual playback");
    check(
      "Actions and sorting are disabled during scoring",
      (await page.locator(".rg-play-button").isDisabled()) &&
        (await page
          .getByRole("button", { name: "花色", exact: true })
          .isDisabled()),
    );
    await page.keyboard.press("1");
    await page.keyboard.press("Enter");
    await page.keyboard.press("KeyD");
    assert.deepEqual(await saved(), plain(after));
    check("Rapid input cannot spend another hand or consume random numbers");
    await to(origin, steps[0].duration + 100);
    const rollingChips = await displayed(".rg-chip-value");
    check(
      "Chip digits interpolate between successive values",
      rollingChips > 0 && rollingChips < steps[1].chips,
    );

    for (let i = 1; i < steps.length - 2; i++) {
      await to(origin, offset(steps, i) + 110);
      const step = steps[i];
      assert.equal(
        Number(
          await page.locator(".rg-scoring").getAttribute("data-score-step"),
        ),
        i,
      );
      assert.equal(await targetNumber(".rg-chip-value"), step.chips);
      assert.equal(await targetNumber(".rg-mult-value"), step.mult);
      assert.equal(
        await page.locator(".rg-score-effect-label").innerText(),
        step.label,
      );
      if (step.trace?.joker)
        assert.ok(
          await page
            .locator(`[data-joker-id="${step.trace.joker}"].rg-effect-active`)
            .count(),
        );
      if (step.trace?.card)
        assert.ok(
          await page
            .locator(
              `[data-scored-card="${step.trace.card}"].rg-effect-active, [data-card-id="${step.trace.card}"].rg-effect-active`,
            )
            .count(),
        );
      assert.equal(await displayed(".rg-score-meter b"), before.score);
    }
    check("Every card, held-card effect and joker triggers in recorded order");
    const bank = steps.length - 1;
    await to(origin, offset(steps, bank) + 180);
    const banked = await displayed(".rg-score-meter b");
    check(
      "Round score counts up only after the final multiplier",
      banked > before.score &&
        banked < after.score &&
        (await page.locator(".rg-cashout").count()) === 0,
    );
    await fit("desktop-score-transfer");
    await to(origin, offset(steps, steps.length) + 40);
    await page.locator(".rg-cashout").waitFor();
    check(
      "Cash-out appears after the score transfer finishes",
      (await displayed(".rg-score-meter b")) === after.score,
    );
    assert.deepEqual(await saved(), plain(after));

    const blocked = playingFixture([[14, "spades"]]);
    blocked.blind = 2;
    blocked.boss = "psychic";
    blocked.handsLeft = 1;
    await load(blocked);
    origin = await start();
    const blockedAfter = await saved();
    const blockedSteps = buildScoreSteps(blockedAfter.lastHand);
    check(
      "Failure also waits for its score explanation",
      blockedAfter.phase === "lost" &&
        (await page.locator(".rg-end").count()) === 0,
    );
    await to(origin, offset(blockedSteps, blockedSteps.length - 2) + 50);
    check(
      "Blocked hands visibly score zero and explain the boss rule",
      (await displayed(".rg-last-result > strong")) === 0 &&
        (await page.locator(".rg-score-effect-label").innerText()).includes(
          "必须打出 5 张牌",
        ),
    );
    await to(origin, offset(blockedSteps, blockedSteps.length) + 40);
    await page.locator(".rg-end").waitFor();

    const regular = { ...before, target: 1e12 };
    for (const options of [{ fast: true }, { reduce: true }]) {
      await load(regular, options);
      origin = await start();
      const completed = await saved();
      const sequence = buildScoreSteps(completed.lastHand, !!options.fast);
      const activeIndex = sequence.findIndex((s) => s.trace?.card);
      await to(origin, offset(sequence, activeIndex) + 45);
      check(
        options.fast
          ? "Fast mode retains sequential scoring"
          : "Reduced motion retains sequential scoring",
        (await page.locator('.rg-layout[data-scoring="true"]').count()) === 1,
      );
      if (options.reduce)
        check(
          "Reduced motion disables card movement",
          (await page
            .locator(".rg-triggering")
            .first()
            .evaluate((el) => getComputedStyle(el).animationName)) === "none",
        );
      await to(origin, offset(sequence, sequence.length) + 40);
      check(
        "Refill waits until playback completes",
        (await page.locator(".rg-hand-card").count()) ===
          completed.hand.length &&
          (await page.locator('.rg-layout[data-scoring="false"]').count()) ===
            1,
      );
    }

    await load(regular);
    await start();
    const refreshResult = await saved();
    await page.reload();
    await ready('.rg-layout[data-scoring="false"]');
    await page.clock.runFor(40);
    assert.deepEqual(await saved(), refreshResult);
    check(
      "Refreshing mid-animation restores the exact result without replaying effects",
    );

    await load(regular);
    await start();
    const skipped = await saved();
    await page.getByRole("button", { name: "跳过计分动效", exact: true }).tap();
    check(
      "Skip completes playback and unlocks the table",
      (await page.locator('.rg-layout[data-scoring="false"]').count()) === 1,
    );
    assert.deepEqual(await saved(), skipped);
    await page.keyboard.press("1");
    await page.keyboard.press("Enter");
    const second = await saved();
    check(
      "A new hand can start immediately after skipping",
      second.totalHands === skipped.totalHands + 1,
    );
    await page
      .locator(".rg-header")
      .getByRole("button", { name: /游戏大厅/ })
      .click();
    await page.clock.runFor(10000);
    await page.locator(".hall-rogue-entry").click();
    await ready('.rg-layout[data-scoring="false"]');
    assert.deepEqual(await saved(), second);
    check(
      "Leaving during scoring cancels timers and preserves the committed hand",
    );
    await page.clock.runFor(40);
    await page.keyboard.press("1");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: /^新的一局/ }).click();
    await page.locator("#rg-seed").fill("SCORING-NEW");
    await page.locator(".rg-start-run").click();
    const newRun = await saved();
    await page.clock.runFor(10000);
    assert.deepEqual(await saved(), newRun);
    check(
      "Starting a new run cancels the old score sequence",
      (await page.locator(".rg-layout").getAttribute("data-phase")) === "blind",
    );
  }

  for (const [width, height] of [
    [320, 568],
    [375, 667],
    [390, 844],
    [568, 320],
    [844, 390],
    [1280, 720],
    [1440, 900],
  ]) {
    const s = playingFixture(
      [
        [13, "hearts"],
        [13, "clubs"],
        [13, "diamonds"],
        [10, "spades"],
        [10, "hearts"],
      ],
      [
        [2, "clubs"],
        [9, "diamonds", "steel"],
        [6, "hearts"],
      ],
      ["joker", "blueprint", "photo", "fist", "cavendish"],
    );
    s.blind = 2;
    s.boss = "flint";
    await page.setViewportSize({ width, height });
    await load(s);
    origin = await start();
    const result = await saved();
    const sequence = buildScoreSteps(result.lastHand);
    const activeIndex = sequence.findIndex((step) => step.trace?.joker);
    await to(origin, offset(sequence, activeIndex) + 60);
    await fit(`effects-${width}x${height}`);
    if (width === 390) {
      await page.setViewportSize({ width: 844, height: 390 });
      await page.clock.runFor(40);
      assert.deepEqual(await saved(), result);
      await fit("rotate-during-scoring");
      await page.setViewportSize({ width, height });
      await page.clock.runFor(40);
    }
    await to(origin, offset(sequence, sequence.length - 1) + 150);
    await fit(`total-${width}x${height}`);
    await page.getByRole("button", { name: "跳过计分动效", exact: true }).tap();
  }
  assert.deepEqual(
    errors,
    [],
    "No runtime or asset errors during score playback",
  );
  check("No runtime or asset errors during score playback");
  console.log(`\n${checks.length} score animation checks passed.`);
} finally {
  await browser.close();
  await writeFile(
    "test-results/scoring/report.json",
    JSON.stringify({ checks, errors, layouts }, null, 2),
  );
}

import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL ?? "chrome",
  headless: true,
});
const errors = [];
const checks = [];
const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const check = (label, value) => {
  assert.ok(value, label);
  checks.push(label);
  console.log(`✓ ${label}`);
};

async function context(width = 1440, height = 900) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  await ctx.addInitScript(() => {
    // Playwright also runs init scripts on transient, storage-less about:blank documents.
    try {
      localStorage.setItem(
        "joker-holdem.network.transport",
        JSON.stringify("server"),
      );
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
    } catch {
      /* The real same-origin document receives the setup on navigation. */
    }
  });
  ctx.on("page", (page) =>
    page.on("pageerror", (error) => errors.push(error.message)),
  );
  return ctx;
}

async function ready(page, path = "/#/table") {
  await page.goto(`${base}${path}`);
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".game-table").waitFor();
}

async function noOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth,
    content: document.documentElement.scrollWidth,
  }));
  check(
    `${label}: no horizontal overflow`,
    dimensions.content <= dimensions.viewport,
  );
}

async function soloState(page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("joker-holdem.game.v1")),
  );
}

try {
  const desktop = await context();
  const page = await desktop.newPage();
  await ready(page);
  await noOverflow(page, "Desktop 1440px");
  check(
    "Fresh game has two visible private cards and five empty board slots",
    (await page.locator(".hero-cards .card-face").count()) === 2 &&
      (await page.locator(".card-placeholder").count()) === 5,
  );
  check(
    "Initial human turn is actionable",
    await page.locator(".call-button").isEnabled(),
  );
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });

  await page.getByRole("button", { name: "查看牌型速查", exact: true }).click();
  check(
    "Hand reference opens",
    await page.getByText("皇家同花顺", { exact: true }).isVisible(),
  );
  await page.keyboard.press("Escape");
  check(
    "Escape closes the dialog",
    (await page.getByRole("dialog").count()) === 0,
  );
  await page.getByRole("button", { name: "游戏设置", exact: true }).click();
  await page.getByRole("switch", { name: "复古屏幕", exact: true }).click();
  check(
    "CRT preference changes the actual screen",
    (await page.locator(".crt-overlay").count()) === 0,
  );
  await page.getByRole("switch", { name: "复古屏幕", exact: true }).click();
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await page.getByRole("button", { name: "底池", exact: true }).click();
  check(
    "Pot raise preset uses the pot after calling",
    (await page.locator(".raise-button strong").innerText()) === "$70",
  );
  await page.locator(".raise-button").click();
  await page.waitForFunction(() =>
    JSON.parse(localStorage.getItem("joker-holdem.game.v1")).logs.some(
      (log) => log.text === "你 · 加注至 $70",
    ),
  );
  check("Raise updates game state", true);

  let savedFlop = false;
  const soloDeadline = Date.now() + 60_000;
  while (Date.now() < soloDeadline) {
    const state = await soloState(page);
    if (state.community.length >= 3 && !savedFlop) {
      await page.screenshot({
        path: "test-results/desktop-playing.png",
        fullPage: true,
      });
      savedFlop = true;
    }
    if (state.result) break;
    if (state.actor === 0 && (await page.locator(".call-button").isEnabled()))
      await page.locator(".call-button").click();
    else await tick(110);
  }
  const finished = await soloState(page);
  check("A complete solo hand settles", !!finished.result);
  check(
    "Solo settlement conserves all 8,000 chips",
    finished.players.reduce((sum, player) => sum + player.stack, 0) === 8000,
  );
  await page.screenshot({
    path: "test-results/desktop-showdown.png",
    fullPage: true,
  });
  check(
    "Results include a next-hand action",
    await page.locator(".next-hand-button").isEnabled(),
  );
  const expectedHand =
    finished.players[0].stack === 0 ||
    finished.players.filter((player) => player.stack > 0).length < 2
      ? 1
      : 2;
  await page.locator(".next-hand-button").click();
  await page.waitForFunction(
    (expected) =>
      JSON.parse(localStorage.getItem("joker-holdem.game.v1")).handNumber ===
      expected,
    expectedHand,
  );
  const beforeReload = (await soloState(page)).players[0].cards;
  await page.reload();
  await page.locator(".hero-cards .card-face").first().waitFor();
  check(
    "Solo progress and hole cards survive refresh",
    JSON.stringify((await soloState(page)).players[0].cards) ===
      JSON.stringify(beforeReload),
  );

  const mobileContext = await context(390, 844);
  const mobile = await mobileContext.newPage();
  await ready(mobile);
  await noOverflow(mobile, "Phone 390px");
  await mobile.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await mobile.locator(".mobile-new-table").click();
  check(
    "Phone can restart from its visible controls",
    await mobile.getByRole("dialog").isVisible(),
  );
  await mobile.getByRole("button", { name: "继续这一桌", exact: true }).click();
  for (const width of [360, 768, 1024]) {
    await mobile.setViewportSize({ width, height: 900 });
    await noOverflow(mobile, `Responsive ${width}px`);
  }
  await mobile.setViewportSize({ width: 390, height: 844 });

  const hostContext = await context();
  const host = await hostContext.newPage();
  await ready(host);
  await host.locator(".lan-button").click();
  await host.getByLabel("你的牌桌昵称", { exact: true }).fill("电脑玩家");
  await host.getByRole("button", { name: "创建一张牌桌", exact: true }).click();
  await host.getByTestId("room-code").waitFor();
  const code = await host.getByTestId("room-code").innerText();
  check(
    "LAN host receives a six-character room code",
    /^[A-Z2-9]{6}$/.test(code),
  );
  await host.getByRole("button", { name: "关闭弹窗", exact: true }).click();
  check(
    "Closing the lobby shows a waiting table with no stale cards",
    (await host.locator(".waiting-room-placeholder").isVisible()) &&
      !(await host.locator(".hero-cards").isVisible()),
  );
  await host.getByRole("button", { name: "返回等候房间", exact: true }).click();
  await host.waitForFunction(() =>
    document.querySelector("#invite-url")?.value.startsWith("http"),
  );
  const invite = await host.locator("#invite-url").inputValue();
  check(
    "Invitation contains the room code and a network address",
    invite.includes(`?room=${code}`) && !invite.includes("127.0.0.1"),
  );
  const guestContext = await context(390, 844);
  const guest = await guestContext.newPage();
  await guest.goto(invite);
  await guest.evaluate(() => document.fonts.ready);
  await guest.locator(".game-table").waitFor();
  await guest.getByLabel("你的牌桌昵称", { exact: true }).fill("手机玩家");
  await guest.getByRole("button", { name: "加入牌桌", exact: true }).click();
  await guest.getByTestId("room-code").waitFor();
  await host.locator(".room-seat").filter({ hasText: "手机玩家" }).waitFor();
  check(
    "Desktop and phone join the same lobby",
    (await guest.getByTestId("room-code").innerText()) === code,
  );
  check(
    "Only the host can start",
    await guest
      .getByRole("button", { name: "等待房主开始对局…", exact: true })
      .isDisabled(),
  );
  await host.screenshot({ path: "test-results/lan-lobby.png", fullPage: true });
  await host.getByRole("button", { name: "开始对局", exact: true }).click();
  await host.getByRole("dialog").waitFor({ state: "detached" });
  await guest.getByRole("dialog").waitFor({ state: "detached" });
  check(
    "Each browser sees its own cards and hidden opponent cards",
    (await host.locator(".hero-cards .card-face").count()) === 2 &&
      (await guest.locator(".hero-cards .card-face").count()) === 2 &&
      (await host.locator(".opponent .card-face").count()) === 0 &&
      (await guest.locator(".opponent .card-face").count()) === 0,
  );
  check(
    "A guest cannot act out of turn",
    await guest.locator(".call-button").isDisabled(),
  );
  const guestCards = await guest
    .locator(".hero-cards .card-face")
    .evaluateAll((cards) =>
      cards.map((card) => card.getAttribute("aria-label")),
    );
  await guest.reload();
  await guest.getByRole("dialog").waitFor({ state: "detached" });
  await guest.locator(".hero-name").filter({ hasText: "手机玩家" }).waitFor();
  const resumedCards = await guest
    .locator(".hero-cards .card-face")
    .evaluateAll((cards) =>
      cards.map((card) => card.getAttribute("aria-label")),
    );
  check(
    "A refreshed phone restores its original seat and cards",
    JSON.stringify(guestCards) === JSON.stringify(resumedCards),
  );

  const lanDeadline = Date.now() + 75_000;
  let lanCaptured = false;
  while (Date.now() < lanDeadline) {
    if (await host.locator(".next-hand-button").count()) break;
    if (
      !lanCaptured &&
      (await host.locator(".community-cards .card-face").count()) >= 3
    ) {
      await host.screenshot({
        path: "test-results/lan-desktop.png",
        fullPage: true,
      });
      await guest.screenshot({
        path: "test-results/lan-mobile.png",
        fullPage: true,
      });
      lanCaptured = true;
    }
    if (await host.locator(".call-button").isEnabled())
      await host.locator(".call-button").click();
    else if (await guest.locator(".call-button").isEnabled())
      await guest.locator(".call-button").click();
    else await tick(140);
  }
  await guest.locator(".next-hand-button").waitFor({ timeout: 5000 });
  check(
    "Two browsers complete a real LAN hand",
    (await host.locator(".next-hand-button").count()) === 1,
  );
  const hostBoard = await host
    .locator(".community-cards .card-face")
    .evaluateAll((cards) =>
      cards.map((card) => card.getAttribute("aria-label")),
    );
  const guestBoard = await guest
    .locator(".community-cards .card-face")
    .evaluateAll((cards) =>
      cards.map((card) => card.getAttribute("aria-label")),
    );
  check(
    "Community cards and settlement are synchronized",
    JSON.stringify(hostBoard) === JSON.stringify(guestBoard) &&
      (await host.locator(".pot-value strong").innerText()) ===
        (await guest.locator(".pot-value strong").innerText()),
  );
  check(
    "Guest waits for the host to deal again",
    await guest.locator(".next-hand-button").isDisabled(),
  );
  await host.locator(".lan-button").click();
  await host
    .getByRole("button", { name: "离开房间，返回大厅", exact: true })
    .click();
  await guest.waitForFunction(
    () => !document.querySelector(".next-hand-button").disabled,
  );
  check(
    "Hosting transfers when the host leaves",
    await guest.locator(".next-hand-button").isEnabled(),
  );
  await guest.locator(".lan-button").click();
  await guest
    .getByRole("button", { name: "离开房间，返回大厅", exact: true })
    .click();

  check("No unhandled browser errors", errors.length === 0);
  await writeFile(
    "test-results/browser-report.json",
    JSON.stringify({ passed: checks.length, checks, errors }, null, 2),
  );
  console.log(
    `\n${checks.length} browser checks passed. Screenshots saved in test-results/.`,
  );
} catch (error) {
  for (const [index, ctx] of browser.contexts().entries()) {
    const page = ctx.pages()[0];
    if (page)
      await page
        .screenshot({
          path: `test-results/failure-${index}.png`,
          fullPage: true,
        })
        .catch(() => {});
  }
  console.error(error);
  console.error("Browser errors:", errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}

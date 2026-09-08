import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createGame, settle } from "../src/poker.ts";

const base = process.env.GAME_URL ?? "http://127.0.0.1:5178";
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL ?? "chrome",
  headless: true,
});
const checks = [],
  errors = [];
const check = (label, ok) => {
  assert.ok(ok, label);
  checks.push(label);
  console.log(`✓ ${label}`);
};
const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const modes = {
  classic: "经典德州",
  jokers: "小丑狂欢",
  rainbow: "彩虹底池",
  blitz: "闪电战",
};

async function context(width = 1440, height = 1000) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
  });
  await ctx.addInitScript(() => {
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
      /* about:blank has no localStorage. */
    }
  });
  ctx.on("page", (page) =>
    page.on("pageerror", (error) => errors.push(error.message)),
  );
  return ctx;
}
async function hall(page) {
  await page.goto(`${base}/`);
  await page.locator(".game-hall").waitFor();
  await page.evaluate(() => document.fonts.ready);
}
async function soloState(page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("joker-holdem.game.v1")),
  );
}
async function noOverflow(page, label) {
  const size = await page.evaluate(() => [
    innerWidth,
    document.documentElement.scrollWidth,
  ]);
  check(`${label}: no horizontal overflow`, size[1] <= size[0]);
}
async function chooseMode(page, mode) {
  await page.locator(`.game-mode-card.mode-${mode}`).click();
}
async function startSolo(page, mode, opponents = 1) {
  await chooseMode(page, mode);
  await page
    .getByRole("button", { name: `${opponents} 个 AI 对手`, exact: true })
    .click();
  await page.getByRole("button", { name: "开始人机对战", exact: true }).click();
  await page.locator(".game-table").waitFor();
}
async function finishSoloByFolding(page) {
  const deadline = Date.now() + 35000;
  while (Date.now() < deadline) {
    if ((await soloState(page)).result) return;
    if (await page.locator(".fold-button").isEnabled())
      await page.locator(".fold-button").click();
    else await tick(100);
  }
  throw new Error("Solo hand did not settle");
}
async function tableGeometry(page, label) {
  const collisions = await page.evaluate(() => {
    const seats = [...document.querySelectorAll(".opponent")].map((el) => ({
      label: `seat ${el.dataset.seat}`,
      rect: el.getBoundingClientRect(),
    }));
    const center = [
      ".community-area",
      ".pot-eyebrow",
      ".pot-value",
      ".pot-caption",
      ".hero-area",
    ].map((selector) => ({
      label: selector,
      rect: document.querySelector(selector).getBoundingClientRect(),
    }));
    const overlap = (a, b) =>
      Math.min(a.right, b.right) - Math.max(a.left, b.left) > 3 &&
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 3;
    return seats.flatMap((seat, i) =>
      [...seats.slice(i + 1), ...center]
        .filter((other) => overlap(seat.rect, other.rect))
        .map((other) => `${seat.label} / ${other.label}`),
    );
  });
  check(
    `${label}: seats clear the board and each other (${collisions.join(", ")})`,
    !collisions.length,
  );
}
async function leaveRoom(page) {
  await page.locator(".lan-button").click();
  await page
    .getByRole("button", { name: "离开房间，返回大厅", exact: true })
    .click();
  await page.locator(".game-hall").waitFor();
}

try {
  const desktop = await context();
  const page = await desktop.newPage();
  await hall(page);
  check(
    "A fresh visit opens the mode hall without a fabricated saved game",
    !(await page.locator(".game-table").count()) &&
      !(await page.locator(".resume-game-button").count()),
  );
  check(
    "The hall offers all four variants",
    (await page.locator(".game-mode-card").count()) === 4,
  );
  await page.screenshot({
    path: "test-results/hall-desktop.png",
    fullPage: true,
  });
  for (const width of [1440, 1024, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await noOverflow(page, `Hall ${width}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/hall-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("你的牌桌昵称", { exact: true }).fill("多模式玩家");
  await page.getByRole("button", { name: "挑战", exact: true }).click();
  await startSolo(page, "jokers", 5);
  let state = await soloState(page);
  check(
    "Solo setup applies mode, five AI opponents, nickname and difficulty",
    state.config.mode === "jokers" &&
      state.players.length === 6 &&
      state.config.difficulty === "hard" &&
      state.players[0].name === "多模式玩家",
  );
  check(
    "Six seats include five opponent portraits and equipment",
    (await page.locator(".opponent").count()) === 5 &&
      (await page.locator(".opponent-jokers").count()) === 5,
  );
  // Pause the game while inspecting each responsive arrangement.
  await page.getByRole("button", { name: "游戏设置", exact: true }).click();
  for (const width of [1440, 1280, 1100, 1024, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    await noOverflow(page, `Six-seat table ${width}px`);
    await tableGeometry(page, `Six-seat table ${width}px`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
  await page.screenshot({
    path: "test-results/jokers-six-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/jokers-six-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /游戏大厅/ }).click();
  const paused = await soloState(page);
  await tick(950);
  check(
    "Returning to the hall pauses the saved solo table",
    JSON.stringify(await soloState(page)) === JSON.stringify(paused),
  );
  await page.reload();
  await page.locator(".game-hall").waitFor();
  check(
    "Mode and AI count survive refresh in the hall",
    (await page.locator(".mode-jokers").getAttribute("aria-pressed")) ===
      "true" &&
      (await page
        .getByRole("button", { name: "5 个 AI 对手" })
        .getAttribute("aria-pressed")) === "true",
  );
  await page.locator(".resume-game-button").click();
  check(
    "Resume returns to the same six-seat match",
    (await soloState(page)).session === paused.session,
  );
  await page.getByRole("button", { name: /游戏大厅/ }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });

  for (const mode of ["classic", "rainbow", "blitz", "jokers"]) {
    await page.getByRole("button", { name: "轻松", exact: true }).click();
    await startSolo(page, mode);
    state = await soloState(page);
    check(
      `${modes[mode]} starts as a playable two-seat game`,
      state.config.mode === mode &&
        state.players.length === 2 &&
        (await page.locator(".current-mode").innerText()).includes(modes[mode]),
    );
    if (mode === "blitz")
      check(
        "Blitz starts with 500 chips per seat",
        state.players.reduce((sum, p) => sum + p.stack + p.contributed, 0) ===
          1000,
      );
    await page.locator(".current-mode").click();
    check(
      `${modes[mode]} has its own visible rules`,
      (await page.locator(".mode-rule-summary").innerText()).includes(
        modes[mode],
      ),
    );
    await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
    await finishSoloByFolding(page);
    if (mode === "jokers") break;
    await page.locator(".next-hand-button").click();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("joker-holdem.game.v1")).handNumber ===
        2,
    );
    check(
      `${modes[mode]} continues with the correct blind level`,
      (await soloState(page)).blinds.small === (mode === "blitz" ? 20 : 10),
    );
    await page.getByRole("button", { name: /游戏大厅/ }).click();
  }

  await page.getByRole("button", { name: "进入小丑商店", exact: true }).click();
  await page.locator(".joker-shop").waitFor();
  const statsBefore = await page.evaluate(
    () => JSON.parse(localStorage.getItem("joker-holdem.stats.v1")).hands,
  );
  await page.reload();
  await page.locator(".joker-shop").waitFor();
  check(
    "Reload restores an open solo shop",
    (await soloState(page)).street === "shop",
  );
  await page.screenshot({
    path: "test-results/joker-shop-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page, "Joker shop phone");
  await page.screenshot({
    path: "test-results/joker-shop-mobile.png",
    fullPage: true,
  });
  const beforeBuy = (await soloState(page)).players[0].coins;
  await page.locator(".buy-joker:not(:disabled)").first().click();
  check(
    "Buying a joker updates inventory and spends five coins",
    (await soloState(page)).players[0].coins === beforeBuy - 5 &&
      (await soloState(page)).players[0].jokers.length === 2,
  );
  await page.locator(".inventory-joker button").last().click();
  check(
    "Selling returns two coins",
    (await soloState(page)).players[0].coins === beforeBuy - 3,
  );
  await page.getByRole("button", { name: /刷新 · 1 币/ }).click();
  check(
    "Refreshing changes the shared shelf and spends one coin",
    (await soloState(page)).players[0].coins === beforeBuy - 4 &&
      (await page.locator(".shop-offer").count()) === 3,
  );
  check(
    "Shopping and refreshing do not double-count played hands",
    (await page.evaluate(
      () => JSON.parse(localStorage.getItem("joker-holdem.stats.v1")).hands,
    )) === statsBefore,
  );
  await page
    .getByRole("button", { name: "准备，继续发牌", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("joker-holdem.game.v1")).handNumber === 2,
  );
  await page.locator(".joker-shop").waitFor({ state: "detached" });
  check(
    "Ready starts the next solo hand after the AI has shopped",
    !(await soloState(page)).shop &&
      (await soloState(page)).players[0].jokers.length === 1,
  );
  await desktop.close();

  // A deterministic settlement verifies the visible rainbow accounting independently of shuffled cards.
  const rainbowContext = await context();
  const rainbowPage = await rainbowContext.newPage();
  const fixture = createGame(Math.random, {
    mode: "rainbow",
    seats: 2,
    name: "彩虹玩家",
  });
  fixture.community = [
    { rank: 12, suit: "spades" },
    { rank: 11, suit: "spades" },
    { rank: 10, suit: "spades" },
    { rank: 2, suit: "diamonds" },
    { rank: 3, suit: "clubs" },
  ];
  fixture.players[0].cards = [
    { rank: 14, suit: "spades" },
    { rank: 13, suit: "spades" },
  ];
  fixture.players[1].cards = [
    { rank: 14, suit: "hearts" },
    { rank: 13, suit: "hearts" },
  ];
  fixture.players.forEach((p) => {
    p.stack = 1900;
    p.contributed = 100;
    p.folded = false;
  });
  const settled = settle(fixture);
  await rainbowContext.addInitScript((game) => {
    try {
      localStorage.setItem("joker-holdem.game.v1", JSON.stringify(game));
    } catch {}
  }, settled);
  await rainbowPage.goto(`${base}/#/table`);
  await rainbowPage.locator(".bonus-summary").waitFor();
  check(
    "Rainbow showdown displays the actual tenfold bonus separately from the base pot",
    (await rainbowPage.locator(".bonus-summary").innerText()).includes(
      "1,800",
    ) &&
      (await rainbowPage.locator(".pot-value strong").innerText()).includes(
        "200",
      ),
  );
  await rainbowPage.screenshot({
    path: "test-results/rainbow-showdown.png",
    fullPage: true,
  });
  await rainbowContext.close();

  const hostContext = await context();
  const host = await hostContext.newPage();
  await hall(host);
  await host.getByRole("button", { name: "创建房间", exact: true }).click();
  await host.getByLabel("你的牌桌昵称", { exact: true }).fill("六人房主");
  await chooseMode(host, "jokers");
  await host.getByRole("button", { name: "6 人牌桌", exact: true }).click();
  await host.getByLabel("空位由 AI 补齐").uncheck();
  await host.getByRole("button", { name: "创建这张牌桌", exact: true }).click();
  await host.getByTestId("room-code").waitFor();
  check(
    "A pure-human room waits for at least two people",
    await host
      .getByRole("button", { name: "等待至少 2 位玩家入座", exact: true })
      .isDisabled(),
  );
  await host.waitForFunction(() =>
    document.querySelector("#invite-url")?.value.startsWith("http"),
  );
  const invite = await host.locator("#invite-url").inputValue();
  const participants = [host],
    contexts = [hostContext];
  for (let seat = 1; seat < 6; seat++) {
    const ctx = await context(390, 844),
      guest = await ctx.newPage();
    contexts.push(ctx);
    participants.push(guest);
    await guest.goto(invite);
    await guest.getByLabel("你的牌桌昵称", { exact: true }).fill(`朋友${seat}`);
    await guest.getByRole("button", { name: "加入牌桌", exact: true }).click();
    await guest.getByTestId("room-code").waitFor();
  }
  check(
    "Six independent browser sessions join one pure-human room",
    (await host.locator(".room-seat:not(.empty-seat)").count()) === 6,
  );
  const lastGuest = participants[5];
  await lastGuest
    .getByRole("button", { name: "关闭弹窗", exact: true })
    .click();
  check(
    "The sixth seat can view the waiting table without stale private cards",
    (await lastGuest.locator(".waiting-room-placeholder").isVisible()) &&
      !(await lastGuest.locator(".hero-cards").isVisible()),
  );
  await lastGuest.locator(".lan-button").click();
  await host.locator(".room-configuration summary").click();
  await chooseMode(host, "blitz");
  await lastGuest
    .locator(".room-configuration summary")
    .filter({ hasText: "闪电战" })
    .waitFor();
  await chooseMode(host, "jokers");
  await lastGuest
    .locator(".room-configuration summary")
    .filter({ hasText: "小丑狂欢" })
    .waitFor();
  check(
    "Changing the host mode updates every guest lobby",
    (
      await Promise.all(
        participants.map((p) =>
          p.locator(".room-configuration summary").innerText(),
        ),
      )
    ).every((text) => text.includes("小丑狂欢")),
  );
  await lastGuest.locator(".room-configuration summary").click();
  check(
    "Guests see the synchronized settings without host controls",
    await lastGuest.locator(".game-mode-card.mode-classic").isDisabled(),
  );
  await host.screenshot({
    path: "test-results/six-player-lobby.png",
    fullPage: true,
  });
  await host.getByRole("button", { name: "开始对局", exact: true }).click();
  await Promise.all(
    participants.map((p) =>
      p.getByRole("dialog").waitFor({ state: "detached" }),
    ),
  );
  check(
    "Six players each see their own two cards and five hidden hands",
    (
      await Promise.all(
        participants.map(
          async (p) =>
            (await p.locator(".hero-cards .card-face").count()) === 2 &&
            (await p.locator(".opponent").count()) === 5 &&
            (await p.locator(".opponent .card-face").count()) === 0,
        ),
      )
    ).every(Boolean),
  );
  check(
    "Seat six receives its own name and avatar",
    (await lastGuest.locator(".hero-name").innerText()).includes("朋友5"),
  );
  const deadline = Date.now() + 20000;
  while (
    !(await host.locator(".next-hand-button").count()) &&
    Date.now() < deadline
  ) {
    let acted = false;
    for (const participant of participants)
      if (await participant.locator(".fold-button").isEnabled()) {
        await participant.locator(".fold-button").click();
        acted = true;
        break;
      }
    if (!acted) await tick(80);
  }
  await host.locator(".next-hand-button").waitFor();
  check(
    "A six-person hand settles across all browser sessions",
    (
      await Promise.all(
        participants.map((p) => p.locator(".next-hand-button").count()),
      )
    ).every((count) => count === 1),
  );
  await host.getByRole("button", { name: "进入小丑商店", exact: true }).click();
  await Promise.all(
    participants.map((p) => p.locator(".joker-shop").waitFor()),
  );
  const firstOfferName = await host
    .locator(".buy-joker")
    .first()
    .getAttribute("aria-label");
  await host.getByRole("button", { name: firstOfferName, exact: true }).click();
  await Promise.all(
    participants.map((p) =>
      p
        .getByRole("button", { name: firstOfferName, exact: true })
        .waitFor({ state: "detached" }),
    ),
  );
  check(
    "Buying removes the same shared offer from all six shops",
    (
      await Promise.all(
        participants.map((p) => p.locator(".shop-offer").count()),
      )
    ).every((count) => count === 2),
  );
  const inventory = await lastGuest.locator(".shop-inventory").innerText();
  await lastGuest.reload();
  await lastGuest.locator(".joker-shop").waitFor();
  check(
    "Reloading seat six restores its equipment and shared shelf",
    (await lastGuest.locator(".shop-inventory").innerText()) === inventory &&
      (await lastGuest.locator(".shop-offer").count()) === 2,
  );
  await lastGuest.screenshot({
    path: "test-results/lan-joker-shop-mobile.png",
    fullPage: true,
  });
  for (const participant of participants.slice(1))
    await participant
      .getByRole("button", { name: "准备，继续发牌", exact: true })
      .click();
  await host.locator(".shop-ready-row").filter({ hasText: "5 / 6" }).waitFor();
  check(
    "Five ready players wait for the sixth instead of skipping the shop",
    await host.locator(".joker-shop").isVisible(),
  );
  check(
    "A ready player cannot buy or refresh",
    (await lastGuest.locator(".buy-joker").first().isDisabled()) &&
      (await lastGuest
        .getByRole("button", { name: /刷新 · 1 币/ })
        .isDisabled()),
  );
  await host
    .getByRole("button", { name: "准备，继续发牌", exact: true })
    .click();
  await Promise.all(
    participants.map((p) =>
      p.waitForFunction(
        () =>
          document
            .querySelector(".hand-number strong")
            ?.textContent.replace(/\D/g, "") === "02",
      ),
    ),
  );
  check(
    "All-ready automatically deals hand two for every player",
    (
      await Promise.all(
        participants.map((p) => p.locator(".joker-shop").count()),
      )
    ).every((count) => count === 0),
  );
  for (const participant of participants) await leaveRoom(participant);
  for (const ctx of contexts) await ctx.close();

  check("No unhandled browser errors in multi-mode flows", errors.length === 0);
  await writeFile(
    "test-results/modes-browser-report.json",
    JSON.stringify({ passed: checks.length, checks, errors }, null, 2),
  );
  console.log(`\n${checks.length} mode browser checks passed.`);
} catch (error) {
  for (const [i, ctx] of browser.contexts().entries())
    if (ctx.pages()[0])
      await ctx
        .pages()[0]
        .screenshot({
          path: `test-results/modes-failure-${i}.png`,
          fullPage: true,
        })
        .catch(() => {});
  console.error(error);
  console.error("Browser errors:", errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}

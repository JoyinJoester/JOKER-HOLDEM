import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { chromium, firefox } from "playwright";
import { staticSite } from "./static-site.mjs";

const site = process.env.P2P_SITE_URL
  ? {
      url: new URL(process.env.P2P_SITE_URL).href.replace(/\/?$/, "/"),
      close: async () => {},
    }
  : await staticSite();
const browser = await chromium.launch({
  ...(process.env.BROWSER_CHANNEL === "chromium"
    ? {}
    : { channel: process.env.BROWSER_CHANNEL ?? "chrome" }),
  headless: true,
});
const alternate =
  process.env.P2P_CROSS_BROWSER === "1"
    ? await firefox.launch({ headless: true })
    : null;
const contexts = [],
  pages = [],
  errors = [],
  requests = [],
  checks = [];
await mkdir("test-results/p2p", { recursive: true });
const check = (label, ok = true) => {
  assert.ok(ok, label);
  checks.push(label);
  console.log(`✓ ${label}`);
};
async function player(name, url = site.url, engine = browser, options = {}) {
  const context = await engine.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: "reduce",
    hasTouch: engine === browser,
  });
  contexts.push(context);
  await context.addInitScript(
    ({ rejectMdns }) => {
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
      window.__peerMessages = [];
      window.__peerConnections = [];
      window.__iceConfigs = [];
      window.__peerTrace = [];
      const Native = window.RTCPeerConnection;
      const observe = (channel, peer) => {
        const connection = window.__peerConnections.indexOf(peer);
        const trace = (direction, raw) => {
          try {
            const packet = JSON.parse(raw);
            window.__peerTrace.push({
              at: Math.round(performance.now()),
              connection,
              direction,
              type: packet.t,
              id: packet.id,
              event: packet.event,
              ok: packet.reply?.ok,
              error: packet.reply?.error,
              hasSession: !!packet.reply?.session,
              hasToken: typeof packet.payload?.token === "string",
            });
          } catch {
            /* Never include raw packets or credentials in CI diagnostics. */
          }
        };
        const send = channel.send.bind(channel);
        channel.send = (data) => {
          trace("send", data);
          return send(data);
        };
        for (const event of ["open", "close", "error"])
          channel.addEventListener(event, () =>
            window.__peerTrace.push({
              at: Math.round(performance.now()),
              connection,
              channel: event,
            }),
          );
        channel.addEventListener("message", ({ data }) => {
          trace("receive", data);
          try {
            window.__peerMessages.push(JSON.parse(data));
          } catch {
            /* Malformed probes are tested separately. */
          }
        });
      };
      window.RTCPeerConnection = class extends Native {
        constructor(...args) {
          super(...args);
          window.__peerConnections.push(this);
          window.__iceConfigs.push(this.getConfiguration());
          this.addEventListener("datachannel", ({ channel }) =>
            observe(channel, this),
          );
        }
        createDataChannel(...args) {
          const channel = super.createDataChannel(...args);
          observe(channel, this);
          return channel;
        }
        setRemoteDescription(description) {
          if (
            rejectMdns &&
            /a=candidate:.*\.local /.test(description.sdp ?? "")
          )
            throw new Error("This test peer cannot resolve mDNS host names");
          return super.setRemoteDescription(description);
        }
      };
    },
    { rejectMdns: !!options.rejectMdns },
  );
  const page = await context.newPage();
  pages.push(page);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => requests.push(r.url()));
  page.on("response", (r) => {
    if (r.status() >= 400)
      errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`);
  });
  await page.goto(url);
  await page.locator(".game-hall").waitFor();
  await page.locator("#hall-nickname").fill(name);
  return page;
}
async function createHost(
  mode = "classic",
  seats = 2,
  fillBots = false,
  options = {},
) {
  const host = await player("房主", site.url, browser, options);
  await host.getByRole("button", { name: "创建房间", exact: true }).click();
  await host.locator(`.game-mode-card.mode-${mode}`).click();
  await host
    .locator(".room-options .number-choices button")
    .filter({ hasText: String(seats) })
    .click();
  await host.locator(".fill-bots-option input").setChecked(fillBots);
  await host.getByRole("button", { name: "创建这张牌桌", exact: true }).click();
  await host.locator(".peer-has-room").waitFor();
  return host;
}
async function invite(host) {
  await host.getByRole("button", { name: "生成邀请", exact: true }).click();
  await host.getByTestId("peer-offer").waitFor();
  return host.getByTestId("peer-offer").inputValue();
}
async function setLanAddress(page, address, fromHall = false) {
  if (fromHall) await page.locator(".lan-button").click();
  await page.getByRole("button", { name: "连接帮助", exact: true }).click();
  await page.getByLabel("本机局域网 IPv4").fill(address);
  await page.locator(".peer-connection-help > .primary-button").click();
  if (fromHall)
    await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
}
async function connectGuest(host, name, engine = browser, options = {}) {
  const url = await invite(host);
  assert.ok(
    url.startsWith(site.url + "#/?invite=JH1."),
    "Invitation keeps the Pages repository path",
  );
  const guest = await player(name, url, engine, options);
  assert.equal(
    await guest.locator("#hall-room-code").inputValue(),
    url.split("invite=")[1],
  );
  if (options.localAddress)
    await setLanAddress(guest, options.localAddress, true);
  await guest
    .getByRole("button", { name: "生成连接应答", exact: true })
    .click();
  await guest.getByTestId("peer-answer").waitFor();
  const answer = await guest.getByTestId("peer-answer").inputValue();
  if (name === "朋友一") {
    const wrong = JSON.parse(
      Buffer.from(answer.slice(4), "base64url").toString(),
    );
    wrong.pair = "f".repeat(24);
    await host
      .getByLabel("朋友的连接应答")
      .fill("JH1." + Buffer.from(JSON.stringify(wrong)).toString("base64url"));
    await host.getByRole("button", { name: "确认应答", exact: true }).click();
    await host.getByRole("alert").filter({ hasText: "不匹配" }).waitFor();
    check(
      "Rejects an answer for a different invitation without losing the current offer",
    );
  }
  await host.getByLabel("朋友的连接应答").fill(answer);
  await host.getByRole("button", { name: "确认应答", exact: true }).click();
  await guest
    .locator('[data-peer-status="connected"]')
    .waitFor({ timeout: 35_000 });
  await host.locator(".peer-roster").getByText(name, { exact: true }).waitFor();
  return guest;
}
const snapshot = (page) =>
  page.evaluate(
    () =>
      window.__peerMessages
        .filter((m) => m.t === "event" && m.event === "room:update")
        .at(-1)?.data,
  );
async function fit(page, label) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const issues = await page.evaluate(() => {
    const issues = [];
    if (
      document.documentElement.scrollHeight > innerHeight + 1 ||
      document.documentElement.scrollWidth > innerWidth + 1
    )
      issues.push("Page overflow");
    for (const selector of [".dialog-content", ".peer-lobby", ".hall-setup"]) {
      const el = document.querySelector(selector);
      if (el && el.scrollHeight > el.clientHeight + 2)
        issues.push(`${selector} clips ${el.scrollHeight - el.clientHeight}px`);
    }
    for (const el of document.querySelectorAll(
      ".peer-lobby textarea, .peer-lobby input, .peer-lobby button",
    )) {
      if (!el.checkVisibility()) continue;
      const r = el.getBoundingClientRect();
      if (!r.height || !r.width) continue;
      if (
        r.top < 0 ||
        r.left < 0 ||
        r.bottom > innerHeight + 1 ||
        r.right > innerWidth + 1
      )
        issues.push("Control outside viewport");
    }
    return issues;
  });
  await page.screenshot({ path: `test-results/p2p/${label}.png` });
  assert.deepEqual(issues, [], label);
  check(label);
}
async function foldHand(host, guest) {
  const room = await snapshot(guest);
  const actor = room.game.actor === 0 ? host : guest;
  await actor.getByRole("button", { name: /弃牌.*F.*FOLD/ }).click();
  await guest.waitForFunction(
    () =>
      window.__peerMessages.filter((m) => m.event === "room:update").at(-1)
        ?.data?.game?.result,
  );
}
async function closeTable(host) {
  if (!(await host.locator(".peer-has-room").isVisible()))
    await host.locator(".lan-button").click();
  await host
    .getByRole("button", { name: "关闭牌桌，返回大厅", exact: true })
    .click();
}

try {
  const host = await createHost();
  check("Creates a browser-hosted table on a file-only Pages subpath");
  await host.getByRole("button", { name: "连接帮助", exact: true }).click();
  await host.getByLabel("本机局域网 IPv4").fill("198.18.0.1");
  check(
    "Rejects a proxy adapter address before an invitation is generated",
    await host.locator(".peer-connection-help > .primary-button").isDisabled(),
  );
  await host.getByLabel("本机局域网 IPv4").fill("");
  for (const [width, height] of [
    [320, 568],
    [568, 320],
    [1280, 800],
  ]) {
    await host.setViewportSize({ width, height });
    await fit(host, `connection-help-${width}x${height}`);
  }
  await host.locator(".peer-connection-help > .primary-button").click();
  await invite(host);
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [568, 320],
    [740, 700],
    [1280, 800],
  ]) {
    await host.setViewportSize({ width, height });
    await fit(host, `invitation-${width}x${height}`);
  }
  await host.getByRole("button", { name: "取消邀请", exact: true }).click();
  check(
    "Cancelling an invitation closes its unused peer connection",
    await host.evaluate(() =>
      window.__peerConnections.every((p) => p.connectionState === "closed"),
    ),
  );
  const guest = await connectGuest(host, "朋友一");
  check(
    "Two independent browser sessions connect by exchanging an invitation and answer",
  );
  await host.screenshot({ path: "test-results/p2p/connected-room.png" });
  await host.getByRole("button", { name: "开始对局", exact: true }).click();
  await guest.locator(".game-table").waitFor();
  await guest.waitForFunction(() =>
    window.__peerMessages.some(
      (m) => m.event === "room:update" && m.data?.game,
    ),
  );
  const room = await snapshot(guest);
  assert.equal(room.members.length, 2);
  assert.equal(room.game.players[1].cards.length, 2);
  assert.equal(room.game.players[0].cards.length, 0);
  assert.deepEqual(room.game.deck, []);
  check("Only each player's own hole cards are sent over the data channel");
  await foldHand(host, guest);
  check("Player actions and settlement synchronize without a game server");
  await guest.screenshot({ path: "test-results/p2p/guest-table.png" });
  await host.locator(".next-hand-button").click();
  await guest.waitForFunction(
    () =>
      window.__peerMessages.filter((m) => m.event === "room:update").at(-1)
        ?.data?.game?.handNumber === 2,
  );
  check("The host deals the next hand to the same seats");
  const sessionBefore = await guest.evaluate(() =>
    sessionStorage.getItem("joker-holdem.peer.session.v1"),
  );
  await guest.reload();
  await guest.locator('[data-peer-status="disconnected"]').waitFor();
  await host.locator(".lan-button").click();
  const reconnect = await invite(host);
  await guest.getByLabel("新的邀请链接").fill(reconnect);
  await guest
    .getByRole("button", { name: "生成重连应答", exact: true })
    .click();
  await guest.getByTestId("peer-answer").waitFor();
  for (const [width, height] of [
    [320, 568],
    [568, 320],
    [1280, 800],
  ]) {
    await guest.setViewportSize({ width, height });
    await fit(guest, `answer-${width}x${height}`);
  }
  await host
    .getByLabel("朋友的连接应答")
    .fill(await guest.getByTestId("peer-answer").inputValue());
  await host.getByRole("button", { name: "确认应答", exact: true }).click();
  await guest.waitForFunction(() =>
    window.__peerMessages.some(
      (m) => m.event === "room:update" && m.data?.game?.handNumber === 2,
    ),
  );
  assert.equal(
    await guest.evaluate(() =>
      sessionStorage.getItem("joker-holdem.peer.session.v1"),
    ),
    sessionBefore,
  );
  check(
    "A refreshed guest reconnects to the original seat and live hand using a new invitation",
  );
  await closeTable(host);
  await guest.locator('[data-peer-status="disconnected"]').waitFor();
  check("Closing the host stops the room and informs the guest");

  const sixHost = await createHost("classic", 6, false);
  await invite(sixHost);
  for (const [width, height] of [
    [320, 568],
    [568, 320],
    [1280, 800],
  ]) {
    await sixHost.setViewportSize({ width, height });
    await fit(sixHost, `six-seats-invitation-${width}x${height}`);
  }
  await sixHost.getByRole("button", { name: "取消邀请", exact: true }).click();
  const sixGuests = [];
  for (let i = 1; i <= 5; i++)
    sixGuests.push(await connectGuest(sixHost, `牌手${i}`));
  assert.equal(await sixHost.locator(".room-seat:not(.empty-seat)").count(), 6);
  for (const page of sixGuests)
    assert.equal((await snapshot(page)).members.length, 6);
  check("Six browser players share one room through five separate invitations");
  await sixHost.getByRole("button", { name: "开始对局", exact: true }).click();
  for (let i = 0; i < sixGuests.length; i++) {
    const page = sixGuests[i];
    await page.waitForFunction(
      () =>
        window.__peerMessages.filter((m) => m.event === "room:update").at(-1)
          ?.data?.game,
    );
    const game = (await snapshot(page)).game;
    assert.equal(game.players[i + 1].cards.length, 2);
    assert.equal(
      game.players.filter((p, seat) => seat !== i + 1).flatMap((p) => p.cards)
        .length,
      0,
    );
  }
  check("Six seats receive individually redacted game states");
  await closeTable(sixHost);

  for (const mode of ["jokers", "rainbow", "blitz"]) {
    const modeHost = await createHost(mode);
    const modeGuest = await connectGuest(modeHost, `${mode}玩家`);
    await modeHost
      .getByRole("button", { name: "开始对局", exact: true })
      .click();
    await modeGuest.waitForFunction(
      () =>
        window.__peerMessages.filter((m) => m.event === "room:update").at(-1)
          ?.data?.game,
    );
    assert.equal((await snapshot(modeGuest)).game.config.mode, mode);
    await foldHand(modeHost, modeGuest);
    await modeHost.locator(".next-hand-button").click();
    if (mode === "jokers") {
      await modeGuest.locator(".joker-shop").waitFor();
      await modeHost.getByRole("button", { name: /准备，继续发牌/ }).click();
      await modeGuest.getByRole("button", { name: /准备，继续发牌/ }).click();
    }
    await modeGuest.waitForFunction(
      () =>
        window.__peerMessages.filter((m) => m.event === "room:update").at(-1)
          ?.data?.game?.handNumber === 2,
    );
    check(
      `${mode} mode synchronizes settlement and the next hand${mode === "jokers" ? " through the shared shop" : ""}`,
    );
    await closeTable(modeHost);
  }
  if (alternate) {
    const crossHost = await createHost();
    const crossGuest = await connectGuest(crossHost, "Firefox玩家", alternate);
    await crossHost
      .getByRole("button", { name: "开始对局", exact: true })
      .click();
    await crossGuest.waitForFunction(
      () =>
        window.__peerMessages.filter((m) => m.event === "room:update").at(-1)
          ?.data?.game,
    );
    await foldHand(crossHost, crossGuest);
    check("Chromium and Firefox can directly play and settle a hand together");
    await closeTable(crossHost);
  }
  const lanAddress =
    process.env.P2P_LAN_IPV4 ??
    Object.values(networkInterfaces())
      .flat()
      .find(
        (address) =>
          address &&
          !address.internal &&
          address.family === "IPv4" &&
          /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address.address),
      )?.address;
  assert.ok(
    lanAddress,
    "A LAN interface is available for the explicit IPv4 test",
  );
  const addressHost = await createHost("classic", 2, false, {
    rejectMdns: true,
  });
  await setLanAddress(addressHost, lanAddress);
  const addressGuest = await connectGuest(
    addressHost,
    "IPv4玩家",
    alternate ?? browser,
    { rejectMdns: true, localAddress: lanAddress },
  );
  await addressHost
    .getByRole("button", { name: "开始对局", exact: true })
    .click();
  await addressGuest.waitForFunction(() =>
    window.__peerMessages.some(
      (m) => m.event === "room:update" && m.data?.game,
    ),
  );
  await foldHand(addressHost, addressGuest);
  check(
    "Explicit Wi-Fi IPv4 connects and plays when neither peer can resolve hidden mDNS addresses",
  );
  await closeTable(addressHost);
  for (const page of pages) {
    const configs = await page.evaluate(() => window.__iceConfigs);
    assert.ok(
      configs.every(
        (c) =>
          c.iceServers.length === 2 &&
          c.iceServers.every((server) =>
            [server.urls].flat().every((url) => url.startsWith("stun:")),
          ),
      ),
    );
  }
  check(
    "Uses STUN only for address discovery, with no signaling or TURN relay server",
  );
  assert.ok(
    requests.every((url) => url.startsWith(site.url)),
    "All requested resources stay under the Pages path",
  );
  assert.ok(!requests.some((url) => /socket\.io|\/api\//.test(url)));
  check("The static build makes no API or Socket.IO requests");
  assert.deepEqual(errors, []);
  check("No runtime or asset errors");
  console.log(`\n${checks.length} serverless multiplayer checks passed.`);
} catch (error) {
  for (let i = 0; i < pages.length; i++) {
    await pages[i]
      .screenshot({ path: `test-results/p2p/failure-${i}.png` })
      .catch(() => {});
    console.log(
      JSON.stringify({
        player: i,
        text: (await pages[i].locator("body").innerText()).slice(-1800),
        rtc: await pages[i].evaluate(() =>
          window.__peerConnections.map((p) => ({
            state: p.connectionState,
            ice: p.iceConnectionState,
            gathering: p.iceGatheringState,
            candidates: (p.localDescription?.sdp.match(/a=candidate:/g) ?? [])
              .length,
            remote: p.remoteDescription?.type,
          })),
        ),
        trace: await pages[i].evaluate(() => window.__peerTrace.slice(-80)),
      }),
    );
  }
  throw error;
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
  await alternate?.close();
  await site.close();
  await writeFile(
    "test-results/p2p/report.json",
    JSON.stringify({ checks, errors }, null, 2),
  );
}

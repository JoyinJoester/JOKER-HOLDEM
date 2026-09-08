import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import { createGame, legalActions } from "../src/poker";
import type {
  RoomSession,
  RoomSnapshot,
  ServerReply,
} from "../src/network-types";
import { installRooms, publicState } from "./rooms";
import { DEFAULT_CONFIG, MODE_META, MODE_ORDER } from "../src/modes";

interface Client {
  socket: Socket;
  room: RoomSnapshot | null;
  session: RoomSession | null;
}
const clients: Client[] = [];
let http: HttpServer | null = null;
let server: Server | null = null;
let cleanup: (() => void) | null = null;
let url = "";

async function setup(disconnectGrace = 200) {
  http = createServer();
  server = new Server(http);
  const controller = installRooms(server, { aiDelay: 5, disconnectGrace });
  cleanup = controller.close;
  await new Promise<void>((resolve) => http!.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  return controller;
}

async function client(): Promise<Client> {
  const socket = connect(url, {
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
  });
  const result: Client = { socket, room: null, session: null };
  clients.push(result);
  socket.on("room:update", (room: RoomSnapshot) => {
    result.room = room;
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
  return result;
}

async function request(
  player: Client,
  event: string,
  data: unknown = {},
): Promise<ServerReply> {
  return new Promise((resolve, reject) =>
    player.socket
      .timeout(2000)
      .emit(event, data, (error: Error | null, reply: ServerReply) => {
        if (error) {
          reject(error);
          return;
        }
        if (reply.session) player.session = reply.session;
        resolve(reply);
      }),
  );
}

async function waitFor(predicate: () => boolean, timeout = 3000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline)
      throw new Error("Timed out waiting for room state");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

afterEach(async () => {
  cleanup?.();
  cleanup = null;
  for (const player of clients.splice(0)) {
    player.socket.removeAllListeners();
    player.socket.disconnect();
  }
  if (server)
    await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
  http = null;
});

describe("LAN room protocol", () => {
  it("redacts the deck and all unrevealed opponent hole cards", () => {
    const privateGame = createGame();
    const view = publicState(privateGame, 2);
    expect(view.deck).toEqual([]);
    expect(view.players[2].cards).toHaveLength(2);
    expect(
      view.players.filter((p) => p.id !== 2).every((p) => p.cards.length === 0),
    ).toBe(true);
    expect(privateGame.deck).toHaveLength(44);
    expect(privateGame.players.every((p) => p.cards.length === 2)).toBe(true);
  });

  it("creates, joins, plays a synchronized hand, and rejects unauthorized actions", async () => {
    await setup();
    const players = await Promise.all([
      client(),
      client(),
      client(),
      client(),
      client(),
    ]);
    const host = players[0];
    expect((await request(host, "room:create", { name: "房主" })).ok).toBe(
      true,
    );
    const code = host.session!.code;
    for (let i = 1; i < 4; i++)
      expect(
        (await request(players[i], "room:join", { name: `朋友${i}`, code })).ok,
      ).toBe(true);
    expect(
      (await request(players[4], "room:join", { name: "第五人", code })).ok,
    ).toBe(false);
    expect((await request(players[1], "game:start")).ok).toBe(false);
    expect((await request(host, "game:start")).ok).toBe(true);
    await waitFor(() => players.slice(0, 4).every((p) => !!p.room?.game));
    expect(
      (await request(players[1], "game:action", { type: "allin" })).ok,
    ).toBe(false);
    expect(
      (await request(host, "game:action", { type: "raise", amount: -100 })).ok,
    ).toBe(false);
    expect((await request(host, "game:action", { type: "cheat" })).ok).toBe(
      false,
    );
    expect((await request(host, "game:start")).ok).toBe(false);

    for (let decision = 0; decision < 30; decision++) {
      await waitFor(
        () => !!host.room?.game?.result || host.room?.game?.actor !== null,
      );
      const state = host.room!.game!;
      if (state.result) break;
      const actor = state.actor!;
      const current = players[actor];
      await waitFor(() => current.room?.game?.actor === actor);
      const legal = legalActions(current.room!.game!, actor);
      const before = current.room!.game!.logs.at(-1)!.id;
      expect(
        (
          await request(current, "game:action", {
            type: legal.canCheck ? "check" : "call",
          })
        ).ok,
      ).toBe(true);
      await waitFor(() => (host.room?.game?.logs.at(-1)?.id ?? 0) > before);
    }
    await waitFor(() =>
      players.slice(0, 4).every((p) => !!p.room?.game?.result),
    );
    const settled = host.room!.game!;
    expect(settled.community).toHaveLength(5);
    expect(settled.players.reduce((sum, p) => sum + p.stack, 0)).toBe(8000);
    expect(
      players
        .slice(1, 4)
        .every(
          (p) =>
            JSON.stringify(p.room!.game!.community) ===
            JSON.stringify(settled.community),
        ),
    ).toBe(true);
    expect((await request(players[1], "game:next")).ok).toBe(false);
    expect((await request(host, "game:next")).ok).toBe(true);
    await waitFor(() => host.room?.game?.handNumber === 2);
    for (const player of players.slice(0, 4)) {
      await waitFor(() => player.room?.game?.handNumber === 2);
      expect(player.room!.game!.deck).toEqual([]);
      expect(
        player.room!.game!.players[player.session!.seat].cards,
      ).toHaveLength(2);
      expect(
        player
          .room!.game!.players.filter((p) => p.id !== player.session!.seat)
          .every((p) => p.cards.length === 0),
      ).toBe(true);
    }
  });

  it("restores a disconnected seat using its token and prevents impersonation", async () => {
    await setup(1500);
    const host = await client();
    const guest = await client();
    await request(host, "room:create", { name: "房主" });
    await request(guest, "room:join", {
      name: "朋友",
      code: host.session!.code,
    });
    await request(host, "game:start");
    await waitFor(() => !!guest.room?.game);
    const saved = guest.session!;
    const holeCards = structuredClone(guest.room!.game!.players[1].cards);
    guest.socket.disconnect();
    await waitFor(
      () => host.room?.members.find((m) => m.seat === 1)?.connected === false,
    );
    const resumed = await client();
    expect(
      (
        await request(resumed, "room:resume", {
          code: saved.code,
          token: "x".repeat(48),
        })
      ).ok,
    ).toBe(false);
    expect((await request(resumed, "room:resume", saved)).ok).toBe(true);
    await waitFor(() => !!resumed.room?.game);
    expect(resumed.session?.seat).toBe(1);
    expect(resumed.room!.game!.players[1].cards).toEqual(holeCards);
    expect(resumed.room!.members.find((m) => m.seat === 1)?.connected).toBe(
      true,
    );
  });

  it("transfers hosting when the host leaves and lets the new host return to lobby", async () => {
    const controller = await setup();
    const host = await client();
    const guest = await client();
    await request(host, "room:create", { name: "房主" });
    await request(guest, "room:join", {
      name: "朋友",
      code: host.session!.code,
    });
    await request(host, "game:start");
    await request(host, "room:leave");
    await waitFor(() => guest.room?.host === 1);
    expect((await request(guest, "game:lobby")).ok).toBe(true);
    await waitFor(() => guest.room?.phase === "lobby");
    expect((await request(guest, "game:start")).ok).toBe(true);
    await request(guest, "room:leave");
    expect(controller.rooms.size).toBe(0);
  });

  it("uses AI for empty seats and can finish a hand with one connected human", async () => {
    await setup();
    const host = await client();
    await request(host, "room:create", { name: "房主" });
    await request(host, "game:start");
    await waitFor(() => host.room?.game?.actor === 0);
    await request(host, "game:action", { type: "fold" });
    await waitFor(() => !!host.room?.game?.result, 6000);
    expect(host.room!.game!.players.reduce((sum, p) => sum + p.stack, 0)).toBe(
      8000,
    );
  }, 10_000);
});

describe("LAN variants and shared shops", () => {
  it.each(MODE_ORDER)(
    "starts a pure-human %s table with the same settings on every browser",
    async (mode) => {
      await setup();
      const host = await client();
      const guest = await client();
      const config = { mode, seats: 6, fillBots: false, difficulty: "hard" };
      expect(
        (await request(host, "room:create", { name: "房主", config })).ok,
      ).toBe(true);
      expect((await request(host, "game:start")).ok).toBe(false);
      await request(guest, "room:join", {
        name: "朋友",
        code: host.session!.code,
      });
      expect((await request(host, "game:start")).ok).toBe(true);
      await waitFor(() => !!host.room?.game && !!guest.room?.game);
      expect(host.room!.config).toEqual(config);
      expect(guest.room!.game!.config).toEqual(config);
      const state = host.room!.game!;
      expect(state.players.filter((p) => p.occupied).map((p) => p.id)).toEqual([
        0, 1,
      ]);
      expect(
        state.players
          .filter((p) => !p.occupied)
          .every((p) => !p.cards.length && !p.stack),
      ).toBe(true);
      expect(
        state.players.reduce((sum, p) => sum + p.stack + p.contributed, 0),
      ).toBe(MODE_META[mode].buyIn * 2 + state.issuedChips);
      expect(host.room!.game!.players[1].cards).toEqual([]);
      expect(guest.room!.game!.players[1].cards).toHaveLength(2);
    },
  );

  it("syncs host configuration, validates capacity, and supports six private seats", async () => {
    await setup();
    const players = await Promise.all(
      Array.from({ length: 7 }, () => client()),
    );
    const host = players[0];
    expect(
      (
        await request(host, "room:create", {
          name: "房主",
          config: { ...DEFAULT_CONFIG, seats: 9 },
        })
      ).ok,
    ).toBe(false);
    await request(host, "room:create", { name: "房主" });
    const config = {
      ...DEFAULT_CONFIG,
      mode: "blitz",
      seats: 6,
      difficulty: "easy",
      fillBots: false,
    };
    expect((await request(host, "room:configure", { config })).ok).toBe(true);
    for (const [i, player] of players.slice(1, 6).entries())
      await request(player, "room:join", {
        name: `朋友${i + 1}`,
        code: host.session!.code,
      });
    await waitFor(() =>
      players.slice(0, 6).every((p) => p.room?.members.length === 6),
    );
    expect(
      (
        await request(players[6], "room:join", {
          name: "超出人数",
          code: host.session!.code,
        })
      ).ok,
    ).toBe(false);
    expect(
      (await request(players[1], "room:configure", { config: DEFAULT_CONFIG }))
        .ok,
    ).toBe(false);
    expect(
      (
        await request(host, "room:configure", {
          config: { ...config, seats: 5 },
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await request(host, "room:configure", {
          config: { ...config, mode: "invalid" },
        })
      ).ok,
    ).toBe(false);
    expect((await request(host, "game:start")).ok).toBe(true);
    await waitFor(() => players.slice(0, 6).every((p) => !!p.room?.game));
    expect(
      (await request(host, "room:configure", { config: DEFAULT_CONFIG })).ok,
    ).toBe(false);
    for (const player of players.slice(0, 6)) {
      expect(player.room!.config).toEqual(config);
      expect(player.room!.game!.deck).toEqual([]);
      expect(
        player.room!.game!.players[player.session!.seat].cards,
      ).toHaveLength(2);
      expect(
        player
          .room!.game!.players.filter((p) => p.id !== player.session!.seat)
          .every((p) => p.cards.length === 0),
      ).toBe(true);
    }
  });

  it("serializes shared purchases, restores shop state, and deals only when all players are ready", async () => {
    await setup(3000);
    const host = await client();
    const guest = await client();
    await request(host, "room:create", {
      name: "房主",
      config: { ...DEFAULT_CONFIG, mode: "jokers", seats: 2, fillBots: false },
    });
    await request(guest, "room:join", {
      name: "朋友",
      code: host.session!.code,
    });
    await request(host, "game:start");
    await waitFor(() => guest.room?.game?.actor === 1);
    expect(
      (await request(host, "game:shop", { type: "buy", jokerId: "star" })).ok,
    ).toBe(false);
    await request(guest, "game:action", { type: "fold" });
    await waitFor(() => !!host.room?.game?.result);
    expect((await request(guest, "game:next")).ok).toBe(false);
    expect((await request(host, "game:next")).ok).toBe(true);
    await waitFor(() => !!host.room?.game?.shop && !!guest.room?.game?.shop);
    const jokerId = host.room!.game!.shop!.offers[0];
    const purchases = await Promise.all(
      [host, guest].map((p) =>
        request(p, "game:shop", { type: "buy", jokerId }),
      ),
    );
    expect(purchases.filter((p) => p.ok)).toHaveLength(1);
    await waitFor(() =>
      [host, guest].every((p) => !p.room!.game!.shop!.offers.includes(jokerId)),
    );
    expect(host.room!.game!.players.map((p) => p.jokers.length).sort()).toEqual(
      [1, 2],
    );
    expect(host.room!.game!.shop).toEqual(guest.room!.game!.shop);
    expect((await request(host, "game:next")).ok).toBe(false);
    await request(host, "game:shop", { type: "ready" });
    expect((await request(host, "game:shop", { type: "refresh" })).ok).toBe(
      false,
    );
    const token = guest.session!;
    guest.socket.disconnect();
    await waitFor(
      () => host.room?.members.find((m) => m.seat === 1)?.connected === false,
    );
    const resumed = await client();
    expect((await request(resumed, "room:resume", token)).ok).toBe(true);
    await waitFor(() => !!resumed.room?.game?.shop);
    expect(resumed.room!.game!.shop).toEqual(host.room!.game!.shop);
    expect(resumed.room!.game!.players[0].ready).toBe(true);
    expect(resumed.room!.game!.players[1].ready).toBe(false);
    await request(resumed, "game:shop", { type: "ready" });
    await waitFor(
      () =>
        host.room?.game?.handNumber === 2 &&
        resumed.room?.game?.handNumber === 2,
    );
    expect(host.room!.game!.shop).toBeNull();
    expect(resumed.room!.game!.players[0].cards).toEqual([]);
    expect(resumed.room!.game!.players[1].cards).toHaveLength(2);
  });

  it("lets AI shop and ready automatically on a six-seat mixed table", async () => {
    await setup();
    const host = await client();
    await request(host, "room:create", {
      name: "房主",
      config: { ...DEFAULT_CONFIG, mode: "jokers", seats: 6 },
    });
    await request(host, "game:start");
    await waitFor(() => host.room?.game?.actor === 0, 6000);
    await request(host, "game:action", { type: "fold" });
    await waitFor(() => !!host.room?.game?.result, 6000);
    await request(host, "game:next");
    await waitFor(
      () =>
        !!host.room?.game?.shop &&
        host.room.game.players
          .filter((p) => p.id !== 0 && p.stack > 0)
          .every((p) => p.ready),
      6000,
    );
    expect(host.room!.game!.players[0].ready).toBe(false);
    expect(
      host
        .room!.game!.players.filter((p) => p.id !== 0 && p.stack > 0)
        .some((p) => p.jokers.length > 1),
    ).toBe(true);
    await request(host, "game:shop", { type: "ready" });
    await waitFor(() => host.room?.game?.handNumber === 2);
  }, 15_000);

  it("does not deadlock the shop when a player disconnects", async () => {
    await setup(100);
    const host = await client();
    const guest = await client();
    await request(host, "room:create", {
      name: "房主",
      config: { ...DEFAULT_CONFIG, mode: "jokers", seats: 2, fillBots: false },
    });
    await request(guest, "room:join", {
      name: "朋友",
      code: host.session!.code,
    });
    await request(host, "game:start");
    await waitFor(() => guest.room?.game?.actor === 1);
    await request(guest, "game:action", { type: "fold" });
    await waitFor(() => !!host.room?.game?.result);
    await request(host, "game:next");
    await waitFor(() => !!host.room?.game?.shop);
    await request(host, "game:shop", { type: "ready" });
    guest.socket.disconnect();
    await waitFor(() => host.room?.game?.handNumber === 2);
    expect(host.room!.game!.shop).toBeNull();
  });
});

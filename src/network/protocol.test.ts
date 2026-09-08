import { describe, expect, it } from "vitest";
import { createGame } from "../poker";
import { DEFAULT_CONFIG } from "../modes";
import {
  decodeSignal,
  encodeSignal,
  MAX_SIGNAL,
  SIGNAL_TTL,
  type Signal,
} from "./signaling";
import { MAX_PACKET, parsePacket, validSnapshot } from "./protocol";
import { publicState } from "./rooms";
import { LocalRoomServer } from "./transport";
import { installRooms } from "./rooms";
import type { ServerReply } from "../network-types";

const signal = (): Signal => ({
  v: 1,
  kind: "offer",
  room: "AB3K7X",
  pair: "a".repeat(24),
  expires: Date.now() + SIGNAL_TTL,
  sdp: "v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=fingerprint:sha-256 AB:CD\r\na=ice-ufrag:test\r\na=ice-pwd:secret\r\na=candidate:1 1 udp 1 host.local 5000 typ host\r\n",
});

describe("Manual WebRTC signaling", () => {
  it("roundtrips complete offers, answers and Pages invitation URLs", () => {
    const offer = signal(),
      token = encodeSignal(offer);
    expect(decodeSignal(token, "offer")).toEqual(offer);
    expect(
      decodeSignal(
        `https://example.github.io/JOKER-HOLDEM/#/?invite=${token}`,
        "offer",
      ),
    ).toEqual(offer);
    const answer = { ...offer, kind: "answer" as const };
    expect(decodeSignal(encodeSignal(answer), "answer")).toEqual(answer);
  });
  it("rejects missing, corrupted, oversized and incompatible invitations", () => {
    for (const input of [
      "AB3K7X",
      "JH1.%%%",
      "JH1.e30",
      "x".repeat(MAX_SIGNAL + 1),
      encodeSignal({ ...signal(), v: 2 } as unknown as Signal),
    ])
      expect(() => decodeSignal(input)).toThrow();
  });
  it("rejects expired invitations and exchanging an offer as an answer", () => {
    const s = signal();
    expect(() => decodeSignal(encodeSignal(s), "answer")).toThrow(/应答/);
    expect(() => decodeSignal(encodeSignal(s), "offer", s.expires + 1)).toThrow(
      /过期/,
    );
    expect(() =>
      decodeSignal(encodeSignal({ ...s, expires: s.expires + SIGNAL_TTL })),
    ).toThrow(/时间/);
  });
});

describe("Browser room protocol", () => {
  it("accepts only bounded, known commands and valid response credentials", () => {
    expect(
      parsePacket(
        JSON.stringify({
          t: "request",
          id: 1,
          event: "game:action",
          payload: { type: "fold" },
        }),
      ).t,
    ).toBe("request");
    for (const packet of [
      { t: "request", id: 1, event: "room:create" },
      { t: "request", id: -1, event: "game:start" },
      { t: "request", id: 1, event: "__proto__" },
      { t: "reply", id: 1, reply: { ok: true, session: { seat: 9 } } },
    ])
      expect(() => parsePacket(JSON.stringify(packet))).toThrow();
    expect(() => parsePacket(" ".repeat(MAX_PACKET + 1))).toThrow();
  });
  it("validates a redacted game and rejects broken card and seat data", () => {
    const game = publicState(createGame(), 0);
    const room = {
      code: "AB3K7X",
      host: 0,
      config: game.config,
      phase: "playing",
      members: [{ seat: 0, name: "房主", connected: true }],
      game,
    };
    expect(validSnapshot(room)).toBe(true);
    expect(validSnapshot({ ...room, game: { ...game, players: [] } })).toBe(
      false,
    );
    expect(
      validSnapshot({
        ...room,
        game: { ...game, community: [{ rank: 99, suit: "clubs" }] },
      }),
    ).toBe(false);
    expect(
      validSnapshot({
        ...room,
        members: [{ seat: 99, name: "旁观", connected: true }],
      }),
    ).toBe(false);
  });
  it("runs the authoritative rules in memory with independent private seat views", () => {
    const bus = new LocalRoomServer(),
      authority = installRooms(bus, { aiDelay: 100 });
    const messages = new Map<string, unknown[]>();
    const host = bus.connect("host", (event, data) => {
      if (event === "room:update")
        messages.set("host", [...(messages.get("host") ?? []), data]);
    });
    const guest = bus.connect("guest", (event, data) => {
      if (event === "room:update")
        messages.set("guest", [...(messages.get("guest") ?? []), data]);
    });
    const request = (
      socket: typeof host,
      event: string,
      payload = {},
    ): ServerReply => {
      let reply: ServerReply = { ok: false };
      socket.receive(event, payload, (value) => {
        reply = value;
      });
      return reply;
    };
    try {
      const created = request(host, "room:create", {
        name: "房主",
        config: { ...DEFAULT_CONFIG, seats: 2, fillBots: false },
      });
      expect(created.ok).toBe(true);
      expect(
        request(guest, "room:join", {
          name: "朋友",
          code: created.session!.code,
        }).ok,
      ).toBe(true);
      expect(request(guest, "game:start").ok).toBe(false);
      expect(request(host, "game:start").ok).toBe(true);
      for (const [id, seat] of [
        ["host", 0],
        ["guest", 1],
      ] as const) {
        const view = messages.get(id)!.at(-1) as {
          game: ReturnType<typeof createGame>;
        };
        expect(view.game.deck).toEqual([]);
        expect(view.game.players[seat].cards).toHaveLength(2);
        expect(view.game.players[1 - seat].cards).toEqual([]);
        expect(JSON.stringify(view)).not.toContain(created.session!.token);
      }
      const active = (
        messages.get("host")!.at(-1) as { game: ReturnType<typeof createGame> }
      ).game.actor;
      expect(
        request(active === 0 ? guest : host, "game:action", { type: "fold" })
          .ok,
      ).toBe(false);
    } finally {
      authority.close();
      bus.close();
    }
  });
});

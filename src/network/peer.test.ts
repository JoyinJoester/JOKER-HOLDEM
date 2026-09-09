import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../modes";
import { PeerNetwork } from "./peer";
import type { Packet } from "./protocol";

const SESSION_KEY = "joker-holdem.peer.session.v1";

// Control only transport timing; invitations, room rules and session recovery are real.
class Channel {
  readonly label = "joker-holdem-v1";
  readyState = "connecting";
  bufferedAmount = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  partner: Channel | null = null;
  sent: Packet[] = [];
  silence = false;
  send(data: string) {
    this.sent.push(JSON.parse(data));
    if (!this.silence) this.partner?.onmessage?.({ data });
  }
  close() {
    if (this.readyState === "closed") return;
    this.readyState = "closed";
    this.onclose?.();
    this.partner?.close();
  }
}

class Connection {
  static all: Connection[] = [];
  readonly id = Connection.all.push(this);
  readonly iceGatheringState = "complete";
  connectionState = "new";
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  channel: Channel | null = null;
  ondatachannel: ((event: { channel: Channel }) => void) | null = null;
  private description(type: RTCSdpType): RTCSessionDescriptionInit {
    return {
      type,
      sdp:
        "v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n" +
        `a=ice-ufrag:test${this.id}\r\na=ice-pwd:test-password\r\n` +
        "a=fingerprint:sha-256 AB:CD\r\n" +
        "a=candidate:1 1 udp 1 192.168.1.2 5000 typ host\r\n",
    };
  }
  async createOffer() {
    return this.description("offer");
  }
  async createAnswer() {
    return this.description("answer");
  }
  async setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description;
  }
  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description;
    if (description.type !== "answer") return;
    const id = Number(description.sdp?.match(/a=ice-ufrag:test(\d+)/)?.[1]);
    const guest = Connection.all[id - 1];
    guest.channel = new Channel();
    guest.channel.partner = this.channel;
    this.channel!.partner = guest.channel;
    guest.ondatachannel?.({ channel: guest.channel });
    this.connectionState = guest.connectionState = "connected";
  }
  createDataChannel() {
    return (this.channel = new Channel());
  }
  close() {
    this.connectionState = "closed";
    this.channel?.close();
  }
}

let clients: PeerNetwork[];
beforeEach(() => {
  vi.useFakeTimers();
  Connection.all = [];
  clients = [];
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.stubGlobal("RTCPeerConnection", Connection);
});
afterEach(async () => {
  for (const client of clients) client.stop();
  await vi.advanceTimersByTimeAsync(0);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function client() {
  const network = new PeerNetwork();
  clients.push(network);
  return network;
}
async function host() {
  const network = client();
  expect(
    await network.create("房主", {
      ...DEFAULT_CONFIG,
      seats: 2,
      fillBots: false,
    }),
  ).toBe(true);
  return network;
}
async function exchange(host: PeerNetwork, guest: PeerNetwork) {
  expect(await host.invite()).toBe(true);
  expect(await guest.join("朋友", host.getSnapshot().offer)).toBe(true);
  expect(await host.accept(guest.getSnapshot().answer)).toBe(true);
  const [sender, receiver] = Connection.all.slice(-2).map((p) => p.channel!);
  return {
    receiver,
    open(guestFirst = false) {
      sender.readyState = receiver.readyState = "open";
      if (guestFirst) {
        receiver.onopen?.();
        sender.onopen?.();
      } else {
        sender.onopen?.();
        receiver.onopen?.();
      }
    },
  };
}
async function playing() {
  const owner = await host();
  const guest = client();
  (await exchange(owner, guest)).open();
  await vi.advanceTimersByTimeAsync(0);
  expect(guest.getSnapshot().connected).toBe(true);
  expect(await owner.command("game:start")).toBe(true);
  const session = guest.getSnapshot().session!;
  guest.stop();
  return { owner, session };
}

describe("Peer connection handshake and seat recovery", () => {
  it("accepts the first request even before the host open callback runs", async () => {
    const owner = await host();
    const guest = client();
    (await exchange(owner, guest)).open(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(guest.getSnapshot().status).toBe("connected");
    expect(owner.getSnapshot().room?.members).toHaveLength(2);
  });

  it("restores the original seat and private cards after a guest refresh", async () => {
    const { owner, session } = await playing();
    const hand = owner.getSnapshot().room!.game!;
    const guest = client();
    guest.restoreSession();
    expect(guest.getSnapshot().status).toBe("disconnected");
    guest.stop();
    (await exchange(owner, guest)).open();
    await vi.advanceTimersByTimeAsync(0);
    expect(guest.getSnapshot().session).toEqual(session);
    expect(guest.getSnapshot().room?.game?.session).toBe(hand.session);
    expect(guest.getSnapshot().room?.game?.handNumber).toBe(hand.handNumber);
    expect(
      guest.getSnapshot().room?.game?.players[session.seat].cards,
    ).toHaveLength(2);
    expect(guest.getSnapshot().room?.game?.players[0].cards).toEqual([]);
    expect(owner.getSnapshot().room?.members).toHaveLength(2);
  });

  it("keeps the resume rejection instead of attempting a new seat in a live hand", async () => {
    const { owner, session } = await playing();
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        ...session,
        token: (session.token[0] === "a" ? "b" : "a") + session.token.slice(1),
      }),
    );
    const guest = client();
    const link = await exchange(owner, guest);
    link.open();
    await vi.advanceTimersByTimeAsync(0);
    expect(guest.getSnapshot().error).toBe("房间已结束，重新开一桌吧。");
    expect(
      link.receiver.sent.filter((p) => p.t === "request").map((p) => p.event),
    ).toEqual(["room:resume"]);
    expect(owner.getSnapshot().room?.members).toHaveLength(2);
  });

  it("reports an unconfirmed resume without silently joining as a new player", async () => {
    const { owner } = await playing();
    const guest = client();
    const link = await exchange(owner, guest);
    link.receiver.silence = true;
    link.open();
    await vi.advanceTimersByTimeAsync(8000);
    expect(guest.getSnapshot().status).toBe("disconnected");
    expect(guest.getSnapshot().error).toContain("操作没有得到确认");
    expect(
      link.receiver.sent.filter((p) => p.t === "request").map((p) => p.event),
    ).toEqual(["room:resume"]);
    expect(owner.getSnapshot().room?.members).toHaveLength(2);
  });
});

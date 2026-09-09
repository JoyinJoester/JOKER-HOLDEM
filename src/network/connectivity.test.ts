import { afterEach, describe, expect, it, vi } from "vitest";
import {
  candidateSummary,
  checkLanAddress,
  connectionIssue,
  gatherCandidates,
  GATHER_TIMEOUT,
  withLanAddress,
} from "./connectivity";

const base =
  "v=0\r\na=ice-ufrag:private-ufrag\r\na=ice-pwd:private-password\r\n";
const hidden =
  "a=candidate:123 1 udp 2122260223 device.local 51000 typ host generation 0\r\n";
const discovered =
  "a=candidate:456 1 udp 1686052607 203.0.113.8 52000 typ srflx raddr 0.0.0.0 rport 0\r\n";

function fakePeer(sdp: string) {
  return Object.assign(new EventTarget(), {
    iceGatheringState: "gathering",
    connectionState: "failed",
    iceConnectionState: "failed",
    localDescription: { sdp },
    remoteDescription: { sdp: base + hidden },
  }) as unknown as RTCPeerConnection;
}

afterEach(() => vi.useRealTimers());

describe("Cross-device connection addresses", () => {
  it("accepts an optional LAN address and rejects URLs, public IPs and proxy adapters", () => {
    for (const input of ["", "192.168.1.20", "10.2.3.4", "172.20.1.2"])
      expect(checkLanAddress(input)).toBe(input);
    for (const input of [
      "https://192.168.1.20",
      "127.0.0.1",
      "8.8.8.8",
      "198.18.0.1",
      "192.168.1.999",
      "192.168.01.2",
      "192.168.1.20\r\na=evil",
    ])
      expect(() => checkLanAddress(input)).toThrow();
  });

  it("makes hidden hosts reachable by IPv4 without changing ports or ICE credentials", () => {
    const sdp = withLanAddress(base + hidden + discovered, "192.168.1.20");
    expect(sdp).toContain("192.168.1.20 51000 typ host");
    expect(sdp).not.toContain("device.local");
    expect(sdp).toContain(base);
    expect(sdp).toContain(discovered);
    expect(candidateSummary(sdp)).toEqual({
      direct: 1,
      hidden: 0,
      discovered: 1,
      relay: 0,
    });
    expect(withLanAddress(base + hidden, "")).toBe(base + hidden);
  });

  it("keeps addresses and connection credentials out of diagnostic reports", () => {
    const report = connectionIssue(
      fakePeer(base + hidden + discovered),
      "ICE failed",
      "192.168.1.20",
    );
    expect(report.local).toEqual({
      direct: 1,
      hidden: 0,
      discovered: 1,
      relay: 0,
    });
    expect(report.remote.hidden).toBe(1);
    const text = JSON.stringify(report);
    for (const secret of [
      "192.168.1.20",
      "203.0.113.8",
      "private-password",
      "private-ufrag",
      "device.local",
    ])
      expect(text).not.toContain(secret);
  });
});

describe("Bounded candidate gathering", () => {
  it("retains LAN candidates even when STUN servers never finish responding", async () => {
    vi.useFakeTimers();
    const sdp = base + hidden;
    const result = gatherCandidates(
      fakePeer(sdp),
      new AbortController().signal,
    );
    await vi.advanceTimersByTimeAsync(GATHER_TIMEOUT);
    expect(await result).toBe(sdp);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("finishes once public discovery succeeds without waiting for a broken secondary server", async () => {
    vi.useFakeTimers();
    const sdp = base + hidden + discovered;
    const result = gatherCandidates(
      fakePeer(sdp),
      new AbortController().signal,
    );
    await vi.advanceTimersByTimeAsync(250);
    expect(await result).toBe(sdp);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports missing candidates instead of issuing an unusable invitation", async () => {
    vi.useFakeTimers();
    const result = expect(
      gatherCandidates(fakePeer(base), new AbortController().signal),
    ).rejects.toThrow(/未提供可连接地址/);
    await vi.advanceTimersByTimeAsync(GATHER_TIMEOUT);
    await result;
  });

  it("cancels gathering and releases every pending timer", async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    const result = expect(
      gatherCandidates(fakePeer(base + hidden), abort.signal),
    ).rejects.toThrow(/取消/);
    abort.abort();
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves the network error when a failed connection interrupts gathering", async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    const result = expect(
      gatherCandidates(fakePeer(base + hidden), abort.signal),
    ).rejects.toThrow("网络检查失败");
    abort.abort(new Error("网络检查失败"));
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });
});

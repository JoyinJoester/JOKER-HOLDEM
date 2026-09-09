/** Public address discovery only: game traffic never goes through these services. */
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.l.google.com:19302" },
];

export const GATHER_TIMEOUT = 6_000;

export interface CandidateSummary {
  direct: number;
  hidden: number;
  discovered: number;
  relay: number;
}

export interface ConnectionIssue {
  connection: string;
  ice: string;
  local: CandidateSummary;
  remote: CandidateSummary;
  reason: string;
}

export function candidateSummary(sdp = ""): CandidateSummary {
  const result = { direct: 0, hidden: 0, discovered: 0, relay: 0 };
  for (const line of sdp.split(/\r?\n/)) {
    if (!line.startsWith("a=candidate:")) continue;
    const parts = line.trim().split(/\s+/);
    const kind = parts[parts.indexOf("typ") + 1];
    if (kind === "host") {
      if (parts[4]?.toLowerCase().endsWith(".local")) result.hidden++;
      else result.direct++;
    } else if (kind === "srflx" || kind === "prflx") result.discovered++;
    else if (kind === "relay") result.relay++;
  }
  return result;
}

export function validLanAddress(input: string) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(input)) return false;
  const parts = input.split(".").map(Number);
  if (parts.some((v, i) => v > 255 || String(v) !== input.split(".")[i]))
    return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

export function checkLanAddress(input: string) {
  const address = input.trim();
  if (address && !validLanAddress(address))
    throw new Error(
      "请填写本机 Wi-Fi 的局域网 IPv4，例如 192.168.1.20；不要填网址、网关或代理虚拟网卡地址。",
    );
  return address;
}

/** An explicit address avoids relying on mDNS support in the other browser. */
export function withLanAddress(sdp: string, input: string) {
  const address = checkLanAddress(input);
  if (!address) return sdp;
  return sdp
    .split("\r\n")
    .map((line) => {
      if (!line.startsWith("a=candidate:")) return line;
      const parts = line.split(" ");
      if (
        parts[parts.indexOf("typ") + 1] === "host" &&
        parts[4]?.toLowerCase().endsWith(".local")
      )
        parts[4] = address;
      return parts.join(" ");
    })
    .join("\r\n");
}

/** Bounded gathering also succeeds offline when a public STUN endpoint is unavailable. */
export async function gatherCandidates(
  pc: RTCPeerConnection,
  signal: AbortSignal,
): Promise<string> {
  const abortError = () =>
    signal.reason instanceof Error && signal.reason.name !== "AbortError"
      ? signal.reason
      : new Error("邀请已取消。");
  if (signal.aborted) throw abortError();
  if (pc.iceGatheringState !== "complete")
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let discoveryTimer: ReturnType<typeof setTimeout> | undefined;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        clearTimeout(discoveryTimer);
        pc.removeEventListener("icegatheringstatechange", progress);
        pc.removeEventListener("icecandidate", progress);
        signal.removeEventListener("abort", abort);
        if (error) reject(error);
        else resolve();
      };
      const progress = () => {
        if (pc.iceGatheringState === "complete") return finish();
        // Do not wait for an unreachable secondary server once discovery succeeded.
        if (
          !discoveryTimer &&
          candidateSummary(pc.localDescription?.sdp).discovered
        )
          discoveryTimer = setTimeout(() => finish(), 250);
      };
      const abort = () => finish(abortError());
      const deadline = setTimeout(() => finish(), GATHER_TIMEOUT);
      pc.addEventListener("icegatheringstatechange", progress);
      pc.addEventListener("icecandidate", progress);
      signal.addEventListener("abort", abort, { once: true });
      progress();
    });
  if (signal.aborted) throw abortError();
  const sdp = pc.localDescription?.sdp ?? "";
  if (!sdp.includes("a=candidate:"))
    throw new Error(
      "浏览器未提供可连接地址。请在系统浏览器中打开，允许本地网络访问，再重试；代理的 TUN 模式也可能影响地址发现。",
    );
  return sdp;
}

export function connectionIssue(
  pc: RTCPeerConnection,
  reason: string,
  localAddress = "",
): ConnectionIssue {
  return {
    connection: pc.connectionState,
    ice: pc.iceConnectionState,
    local: candidateSummary(
      withLanAddress(pc.localDescription?.sdp ?? "", localAddress),
    ),
    remote: candidateSummary(pc.remoteDescription?.sdp),
    reason,
  };
}

export function connectionFailure(issue: ConnectionIssue) {
  if (issue.remote.hidden && !issue.remote.direct && !issue.remote.discovered)
    return "对方只提供了隐藏的局域网地址，当前通道没有打通。请对方在「连接帮助」填写本机 Wi-Fi 的 IPv4 地址，然后重新交换邀请和应答。";
  return "连接地址已交换，但设备之间的通道没有打通。可在「连接帮助」填写本机 Wi-Fi 的 IPv4 地址后重新邀请；开启代理 TUN 或访客网络时，需允许局域网设备直连。";
}

export function diagnosticReport(issue: ConnectionIssue | null) {
  return JSON.stringify(
    {
      version: "direct-connect-2",
      browser: navigator.userAgent,
      issue,
    },
    null,
    2,
  );
}

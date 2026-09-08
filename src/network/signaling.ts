export const SIGNAL_TTL = 10 * 60_000;
export const MAX_SIGNAL = 24_000;
const PREFIX = "JH1.";

export interface Signal {
  v: 1;
  kind: "offer" | "answer";
  room: string;
  pair: string;
  expires: number;
  sdp: string;
}

export function signalFromLocation() {
  return (
    new URLSearchParams(location.hash.split("?")[1] ?? "").get("invite") ?? ""
  );
}

export function encodeSignal(signal: Signal) {
  const bytes = new TextEncoder().encode(JSON.stringify(signal));
  return (
    PREFIX +
    btoa(String.fromCharCode(...bytes))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "")
  );
}

export function decodeSignal(
  input: string,
  kind?: Signal["kind"],
  now = Date.now(),
): Signal {
  if (typeof input !== "string" || input.length > MAX_SIGNAL)
    throw new Error("连接信息过长，请重新复制完整的邀请或应答。");
  let token = input.trim();
  if (/^https?:\/\//i.test(token)) {
    const url = new URL(token);
    token =
      new URLSearchParams(url.hash.split("?")[1] ?? "").get("invite") ?? "";
  }
  token = token.replace(/\s/g, "");
  if (!/^JH1\.[A-Za-z0-9_-]+$/.test(token))
    throw new Error(
      "请粘贴完整的邀请链接或 JH1 开头的连接信息，不是六位房间号。",
    );
  let value: unknown;
  try {
    const raw = atob(
      token.slice(PREFIX.length).replaceAll("-", "+").replaceAll("_", "/"),
    );
    value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(raw, (c) => c.charCodeAt(0)),
      ),
    );
  } catch {
    throw new Error("连接信息不完整，请重新复制。");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("无法识别这份连接信息。");
  const s = value as Partial<Signal>;
  if (
    s.v !== 1 ||
    !["offer", "answer"].includes(s.kind ?? "") ||
    typeof s.room !== "string" ||
    !/^[A-HJ-NP-Z2-9]{6}$/.test(s.room) ||
    typeof s.pair !== "string" ||
    !/^[a-f0-9]{24}$/.test(s.pair) ||
    typeof s.expires !== "number" ||
    !Number.isSafeInteger(s.expires) ||
    typeof s.sdp !== "string" ||
    s.sdp.length > 16_000 ||
    !s.sdp.startsWith("v=0\r\n") ||
    !s.sdp.includes("m=application ") ||
    !s.sdp.includes("a=fingerprint:sha-256 ") ||
    !s.sdp.includes("a=ice-ufrag:") ||
    !s.sdp.includes("a=ice-pwd:")
  )
    throw new Error("连接信息格式不正确，或游戏版本不一致。");
  if (kind && s.kind !== kind)
    throw new Error(
      kind === "offer"
        ? "这里需要房主的邀请，请不要粘贴应答。"
        : "这里需要朋友的应答，请不要粘贴邀请。",
    );
  if (s.expires < now) throw new Error("这份邀请已过期，请房主生成新的邀请。");
  if (s.expires > now + SIGNAL_TTL + 60_000)
    throw new Error("设备时间不一致，请校准时间后重新邀请。");
  return s as Signal;
}

export function inviteLink(token: string) {
  return `${location.origin}${location.pathname}#/?invite=${encodeURIComponent(token)}`;
}

import type { TableConfig } from "../modes";
import type { RoomSession, RoomSnapshot, ServerReply } from "../network-types";
import { installRooms } from "./rooms";
import { LocalRoomServer, type LocalSocket } from "./transport";
import { randomHex } from "./random";
import {
  decodeSignal,
  encodeSignal,
  SIGNAL_TTL,
  type Signal,
} from "./signaling";
import {
  MAX_PACKET,
  parsePacket,
  validSession,
  validSnapshot,
  type Packet,
} from "./protocol";

export type PeerStatus =
  | "idle"
  | "preparing"
  | "offer"
  | "answer"
  | "connecting"
  | "connected"
  | "disconnected";
export interface PeerState {
  role: "none" | "host" | "guest";
  status: PeerStatus;
  room: RoomSnapshot | null;
  session: RoomSession | null;
  connected: boolean;
  busy: boolean;
  error: string;
  offer: string;
  answer: string;
  expires: number;
}
interface Link {
  id: string;
  pc: RTCPeerConnection;
  abort: AbortController;
  signal: Signal;
  channel: RTCDataChannel | null;
  socket: LocalSocket | null;
  session?: RoomSession;
  timer?: ReturnType<typeof setTimeout>;
  disconnected: boolean;
  replies: Map<number, ServerReply>;
}
const SESSION_KEY = "joker-holdem.peer.session.v1";
const readSession = (): RoomSession | null => {
  try {
    const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null");
    return validSession(value) ? value : null;
  } catch {
    return null;
  }
};
const saveSession = (session: RoomSession | null) => {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* A live connection also works without browser storage. */
  }
};

async function gather(
  pc: RTCPeerConnection,
  signal: AbortSignal,
): Promise<string> {
  if (signal.aborted) throw new Error("邀请已取消。");
  if (pc.iceGatheringState !== "complete")
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        pc.removeEventListener("icegatheringstatechange", change);
        signal.removeEventListener("abort", abort);
        if (error) reject(error);
        else resolve();
      };
      const change = () => {
        if (pc.iceGatheringState === "complete") finish();
      };
      const abort = () => finish(new Error("邀请已取消。"));
      const timer = setTimeout(
        () => finish(new Error("获取局域网地址超时，请检查网络后重试。")),
        10_000,
      );
      pc.addEventListener("icegatheringstatechange", change);
      signal.addEventListener("abort", abort, { once: true });
      change();
    });
  const sdp = pc.localDescription?.sdp ?? "";
  if (!sdp.includes("a=candidate:"))
    throw new Error("浏览器没有提供直连地址，请允许本地网络访问后重试。");
  return sdp;
}

export class PeerNetwork {
  private state: PeerState;
  private listeners = new Set<() => void>();
  private bus: LocalRoomServer | null = null;
  private authority: ReturnType<typeof installRooms> | null = null;
  private local: LocalSocket | null = null;
  private links = new Map<string, Link>();
  private pendingId: string | null = null;
  private requests = new Map<
    number,
    {
      resolve: (reply: ServerReply) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private requestId = 0;
  private generation = 0;
  readonly supported = typeof RTCPeerConnection !== "undefined";
  constructor() {
    this.state = this.initial();
  }
  private initial(): PeerState {
    return {
      role: "none",
      status: "idle",
      room: null,
      session: null,
      connected: this.supported,
      busy: false,
      error: this.supported
        ? ""
        : "当前浏览器不支持直连，请使用新版 Chrome、Edge、Firefox 或 Safari。",
      offer: "",
      answer: "",
      expires: 0,
    };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<PeerState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  setError = (error: string) => this.update({ error });
  restoreSession = () => {
    const session = readSession();
    if (this.state.role === "none" && session)
      this.update({
        role: "guest",
        status: "disconnected",
        session,
        connected: false,
        error: "网页连接已中断，请房主生成新的邀请，以回到原座位。",
      });
  };
  private async operation(work: () => Promise<void>) {
    if (this.state.busy) return false;
    const generation = this.generation;
    this.update({ busy: true, error: "" });
    try {
      await work();
      return generation === this.generation;
    } catch (error) {
      if (generation === this.generation)
        this.update({
          error:
            error instanceof Error ? error.message : "连接未完成，请重试。",
        });
      return false;
    } finally {
      if (generation === this.generation) this.update({ busy: false });
    }
  }
  private onEvent = (event: string, data?: unknown) => {
    if (event === "room:update") {
      if (!validSnapshot(data))
        throw new Error("牌桌数据版本不一致，请所有玩家刷新后重新开桌。");
      this.update({ room: data });
    } else if (event === "room:closed" || event === "room:replaced") {
      this.update({
        connected: false,
        status: "disconnected",
        error: typeof data === "string" ? data : "房主已关闭牌桌，请重新邀请。",
      });
    } else if (event === "room:error" && typeof data === "string")
      this.setError(data.slice(0, 500));
  };
  private send(link: Link, packet: Packet) {
    const raw = JSON.stringify(packet);
    if (
      raw.length > MAX_PACKET ||
      (link.channel?.bufferedAmount ?? 0) > 512_000
    )
      throw new Error("连接拥堵，请重新邀请这位玩家。");
    if (link.channel?.readyState === "open") link.channel.send(raw);
  }
  private drop(link: Link, error = "") {
    if (!this.links.delete(link.id)) return;
    link.abort.abort();
    clearTimeout(link.timer);
    this.bus?.disconnect(link.id);
    link.pc.close();
    if (this.pendingId === link.id) {
      this.pendingId = null;
      this.update({
        offer: "",
        expires: 0,
        status: "connected",
        ...(error ? { error } : {}),
      });
    }
    if (this.state.role === "guest") {
      this.rejectRequests();
      this.update({
        connected: false,
        status: "disconnected",
        error: error || "与房主的连接已中断，请向房主索取新的邀请以重新入座。",
      });
    }
  }
  private rejectRequests() {
    for (const { resolve, timer } of this.requests.values()) {
      clearTimeout(timer);
      resolve({ ok: false, error: "连接已断开，操作没有确认。" });
    }
    this.requests.clear();
  }
  private makeLink(signal: Signal) {
    const pc = new RTCPeerConnection({ iceServers: [] });
    const link: Link = {
      id: signal.pair,
      pc,
      signal,
      abort: new AbortController(),
      channel: null,
      socket: null,
      disconnected: false,
      replies: new Map(),
    };
    this.links.set(link.id, link);
    link.timer = setTimeout(
      () => this.drop(link, "邀请已过期，请生成新的邀请。"),
      Math.max(1, signal.expires - Date.now()),
    );
    pc.onconnectionstatechange = () => {
      if (!this.links.has(link.id)) return;
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.drop(
          link,
          "直连未成功或已中断，请确认双方在同一局域网，且允许设备互访，再重新邀请。",
        );
      } else if (pc.connectionState === "disconnected") {
        link.disconnected = true;
        link.socket?.disconnect();
        if (this.state.role === "guest")
          this.update({
            connected: false,
            status: "connecting",
            error: "连接暂时中断，正在恢复…",
          });
        clearTimeout(link.timer);
        link.timer = setTimeout(() => this.drop(link), 30_000);
      } else if (pc.connectionState === "connected" && link.disconnected) {
        link.disconnected = false;
        clearTimeout(link.timer);
        if (link.socket && link.session)
          link.socket.receive("room:resume", link.session, () => {});
        if (this.state.role === "guest")
          this.update({ connected: true, status: "connected", error: "" });
      }
    };
    return link;
  }
  private hostChannel(link: Link, channel: RTCDataChannel) {
    link.channel = channel;
    channel.onopen = () => {
      if (!this.links.has(link.id)) return;
      link.socket = this.bus!.connect(link.id, (event, data) => {
        try {
          this.send(link, { t: "event", event, data });
        } catch {
          this.drop(link);
        }
      });
    };
    channel.onmessage = ({ data }) => {
      if (!link.socket || !this.links.has(link.id)) return;
      try {
        const packet = parsePacket(data);
        if (packet.t !== "request") throw new Error("Invalid direction");
        const cached = link.replies.get(packet.id);
        if (cached)
          return this.send(link, { t: "reply", id: packet.id, reply: cached });
        if (
          ["room:join", "room:resume"].includes(packet.event) &&
          (packet.payload as { code?: unknown } | null)?.code !==
            this.state.room?.code
        )
          throw new Error("Wrong room");
        link.socket.receive(packet.event, packet.payload, (reply) => {
          link.replies.set(packet.id, reply);
          if (link.replies.size > 64)
            link.replies.delete(link.replies.keys().next().value!);
          if (reply.ok && reply.session) {
            link.session = reply.session;
            clearTimeout(link.timer);
            if (this.pendingId === link.id) {
              this.pendingId = null;
              this.update({
                offer: "",
                expires: 0,
                status: "connected",
                error: "",
              });
            }
          }
          this.send(link, { t: "reply", id: packet.id, reply });
        });
      } catch {
        this.drop(link, "连接信息无效，请重新邀请这位玩家。");
      }
    };
    channel.onclose = () => this.drop(link);
    channel.onerror = () => this.drop(link, "连接发生错误，请重新邀请。");
  }
  private guestChannel(link: Link, channel: RTCDataChannel, name: string) {
    if (link.channel || channel.label !== "joker-holdem-v1") {
      channel.close();
      return;
    }
    link.channel = channel;
    channel.onmessage = ({ data }) => {
      if (!this.links.has(link.id)) return;
      try {
        const packet = parsePacket(data);
        if (packet.t === "event") this.onEvent(packet.event, packet.data);
        else if (packet.t === "reply") {
          const pending = this.requests.get(packet.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.requests.delete(packet.id);
            pending.resolve(packet.reply);
          }
        } else throw new Error("Invalid direction");
      } catch {
        this.drop(link, "收到无法识别的牌桌数据，请更新网页后重新邀请。");
      }
    };
    channel.onopen = async () => {
      if (!this.links.has(link.id)) return;
      this.update({ status: "connecting" });
      const saved = readSession();
      let reply =
        saved?.code === link.signal.room
          ? await this.remoteRequest("room:resume", saved)
          : await this.remoteRequest("room:join", {
              name,
              code: link.signal.room,
            });
      if (
        !reply.ok &&
        saved?.code === link.signal.room &&
        this.links.has(link.id)
      )
        reply = await this.remoteRequest("room:join", {
          name,
          code: link.signal.room,
        });
      if (!this.links.has(link.id)) return;
      if (!reply.ok || !reply.session) {
        this.drop(link, reply.error ?? "无法入座，请重新邀请。");
        return;
      }
      clearTimeout(link.timer);
      saveSession(reply.session);
      this.update({
        session: reply.session,
        connected: true,
        status: "connected",
        answer: "",
        error: "",
      });
    };
    channel.onclose = () => this.drop(link);
    channel.onerror = () => this.drop(link, "连接发生错误，请重新邀请。");
  }
  private async remoteRequest(
    event: string,
    payload: unknown = {},
  ): Promise<ServerReply> {
    const link = this.links.values().next().value as Link | undefined;
    if (!link || link.channel?.readyState !== "open")
      return { ok: false, error: "还没有连接到房主。" };
    const id = ++this.requestId;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.requests.delete(id);
        resolve({ ok: false, error: "操作没有得到确认，请检查与房主的连接。" });
      }, 8000);
      this.requests.set(id, { resolve, timer });
      try {
        this.send(link, { t: "request", id, event, payload });
      } catch {
        clearTimeout(timer);
        this.requests.delete(id);
        resolve({ ok: false, error: "操作发送失败，请检查连接。" });
      }
    });
  }
  private localRequest(
    event: string,
    payload: unknown = {},
  ): Promise<ServerReply> {
    return new Promise((resolve) => {
      if (!this.local) return resolve({ ok: false, error: "牌桌已经关闭。" });
      this.local.receive(event, payload, resolve);
    });
  }
  command = (event: string, payload: unknown = {}) =>
    this.operation(async () => {
      if (!this.state.connected)
        throw new Error("尚未连接，暂时不能操作牌局。");
      const reply = await (this.state.role === "host"
        ? this.localRequest(event, payload)
        : this.remoteRequest(event, payload));
      if (!reply.ok) throw new Error(reply.error ?? "操作未生效。");
    });
  create = (name: string, config?: TableConfig) => {
    if (this.state.role !== "none") return Promise.resolve(false);
    return this.operation(async () => {
      if (!this.supported) throw new Error("当前浏览器不支持直连。");
      this.bus = new LocalRoomServer();
      this.authority = installRooms(this.bus);
      this.local = this.bus.connect("local-host", this.onEvent);
      const local = this.local;
      const reply = await this.localRequest("room:create", { name, config });
      if (this.local !== local) return;
      if (!reply.ok || !reply.session) {
        this.authority.close();
        this.bus.close();
        this.authority = null;
        this.bus = null;
        this.local = null;
        throw new Error(reply.error ?? "创建牌桌失败。");
      }
      this.update({
        role: "host",
        session: reply.session,
        connected: true,
        status: "connected",
      });
      // Invitations are generated explicitly, so a solo host can start with AI immediately.
    });
  };
  cancelInvite = () => {
    const link = this.pendingId ? this.links.get(this.pendingId) : undefined;
    if (link) this.drop(link);
  };
  invite = () =>
    this.operation(async () => {
      if (this.state.role !== "host" || !this.state.room)
        throw new Error("请先创建牌桌。");
      if (this.pendingId) this.drop(this.links.get(this.pendingId)!);
      if (this.links.size >= 5)
        throw new Error("本桌已连接五位朋友，请先让一位朋友离开。");
      const signal: Signal = {
        v: 1,
        kind: "offer",
        room: this.state.room.code,
        pair: randomHex(),
        expires: Date.now() + SIGNAL_TTL,
        sdp: "",
      };
      const link = this.makeLink(signal);
      this.pendingId = link.id;
      this.update({ status: "preparing", offer: "", expires: signal.expires });
      try {
        this.hostChannel(
          link,
          link.pc.createDataChannel("joker-holdem-v1", { ordered: true }),
        );
        await link.pc.setLocalDescription(await link.pc.createOffer());
        signal.sdp = await gather(link.pc, link.abort.signal);
        if (!this.links.has(link.id)) return;
        this.update({ offer: encodeSignal(signal), status: "offer" });
      } catch (error) {
        this.drop(link);
        throw error;
      }
    });
  accept = (input: string) =>
    this.operation(async () => {
      const answer = decodeSignal(input, "answer");
      const link = this.pendingId ? this.links.get(this.pendingId) : undefined;
      if (
        !link ||
        answer.pair !== link.id ||
        answer.room !== this.state.room?.code
      )
        throw new Error("应答与当前邀请不匹配，请使用这次邀请对应的应答。");
      if (link.pc.remoteDescription)
        throw new Error("已经接收应答，正在连接；如需重试请生成新邀请。");
      await link.pc.setRemoteDescription({ type: "answer", sdp: answer.sdp });
      this.update({ status: "connecting" });
      clearTimeout(link.timer);
      link.timer = setTimeout(
        () =>
          this.drop(
            link,
            "直连超时，请检查同一 Wi-Fi 和本地网络权限后重新邀请。",
          ),
        30_000,
      );
    });
  join = (name: string, input: string) =>
    this.operation(async () => {
      if (this.state.role !== "none")
        throw new Error("请先离开当前连接，再加入其他牌桌。");
      if (!this.supported) throw new Error("当前浏览器不支持直连。");
      if (!name.trim() || name.trim().length > 12)
        throw new Error("昵称需要 1–12 个字符。");
      const offer = decodeSignal(input, "offer");
      const link = this.makeLink(offer);
      this.update({
        role: "guest",
        status: "preparing",
        connected: false,
        answer: "",
        expires: offer.expires,
      });
      try {
        link.pc.ondatachannel = ({ channel }) =>
          this.guestChannel(link, channel, name.trim());
        await link.pc.setRemoteDescription({ type: "offer", sdp: offer.sdp });
        await link.pc.setLocalDescription(await link.pc.createAnswer());
        const sdp = await gather(link.pc, link.abort.signal);
        if (!this.links.has(link.id)) return;
        this.update({
          answer: encodeSignal({ ...offer, kind: "answer", sdp }),
          status: "answer",
        });
      } catch (error) {
        const active = this.links.has(link.id);
        this.drop(link);
        if (active)
          this.update({
            role: "none",
            connected: this.supported,
            status: "idle",
          });
        throw error;
      }
    });
  stop = () => {
    this.generation++;
    if (this.state.role === "host")
      for (const link of this.links.values()) {
        try {
          this.send(link, {
            t: "event",
            event: "room:closed",
            data: "房主已关闭牌桌，请重新邀请。",
          });
        } catch {
          /* Already disconnected. */
        }
      }
    this.authority?.close();
    this.authority = null;
    this.bus?.close();
    this.bus = null;
    this.local = null;
    const links = [...this.links.values()];
    this.links.clear();
    this.pendingId = null;
    for (const link of links) {
      link.abort.abort();
      clearTimeout(link.timer);
      link.pc.close();
    }
    this.rejectRequests();
    this.update(this.initial());
  };
  leave = async () => {
    if (this.state.role === "guest" && this.state.connected)
      await this.remoteRequest("room:leave");
    saveSession(null);
    this.stop();
  };
}

import type { ServerReply } from "../network-types";

// This small event interface is implemented by both Socket.IO and a browser room.
type Listener = (...args: any[]) => void;
type Middleware = (packet: unknown[], next: (error?: Error) => void) => void;
export interface RoomSocket {
  id: string;
  on(event: string, listener: Listener): unknown;
  use(middleware: Middleware): unknown;
}
export interface RoomServer {
  on(event: "connection", listener: (socket: RoomSocket) => void): unknown;
  to(id: string): { emit(event: string, data?: unknown): unknown };
}

export class LocalSocket implements RoomSocket {
  private listeners = new Map<string, Listener[]>();
  private middleware: Middleware[] = [];
  constructor(
    readonly id: string,
    readonly send: (event: string, data?: unknown) => void,
  ) {}
  on(event: string, listener: Listener) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }
  use(middleware: Middleware) {
    this.middleware.push(middleware);
  }
  receive(event: string, data: unknown, reply: (value: ServerReply) => void) {
    for (const middleware of this.middleware) {
      let failure: Error | undefined;
      middleware([event, data], (error) => {
        failure = error;
      });
      if (failure) return reply({ ok: false, error: failure.message });
    }
    const listeners = this.listeners.get(event);
    if (!listeners?.length)
      return reply({ ok: false, error: "不支持的操作。" });
    try {
      for (const listener of listeners) listener(data, reply);
    } catch {
      reply({ ok: false, error: "操作未生效，请重试。" });
    }
  }
  disconnect() {
    for (const listener of this.listeners.get("disconnect") ?? []) listener();
  }
}

export class LocalRoomServer implements RoomServer {
  private listeners: ((socket: RoomSocket) => void)[] = [];
  private sockets = new Map<string, LocalSocket>();
  on(_event: "connection", listener: (socket: RoomSocket) => void) {
    this.listeners.push(listener);
  }
  to(id: string) {
    return {
      emit: (event: string, data?: unknown) =>
        this.sockets.get(id)?.send(event, data),
    };
  }
  connect(id: string, send: LocalSocket["send"]) {
    this.disconnect(id);
    const socket = new LocalSocket(id, send);
    this.sockets.set(id, socket);
    for (const listener of this.listeners) listener(socket);
    return socket;
  }
  disconnect(id: string) {
    const socket = this.sockets.get(id);
    if (!socket) return;
    this.sockets.delete(id);
    socket.disconnect();
  }
  close() {
    for (const id of this.sockets.keys()) this.disconnect(id);
    this.listeners = [];
  }
}

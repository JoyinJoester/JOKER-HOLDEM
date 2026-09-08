import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { Action, ShopAction } from "./poker";
import type { TableConfig } from "./modes";
import type { RoomSession, RoomSnapshot, ServerReply } from "./network-types";
import { readStorage, writeStorage } from "./storage";

export function useServerNetwork(enabled: boolean) {
  const socketRef = useRef<Socket | null>(null);
  const [session, setSession] = useState<RoomSession | null>(() =>
    readStorage("room.v1", null),
  );
  const sessionRef = useRef(session);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const remember = useCallback((value: RoomSession | null) => {
    sessionRef.current = value;
    setSession(value);
    writeStorage("room.v1", value);
  }, []);

  useEffect(() => {
    setConnected(false);
    if (!enabled) return;
    const socket = io({
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 6000,
    });
    socketRef.current = socket;
    socket.on("connect", () => {
      setConnected(true);
      if (sessionRef.current) {
        socket
          .timeout(6000)
          .emit(
            "room:resume",
            sessionRef.current,
            (err: Error | null, reply: ServerReply) => {
              if (err) {
                setError("连接正在恢复，请稍候。");
                return;
              }
              if (reply.ok && reply.session) {
                remember(reply.session);
                setError("");
              } else {
                remember(null);
                setRoom(null);
                setError(reply.error ?? "房间已结束。");
              }
            },
          );
      }
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));
    socket.on("room:update", (snapshot: RoomSnapshot) => {
      setRoom(snapshot);
    });
    socket.on("room:error", (message: string) => setError(message));
    socket.on("room:replaced", () => {
      remember(null);
      setRoom(null);
      setError("这个座位已在另一个页面打开。");
    });
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [remember, enabled]);

  const request = useCallback(
    (event: string, data: unknown = {}): Promise<boolean> => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        setError("暂时连不上牌桌，请确认游戏服务已启动。");
        return Promise.resolve(false);
      }
      setBusy(true);
      setError("");
      return new Promise((resolve) => {
        socket
          .timeout(7000)
          .emit(event, data, (err: Error | null, reply: ServerReply) => {
            setBusy(false);
            if (err) {
              setError("连接超时，请重试。");
              resolve(false);
              return;
            }
            if (!reply.ok) {
              setError(reply.error ?? "操作未完成。");
              resolve(false);
              return;
            }
            if (reply.session) remember(reply.session);
            resolve(true);
          });
      });
    },
    [remember],
  );

  const leave = useCallback(async () => {
    if (socketRef.current?.connected) await request("room:leave");
    remember(null);
    setRoom(null);
    setError("");
  }, [remember, request]);

  return {
    session,
    room,
    connected,
    error,
    busy,
    setError,
    leave,
    create: (name: string, config?: TableConfig) =>
      request("room:create", { name, config }),
    configure: (config: TableConfig) => request("room:configure", { config }),
    join: (name: string, code: string) =>
      request("room:join", { name, code: code.trim().toUpperCase() }),
    start: () => request("game:start"),
    next: () => request("game:next"),
    lobby: () => request("game:lobby"),
    action: (action: Action) => request("game:action", action),
    shopAction: (action: ShopAction) => request("game:shop", action),
  };
}

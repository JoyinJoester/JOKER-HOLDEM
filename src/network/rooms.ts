import { randomHex, randomIndex, secureRandom } from "./random";
import type { RoomServer as Server, RoomSocket as Socket } from "./transport";
import {
  act,
  advanceStreet,
  chooseAiAction,
  createGame,
  legalActions,
  startHand,
  openShop,
  allShopReady,
  shopAction,
  shopForAi,
  type Action,
  type ShopAction,
  type GameState,
} from "../poker.ts";
import { DEFAULT_CONFIG, validateConfig, type TableConfig } from "../modes.ts";
import type {
  RoomSession,
  RoomSnapshot,
  ServerReply,
} from "../network-types.ts";

interface Member {
  seat: number;
  name: string;
  token: string;
  socketId: string | null;
  offlineSince: number | null;
}

interface Room {
  config: TableConfig;
  code: string;
  host: number;
  members: Member[];
  game: GameState | null;
  timer: ReturnType<typeof setTimeout> | null;
  touched: number;
}

const validName = (value: unknown) =>
  typeof value === "string" &&
  value.trim().length >= 1 &&
  value.trim().length <= 12;
const validCode = (value: unknown) =>
  typeof value === "string" && /^[A-HJ-NP-Z2-9]{6}$/i.test(value);

/** The deck and unrevealed opponents' cards must never cross the wire. */
export function publicState(game: GameState, viewer: number): GameState {
  const state: GameState = structuredClone(game);
  state.deck = [];
  state.players = state.players.map((player) => ({
    ...player,
    cards:
      player.id === viewer ||
      (state.result &&
        !state.result.uncontested &&
        !player.folded &&
        !player.eliminated)
        ? player.cards
        : [],
  }));
  return state;
}

export function installRooms(
  io: Server,
  options: { aiDelay?: number; disconnectGrace?: number } = {},
) {
  const rooms = new Map<string, Room>();
  const aiDelay = options.aiDelay ?? 1000;
  const disconnectGrace = options.disconnectGrace ?? 30_000;
  const sessionFor = (room: Room, member: Member): RoomSession => ({
    code: room.code,
    token: member.token,
    seat: member.seat,
  });

  function publish(room: Room) {
    room.touched = Date.now();
    for (const member of room.members) {
      if (!member.socketId) continue;
      const snapshot: RoomSnapshot = {
        config: room.config,
        code: room.code,
        host: room.host,
        phase: room.game ? "playing" : "lobby",
        members: room.members.map((m) => ({
          seat: m.seat,
          name: m.name,
          connected: !!m.socketId,
        })),
        game: room.game ? publicState(room.game, member.seat) : null,
      };
      io.to(member.socketId).emit("room:update", snapshot);
    }
  }

  function schedule(room: Room) {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    const state = room.game;
    if (state?.shop && room.members.some((m) => m.socketId)) {
      if (allShopReady(state)) {
        room.timer = setTimeout(() => {
          if (room.game && allShopReady(room.game)) {
            room.game = startHand(room.game, secureRandom);
            publish(room);
            schedule(room);
          }
        }, aiDelay * 0.8);
        return;
      }
      const shopper = state.players.find(
        (p) =>
          p.stack > 0 &&
          !p.ready &&
          !room.members.some((m) => m.seat === p.id && m.socketId),
      );
      if (!shopper) return;
      const absent = room.members.find((m) => m.seat === shopper.id);
      const delay = absent
        ? Math.max(
            250,
            disconnectGrace -
              (Date.now() - (absent.offlineSince ?? Date.now())),
          )
        : aiDelay * 1.5;
      room.timer = setTimeout(() => {
        if (!room.game?.shop || room.game.players[shopper.id].ready) return;
        room.game = absent
          ? shopAction(room.game, shopper.id, { type: "ready" }, secureRandom)
          : shopForAi(room.game, shopper.id, secureRandom);
        publish(room);
        schedule(room);
      }, delay);
      return;
    }
    if (!state || state.result || !room.members.some((m) => m.socketId)) return;
    const member = room.members.find((m) => m.seat === state.actor);
    if (state.actor !== null && member?.socketId) return;
    const delay =
      state.actor === null
        ? aiDelay * 0.7
        : member
          ? Math.max(
              250,
              disconnectGrace -
                (Date.now() - (member.offlineSince ?? Date.now())),
            )
          : aiDelay;
    room.timer = setTimeout(() => {
      room.timer = null;
      const current = room.game;
      if (!current || current.result) return;
      try {
        if (current.actor === null) room.game = advanceStreet(current);
        else if (room.members.some((m) => m.seat === current.actor)) {
          // A disconnected human never has their hidden cards played by the AI.
          const legal = legalActions(current);
          room.game = act(current, { type: legal.canCheck ? "check" : "fold" });
        } else room.game = act(current, chooseAiAction(current));
        publish(room);
        schedule(room);
      } catch (error) {
        console.error("Room advance failed:", room.code, error);
        for (const m of room.members)
          if (m.socketId)
            io.to(m.socketId).emit(
              "room:error",
              "这手牌暂停了，请房主重新开桌。",
            );
      }
    }, delay);
  }

  function locate(socket: Socket): { room: Room; member: Member } | null {
    for (const room of rooms.values()) {
      const member = room.members.find((m) => m.socketId === socket.id);
      if (member) return { room, member };
    }
    return null;
  }

  function leave(socket: Socket) {
    const found = locate(socket);
    if (!found) return;
    const { room, member } = found;
    room.members = room.members.filter((m) => m !== member);
    if (room.game)
      room.game.players[member.seat].name = `${member.name.slice(0, 8)}·AI`;
    if (!room.members.length) {
      if (room.timer) clearTimeout(room.timer);
      rooms.delete(room.code);
      return;
    }
    if (room.host === member.seat)
      room.host = (
        room.members.find((m) => m.socketId) ?? room.members[0]
      ).seat;
    publish(room);
    schedule(room);
  }

  function attach(socket: Socket, room: Room, member: Member) {
    if (member.socketId && member.socketId !== socket.id) {
      io.to(member.socketId).emit("room:replaced");
    }
    member.socketId = socket.id;
    member.offlineSince = null;
    room.touched = Date.now();
  }

  function start(room: Room) {
    room.game = createGame(secureRandom, {
      ...room.config,
      activeSeats: room.config.fillBots
        ? undefined
        : room.members.map((m) => m.seat),
    });
    for (const member of room.members)
      room.game.players[member.seat].name = member.name;
    publish(room);
    schedule(room);
  }

  io.on("connection", (socket) => {
    // Bound inbound event rates without affecting ordinary play.
    let recent: number[] = [];
    socket.use((_packet, next) => {
      const now = Date.now();
      recent = recent.filter((t) => now - t < 1000);
      if (recent.length >= 18) return next(new Error("操作过于频繁"));
      recent.push(now);
      next();
    });

    socket.on(
      "room:create",
      (
        payload: { name?: unknown; config?: unknown },
        reply: (r: ServerReply) => void,
      ) => {
        if (typeof reply !== "function") return;
        if (!validName(payload?.name))
          return reply({ ok: false, error: "昵称需要 1–12 个字符。" });
        let config: TableConfig;
        try {
          config =
            payload.config === undefined
              ? { ...DEFAULT_CONFIG }
              : validateConfig(payload.config);
        } catch (error) {
          return reply({ ok: false, error: (error as Error).message });
        }
        if (rooms.size >= 100)
          return reply({ ok: false, error: "牌桌已满，请稍后再试。" });
        leave(socket);
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let code: string;
        do {
          code = Array.from(
            { length: 6 },
            () => alphabet[randomIndex(alphabet.length)],
          ).join("");
        } while (rooms.has(code));
        const member: Member = {
          seat: 0,
          name: (payload.name as string).trim(),
          token: randomHex(24),
          socketId: socket.id,
          offlineSince: null,
        };
        const room: Room = {
          config,
          code,
          host: 0,
          members: [member],
          game: null,
          timer: null,
          touched: Date.now(),
        };
        rooms.set(code, room);
        reply({ ok: true, session: sessionFor(room, member) });
        publish(room);
      },
    );

    socket.on(
      "room:join",
      (
        payload: { name?: unknown; code?: unknown },
        reply: (r: ServerReply) => void,
      ) => {
        if (typeof reply !== "function") return;
        if (!validName(payload?.name) || !validCode(payload?.code))
          return reply({ ok: false, error: "请输入昵称和 6 位房间号。" });
        const room = rooms.get((payload.code as string).toUpperCase());
        if (!room)
          return reply({
            ok: false,
            error: "没有找到房间，请确认地址和房间号。",
          });
        if (room.game)
          return reply({
            ok: false,
            error: "这桌已经开局，请等待房主重新开桌。",
          });
        if (room.members.length >= room.config.seats)
          return reply({
            ok: false,
            error: `这桌已坐满 ${room.config.seats} 人。`,
          });
        if (locate(socket)?.room === room)
          return reply({ ok: false, error: "你已经在这个房间里了。" });
        leave(socket);
        const seat = Array.from(
          { length: room.config.seats },
          (_, i) => i,
        ).find((id) => !room.members.some((m) => m.seat === id))!;
        const member: Member = {
          seat,
          name: (payload.name as string).trim(),
          token: randomHex(24),
          socketId: socket.id,
          offlineSince: null,
        };
        room.members.push(member);
        reply({ ok: true, session: sessionFor(room, member) });
        publish(room);
      },
    );

    socket.on(
      "room:configure",
      (payload: { config?: unknown }, reply: (r: ServerReply) => void) => {
        if (typeof reply !== "function") return;
        const found = locate(socket);
        if (!found || found.member.seat !== found.room.host || found.room.game)
          return reply({ ok: false, error: "只有房主可以在开局前修改设置。" });
        try {
          const config = validateConfig(payload?.config);
          if (found.room.members.some((m) => m.seat >= config.seats))
            return reply({
              ok: false,
              error: "已有牌手坐在这些座位，不能减少至该人数。",
            });
          found.room.config = config;
          reply({ ok: true });
          publish(found.room);
        } catch (error) {
          reply({ ok: false, error: (error as Error).message });
        }
      },
    );

    socket.on(
      "room:resume",
      (
        payload: { code?: unknown; token?: unknown },
        reply: (r: ServerReply) => void,
      ) => {
        if (typeof reply !== "function") return;
        if (
          !validCode(payload?.code) ||
          typeof payload?.token !== "string" ||
          payload.token.length !== 48
        )
          return reply({ ok: false, error: "房间凭证已失效。" });
        const room = rooms.get((payload.code as string).toUpperCase());
        const member = room?.members.find((m) => m.token === payload.token);
        if (!room || !member)
          return reply({ ok: false, error: "房间已结束，重新开一桌吧。" });
        const current = locate(socket);
        if (current && current.room !== room) leave(socket);
        attach(socket, room, member);
        reply({ ok: true, session: sessionFor(room, member) });
        publish(room);
        schedule(room);
      },
    );

    socket.on(
      "game:action",
      (payload: Action, reply: (r: ServerReply) => void) => {
        if (typeof reply !== "function") return;
        const found = locate(socket);
        if (!found?.room.game || found.room.game.actor !== found.member.seat)
          return reply({ ok: false, error: "还没轮到你行动。" });
        if (
          !payload ||
          !["fold", "check", "call", "raise", "allin"].includes(payload.type)
        )
          return reply({ ok: false, error: "无效的操作。" });
        try {
          found.room.game = act(found.room.game, payload);
          reply({ ok: true });
          publish(found.room);
          schedule(found.room);
        } catch (error) {
          reply({
            ok: false,
            error:
              error instanceof Error ? error.message : "操作未生效，请重试。",
          });
        }
      },
    );

    socket.on(
      "game:shop",
      (payload: ShopAction, reply: (r: ServerReply) => void) => {
        if (typeof reply !== "function") return;
        const found = locate(socket);
        if (
          !found?.room.game ||
          !payload ||
          !["buy", "sell", "refresh", "ready"].includes(payload.type)
        )
          return reply({ ok: false, error: "无效的商店操作。" });
        try {
          found.room.game = shopAction(
            found.room.game,
            found.member.seat,
            payload,
            secureRandom,
          );
          reply({ ok: true });
          publish(found.room);
          schedule(found.room);
        } catch (error) {
          reply({ ok: false, error: (error as Error).message });
        }
      },
    );

    for (const event of ["game:start", "game:next", "game:lobby"])
      socket.on(event, (_payload: unknown, reply: (r: ServerReply) => void) => {
        if (typeof reply !== "function") return;
        const found = locate(socket);
        if (!found || found.member.seat !== found.room.host)
          return reply({ ok: false, error: "只有房主可以发牌。" });
        const { room } = found;
        if (event === "game:start") {
          if (room.game) return reply({ ok: false, error: "牌局已经开始。" });
          if (
            !room.config.fillBots &&
            room.members.filter((m) => m.socketId).length < 2
          )
            return reply({
              ok: false,
              error: "纯真人牌桌至少需要 2 位已连接的玩家。",
            });
          start(room);
        } else if (event === "game:next") {
          if (!room.game?.result)
            return reply({ ok: false, error: "请先完成当前这手牌。" });
          if (room.game.shop)
            return reply({
              ok: false,
              error: "请在商店准备，全部牌手准备后自动发牌。",
            });
          if (room.game.players.filter((p) => p.stack > 0).length < 2)
            return reply({ ok: false, error: "本桌已结束，请重新开桌。" });
          room.game =
            room.config.mode === "jokers"
              ? openShop(room.game, secureRandom)
              : startHand(room.game, secureRandom);
          publish(room);
          schedule(room);
        } else {
          if (room.timer) clearTimeout(room.timer);
          room.timer = null;
          room.game = null;
          publish(room);
        }
        reply({ ok: true });
      });

    socket.on(
      "room:leave",
      (_payload: unknown, reply?: (r: ServerReply) => void) => {
        leave(socket);
        reply?.({ ok: true });
      },
    );
    socket.on("disconnect", () => {
      const found = locate(socket);
      if (!found) return;
      found.member.socketId = null;
      found.member.offlineSince = Date.now();
      publish(found.room);
      schedule(found.room);
    });
  });

  const cleanup = setInterval(
    () => {
      const now = Date.now();
      for (const [code, room] of rooms) {
        if (
          !room.members.some((m) => m.socketId) &&
          now - room.touched > 15 * 60_000
        ) {
          if (room.timer) clearTimeout(room.timer);
          rooms.delete(code);
        } else if (
          !room.members.some((m) => m.seat === room.host && m.socketId)
        ) {
          const host = room.members.find((m) => m.seat === room.host);
          const successor = room.members.find((m) => m.socketId);
          if (
            successor &&
            host?.offlineSince &&
            now - host.offlineSince > disconnectGrace
          ) {
            room.host = successor.seat;
            publish(room);
          }
        }
      }
    },
    Math.min(disconnectGrace, 10_000),
  );
  if (typeof cleanup === "object") cleanup.unref();

  return {
    rooms,
    close: () => {
      clearInterval(cleanup);
      for (const room of rooms.values())
        if (room.timer) clearTimeout(room.timer);
      rooms.clear();
    },
  };
}

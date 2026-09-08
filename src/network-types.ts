import type { GameState } from "./poker";
import type { TableConfig } from "./modes";

export interface RoomMember {
  seat: number;
  name: string;
  connected: boolean;
}

export interface RoomSnapshot {
  config: TableConfig;
  code: string;
  host: number;
  phase: "lobby" | "playing";
  members: RoomMember[];
  game: GameState | null;
}

export interface RoomSession {
  code: string;
  token: string;
  seat: number;
}

export interface NetworkInfo {
  urls: string[];
  port: number;
}

export interface ServerReply {
  ok: boolean;
  error?: string;
  session?: RoomSession;
}

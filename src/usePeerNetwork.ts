import { useEffect, useState, useSyncExternalStore } from "react";
import type { TableConfig } from "./modes";
import type { Action, ShopAction } from "./poker";
import { PeerNetwork } from "./network/peer";
import { signalFromLocation } from "./network/signaling";

export function usePeerNetwork(enabled: boolean) {
  const [client] = useState(() => new PeerNetwork());
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot);
  useEffect(() => {
    if (!enabled) return;
    if (!signalFromLocation()) client.restoreSession();
    return () => client.stop();
  }, [client, enabled]);
  return {
    ...state,
    supported: client.supported,
    setError: client.setError,
    setLocalAddress: client.setLocalAddress,
    leave: client.leave,
    resetConnection: client.stop,
    create: client.create,
    join: client.join,
    invite: client.invite,
    cancelInvite: client.cancelInvite,
    accept: client.accept,
    configure: (config: TableConfig) =>
      client.command("room:configure", { config }),
    start: () => client.command("game:start"),
    next: () => client.command("game:next"),
    lobby: () => client.command("game:lobby"),
    action: (action: Action) => client.command("game:action", action),
    shopAction: (action: ShopAction) => client.command("game:shop", action),
  };
}

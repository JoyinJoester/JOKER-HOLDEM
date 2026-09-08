import { useState } from "react";
import { readStorage, writeStorage } from "./storage";
import { useServerNetwork } from "./useServerNetwork";
import { usePeerNetwork } from "./usePeerNetwork";
import { signalFromLocation } from "./network/signaling";

export type NetworkTransport = "peer" | "server";
export function initialTransport(): NetworkTransport {
  if (signalFromLocation()) return "peer";
  if (new URLSearchParams(location.search).has("room")) return "server";
  return readStorage<NetworkTransport>("network.transport", "peer") === "server"
    ? "server"
    : "peer";
}
export function useNetwork() {
  const [transport, chooseTransport] = useState(initialTransport);
  const [invitation] = useState(signalFromLocation);
  const server = useServerNetwork(transport === "server");
  const peer = usePeerNetwork(transport === "peer");
  const active = transport === "peer" ? peer : server;
  return {
    ...active,
    transport,
    invitation,
    peer,
    setTransport: (value: NetworkTransport) => {
      if (active.session || active.busy || peer.role !== "none") return;
      chooseTransport(value);
      writeStorage("network.transport", value);
    },
  };
}
export type NetworkController = ReturnType<typeof useNetwork>;

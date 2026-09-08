import type { NetworkTransport } from "./useNetwork";

export function NetworkChoice({
  value,
  onChange,
}: {
  value: NetworkTransport;
  onChange: (transport: NetworkTransport) => void;
}) {
  return (
    <div className="network-choice" role="group" aria-label="联机方式">
      <button
        type="button"
        aria-pressed={value === "peer"}
        onClick={() => onChange("peer")}
      >
        浏览器直连 <small>无需服务器</small>
      </button>
      <button
        type="button"
        aria-pressed={value === "server"}
        onClick={() => onChange("server")}
      >
        本地服务 <small>电脑已启动服务</small>
      </button>
    </div>
  );
}

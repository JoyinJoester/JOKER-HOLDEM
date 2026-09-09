import { useId, useState } from "react";
import { copyText } from "./clipboard";
import { diagnosticReport, validLanAddress } from "./network/connectivity";
import type { NetworkController } from "./useNetwork";

export function PeerConnectionHelp({
  peer,
  onBack,
}: {
  peer: NetworkController["peer"];
  onBack: () => void;
}) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  const invalid =
    !!peer.localAddress.trim() && !validLanAddress(peer.localAddress.trim());
  return (
    <section className="peer-connection-help">
      <h3>让手机和电脑接上同一桌</h3>
      <p className="peer-help">
        已自动尝试多种连接地址。如果手机 Firefox 与电脑 Chrome
        仍连不上，请填写本机 Wi-Fi 地址，返回后重新生成邀请或应答。
      </p>
      <label htmlFor={id}>
        本机局域网 IPv4 <small>可选，留空为自动发现</small>
      </label>
      <input
        id={id}
        value={peer.localAddress}
        onChange={(e) => peer.setLocalAddress(e.target.value)}
        disabled={peer.busy}
        maxLength={15}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        placeholder="例如 192.168.1.20"
        aria-invalid={invalid}
      />
      {invalid && (
        <p className="inline-error" role="alert">
          请输入本机的局域网 IPv4，不能填网址或代理虚拟网卡地址。
        </p>
      )}
      <p className="peer-help">
        电脑在 Wi-Fi／网络设置中查看，手机在当前 Wi-Fi
        详情中查看。这里填正在操作的这台设备的地址，不能填网关；另一台设备也可以单独填写。
      </p>
      <p className="peer-help">
        开着 VPN 或代理 TUN
        时，需要允许局域网流量直连。交换应答和游玩期间，双方保持浏览器在前台。
      </p>
      {peer.issue && (
        <div className="peer-diagnostic-summary">
          <span>
            最近一次：
            {peer.issue.ice === "failed" ? "连接检查失败" : peer.issue.reason}
          </span>
          <button
            className="text-button"
            onClick={async () =>
              setCopied(await copyText(diagnosticReport(peer.issue)))
            }
          >
            {copied ? "诊断已复制 ✓" : "复制连接诊断"}
          </button>
        </div>
      )}
      <button
        className="primary-button full-width"
        disabled={invalid}
        onClick={onBack}
      >
        返回连接
      </button>
      <p className="peer-help peer-discovery-note">
        地址发现使用公共 STUN
        服务，手牌和下注仍在设备之间直接传输，无需你搭建服务器。
      </p>
    </section>
  );
}

import { useState } from "react";
import { copyText } from "./clipboard";
import { MODE_META, type SetupOptions } from "./modes";
import { RoomOptions } from "./ModeControls";
import { NetworkChoice } from "./NetworkChoice";
import { inviteLink, MAX_SIGNAL } from "./network/signaling";
import type { NetworkController } from "./useNetwork";
import { Icon, Portrait } from "./visuals";
import { PeerConnectionHelp } from "./PeerConnectionHelp";

export interface LobbyProps {
  network: NetworkController;
  onClose: () => void;
  onLeave: () => void;
  setup: SetupOptions;
  onSetup: (patch: Partial<SetupOptions>) => void;
}

export function PeerLobby({
  network,
  onClose,
  onLeave,
  setup,
  onSetup,
}: LobbyProps) {
  const p = network.peer;
  const room = p.room;
  const [response, setResponse] = useState("");
  const [invite, setInvite] = useState(network.invitation);
  const [tab, setTab] = useState<"create" | "join">(
    network.invitation ? "join" : "create",
  );
  const [copied, setCopied] = useState("");
  const [copyFailed, setCopyFailed] = useState(false);
  const [help, setHelp] = useState(false);
  const copy = async (kind: string, value: string) => {
    const ok = await copyText(value);
    setCopied(ok ? kind : "");
    setCopyFailed(!ok);
  };
  const leave = async () => {
    await p.leave();
    onLeave();
  };
  const disconnected = p.status === "disconnected";
  return (
    <div
      className={`peer-lobby ${room ? "peer-has-room" : ""}`}
      data-peer-status={p.status}
    >
      <div
        className={`connection-status ${disconnected ? "connection-offline" : ""}`}
      >
        <i />
        {disconnected
          ? "连接已中断"
          : p.status === "connected"
            ? "浏览器直连已就绪"
            : "同一 Wi-Fi · 浏览器直连"}
        <button
          className="text-button peer-help-toggle"
          onClick={() => setHelp(!help)}
        >
          {help ? "返回连接" : "连接帮助"}
        </button>
      </div>
      {help ? (
        <PeerConnectionHelp peer={p} onBack={() => setHelp(false)} />
      ) : p.role === "guest" && (!room || disconnected) ? (
        <div className="peer-guest-flow">
          {p.answer && !disconnected ? (
            <>
              <div className="peer-step-title">
                <b>02</b>
                <div>
                  <strong>把应答发回房主</strong>
                  <p>房主确认后，你会自动入座。</p>
                </div>
              </div>
              <textarea
                aria-label="你的连接应答"
                data-testid="peer-answer"
                value={p.answer}
                readOnly
                rows={3}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                className="primary-button full-width"
                onClick={() => void copy("answer", p.answer)}
              >
                {copied === "answer" ? "应答已复制 ✓" : "复制应答给房主"}
              </button>
              <p className="peer-help">
                请保持本页打开，等待房主粘贴并确认应答。无需再输入房间号。
              </p>
            </>
          ) : disconnected ? (
            <>
              <h3>重新接上这张牌桌</h3>
              <p className="peer-help">
                请房主生成新的邀请，交换应答后可回到原座位；房主刷新或关闭网页后需要重新开桌。
              </p>
              <textarea
                aria-label="新的邀请链接"
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
                maxLength={MAX_SIGNAL}
                rows={3}
                placeholder="粘贴房主的新邀请链接"
              />
              <button
                className="primary-button full-width"
                disabled={!invite.trim() || p.busy}
                onClick={async () => {
                  p.resetConnection();
                  await p.join(setup.name.trim(), invite);
                }}
              >
                生成重连应答
              </button>
            </>
          ) : (
            <p className="peer-help">正在准备连接，请稍候…</p>
          )}
          <button
            className="text-button leave-room"
            onClick={() => void leave()}
          >
            取消连接，返回大厅
          </button>
        </div>
      ) : room ? (
        <>
          <div className="peer-room-heading">
            <div>
              <span>牌桌</span>
              <strong data-testid="room-code">{room.code}</strong>
            </div>
            <span>
              {MODE_META[room.config.mode].name} ·{" "}
              {room.members.filter((m) => m.connected).length}/
              {room.config.seats} 人
            </span>
          </div>
          <div className="peer-room-layout">
            <section className="peer-roster" aria-label="房间成员">
              <div className="room-seats">
                {Array.from({ length: room.config.seats }, (_, seat) => {
                  const member = room.members.find((m) => m.seat === seat);
                  return (
                    <div
                      className={`room-seat ${member ? "" : "empty-seat"}`}
                      key={seat}
                    >
                      <Portrait character={seat} />
                      <div>
                        <strong>
                          {member?.name ??
                            (room.config.fillBots ? "AI 牌手" : "等待朋友")}
                        </strong>
                        <span>
                          {member
                            ? `${seat === room.host ? "房主 · " : ""}${member.connected ? "已入座" : "已断线"}`
                            : room.config.fillBots
                              ? "空位由 AI 补位"
                              : "空座不参与"}
                        </span>
                      </div>
                      {member?.connected && <Icon name="check" size={14} />}
                    </div>
                  );
                })}
              </div>
              <details className="room-configuration">
                <summary>
                  <span>牌桌设置</span>
                  <small>{room.config.fillBots ? "AI 补位" : "纯真人"}</small>
                </summary>
                <RoomOptions
                  value={room.config}
                  onChange={(config) => void p.configure(config)}
                  disabled={
                    p.busy || p.role !== "host" || room.phase !== "lobby"
                  }
                  minimumSeats={Math.max(
                    2,
                    ...room.members.map((m) => m.seat + 1),
                  )}
                />
              </details>
              <p className="peer-host-note">
                {p.role === "host"
                  ? "你是房主，请保持网页打开。刷新或关闭会结束本桌。"
                  : "牌局由房主网页保持运行，同一局域网内直接同步。"}
              </p>
            </section>
            {p.role === "host" && (
              <section className="peer-invite-panel" aria-label="邀请朋友">
                {p.offer ? (
                  <>
                    <label htmlFor="peer-invite-url">
                      <b>1</b> 发给一位朋友
                    </label>
                    <div className="peer-copy-row">
                      <textarea
                        id="peer-invite-url"
                        data-testid="peer-offer"
                        readOnly
                        value={inviteLink(p.offer)}
                        rows={2}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <button
                        className="small-button"
                        onClick={() => void copy("offer", inviteLink(p.offer))}
                      >
                        {copied === "offer" ? "已复制 ✓" : "复制邀请"}
                      </button>
                    </div>
                    <label htmlFor="peer-response">
                      <b>2</b> 接收朋友的应答
                    </label>
                    <div className="peer-copy-row">
                      <textarea
                        id="peer-response"
                        aria-label="朋友的连接应答"
                        value={response}
                        onChange={(e) => setResponse(e.target.value)}
                        maxLength={MAX_SIGNAL}
                        rows={2}
                        placeholder="粘贴朋友回传的 JH1… 应答"
                      />
                      <button
                        className="small-button"
                        disabled={
                          p.busy ||
                          !response.trim() ||
                          p.status === "connecting"
                        }
                        onClick={() => void p.accept(response)}
                      >
                        {p.status === "connecting" ? "连接中…" : "确认应答"}
                      </button>
                    </div>
                    <div className="peer-invite-footer">
                      <span>10 分钟有效 · 一人一份邀请</span>
                      <button className="text-button" onClick={p.cancelInvite}>
                        取消邀请
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="peer-invite-glyph">♠</span>
                    <h3>
                      {room.phase === "lobby"
                        ? "邀请朋友，坐到同一桌"
                        : "让断线的朋友重新入座"}
                    </h3>
                    <p className="peer-help">
                      发送邀请 → 朋友回传应答 →
                      你确认连接。每位朋友单独邀请一次。
                    </p>
                    <button
                      className="primary-button full-width"
                      disabled={p.busy}
                      onClick={() => {
                        setResponse("");
                        setCopied("");
                        void p.invite();
                      }}
                    >
                      {p.busy ? "正在生成邀请…" : "生成邀请"}
                      <Icon name="arrow" size={16} />
                    </button>
                  </>
                )}
              </section>
            )}
          </div>
          <div className="peer-room-actions">
            {room.phase === "lobby" ? (
              <button
                className="primary-button"
                disabled={
                  p.busy ||
                  !!p.offer ||
                  !p.connected ||
                  p.role !== "host" ||
                  (!room.config.fillBots &&
                    room.members.filter((m) => m.connected).length < 2)
                }
                onClick={() => void p.start()}
              >
                {p.role === "host" ? "开始对局" : "等待房主开始…"}
                <Icon name="arrow" size={16} />
              </button>
            ) : (
              <button className="primary-button" onClick={onClose}>
                返回牌桌
                <Icon name="arrow" size={16} />
              </button>
            )}
            <button
              className="text-button leave-room"
              onClick={() => void leave()}
            >
              {p.role === "host" ? "关闭牌桌，返回大厅" : "离开房间，返回大厅"}
            </button>
          </div>
        </>
      ) : (
        <>
          <NetworkChoice
            value={network.transport}
            onChange={network.setTransport}
          />
          <div className="online-tabs">
            <button
              aria-pressed={tab === "create"}
              onClick={() => setTab("create")}
            >
              创建房间
            </button>
            <button
              aria-pressed={tab === "join"}
              onClick={() => setTab("join")}
            >
              加入房间
            </button>
          </div>
          <form
            className="peer-entry-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (tab === "create") void p.create(setup.name.trim(), setup);
              else void p.join(setup.name.trim(), invite);
            }}
          >
            <label htmlFor="peer-nickname">你的昵称</label>
            <input
              id="peer-nickname"
              value={setup.name}
              maxLength={12}
              required
              onChange={(e) => onSetup({ name: e.target.value })}
            />
            {tab === "create" ? (
              <RoomOptions value={setup} onChange={onSetup} />
            ) : (
              <>
                <label htmlFor="peer-entry-invite">房主的邀请链接</label>
                <textarea
                  id="peer-entry-invite"
                  value={invite}
                  maxLength={MAX_SIGNAL}
                  required
                  rows={3}
                  onChange={(e) => setInvite(e.target.value)}
                  placeholder="粘贴完整邀请链接或 JH1… 信息"
                />
              </>
            )}
            <button
              className="primary-button full-width"
              disabled={p.busy || !p.supported}
            >
              {p.busy
                ? "正在准备…"
                : tab === "create"
                  ? "创建这张牌桌"
                  : "生成连接应答"}
            </button>
            <p className="peer-help">
              无需安装程序或运行服务器。双方在同一
              Wi-Fi，并允许设备互访即可尝试直连。
            </p>
          </form>
        </>
      )}
      {copyFailed && (
        <p className="inline-error" role="alert">
          复制未成功，请选中上方文本手动复制。
        </p>
      )}
      {p.error && !help && (
        <p className="inline-error" role="alert">
          {p.error}
        </p>
      )}
    </div>
  );
}

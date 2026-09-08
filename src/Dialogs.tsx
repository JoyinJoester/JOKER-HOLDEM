import { copyText } from "./clipboard";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon, Portrait } from "./visuals";
import type { GameState } from "./poker";
import type { Settings } from "./storage";
import { writeStorage } from "./storage";
import type { NetworkController } from "./useNetwork";
import { PeerLobby, type LobbyProps } from "./PeerLobby";
import { NetworkChoice } from "./NetworkChoice";
import type { NetworkInfo } from "./network-types";
import { RoomOptions } from "./ModeControls";
import { MODE_META, type SetupOptions } from "./modes";

export function Dialog({
  title,
  eyebrow,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key === "Tab") {
        const items = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, a[href], [tabindex="0"]',
          ) ?? [],
        ).filter(
          (item) =>
            item.checkVisibility?.() ?? item.getClientRects().length > 0,
        );
        if (!items.length) {
          event.preventDefault();
          return;
        }
        const first = items[0],
          last = items[items.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          last.focus();
          event.preventDefault();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === ref.current)
        ) {
          first.focus();
          event.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`dialog pixel-panel ${wide ? "dialog-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        tabIndex={-1}
      >
        <header className="dialog-header">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2 id="dialog-title">{title}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="关闭弹窗"
          >
            <Icon name="close" />
          </button>
        </header>
        <div className="dialog-content">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

const handRows = [
  ["皇家同花顺", "A♠ K♠ Q♠ J♠ 10♠", "同一花色的 A、K、Q、J、10"],
  ["同花顺", "9♥ 8♥ 7♥ 6♥ 5♥", "同一花色，五张连续点数"],
  ["四条", "K♠ K♥ K♣ K♦ 3♠", "四张相同点数的牌"],
  ["葫芦", "Q♠ Q♥ Q♣ 8♦ 8♠", "三条加一对"],
  ["同花", "A♣ J♣ 8♣ 6♣ 2♣", "同一花色，点数不连续"],
  ["顺子", "8♠ 7♥ 6♣ 5♦ 4♠", "五张连续点数，A 可接 2 或 K"],
  ["三条", "7♠ 7♥ 7♣ K♦ 2♠", "三张相同点数的牌"],
  ["两对", "J♠ J♥ 4♣ 4♦ 9♠", "两组不同的对子"],
  ["一对", "A♠ A♥ 8♣ 5♦ 3♠", "两张相同点数的牌"],
  ["高牌", "A♠ J♥ 8♣ 6♦ 2♠", "没有组合时，比较最大点数"],
];

export function Rules({
  defaultTab = "hands",
}: {
  defaultTab?: "hands" | "how";
}) {
  const [tab, setTab] = useState(defaultTab);
  return (
    <>
      <div className="dialog-tabs" role="tablist" aria-label="规则分类">
        <button
          role="tab"
          aria-selected={tab === "hands"}
          onClick={() => setTab("hands")}
        >
          牌型大小
        </button>
        <button
          role="tab"
          aria-selected={tab === "how"}
          onClick={() => setTab("how")}
        >
          怎么玩
        </button>
      </div>
      {tab === "hands" ? (
        <div className="hands-reference">
          <p className="muted-text">
            从强到弱排列。用两张底牌和五张公共牌，组成最佳五张牌。
          </p>
          {handRows.map(([name, example, description], i) => (
            <div className="hand-reference" key={name}>
              <span className="rank-order">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <strong>{name}</strong>
                <span>{description}</span>
              </div>
              <code>
                {example.split(" ").map((card, j) => (
                  <span
                    className={/[♥♦]/.test(card) ? "red-example" : ""}
                    key={j}
                  >
                    {card}
                  </span>
                ))}
              </code>
            </div>
          ))}
          <p className="rule-footnote">
            相同牌型依次比较点数与踢脚牌；花色不分大小。完全相同时平分底池。
          </p>
        </div>
      ) : (
        <div className="how-to">
          <div className="rule-intro">
            <Icon name="cards" size={32} />
            <p>
              两张底牌，五张公共牌。
              <br />
              <strong>用最好的五张，赢下桌上的筹码。</strong>
            </p>
          </div>
          <ol>
            <li>
              <strong>拿到底牌</strong>
              <p>
                每人起始 2,000 筹码，闪电战为 500。首手小盲 10、大盲 20，通常每
                4 手翻倍，闪电战每手翻倍。庄家每手顺时针轮转。
              </p>
            </li>
            <li>
              <strong>决定怎么出手</strong>
              <p>
                轮到你时可以弃牌、过牌、跟注或加注。无人下注时可以过牌；加注金额表示本轮的总下注额。
              </p>
            </li>
            <li>
              <strong>等待公共牌</strong>
              <p>
                翻牌一次发 3 张，转牌和河牌各发 1
                张。每次发牌后，都会开始新一轮下注。
              </p>
            </li>
            <li>
              <strong>亮牌见分晓</strong>
              <p>
                剩余牌手比较最佳五张牌。如果其他人都弃牌，你直接获胜。多人全押时，会按各自投入的筹码分别结算主池与边池。
              </p>
            </li>
          </ol>
          <div className="keyboard-guide">
            <span>
              <kbd>F</kbd> 弃牌
            </span>
            <span>
              <kbd>SPACE</kbd> 过牌 / 跟注
            </span>
            <span>
              <kbd>R</kbd> 加注
            </span>
          </div>
          <p className="rule-footnote">
            联机：一台电脑运行游戏服务，同一局域网的朋友通过邀请链接加入。刷新页面可重新回到原座位。
          </p>
        </div>
      )}
    </>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch ${checked ? "switch-on" : ""}`}
      onClick={onChange}
    >
      <span />
    </button>
  );
}

export function SettingsContent({
  settings,
  onChange,
  online,
}: {
  settings: Settings;
  onChange: (value: Partial<Settings>) => void;
  online: boolean;
}) {
  return (
    <div className="settings-content">
      <div className="setting-row">
        <div>
          <strong>游戏音效</strong>
          <span>发牌、筹码与胜利的声音</span>
        </div>
        <Switch
          label="游戏音效"
          checked={settings.sound}
          onChange={() => onChange({ sound: !settings.sound })}
        />
      </div>
      <div className="setting-row volume-setting">
        <label htmlFor="volume">音量</label>
        <input
          id="volume"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={settings.volume}
          onChange={(event) => onChange({ volume: Number(event.target.value) })}
          disabled={!settings.sound}
        />
        <span>{Math.round(settings.volume * 100)}%</span>
      </div>
      <div className="setting-row">
        <div>
          <strong>复古屏幕</strong>
          <span>轻微扫描线与流动背景</span>
        </div>
        <Switch
          label="复古屏幕"
          checked={settings.crt}
          onChange={() => onChange({ crt: !settings.crt })}
        />
      </div>
      <div className="setting-row">
        <div>
          <strong>快速出牌</strong>
          <span>缩短单人模式的 AI 思考时间</span>
        </div>
        <Switch
          label="快速出牌"
          checked={settings.fast}
          onChange={() => onChange({ fast: !settings.fast })}
        />
      </div>
      <div className="setting-row">
        <div>
          <strong>单人 AI 难度</strong>
          <span>
            {online
              ? "联机 AI 难度由房主在开局前设置"
              : "改变牌手的判断与进攻倾向"}
          </span>
        </div>
        <select
          aria-label="单人 AI 难度"
          value={settings.difficulty}
          disabled={online}
          onChange={(event) =>
            onChange({
              difficulty: event.target.value as Settings["difficulty"],
            })
          }
        >
          <option value="easy">轻松</option>
          <option value="normal">标准</option>
          <option value="hard">挑战</option>
        </select>
      </div>
      <p className="rule-footnote">
        设置自动保存。单人对局在打开弹窗时暂停，联机牌局会继续进行。
      </p>
    </div>
  );
}

export function History({ game }: { game: GameState }) {
  return (
    <div className="history-list">
      {[...game.logs].reverse().map((entry) => (
        <div className={`history-entry history-${entry.kind}`} key={entry.id}>
          <span>#{String(entry.hand).padStart(2, "0")}</span>
          <p>{entry.text}</p>
          {entry.kind === "win" && <Icon name="trophy" size={16} />}
        </div>
      ))}
    </div>
  );
}

export function OnlineLobby(props: LobbyProps) {
  return props.network.transport === "peer" ? (
    <PeerLobby {...props} />
  ) : (
    <ServerLobby {...props} />
  );
}

function ServerLobby({
  network,
  onClose,
  onLeave,
  setup,
  onSetup,
}: {
  network: NetworkController;
  onClose: () => void;
  onLeave: () => void;
  setup: SetupOptions;
  onSetup: (patch: Partial<SetupOptions>) => void;
}) {
  const inviteCode = new URLSearchParams(location.search).get("room") ?? "";
  const [tab, setTab] = useState<"create" | "join">(
    inviteCode ? "join" : "create",
  );
  const [name, setName] = useState(setup.name);
  const [code, setCode] = useState(inviteCode.toUpperCase().slice(0, 6));
  const [urls, setUrls] = useState<string[]>([]);
  const localAddress = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    location.hostname,
  );
  const [baseUrl, setBaseUrl] = useState(localAddress ? "" : location.origin);
  const [loadingAddress, setLoadingAddress] = useState(localAddress);
  const [addressError, setAddressError] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const room = network.room;
  const shareUrl = baseUrl ? `${baseUrl}/?room=${room?.code ?? ""}` : "";
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/network", { signal: abort.signal })
      .then((response) => response.json())
      .then((info: NetworkInfo) => {
        setUrls(info.urls);
        if (localAddress) {
          setBaseUrl(info.urls[0] ?? "");
          if (!info.urls.length)
            setAddressError("未找到局域网地址，请连接 Wi-Fi 后重新打开房间。");
        }
        setLoadingAddress(false);
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          setLoadingAddress(false);
          if (localAddress)
            setAddressError("地址读取失败，请重新打开房间后再试。");
        }
      });
    return () => abort.abort();
  }, []);

  return (
    <div className="online-content">
      {!room && !network.session && (
        <NetworkChoice
          value={network.transport}
          onChange={network.setTransport}
        />
      )}
      <div
        className={`connection-status ${network.connected ? "" : "connection-offline"}`}
      >
        <i />
        {network.connected ? "已连接牌桌服务" : "正在连接牌桌服务…"}
        <span>LAN MULTIPLAYER</span>
      </div>
      {room ? (
        <>
          <div className="room-code-block">
            <span>房间号</span>
            <strong data-testid="room-code">{room.code}</strong>
            <span>
              {room.phase === "lobby"
                ? "朋友到齐，就可以开牌了。"
                : "一桌朋友，各凭本事。"}
            </span>
          </div>
          <div className="room-seats">
            {Array.from({ length: room.config.seats }, (_, i) => i).map(
              (seat) => {
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
                          (room.config.fillBots ||
                          room.game?.players[seat].occupied
                            ? "AI 牌手"
                            : "等待朋友")}
                      </strong>
                      <span>
                        {member
                          ? `${seat === room.host ? "房主 · " : ""}${member.connected ? "已入座" : "重连中"}`
                          : room.config.fillBots ||
                              room.game?.players[seat].occupied
                            ? "AI 牌手补位"
                            : "空座不参与对局"}
                      </span>
                    </div>
                    {member?.connected && <Icon name="check" size={16} />}
                  </div>
                );
              },
            )}
          </div>
          <details className="room-configuration">
            <summary>
              <span>
                {MODE_META[room.config.mode].glyph}{" "}
                {MODE_META[room.config.mode].name} · {room.config.seats} 人牌桌
              </span>
              <small>
                房间设置{" "}
                {room.phase === "lobby" && network.session?.seat === room.host
                  ? "· 可修改"
                  : ""}
              </small>
            </summary>
            <RoomOptions
              value={room.config}
              onChange={(config) => void network.configure(config)}
              disabled={
                network.busy ||
                !network.connected ||
                room.phase !== "lobby" ||
                network.session?.seat !== room.host
              }
              minimumSeats={Math.max(2, ...room.members.map((m) => m.seat + 1))}
            />
          </details>
          <div className="share-invite">
            <label htmlFor="invite-url">分享给同一 Wi-Fi 下的朋友</label>
            <div>
              <input
                id="invite-url"
                readOnly
                value={shareUrl}
                placeholder={
                  loadingAddress ? "正在读取局域网地址…" : "暂无可用的邀请地址"
                }
                onFocus={(event) => event.currentTarget.select()}
              />
              <button
                className="small-button"
                disabled={!shareUrl}
                onClick={async () => {
                  const ok = await copyText(shareUrl);
                  setCopied(ok);
                  setCopyFailed(!ok);
                }}
              >
                {" "}
                {copied ? "已复制 ✓" : "复制链接"}
              </button>
            </div>
            {copyFailed && (
              <span className="inline-error">请选中上方链接，手动复制。</span>
            )}
            {addressError && (
              <span className="inline-error">{addressError}</span>
            )}
            {urls.length > 1 &&
              ["localhost", "127.0.0.1"].includes(location.hostname) && (
                <select
                  aria-label="选择局域网地址"
                  value={baseUrl}
                  onChange={(event) => {
                    setBaseUrl(event.target.value);
                    setCopied(false);
                  }}
                >
                  {urls.map((url) => (
                    <option value={url} key={url}>
                      {url}
                    </option>
                  ))}
                </select>
              )}
          </div>
          {room.phase === "lobby" ? (
            <button
              className="primary-button full-width"
              disabled={
                network.busy ||
                !network.connected ||
                network.session?.seat !== room.host ||
                (!room.config.fillBots &&
                  room.members.filter((m) => m.connected).length < 2)
              }
              onClick={() => void network.start()}
            >
              {network.session?.seat === room.host ? (
                <>
                  {!room.config.fillBots &&
                  room.members.filter((m) => m.connected).length < 2
                    ? "等待至少 2 位玩家入座"
                    : "开始对局"}{" "}
                  <Icon name="arrow" />
                </>
              ) : (
                "等待房主开始对局…"
              )}
            </button>
          ) : (
            <button className="primary-button full-width" onClick={onClose}>
              返回牌桌 <Icon name="arrow" />
            </button>
          )}
          <button
            className="text-button leave-room"
            onClick={async () => {
              await network.leave();
              onLeave();
            }}
          >
            离开房间，返回大厅
          </button>
        </>
      ) : network.session ? (
        <div className="reconnecting">
          <Icon name="reset" size={32} />
          <p>正在回到你的座位…</p>
          <button
            className="small-button"
            onClick={async () => {
              await network.leave();
              onLeave();
            }}
          >
            返回大厅
          </button>
        </div>
      ) : (
        <>
          <p className="online-intro">
            朋友可以隔着屏幕，坐到同一张牌桌。
            <br />
            <span>手机、平板、电脑，都用浏览器加入。</span>
          </p>
          <div className="dialog-tabs" role="tablist" aria-label="联机方式">
            <button
              role="tab"
              aria-selected={tab === "create"}
              onClick={() => {
                setTab("create");
                network.setError("");
              }}
            >
              创建房间
            </button>
            <button
              role="tab"
              aria-selected={tab === "join"}
              onClick={() => {
                setTab("join");
                network.setError("");
              }}
            >
              加入房间
            </button>
          </div>
          <form
            className="room-form"
            onSubmit={async (event) => {
              event.preventDefault();
              writeStorage("nickname.v1", name.trim());
              onSetup({ name: name.trim() });
              if (tab === "create") await network.create(name.trim(), setup);
              else await network.join(name.trim(), code);
            }}
          >
            <label htmlFor="nickname">你的牌桌昵称</label>
            <input
              id="nickname"
              value={name}
              maxLength={12}
              minLength={1}
              required
              autoComplete="nickname"
              onChange={(event) => setName(event.target.value)}
              placeholder="给自己起个名字"
            />
            {tab === "create" && (
              <RoomOptions
                value={setup}
                onChange={onSetup}
                disabled={network.busy}
              />
            )}
            {tab === "join" && (
              <>
                <label htmlFor="room-code-input">6 位房间号</label>
                <input
                  id="room-code-input"
                  className="room-code-input"
                  value={code}
                  maxLength={6}
                  minLength={6}
                  required
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  onChange={(event) =>
                    setCode(
                      event.target.value
                        .toUpperCase()
                        .replace(/[^A-Z2-9]/g, ""),
                    )
                  }
                  placeholder="例如 AB3K7X"
                />
              </>
            )}
            <button
              className="primary-button full-width"
              type="submit"
              disabled={!network.connected || network.busy}
            >
              {network.busy
                ? "正在入座…"
                : tab === "create"
                  ? "创建一张牌桌"
                  : "加入牌桌"}{" "}
              <Icon name="arrow" />
            </button>
          </form>
          <p className="rule-footnote">
            支持 2–6 人、四种玩法。可纯真人对战，也可让 AI
            补位。创建房间后，复制邀请链接给同一局域网的朋友。
          </p>
        </>
      )}
      {network.error && (
        <div className="inline-error" role="alert">
          {network.error}
        </div>
      )}
    </div>
  );
}

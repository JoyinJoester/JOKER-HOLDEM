import { useEffect, useState } from "react";
import { NetworkChoice } from "./NetworkChoice";
import type { NetworkTransport } from "./useNetwork";
import { MAX_SIGNAL } from "./network/signaling";
import { MODE_META, type SetupOptions } from "./modes";
import type { GameState } from "./poker";
import { money } from "./poker";
import {
  DifficultyChoices,
  ModePicker,
  NumberChoices,
  RoomOptions,
} from "./ModeControls";
import { Icon, PlayingCard, Portrait } from "./visuals";

export function GameHall({
  setup,
  onChange,
  onSolo,
  onBalatro,
  onCreate,
  onJoin,
  savedGame,
  onResume,
  connected,
  busy,
  error,
  transport,
  onTransport,
  invitation,
}: {
  setup: SetupOptions;
  onChange: (patch: Partial<SetupOptions>) => void;
  onSolo: () => void;
  onBalatro: () => void;
  onCreate: () => void;
  onJoin: (code: string) => void;
  savedGame: GameState | null;
  onResume: () => void;
  connected: boolean;
  busy: boolean;
  error: string;
  transport: NetworkTransport;
  onTransport: (value: NetworkTransport) => void;
  invitation: string;
}) {
  const [tab, setTab] = useState<"solo" | "create" | "join">(
    invitation ? "join" : "solo",
  );
  const [code, setCode] = useState(invitation);
  const direct = transport === "peer";
  useEffect(() => {
    if (invitation) {
      setTab("join");
      setCode(invitation);
    }
  }, [invitation]);
  const meta = MODE_META[setup.mode];
  return (
    <main className="game-hall">
      <section className="hall-welcome">
        <span className="eyebrow">ONE TABLE. FOUR WAYS TO PLAY.</span>
        <h2>
          好牌开场。
          <br />
          <span>玩法由你。</span>
        </h2>
        <p>
          独自练牌，或约朋友同桌。
          <br />
          四种玩法，都能人机对战和局域网联机。
        </p>
        <div
          className={`hall-card-art hall-art-${setup.mode}`}
          aria-hidden="true"
        >
          <span className="hall-art-ring" />
          <span className="hall-art-spark spark-left">✧</span>
          <PlayingCard card={{ rank: 14, suit: "spades" }} />
          <div className="hall-joker-card">
            <span>JOKER</span>
            <Portrait character={1} />
            <strong>{meta.glyph}</strong>
          </div>
          <PlayingCard card={{ rank: 14, suit: "hearts" }} />
          <span className="hall-art-spark spark-right">✦</span>
        </div>
        <div className="hall-mode-caption">
          <span>{meta.en}</span>
          <strong>{meta.name}</strong>
          <p>{meta.desc}</p>
        </div>
        {savedGame && (
          <button className="resume-game-button" onClick={onResume}>
            <Icon name="history" size={18} />
            <span>
              继续上次的对局
              <small>
                {MODE_META[savedGame.config.mode].name} · 第{" "}
                {savedGame.handNumber} 手 · ${money(savedGame.players[0].stack)}
              </small>
            </span>
            <Icon name="arrow" size={17} />
          </button>
        )}
        <button className="hall-rogue-entry" onClick={onBalatro}>
          <span className="hall-rogue-mark">✦</span>
          <span>
            <small>独立模式 · ROGUELIKE</small>
            <strong>小丑牌闯关</strong>
            <p>选牌计分 · 随机构筑 · 挑战八底注</p>
          </span>
          <Icon name="arrow" size={20} />
        </button>
        <div className="hall-footnote">
          <span>♠</span> 字体、纸牌与好运，全部就位。
        </div>
      </section>
      <section className="hall-setup pixel-panel">
        <header>
          <div>
            <span className="eyebrow">TAKE YOUR SEAT</span>
            <h3>准备入座</h3>
          </div>
          <span className="autosave-note">
            <i />
            设置自动保存
          </span>
        </header>
        <div className="hall-tabs" role="group" aria-label="对战方式">
          {(["solo", "create", "join"] as const).map((value, i) => (
            <button
              type="button"
              key={value}
              aria-pressed={tab === value}
              onClick={() => setTab(value)}
            >
              {["人机对战", "创建房间", "加入房间"][i]}
            </button>
          ))}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (tab === "solo") onSolo();
            else if (tab === "create") onCreate();
            else onJoin(code);
          }}
        >
          {tab !== "solo" && (
            <NetworkChoice value={transport} onChange={onTransport} />
          )}
          <label className="setup-label" htmlFor="hall-nickname">
            你的牌桌昵称
          </label>
          <input
            id="hall-nickname"
            className="hall-input"
            value={setup.name}
            maxLength={12}
            minLength={1}
            required
            autoComplete="nickname"
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="给自己起个名字"
          />
          {tab === "solo" && (
            <>
              <div className="setup-label">游戏玩法</div>
              <ModePicker
                value={setup.mode}
                onChange={(mode) => onChange({ mode })}
              />
              <p className="mode-detail">{meta.detail}</p>
              <div className="setup-two-columns">
                <div>
                  <div className="setup-label">
                    AI 对手 <span>{setup.aiCount} 位</span>
                  </div>
                  <NumberChoices
                    value={setup.aiCount}
                    onChange={(aiCount) => onChange({ aiCount })}
                    label="个 AI 对手"
                    start={1}
                    end={5}
                  />
                </div>
                <div>
                  <div className="setup-label">AI 难度</div>
                  <DifficultyChoices
                    value={setup.difficulty}
                    onChange={(difficulty) => onChange({ difficulty })}
                  />
                </div>
              </div>
            </>
          )}
          {tab === "create" && (
            <RoomOptions value={setup} onChange={onChange} />
          )}
          {tab === "join" && (
            <div className="hall-join">
              <label className="setup-label" htmlFor="hall-room-code">
                {direct ? "房主的邀请链接" : "朋友的 6 位房间号"}
              </label>
              {direct ? (
                <textarea
                  id="hall-room-code"
                  className="hall-input peer-invite-input"
                  value={code}
                  maxLength={MAX_SIGNAL}
                  required
                  rows={3}
                  spellCheck={false}
                  placeholder="粘贴完整邀请链接或 JH1… 信息"
                  onChange={(event) => setCode(event.target.value)}
                />
              ) : (
                <input
                  id="hall-room-code"
                  className="hall-input code-input"
                  value={code}
                  minLength={6}
                  maxLength={6}
                  required
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="例如 AB3K7X"
                  onChange={(event) =>
                    setCode(
                      event.target.value
                        .toUpperCase()
                        .replace(/[^A-Z2-9]/g, ""),
                    )
                  }
                />
              )}
              <div className="join-explanation">
                <Icon name="cards" size={34} />
                <p>
                  {direct
                    ? "生成应答后，发回给房主确认。"
                    : "先打开朋友发来的局域网地址，"}
                  <br />
                  {direct
                    ? "连接成功后会自动入座。"
                    : "再输入房间号，就能坐到同一桌。"}
                  <span>
                    {direct
                      ? "同一 Wi-Fi · 不需要额外服务器"
                      : "手机、平板、电脑都可以加入。"}
                  </span>
                </p>
              </div>
            </div>
          )}
          <button
            type="submit"
            className="primary-button hall-start"
            disabled={
              !setup.name.trim() || busy || (tab !== "solo" && !connected)
            }
          >
            {busy
              ? "正在入座…"
              : tab === "solo"
                ? "开始人机对战"
                : tab === "create"
                  ? "创建这张牌桌"
                  : direct
                    ? "生成连接应答"
                    : "加入好友牌桌"}
            <Icon name="arrow" />
          </button>
          <div className="hall-start-note">
            {tab === "solo"
              ? `${money(meta.buyIn)} 起始筹码 · ${setup.aiCount + 1} 人牌桌 · 随时可以暂停`
              : direct
                ? connected
                  ? "浏览器直连 · 邀请与应答各交换一次"
                  : "当前浏览器暂不能直连，请检查连接提示"
                : connected
                  ? "已连接牌桌服务 · 同一局域网内畅玩"
                  : "正在连接牌桌服务…"}
          </div>
        </form>
        {error && (
          <div className="inline-error" role="alert">
            {error}
          </div>
        )}
      </section>
    </main>
  );
}

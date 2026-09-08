import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  act,
  advanceStreet,
  cardId,
  createGame,
  handDescription,
  legalActions,
  money,
  potTotal,
  startHand,
  chooseAiAction,
  openShop,
  allShopReady,
  shopAction,
  shopForAi,
  STREET_NAME,
  type Action,
  type GameState,
  type Player,
  type Street,
  type ShopAction,
} from "./poker";
import {
  Atmosphere,
  ChipStack,
  Icon,
  JokerNote,
  PixelSuit,
  PlayingCard,
  Portrait,
} from "./visuals";
import {
  Dialog,
  History,
  OnlineLobby,
  Rules,
  SettingsContent,
} from "./Dialogs";
import {
  DEFAULT_STATS,
  loadGame,
  loadSettings,
  loadSetup,
  readStorage,
  writeStorage,
  type Settings,
  type Stats,
} from "./storage";
import { initialTransport, useNetwork } from "./useNetwork";
import { playSound } from "./sound";
import { JOKERS, MODE_META, type SetupOptions } from "./modes";
import { GameHall } from "./GameHall";
import { useViewportHeight } from "./useViewportHeight";
import { BonusSummary, JokerRack, JokerShop, ModeReference } from "./JokerShop";

const BalatroMode = lazy(() => import("./balatro/BalatroMode"));

type Modal =
  | "rules"
  | "settings"
  | "history"
  | "new"
  | "online"
  | "shop"
  | "mode"
  | "exit"
  | null;
const streets: Street[] = ["preflop", "flop", "turn", "river", "showdown"];

function SeatBadge({ game, seat }: { game: GameState; seat: number }) {
  return (
    <span className="seat-badges">
      {game.dealer === seat && (
        <span className="dealer-badge" title="庄家">
          D
        </span>
      )}
      {game.smallBlind === seat && (
        <span className="blind-badge small-blind" title="小盲位">
          SB
        </span>
      )}
      {game.bigBlind === seat && (
        <span className="blind-badge big-blind" title="大盲位">
          BB
        </span>
      )}
    </span>
  );
}

function Opponent({
  player,
  game,
  human,
  disconnected,
}: {
  player: Player;
  game: GameState;
  human: boolean;
  disconnected: boolean;
}) {
  const active = game.actor === player.id && !game.result;
  const winner = game.result?.winners.includes(player.id);
  const reveal =
    !!game.result &&
    !game.result.uncontested &&
    !player.folded &&
    !player.eliminated;
  return (
    <div
      className={`opponent ${active ? "active-opponent" : ""} ${player.folded || player.eliminated ? "folded-opponent" : ""} ${winner ? "winning-opponent" : ""}`}
      data-seat={player.id}
    >
      <div className="opponent-cards">
        {[0, 1].map((index) => (
          <PlayingCard
            key={`${game.handNumber}-${index}`}
            card={player.cards[index]}
            hidden={!reveal}
            small
            index={index}
          />
        ))}
        <SeatBadge game={game} seat={player.id} />
      </div>
      <div className="opponent-nameplate">
        <Portrait character={player.id} />
        <div>
          <span className="opponent-name">
            {player.name}
            <i>{human ? "玩家" : "AI"}</i>
          </span>
          <strong>${money(player.stack)}</strong>
        </div>
        {active && <span className="active-light" />}
        {winner && <span className="winner-star">✦</span>}
      </div>
      <div className={`opponent-action ${active ? "thinking" : ""}`}>
        {disconnected
          ? "断线重连中"
          : player.eliminated
            ? "已离桌"
            : active
              ? human
                ? "正在行动…"
                : "思考中…"
              : player.lastAction || "等待行动"}
        {player.bet > 0 && !game.result && <span className="bet-dot" />}
      </div>
      {!!player.jokers.length && (
        <div
          className="opponent-jokers"
          aria-label={`${player.name}持有的小丑`}
        >
          {player.jokers.map((id, i) => (
            <span
              key={i}
              title={`${JOKERS[id].name}：${JOKERS[id].desc}`}
              style={{ color: JOKERS[id].color }}
            >
              {JOKERS[id].glyph}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  useViewportHeight();
  const [solo, setSolo] = useState(loadGame);
  const [hasSoloGame, setHasSoloGame] = useState(
    () =>
      location.hash === "#/table" ||
      readStorage<GameState | null>("game.v1", null)?.session === solo.session,
  );
  const [setup, setSetup] = useState(loadSetup);
  const [view, setView] = useState<"home" | "game" | "balatro">(() =>
    location.hash === "#/balatro"
      ? "balatro"
      : location.hash === "#/table" ||
          new URLSearchParams(location.search).has("room") ||
          (initialTransport() === "server" && readStorage("room.v1", null))
        ? "game"
        : "home",
  );
  const [settings, setSettings] = useState(loadSettings);
  const [stats, setStats] = useState<Stats>(() => ({
    ...DEFAULT_STATS,
    ...readStorage<Partial<Stats>>("stats.v1", {}),
  }));
  const [modal, setModal] = useState<Modal>(() =>
    location.hash !== "#/balatro" &&
    (new URLSearchParams(location.search).has("room") ||
      (initialTransport() === "server" && readStorage("room.v1", null)))
      ? "online"
      : null,
  );
  const [rulesTab, setRulesTab] = useState<"how" | "hands">("how");
  const [raiseAmount, setRaiseAmount] = useState(60);
  const [toast, setToast] = useState("");
  const network = useNetwork();
  useEffect(() => {
    if (
      network.transport === "peer" &&
      network.peer.status === "disconnected" &&
      location.hash !== "#/balatro"
    ) {
      setView("game");
      setModal("online");
    }
  }, [network.transport, network.peer.status]);
  const online = !!network.session;
  const waitingForRoom = online && !network.room?.game;
  const game = network.room?.game ?? solo;
  const heroId = network.room?.game ? (network.session?.seat ?? 0) : 0;
  const hero = game.players[heroId];
  const legal = legalActions(game, heroId);
  const yourTurn =
    view === "game" &&
    legal.active &&
    (!online || network.connected) &&
    !network.busy &&
    !(online && !network.room?.game);
  const pot = potTotal(game);
  const currentRaise = Math.max(
    legal.minRaise,
    Math.min(raiseAmount, legal.maxRaise),
  );
  const net = hero.stack - game.startingStacks[heroId];
  const won = !!game.result?.winners.includes(heroId);
  const tableOver = game.players.filter((p) => p.stack > 0).length < 2;
  const finished =
    !!game.result && (tableOver || (!online && hero.stack === 0));
  const isHost = !online || network.session?.seat === network.room?.host;
  const opponents = Array.from(
    { length: game.players.length - 1 },
    (_, i) => game.players[(heroId + i + 1) % game.players.length],
  ).filter((p) => p.occupied);
  const mode = MODE_META[game.config.mode];
  const bestCards = new Set(
    game.result?.ranks[heroId]?.cards.map(cardId) ?? [],
  );
  const recorded = useRef(new Set(readStorage<string[]>("recorded.v1", [])));
  const lastSound = useRef(`${game.session}:${game.handNumber}:${game.street}`);

  useEffect(() => {
    if (hasSoloGame) writeStorage("game.v1", solo);
  }, [solo, hasSoloGame]);
  useEffect(() => {
    writeStorage("setup.v2", setup);
    writeStorage("nickname.v1", setup.name);
  }, [setup]);
  useEffect(() => writeStorage("settings.v1", settings), [settings]);
  useEffect(() => writeStorage("stats.v1", stats), [stats]);
  useEffect(() => {
    if (view !== "game" || waitingForRoom || !game.result || hero.eliminated)
      return;
    const id = `${game.session}:${game.handNumber}:${heroId}`;
    if (recorded.current.has(id)) return;
    recorded.current.add(id);
    const records = [...recorded.current].slice(-500);
    recorded.current = new Set(records);
    writeStorage("recorded.v1", records);
    const payout = game.result.pots
      .filter((p) => !p.refund && p.winners.includes(heroId))
      .reduce((sum, p) => sum + Math.floor(p.amount / p.winners.length), 0);
    setStats((previous) => ({
      hands: previous.hands + 1,
      wins: previous.wins + (won ? 1 : 0),
      bestPot: Math.max(previous.bestPot, payout),
      lastResult: id,
    }));
  }, [
    game.result,
    game.session,
    game.handNumber,
    heroId,
    hero.eliminated,
    won,
    waitingForRoom,
    view,
  ]);

  useEffect(() => {
    if (online || view !== "game") return;
    if (solo.shop) {
      if (modal && modal !== "shop") return;
      const shopper = solo.players.find(
        (p) => p.id !== 0 && p.stack > 0 && !p.ready,
      );
      if (!shopper && !allShopReady(solo)) return;
      const timer = setTimeout(
        () =>
          setSolo((previous) => {
            if (!previous.shop) return previous;
            return allShopReady(previous)
              ? startHand(previous)
              : shopper
                ? shopForAi(previous, shopper.id)
                : previous;
          }),
        settings.fast ? 300 : 900,
      );
      return () => clearTimeout(timer);
    }
    if (modal || solo.result || solo.actor === 0) return;
    const timer = window.setTimeout(
      () => {
        setSolo((previous) => {
          if (previous.result || previous.actor === 0) return previous;
          try {
            return previous.actor === null
              ? advanceStreet(previous)
              : act(previous, chooseAiAction(previous));
          } catch (error) {
            setToast(
              error instanceof Error
                ? error.message
                : "牌局暂时无法继续，请重新开桌。",
            );
            return previous;
          }
        });
      },
      settings.fast
        ? 280
        : solo.actor === null
          ? 850
          : 1100 + Math.random() * 350,
    );
    return () => clearTimeout(timer);
  }, [solo, online, modal, view, settings.fast]);

  useEffect(() => {
    if (location.hash === "#/balatro") return;
    if (network.room?.phase === "playing") {
      setView("game");
      setModal((previous) => (previous === "online" ? null : previous));
    }
    if (network.room?.phase === "lobby") {
      setView("game");
      setModal("online");
    }
  }, [network.room?.phase]);

  useEffect(() => {
    if (view === "game" && !waitingForRoom && game.street === "shop")
      setModal("shop");
    else setModal((previous) => (previous === "shop" ? null : previous));
  }, [game.street, game.session, view, waitingForRoom]);

  useEffect(() => {
    const change = () => {
      if (location.hash === "#/balatro") {
        setView("balatro");
        setModal(null);
      } else if (!online)
        setView(location.hash === "#/table" ? "game" : "home");
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, [online]);

  useEffect(() => {
    const signature = `${game.session}:${game.handNumber}:${game.street}`;
    if (signature !== lastSound.current && settings.sound && view === "game")
      playSound(game.result && won ? "win" : "card", settings.volume);
    lastSound.current = signature;
  }, [
    game.session,
    game.handNumber,
    game.street,
    game.result,
    won,
    settings.sound,
    settings.volume,
    view,
  ]);

  useEffect(() => {
    if (yourTurn)
      setRaiseAmount(
        Math.min(
          legal.maxRaise,
          Math.max(legal.minRaise, game.currentBet + 40),
        ),
      );
  }, [game.actor, game.currentBet, game.handNumber, game.street, heroId]); // Deliberately resets only when the betting decision changes.

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (network.error && modal !== "online") setToast(network.error);
  }, [network.error, modal]);

  const sound = useCallback(
    (kind: "card" | "chip" | "click" = "click") => {
      if (settings.sound) playSound(kind, settings.volume);
    },
    [settings.sound, settings.volume],
  );
  const perform = useCallback(
    (action: Action) => {
      if (!yourTurn || modal) return;
      sound(
        action.type === "fold" || action.type === "check" ? "card" : "chip",
      );
      if (online) void network.action(action);
      else {
        try {
          setSolo(act(solo, action));
        } catch (error) {
          setToast(error instanceof Error ? error.message : "操作未生效。");
        }
      }
    },
    [yourTurn, modal, sound, online, network, solo],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        modal ||
        event.repeat ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey
      )
        return;
      const target = event.target as HTMLElement;
      if (
        ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target.tagName) ||
        target.isContentEditable
      )
        return;
      if (!yourTurn) return;
      if (event.code === "KeyF") {
        event.preventDefault();
        perform({ type: "fold" });
      }
      if (event.code === "Space") {
        event.preventDefault();
        perform({ type: legal.canCheck ? "check" : "call" });
      }
      if (event.code === "KeyR" && legal.canRaise) {
        event.preventDefault();
        perform({ type: "raise", amount: currentRaise });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [perform, modal, yourTurn, legal.canCheck, legal.canRaise, currentRaise]);

  const changeSettings = (patch: Partial<Settings>) => {
    setSettings((previous) => ({ ...previous, ...patch }));
    if (patch.difficulty) {
      setSetup((previous) => ({ ...previous, difficulty: patch.difficulty! }));
      if (!online)
        setSolo((previous) => ({
          ...previous,
          config: { ...previous.config, difficulty: patch.difficulty! },
        }));
    }
    if (patch.sound) playSound("chip", settings.volume);
  };
  const openRules = (tab: "hands" | "how") => {
    sound();
    setRulesTab(tab);
    setModal("rules");
  };
  const nextHand = () => {
    sound("card");
    if (game.shop) {
      setModal("shop");
      return;
    }
    if (online) {
      if (tableOver) void network.lobby();
      else void network.next();
    } else
      setSolo(
        finished
          ? createGame(Math.random, {
              ...solo.config,
              name: solo.players[0].name,
            })
          : solo.config.mode === "jokers"
            ? openShop(solo)
            : startHand(solo),
      );
  };
  const closeModal = () => setModal(null);
  const showTable = () => {
    setView("game");
    location.hash = "/table";
  };
  const goHome = () => {
    setView("home");
    setModal(null);
    history.replaceState(null, "", `${location.pathname}#/`);
  };
  const showBalatro = () => {
    setView("balatro");
    setModal(null);
    location.hash = "/balatro";
  };
  const changeSetup = (patch: Partial<SetupOptions>) => {
    network.setError("");
    setSetup((previous) => ({ ...previous, ...patch }));
  };
  const newSolo = () => {
    setSolo(
      createGame(Math.random, {
        ...setup,
        name: setup.name.trim(),
        seats: setup.aiCount + 1,
        fillBots: true,
      }),
    );
    setHasSoloGame(true);
    setSettings((previous) => ({ ...previous, difficulty: setup.difficulty }));
    setModal(null);
    sound("card");
    showTable();
  };
  const enterRoom = async (code?: string) => {
    const ok =
      code === undefined
        ? await network.create(setup.name.trim(), setup)
        : await network.join(setup.name.trim(), code);
    if (ok) {
      showTable();
      setModal("online");
    }
  };
  const performShop = (action: ShopAction) => {
    sound("chip");
    if (online) void network.shopAction(action);
    else {
      try {
        setSolo(shopAction(solo, 0, action));
      } catch (error) {
        setToast(error instanceof Error ? error.message : "商店操作未生效。");
      }
    }
  };
  const hint = game.result
    ? won
      ? "好牌，也要打得漂亮。"
      : "收拾心情，下一手见。"
    : hero.folded
      ? "你已弃牌，看看其他人的底牌。"
      : yourTurn
        ? legal.canCheck
          ? "还没有人下注。过牌，或给对手一点压力。"
          : `跟注 $${money(legal.toCall)}，继续这一手。`
        : "好牌值得等一等。";
  const peerNeedsInvite =
    network.transport === "peer" && network.peer.status === "disconnected";
  const turnLabel =
    online && !network.connected
      ? peerNeedsInvite
        ? "请向房主索取新邀请"
        : "正在重连牌桌…"
      : waitingForRoom
        ? "等待开局"
        : game.result
          ? "本手结束"
          : hero.eliminated
            ? "观战中"
            : yourTurn
              ? "轮到你了"
              : game.actor === null
                ? "正在发牌…"
                : `${game.players[game.actor].name}正在行动`;

  if (view === "balatro")
    return (
      <Suspense
        fallback={<div className="mode-loading">正在铺开新的牌桌…</div>}
      >
        <BalatroMode
          onHome={goHome}
          settings={settings}
          onSettings={changeSettings}
        />
      </Suspense>
    );

  return (
    <div
      className={`game-app ${view === "home" ? "hall-app" : ""} ${settings.crt ? "crt-enabled" : ""}`}
    >
      <Atmosphere animate={settings.crt} />
      {settings.crt && <div className="crt-overlay" aria-hidden="true" />}
      <div className="app-shell">
        <header className="app-header">
          <div className="brand">
            <div className="brand-mark">
              <Portrait character={1} />
              <span>♠</span>
            </div>
            <div>
              <h1>
                小丑德州<span className="logo-star">✦</span>
              </h1>
              <p>
                JOKER <span>HOLD'EM</span>
              </p>
            </div>
          </div>
          <div className="header-right">
            {view === "game" && (
              <button
                className="back-hall-button"
                aria-label="游戏大厅"
                title="游戏大厅"
                onClick={() => (online ? setModal("exit") : goHome())}
              >
                <span>←</span> <span className="back-hall-label">游戏大厅</span>
              </button>
            )}
            {view === "game" && !online && (
              <button
                className="back-hall-button solo-rogue-button"
                onClick={showBalatro}
              >
                <span>✦</span> 单人闯关
              </button>
            )}
            <span className="mode-label">
              <i />
              {view === "home" ? "欢迎入座" : online ? "好友牌桌" : "人机对战"}
            </span>
            <button
              className={`lan-button ${online ? "in-room-button" : ""}`}
              onClick={() => {
                sound();
                setModal("online");
              }}
            >
              <span className="lan-symbol" aria-hidden="true">
                ⌘
              </span>
              {network.room ? `房间 ${network.room.code}` : "局域网联机"}
              <Icon name="arrow" size={15} />
            </button>
            <div className="header-divider" />
            <button
              className="icon-button sound-toggle"
              aria-label={settings.sound ? "关闭音效" : "开启音效"}
              title={settings.sound ? "关闭音效" : "开启音效"}
              onClick={() => changeSettings({ sound: !settings.sound })}
            >
              <Icon name={settings.sound ? "sound" : "muted"} />
            </button>
            <button
              className="icon-button"
              aria-label="游戏设置"
              title="游戏设置"
              onClick={() => {
                sound();
                setModal("settings");
              }}
            >
              <Icon name="settings" />
            </button>
            <button
              className="icon-button help-toggle"
              aria-label="玩法说明"
              title="玩法说明"
              onClick={() => openRules("how")}
            >
              <Icon name="help" />
            </button>
          </div>
        </header>

        {view === "home" ? (
          <GameHall
            setup={setup}
            onBalatro={showBalatro}
            onChange={changeSetup}
            onSolo={newSolo}
            onCreate={() => void enterRoom()}
            onJoin={(code) => void enterRoom(code)}
            savedGame={hasSoloGame ? solo : null}
            onResume={() => {
              setSettings((previous) => ({
                ...previous,
                difficulty: solo.config.difficulty,
              }));
              showTable();
            }}
            connected={network.connected}
            busy={network.busy}
            error={network.error}
            transport={network.transport}
            onTransport={network.setTransport}
            invitation={network.invitation}
          />
        ) : (
          <main className="game-layout">
            <aside
              className={`sidebar ${waitingForRoom ? "waiting-sidebar" : ""}`}
            >
              <section className="session-panel pixel-panel">
                <button
                  className={`current-mode mode-${game.config.mode}`}
                  onClick={() => setModal("mode")}
                  style={{ "--mode-color": mode.accent } as React.CSSProperties}
                >
                  <span>{mode.glyph}</span>
                  <strong>{mode.name}</strong>
                  <small>玩法 ↗</small>
                </button>
                <div className="panel-heading">
                  <Icon name="cards" size={15} />
                  <h2>牌局信息</h2>
                  <span className="tiny-suits">♠ ♥</span>
                </div>
                <div className="hand-number">
                  <span>当前手数</span>
                  <strong>
                    <span>#</span>
                    {String(game.handNumber).padStart(2, "0")}
                  </strong>
                </div>
                <div className="blinds-line">
                  <span>
                    <span className="blinds-expanded">小盲 / 大盲</span>
                    <span className="blinds-compact">盲注</span>
                  </span>
                  <strong>
                    ${money(game.blinds.small)} <span>/</span> $
                    {money(game.blinds.big)}
                  </strong>
                </div>
                <div className="stage-divider" />
                <div className="street-list">
                  {streets.map((street, index) => (
                    <div
                      key={street}
                      className={`street-step ${game.street === street ? "current-step" : ""} ${streets.indexOf(game.street) > index ? "complete-step" : ""}`}
                    >
                      <i>
                        {streets.indexOf(game.street) > index ? (
                          <Icon name="check" size={9} />
                        ) : null}
                      </i>
                      <span>{STREET_NAME[street]}</span>
                      {game.street === street && (
                        <span className="stage-now">NOW</span>
                      )}
                    </div>
                  ))}
                </div>
                <span className="mobile-street">
                  {STREET_NAME[game.street]}
                </span>
              </section>

              <section className="wallet-panel pixel-panel">
                <div className="wallet-title">
                  <span>你的筹码</span>
                  <PixelSuit suit="diamonds" />
                </div>
                <strong className="wallet-amount">
                  <span>$</span>
                  {money(hero.stack)}
                </strong>
                <div
                  className={`wallet-change ${net > 0 ? "positive-change" : ""}`}
                >
                  <span>
                    {net === 0
                      ? "准备好大展身手了吗？"
                      : net > 0
                        ? `本手净赢 +$${money(net)}`
                        : `本手${game.result ? "净输" : "投入"} $${money(Math.abs(net))}`}
                  </span>
                </div>
                <div className="wallet-stats">
                  <div>
                    <span>已玩手数</span>
                    <strong>{stats.hands}</strong>
                  </div>
                  <div>
                    <span>获胜手数</span>
                    <strong>
                      {stats.wins}
                      <span> / {stats.hands}</span>
                    </strong>
                  </div>
                </div>
              </section>

              {game.config.mode === "jokers" ? (
                <JokerRack
                  game={game}
                  seat={heroId}
                  onOpen={() => setModal(game.shop ? "shop" : "mode")}
                />
              ) : (
                <JokerNote onClick={() => openRules("hands")} />
              )}
              <section className="recent-panel">
                <div>
                  <span>牌桌动态</span>
                  <button
                    onClick={() => {
                      sound();
                      setModal("history");
                    }}
                    aria-label="查看完整牌局记录"
                  >
                    <Icon name="history" size={14} />
                    <span>全部</span>
                  </button>
                </div>
                <p key={game.logs.at(-1)?.id}>
                  {game.logs.at(-1)?.text ?? "准备开牌。"}
                </p>
              </section>
              <button
                className="new-table-button"
                onClick={() => {
                  sound();
                  setModal("new");
                }}
              >
                <Icon name="reset" size={14} />
                {online ? (isHost ? "重新开桌" : "离开牌桌") : "新开一桌"}
                <span>↗</span>
              </button>
            </aside>

            <div className="table-and-actions">
              <section
                className={`game-table opponents-${opponents.length} ${waitingForRoom ? "waiting-table" : ""}`}
                aria-label="德州扑克牌桌"
              >
                {waitingForRoom && (
                  <div className="waiting-room-placeholder">
                    <div className="fresh-deck">
                      <PlayingCard hidden />
                      <PlayingCard hidden />
                    </div>
                    <span className="eyebrow">A SEAT AT THE TABLE</span>
                    <h2>
                      {network.room
                        ? "牌桌已准备好，等你们入座。"
                        : "正在回到你的座位…"}
                    </h2>
                    {network.room && (
                      <>
                        <p>
                          房间 <strong>{network.room.code}</strong> ·{" "}
                          {network.room.members.length} 位朋友已入座
                        </p>
                        <button
                          className="primary-button"
                          onClick={() => setModal("online")}
                        >
                          返回等候房间 <Icon name="arrow" />
                        </button>
                      </>
                    )}
                  </div>
                )}
                <div className="table-corner">
                  <span>THE GREEN ROOM</span>
                  <span className="table-rule">
                    NO LIMIT ·{" "}
                    {online
                      ? `${network.room?.members.length ?? 1} HUMAN`
                      : `${game.players.filter((p) => p.occupied).length} PLAYERS`}
                  </span>
                </div>
                <div className="table-rail rail-outer" aria-hidden="true" />
                <div className="table-rail rail-inner" aria-hidden="true" />
                <div className="felt-watermark" aria-hidden="true">
                  JOKER'S CLUB
                </div>
                <div className="opponents">
                  {opponents.map((player) => (
                    <Opponent
                      key={player.id}
                      player={player}
                      game={game}
                      human={
                        online &&
                        !!network.room?.members.some(
                          (m) => m.seat === player.id,
                        )
                      }
                      disconnected={
                        online &&
                        !!network.room?.members.some(
                          (m) => m.seat === player.id && !m.connected,
                        )
                      }
                    />
                  ))}
                </div>
                <div className={`pot-area ${game.result ? "settled-pot" : ""}`}>
                  <span className="pot-eyebrow">
                    {game.result ? "本手底池" : "当前底池"}
                    <span> TOTAL POT</span>
                  </span>
                  <div className="pot-value">
                    <ChipStack />
                    <strong>
                      <span>$</span>
                      {money(pot)}
                    </strong>
                  </div>
                  <span className="pot-caption">
                    {game.result
                      ? `${game.result.winners.map((id) => game.players[id].name).join("、")} ${game.result.winners.length > 1 ? "分享底池" : "赢得底池"}`
                      : game.street === "preflop"
                        ? "每一手，都有新的可能。"
                        : `${STREET_NAME[game.street]} · ${game.players.filter((p) => !p.folded && !p.eliminated).length} 位牌手在局`}
                  </span>
                </div>
                <div className="community-area">
                  <div className="community-cards" aria-label="公共牌">
                    {[0, 1, 2, 3, 4].map((index) => (
                      <PlayingCard
                        key={`${game.session}-${game.handNumber}-${index}`}
                        card={game.community[index]}
                        placeholder={
                          game.community[index]
                            ? undefined
                            : ["FLOP", "FLOP", "FLOP", "TURN", "RIVER"][index]
                        }
                        index={index}
                        highlighted={
                          won &&
                          !!game.community[index] &&
                          bestCards.has(cardId(game.community[index]))
                        }
                      />
                    ))}
                  </div>
                  <div className="board-labels">
                    <span
                      className={
                        game.community.length >= 3 ? "revealed-label" : ""
                      }
                    >
                      翻牌<span>FLOP</span>
                    </span>
                    <span
                      className={
                        game.community.length >= 4 ? "revealed-label" : ""
                      }
                    >
                      转牌<span>TURN</span>
                    </span>
                    <span
                      className={
                        game.community.length >= 5 ? "revealed-label" : ""
                      }
                    >
                      河牌<span>RIVER</span>
                    </span>
                  </div>
                </div>
                <div
                  className={`hero-area ${hero.folded ? "hero-folded" : ""} ${yourTurn ? "hero-active" : ""}`}
                >
                  <div className="hero-info">
                    <div className="hero-name">
                      <Portrait character={heroId} />
                      <div>
                        <span>
                          {hero.name}
                          <b>你</b>
                        </span>
                        <strong>${money(hero.stack)}</strong>
                      </div>
                    </div>
                    <div className="hero-state">
                      <SeatBadge game={game} seat={heroId} />
                      <span>
                        {hero.eliminated
                          ? "观战中"
                          : hero.folded
                            ? "已弃牌"
                            : hero.allIn && !game.result
                              ? "ALL IN"
                              : "YOUR HAND"}
                      </span>
                    </div>
                  </div>
                  <div className="hero-cards">
                    {[0, 1].map((index) => (
                      <PlayingCard
                        key={`${game.session}-${game.handNumber}-${index}`}
                        card={hero.cards[index]}
                        hidden={!hero.cards[index]}
                        index={index}
                        highlighted={
                          won &&
                          !!hero.cards[index] &&
                          bestCards.has(cardId(hero.cards[index]))
                        }
                      />
                    ))}
                  </div>
                  <div className="hand-hint">
                    <span>当前牌型</span>
                    <strong>
                      {hero.eliminated
                        ? "—"
                        : handDescription(hero.cards, game.community)}
                    </strong>
                    <button
                      className="text-button"
                      onClick={() => openRules("hands")}
                    >
                      牌型说明 <span>↗</span>
                    </button>
                  </div>
                </div>
                <div className="table-bottom-caption">
                  <span>♣</span> TRUST YOUR HAND. <span>♦</span>
                </div>
              </section>

              <section
                className={`action-panel pixel-panel ${game.result && !waitingForRoom ? "result-panel" : ""}`}
                aria-label="操作面板"
              >
                {waitingForRoom ? (
                  <div className="waiting-actions">
                    <Icon name="cards" size={27} />
                    <div>
                      <strong>好牌值得一起等。</strong>
                      <p>房主开局后，大家会同时拿到第一手牌。</p>
                    </div>
                    <button
                      className="secondary-button"
                      onClick={() => setModal("online")}
                    >
                      查看房间
                    </button>
                  </div>
                ) : game.result ? (
                  <div className="result-content">
                    <div className={`result-emblem ${won ? "result-win" : ""}`}>
                      <Icon name={won ? "trophy" : "cards"} size={29} />
                    </div>
                    <div className="result-text">
                      <span>
                        {finished
                          ? hero.stack > 0
                            ? "你赢下了整张牌桌！"
                            : "这次的旅程告一段落。"
                          : won
                            ? "漂亮，拿下这一手。"
                            : "下一手，机会还在。"}
                      </span>
                      <strong
                        className={net > 0 ? "result-profit" : "result-loss"}
                      >
                        {net > 0 ? "+" : net < 0 ? "−" : ""}$
                        {money(Math.abs(net))}
                        <small>
                          {game.result.uncontested
                            ? "其余玩家全部弃牌"
                            : (game.result.ranks[heroId]?.name ??
                              (hero.folded ? "你已弃牌" : "观战中"))}
                        </small>
                      </strong>
                    </div>
                    <button
                      className="primary-button next-hand-button"
                      disabled={
                        (!isHost && !game.shop) ||
                        network.busy ||
                        (online && !network.connected)
                      }
                      onClick={nextHand}
                    >
                      {game.shop
                        ? "返回小丑商店"
                        : !isHost
                          ? game.config.mode === "jokers" && !finished
                            ? "等待房主开启商店"
                            : "等待房主发牌"
                          : finished
                            ? online
                              ? "回到房间"
                              : "再来一桌"
                            : game.config.mode === "jokers"
                              ? "进入小丑商店"
                              : "下一手"}
                      <Icon name="arrow" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="action-heading">
                      <span
                        className={`turn-indicator ${yourTurn ? "your-turn" : ""}`}
                      >
                        <i />
                        {turnLabel}
                      </span>
                      <span className="turn-hint">{hint}</span>
                      <span className="no-timer">慢慢想，不限时</span>
                    </div>
                    <div className="action-buttons">
                      <button
                        className="action-button fold-button"
                        disabled={!yourTurn}
                        onClick={() => perform({ type: "fold" })}
                      >
                        <span>
                          弃牌 <kbd>F</kbd>
                        </span>
                        <small>FOLD</small>
                      </button>
                      <button
                        className="action-button call-button"
                        disabled={!yourTurn}
                        onClick={() =>
                          perform({ type: legal.canCheck ? "check" : "call" })
                        }
                      >
                        <span>
                          {legal.canCheck ? "过牌" : "跟注"} <kbd>SPACE</kbd>
                        </span>
                        <strong>
                          {legal.canCheck ? "CHECK" : `$${money(legal.toCall)}`}
                        </strong>
                      </button>
                      <button
                        className="action-button raise-button"
                        disabled={!yourTurn || !legal.canRaise}
                        onClick={() =>
                          perform({ type: "raise", amount: currentRaise })
                        }
                      >
                        <span>
                          {game.currentBet === 0 ? "下注" : "加注至"}{" "}
                          <kbd>R</kbd>
                        </span>
                        <strong>${money(currentRaise)}</strong>
                        <span className="raise-arrow">↗</span>
                      </button>
                      <button
                        className="action-button allin-button"
                        disabled={!yourTurn || !legal.canAllIn}
                        onClick={() => perform({ type: "allin" })}
                      >
                        <span>
                          全押 <span className="allin-star">✦</span>
                        </span>
                        <small>ALL IN</small>
                      </button>
                    </div>
                    <div className="bet-adjustment">
                      <label htmlFor="raise-amount">
                        加注至 <span>${money(currentRaise)}</span>
                      </label>
                      <input
                        id="raise-amount"
                        aria-label="加注总额"
                        type="range"
                        min={legal.minRaise}
                        max={Math.max(legal.minRaise, legal.maxRaise)}
                        step="1"
                        value={currentRaise}
                        disabled={!yourTurn || !legal.canRaise}
                        onChange={(event) =>
                          setRaiseAmount(Number(event.target.value))
                        }
                        style={
                          {
                            "--range-progress": `${((currentRaise - legal.minRaise) / (legal.maxRaise - legal.minRaise || 1)) * 100}%`,
                          } as React.CSSProperties
                        }
                      />
                      <div className="bet-presets">
                        {[
                          { label: "最小", value: legal.minRaise },
                          {
                            label: "½ 底池",
                            value:
                              game.currentBet +
                              Math.ceil(((pot + legal.toCall) * 0.5) / 10) * 10,
                          },
                          {
                            label: "底池",
                            value:
                              game.currentBet +
                              Math.ceil((pot + legal.toCall) / 10) * 10,
                          },
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            disabled={!yourTurn || !legal.canRaise}
                            onClick={() => {
                              sound();
                              setRaiseAmount(
                                Math.max(
                                  legal.minRaise,
                                  Math.min(preset.value, legal.maxRaise),
                                ),
                              );
                            }}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                {!!game.result && !waitingForRoom && (
                  <BonusSummary game={game} seat={heroId} />
                )}
              </section>
            </div>
          </main>
        )}
        <footer className="app-footer">
          <span>
            <i />
            {online
              ? network.connected
                ? `${network.transport === "peer" ? "浏览器直连" : "局域网"}已连接 · 牌局同步中`
                : peerNeedsInvite
                  ? "连接中断 · 等待新邀请"
                  : "连接中断 · 正在自动重连"
              : "本地练习 · 进度自动保存"}
          </span>
          <span className="footer-tagline">
            一点策略。一点运气。<span>♠ ♥ ♣ ♦</span>
          </span>
          {view === "game" && (
            <button
              className="mobile-new-table"
              onClick={() => setModal("new")}
            >
              {online ? (isHost ? "重新开桌" : "离开牌桌") : "新开一桌"}{" "}
              <Icon name="reset" size={12} />
            </button>
          )}
          <button onClick={() => openRules("how")}>
            玩法说明 <Icon name="help" size={12} />
          </button>
        </footer>
      </div>

      {modal === "rules" && (
        <Dialog
          title="牌桌小抄"
          eyebrow="KNOW YOUR CARDS"
          onClose={closeModal}
          wide
        >
          <Rules defaultTab={rulesTab} />
        </Dialog>
      )}
      {modal === "settings" && (
        <Dialog
          title="调成你的节奏"
          eyebrow="MAKE YOURSELF AT HOME"
          onClose={closeModal}
        >
          <SettingsContent
            settings={
              online
                ? { ...settings, difficulty: game.config.difficulty }
                : settings
            }
            onChange={changeSettings}
            online={online}
          />
        </Dialog>
      )}
      {modal === "history" && (
        <Dialog
          title="牌局记录"
          eyebrow="EVERY HAND TELLS A STORY"
          onClose={closeModal}
        >
          <History game={game} />
        </Dialog>
      )}
      {modal === "online" && (
        <Dialog
          title={network.room ? "朋友，入座吧。" : "好牌，和朋友一起打。"}
          eyebrow="THE MORE, THE MERRIER"
          onClose={closeModal}
          wide
        >
          <OnlineLobby
            network={network}
            onClose={closeModal}
            onLeave={goHome}
            setup={setup}
            onSetup={changeSetup}
          />
        </Dialog>
      )}
      {modal === "mode" && (
        <Dialog title={mode.name} eyebrow={mode.en} onClose={closeModal} wide>
          <ModeReference game={game} />
        </Dialog>
      )}
      {modal === "shop" && game.shop && (
        <Dialog
          title="小丑商店，开门了。"
          eyebrow="A LITTLE LUCK FOR THE NEXT HAND"
          onClose={closeModal}
          wide
        >
          <JokerShop
            game={game}
            seat={heroId}
            onAction={performShop}
            busy={network.busy || (online && !network.connected)}
          />
        </Dialog>
      )}
      {modal === "exit" && (
        <Dialog
          title="准备离开牌桌？"
          eyebrow="SEE YOU NEXT HAND"
          onClose={closeModal}
        >
          <div className="new-table-content">
            <p>离开后，你的座位将由 AI 接管。其他朋友可以继续这一桌。</p>
            <div className="confirm-buttons">
              <button className="secondary-button" onClick={closeModal}>
                继续这一桌
              </button>
              <button
                className="primary-button"
                onClick={async () => {
                  await network.leave();
                  goHome();
                }}
              >
                离开并返回大厅
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {modal === "new" && (
        <Dialog
          title={
            online
              ? isHost
                ? "重新开一张桌？"
                : "准备离开牌桌？"
              : "开启新的手气？"
          }
          eyebrow="A FRESH DECK, A FRESH START"
          onClose={closeModal}
        >
          <div className="new-table-content">
            <div className="fresh-deck">
              <PlayingCard hidden />
              <PlayingCard hidden />
            </div>
            <p>
              {online
                ? isHost
                  ? "这桌的筹码会重置，所有朋友返回等候房间。你可以邀请新朋友再来一局。"
                  : "离开后，你的座位将由 AI 接管。你可以返回大厅选择其他玩法。"
                : `当前对局会结束。继续${mode.name}，你和 ${solo.players.length - 1} 位 AI 将各带 $${money(mode.buyIn)} 筹码，重新开始。切换模式或人数请返回游戏大厅。`}
            </p>
            <div className="confirm-buttons">
              <button className="secondary-button" onClick={closeModal}>
                继续这一桌
              </button>
              <button
                className="primary-button"
                onClick={async () => {
                  sound("card");
                  if (online) {
                    if (isHost) {
                      if (await network.lobby()) setModal("online");
                    } else {
                      await network.leave();
                      goHome();
                    }
                  } else {
                    setSolo(
                      createGame(Math.random, {
                        ...solo.config,
                        name: solo.players[0].name,
                      }),
                    );
                    setHasSoloGame(true);
                    closeModal();
                  }
                }}
              >
                {online ? (isHost ? "重新开桌" : "离开牌桌") : "开一桌"}
                <Icon name="arrow" />
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button onClick={() => setToast("")} aria-label="关闭提示">
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

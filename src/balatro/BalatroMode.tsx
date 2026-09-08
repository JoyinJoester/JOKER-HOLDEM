import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog } from "../Dialogs";
import { Atmosphere, Icon } from "../visuals";
import { playSound } from "../sound";
import type { Settings } from "../storage";
import { createRun, runAction } from "./engine";
import { loadRun, saveConfig, saveRun } from "./storage";
import { scoringView } from "./score-playback";
import { useScorePlayback } from "./useScorePlayback";
import { JokerArt } from "./CardArt";
import { RunSetup } from "./RunSetup";
import { Collection, DeckReference, RulesContent } from "./Collection";
import {
  BlindSelection,
  Cashout,
  HandArea,
  InspectContent,
  PackSelection,
  PlayingStage,
  RunEnd,
  RunInventory,
  RunSidebar,
  ScoreTrace,
  Shop,
  type Inspect,
} from "./RunBoard";
import type { RunAction, RunConfig } from "./types";
import "./balatro.css";
import "./viewport.css";
import "./scoring.css";

type Modal =
  | "setup"
  | "collection"
  | "hands"
  | "deck"
  | "rules"
  | "settings"
  | "trace"
  | "history"
  | Inspect
  | null;

export default function BalatroMode({
  onHome,
  settings,
  onSettings,
}: {
  onHome: () => void;
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => void;
}) {
  const [run, setRun] = useState(loadRun);
  const current = useRef(run);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState("");
  const [saveOk, setSaveOk] = useState(true);
  const {
    playback,
    locked,
    start: animateScore,
    finish: finishScore,
    cancel: cancelScore,
  } = useScorePlayback(settings);
  const busy = playback !== null;
  const displayRun = playback ? scoringView(playback) : run;
  const scoreStep = playback?.steps[playback.index];
  const [reducedMotion, setReducedMotion] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReducedMotion(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3600);
    return () => clearTimeout(timer);
  }, [toast]);

  const act = useCallback(
    (action: RunAction) => {
      if (!current.current || locked.current) return;
      try {
        const previous = current.current;
        const next = runAction(previous, action);
        current.current = next;
        setSaveOk(saveRun(next));
        setRun(next);
        if (action.type === "play") animateScore(previous, next);
        if (["use", "sellJoker", "sellConsumable"].includes(action.type))
          setModal(null);
        if (settings.sound && action.type !== "play")
          playSound(
            ["buy", "voucher", "cashout", "pickPack"].includes(action.type)
              ? "chip"
              : ["select", "discard", "startBlind", "openPack"].includes(
                    action.type,
                  )
                ? "card"
                : "click",
            settings.volume,
          );
        if (
          [
            "use",
            "sellJoker",
            "sellConsumable",
            "voucher",
            "rerollBoss",
          ].includes(action.type)
        )
          setToast(next.message);
      } catch (error) {
        setToast(error instanceof Error ? error.message : "这次操作未生效。");
      }
    },
    [animateScore, locked, settings.sound, settings.volume],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        modal ||
        document.querySelector('[role="dialog"]') ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        locked.current
      )
        return;
      const target = event.target as HTMLElement;
      if (
        ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName) ||
        target.isContentEditable
      )
        return;
      if (
        event.key === "Enter" &&
        target.closest("button") &&
        !target.closest(".rg-hand-card")
      )
        return;
      const s = current.current;
      if (!s || !["playing", "pack"].includes(s.phase)) return;
      const index = Number(event.key) - 1;
      if (/^[1-9]$/.test(event.key) && s.hand[index]) {
        event.preventDefault();
        act({ type: "select", uid: s.hand[index] });
        document
          .querySelector<HTMLButtonElement>(`[data-card-id="${s.hand[index]}"]`)
          ?.focus({ preventScroll: true });
      }
      if (s.phase !== "playing") return;
      if (event.key === "Enter" && s.selected.length) {
        event.preventDefault();
        act({ type: "play" });
      }
      if (event.code === "KeyD" && s.selected.length && s.discardsLeft > 0) {
        event.preventDefault();
        act({ type: "discard" });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [act, modal]);

  const start = (config: RunConfig) => {
    try {
      const next = createRun(config);
      cancelScore();
      current.current = next;
      setSaveOk(saveRun(next));
      saveConfig(config);
      setRun(next);
      setModal(null);
      setToast("新的一局，祝你好运。");
      if (settings.sound) playSound("card", settings.volume);
      window.scrollTo({ top: 0, behavior: "instant" });
    } catch (error) {
      setToast(error instanceof Error ? error.message : "无法开始新局。");
    }
  };
  const close = () => setModal(null);
  const title =
    modal && typeof modal === "object"
      ? "卡牌详情"
      : ((
          {
            setup: "新的一局",
            collection: "构筑图鉴",
            hands: "牌型与星球",
            deck: "我的牌组",
            rules: "怎么玩",
            settings: "游戏设置",
            trace: "这一手，如何得分",
            history: "冒险记录",
          } as Record<string, string>
        )[modal ?? ""] ?? "");

  return (
    <div
      className={`game-app rg-app ${settings.crt ? "crt-enabled" : ""} ${settings.fast || reducedMotion ? "rg-fast" : ""} ${reducedMotion ? "rg-reduced-motion" : ""}`}
    >
      <Atmosphere animate={settings.crt && !reducedMotion} />
      {settings.crt && <div className="crt-overlay" aria-hidden="true" />}
      <div className="rg-shell">
        <header className="rg-header">
          <div className="rg-brand">
            <div className="rg-brand-mark">
              <JokerArt id="joker" />
            </div>
            <div>
              <h1>
                小丑<span>闯关</span>
                <i>✦</i>
              </h1>
              <p>ROGUELIKE POKER</p>
            </div>
          </div>
          <nav className="rg-header-actions" aria-label="闯关模式菜单">
            <button className="rg-nav-button" onClick={onHome}>
              <span>←</span> 游戏大厅
            </button>
            <button
              className="rg-nav-button"
              onClick={() => setModal("collection")}
            >
              <Icon name="cards" />
              <span>图鉴</span>
            </button>
            <button
              className="rg-icon-button"
              aria-label="玩法说明"
              onClick={() => setModal("rules")}
            >
              <Icon name="help" />
            </button>
            <button
              className="rg-icon-button"
              aria-label={settings.sound ? "关闭音效" : "开启音效"}
              onClick={() => onSettings({ sound: !settings.sound })}
            >
              <Icon name={settings.sound ? "sound" : "muted"} />
            </button>
            <button
              className="rg-icon-button"
              aria-label="游戏设置"
              onClick={() => setModal("settings")}
            >
              <Icon name="settings" />
            </button>
          </nav>
        </header>
        {displayRun ? (
          <main
            className="rg-layout"
            data-phase={displayRun.phase}
            data-scoring={busy}
            aria-busy={busy}
          >
            <RunSidebar
              run={displayRun}
              scoreStep={scoreStep}
              animateNumbers={!reducedMotion}
              onReference={() => setModal("hands")}
              onDeck={() => setModal("deck")}
              onNew={() => setModal("setup")}
              onTrace={() => setModal("trace")}
            />
            <div className="rg-main">
              <RunInventory
                run={displayRun}
                onInspect={setModal}
                busy={busy}
                scoreStep={scoreStep}
                triggerId={playback?.index}
              />
              <div className={`rg-board rg-phase-${displayRun.phase}`}>
                {displayRun.phase === "blind" && (
                  <BlindSelection run={displayRun} act={act} />
                )}
                {displayRun.phase === "playing" && (
                  <>
                    <PlayingStage
                      run={displayRun}
                      busy={busy}
                      playback={playback}
                      animateNumbers={!reducedMotion}
                      onSkip={finishScore}
                      onTrace={() => setModal("trace")}
                    />
                    <HandArea
                      run={displayRun}
                      act={act}
                      busy={busy}
                      scoreStep={scoreStep}
                      triggerId={playback?.index}
                    />
                  </>
                )}
                {displayRun.phase === "cashout" && (
                  <Cashout run={displayRun} act={act} busy={busy} />
                )}
                {displayRun.phase === "shop" && (
                  <Shop run={displayRun} act={act} />
                )}
                {displayRun.phase === "pack" && (
                  <PackSelection run={displayRun} act={act} />
                )}
                {["lost", "won"].includes(displayRun.phase) && (
                  <RunEnd
                    run={displayRun}
                    act={act}
                    onNew={() => setModal("setup")}
                  />
                )}
              </div>
              <footer className="rg-run-footer">
                <span
                  className={`rg-save-status ${saveOk ? "" : "rg-save-error"}`}
                >
                  <i />
                  {saveOk ? "已自动保存" : "浏览器无法存档，请保持此页面打开"}
                </span>
                <p aria-live="polite">{displayRun.message}</p>
                <button disabled={busy} onClick={() => setModal("history")}>
                  牌局记录 ↗
                </button>
              </footer>
            </div>
          </main>
        ) : (
          <RunSetup saved={null} onStart={start} onResume={close} />
        )}
        <footer className="rg-page-footer">
          <span>小丑德州 · 独立闯关模式</span>
          <span>
            LUCK IS JUST THE BEGINNING. <b>♠ ♥ ♣ ♦</b>
          </span>
        </footer>
      </div>
      {toast && (
        <div className="rg-toast" role="status">
          {toast}
        </div>
      )}
      {modal && (
        <Dialog
          key={typeof modal === "string" ? modal : modal.kind}
          title={title}
          eyebrow="JOKER / ROGUELIKE"
          onClose={close}
          wide={["collection", "hands", "deck", "setup"].includes(
            typeof modal === "string" ? modal : "",
          )}
        >
          {typeof modal === "object" && run && (
            <InspectContent run={run} inspect={modal} act={act} />
          )}
          {modal === "setup" && (
            <RunSetup saved={run} onStart={start} onResume={close} />
          )}
          {(modal === "collection" || modal === "hands") && (
            <Collection
              run={run}
              initialTab={modal === "hands" ? "hands" : "jokers"}
            />
          )}
          {modal === "deck" && run && <DeckReference run={run} />}
          {modal === "rules" && <RulesContent />}
          {modal === "trace" && run && <ScoreTrace run={run} />}
          {modal === "history" && run && (
            <ol className="rg-history">
              {[...run.logs].reverse().map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
          )}
          {modal === "settings" && (
            <div className="rg-settings">
              <div>
                <span>
                  <b>游戏音效</b>
                  <small>出牌、选牌、购买和过关反馈</small>
                </span>
                <button
                  className="rg-button"
                  aria-pressed={settings.sound}
                  onClick={() => onSettings({ sound: !settings.sound })}
                >
                  {settings.sound ? "已开启" : "已关闭"}
                </button>
              </div>
              <label>
                <span>音量</span>
                <input
                  aria-label="音量"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.volume}
                  onChange={(e) =>
                    onSettings({ volume: Number(e.target.value) })
                  }
                />
              </label>
              <div>
                <span>
                  <b>复古屏幕</b>
                  <small>扫描线与流动桌布</small>
                </span>
                <button
                  className="rg-button"
                  aria-pressed={settings.crt}
                  onClick={() => onSettings({ crt: !settings.crt })}
                >
                  {settings.crt ? "已开启" : "已关闭"}
                </button>
              </div>
              <div>
                <span>
                  <b>快速模式</b>
                  <small>加快计分动效，仍按顺序展示每次加成</small>
                </span>
                <button
                  className="rg-button"
                  aria-pressed={settings.fast}
                  onClick={() => onSettings({ fast: !settings.fast })}
                >
                  {settings.fast ? "已开启" : "已关闭"}
                </button>
              </div>
              <button
                className="rg-button"
                style={{ width: "100%", marginTop: 20 }}
                onClick={() => setModal("rules")}
              >
                查看玩法说明 →
              </button>
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}

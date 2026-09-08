import { useState, type CSSProperties } from "react";
import { DECKS, STAKES, STAKE_COLORS, STAKE_RULES } from "./data";
import { newSeed } from "./engine";
import { JokerFace } from "./CardArt";
import { loadConfig } from "./storage";
import type { RunConfig, RunState } from "./types";

export function RunSetup({
  saved,
  onStart,
  onResume,
}: {
  saved: RunState | null;
  onStart: (config: RunConfig) => void;
  onResume: () => void;
}) {
  const [config, setConfig] = useState(loadConfig);
  const deck = DECKS.find((d) => d.id === config.deck)!;
  return (
    <div className="rg-setup">
      <section className="rg-setup-intro">
        <span className="rg-overline">ONE MORE HAND.</span>
        <h2>
          把好运，
          <br />
          打成<span>无限可能。</span>
        </h2>
        <p>
          组出牌型，叠起倍率。
          <br />
          从第一手 300 分，到属于你的天文数字。
        </p>
        <div className="rg-hero-art" aria-hidden="true">
          {["blueprint", "joker", "banana"].map((id, i) => (
            <div key={id} style={{ "--fan-index": i - 1 } as CSSProperties}>
              <JokerFace
                joker={{
                  id,
                  edition: i === 0 ? "holo" : "base",
                  eternal: false,
                  perish: null,
                  rental: false,
                }}
              />
            </div>
          ))}
          <span className="rg-hero-spark">✦</span>
        </div>
        <div className="rg-setup-numbers">
          <span>
            <b>150</b>小丑牌
          </span>
          <span>
            <b>15</b>起始牌组
          </span>
          <span>
            <b>8</b>挑战注级
          </span>
        </div>
        <p className="rg-setup-footnote">全卡池开放 · 单人闯关 · 自动存档</p>
      </section>
      <form
        className="rg-setup-form"
        onSubmit={(e) => {
          e.preventDefault();
          onStart(config);
        }}
      >
        <div className="rg-section-heading">
          <div>
            <span className="rg-overline">BUILD YOUR RUN</span>
            <h3>开一局新的可能</h3>
          </div>
          <span className="rg-small-chip">独立模式</span>
        </div>
        {saved && (
          <button type="button" className="rg-resume" onClick={onResume}>
            <span>↶</span>
            <div>
              <b>
                {saved.phase === "lost" || saved.phase === "won"
                  ? "查看上一局"
                  : "继续上次的冒险"}
              </b>
              <small>
                第 {saved.ante} 底注 ·{" "}
                {DECKS.find((d) => d.id === saved.config.deck)?.name} · $
                {saved.money}
              </small>
            </div>
            <span>→</span>
          </button>
        )}
        <div className="rg-form-label">
          <b>起始牌组</b>
          <span>{DECKS.findIndex((d) => d.id === deck.id) + 1} / 15</span>
        </div>
        <div className="rg-deck-options" role="group" aria-label="起始牌组">
          {DECKS.map((d) => (
            <button
              type="button"
              key={d.id}
              aria-label={d.name}
              aria-pressed={config.deck === d.id}
              title={d.desc}
              style={{ "--deck-color": d.color } as CSSProperties}
              onClick={() => setConfig((c) => ({ ...c, deck: d.id }))}
            >
              <span>♠</span>
              <small>{d.name.replace("牌组", "")}</small>
            </button>
          ))}
        </div>
        <div
          className="rg-deck-description"
          style={{ "--deck-color": deck.color } as CSSProperties}
        >
          <b>{deck.name}</b>
          <p>{deck.desc}</p>
        </div>
        <div className="rg-form-label">
          <b>挑战注级</b>
          <span>高注包含之前所有限制</span>
        </div>
        <div className="rg-stake-options" role="group" aria-label="挑战注级">
          {STAKES.map((name, i) => (
            <button
              type="button"
              key={name}
              aria-label={name}
              aria-pressed={config.stake === i}
              style={{ "--stake-color": STAKE_COLORS[i] } as CSSProperties}
              onClick={() => setConfig((c) => ({ ...c, stake: i }))}
            >
              <i />
              <span>{name}</span>
            </button>
          ))}
        </div>
        <p className="rg-stake-rule">{STAKE_RULES[config.stake]}</p>
        <label className="rg-form-label" htmlFor="rg-seed">
          <b>随机种子</b>
          <span>可选</span>
        </label>
        <div className="rg-seed-input">
          <input
            id="rg-seed"
            value={config.seed}
            maxLength={32}
            placeholder="留空，每次开始都是新的一局"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                seed: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""),
              }))
            }
          />
          <button
            type="button"
            aria-label="生成随机种子"
            title="生成随机种子"
            onClick={() => setConfig((c) => ({ ...c, seed: newSeed() }))}
          >
            ⚄
          </button>
        </div>
        <p className="rg-seed-note">
          相同种子、牌组、注级和操作，可复现同一条随机路线。
        </p>
        <button className="rg-button rg-primary rg-start-run" type="submit">
          {saved && !["lost", "won"].includes(saved.phase)
            ? "开始新局并替换存档"
            : "开始冒险"}
          <span>→</span>
        </button>
        <span className="rg-start-note">
          目标：击败第 8 底注的 Boss，可继续无尽模式。
        </span>
      </form>
    </div>
  );
}

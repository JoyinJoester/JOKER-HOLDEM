import { useState, type CSSProperties } from "react";
import { Dialog } from "../Dialogs";
import {
  BOSS_MAP,
  DECKS,
  EDITIONS,
  HANDS,
  JOKERS,
  PACK_NAMES,
  RARITIES,
  STAKES,
  TAG_MAP,
  VOUCHER_MAP,
} from "./data";
import {
  blindTarget,
  bossIs,
  canAfford,
  cardDebuffed,
  consumableSlots,
  handSize,
  handValues,
  jokerActive,
  jokerSlots,
  offerPrice,
  offerReason,
  packPrice,
  rerollPrice,
  selectedHand,
  sellConsumableValue,
  sellJokerValue,
  useReason,
  voucherPrice,
} from "./engine";
import {
  cardDetails,
  cardName,
  itemDescription,
  itemKind,
  itemName,
  jokerStatus,
  number,
} from "./presentation";
import { ConsumableFace, JokerFace, PackFace, RunCardFace } from "./CardArt";
import { ScoreCue, ScoreNumber } from "./ScoreEffects";
import type { ScorePlayback, ScoreStep } from "./score-playback";
import type { Offer, RunAction, RunState } from "./types";

type Act = (action: RunAction) => void;
export type Inspect = { kind: "joker" | "item"; uid: string };
export const blindName = (s: RunState) =>
  s.blind === 0 ? "小盲注" : s.blind === 1 ? "大盲注" : BOSS_MAP[s.boss].name;
const bossDescription = (s: RunState) =>
  s.boss === "ox"
    ? `打出「${HANDS[s.bossHand ?? "high"].name}」会使资金归零（本底注指定牌型）。`
    : BOSS_MAP[s.boss].desc;

export function RunInventory({
  run: s,
  onInspect,
  busy = false,
  scoreStep,
  triggerId,
}: {
  run: RunState;
  onInspect: (item: Inspect) => void;
  busy?: boolean;
  scoreStep?: ScoreStep;
  triggerId?: number;
}) {
  const slots = jokerSlots(s),
    hidden = bossIs(s, "acorn");
  return (
    <div className="rg-inventory">
      <section className="rg-joker-inventory" aria-label="持有的小丑">
        <div className="rg-rack-heading">
          <span>
            小丑牌{" "}
            <b>
              {s.jokers.length}/{slots}
            </b>
          </span>
          <small>从左向右触发 · 点按管理</small>
        </div>
        <div
          className="rg-joker-slots"
          style={
            {
              "--slot-count": Math.max(
                1,
                s.jokers.length +
                  Math.max(0, Math.min(5, slots - s.jokers.length)),
              ),
            } as CSSProperties
          }
        >
          {s.jokers.map((j, i) => (
            <button
              key={j.uid}
              className={`rg-inventory-card ${!jokerActive(s, j) ? "rg-disabled-card" : ""} ${scoreStep?.trace?.joker === j.uid ? "rg-effect-active" : ""}`}
              data-joker-id={j.uid}
              disabled={busy}
              aria-label={
                hidden ? `背面朝上的小丑 ${i + 1}` : `管理${JOKERS[j.id].name}`
              }
              onClick={() => onInspect({ kind: "joker", uid: j.uid })}
            >
              <div
                className={`rg-trigger-face ${scoreStep?.trace?.joker === j.uid ? "rg-triggering" : ""}`}
                key={scoreStep?.trace?.joker === j.uid ? triggerId : j.uid}
              >
                <JokerFace joker={j} hidden={hidden} />
              </div>
              {!hidden && jokerStatus(j, s) && (
                <span className="rg-joker-status">{jokerStatus(j, s)}</span>
              )}
            </button>
          ))}
          {Array.from(
            { length: Math.max(0, Math.min(5, slots - s.jokers.length)) },
            (_, i) => (
              <div className="rg-empty-slot" key={`empty-${i}`}>
                <span>✧</span>
                <small>小丑槽位</small>
              </div>
            ),
          )}
        </div>
      </section>
      <section className="rg-consumable-inventory" aria-label="持有的消耗牌">
        <div className="rg-rack-heading">
          <span>
            消耗牌{" "}
            <b>
              {s.consumables.length}/{consumableSlots(s)}
            </b>
          </span>
        </div>
        <div
          className="rg-consumable-slots"
          style={
            {
              "--slot-count": Math.max(
                1,
                s.consumables.length +
                  Math.max(
                    0,
                    Math.min(2, consumableSlots(s) - s.consumables.length),
                  ),
              ),
            } as CSSProperties
          }
        >
          {s.consumables.map((c) => (
            <button
              key={c.uid}
              className="rg-inventory-card"
              disabled={busy}
              aria-label={`使用或出售${itemName(c)}`}
              onClick={() => onInspect({ kind: "item", uid: c.uid })}
            >
              <ConsumableFace item={c} />
            </button>
          ))}
          {Array.from(
            {
              length: Math.max(
                0,
                Math.min(2, consumableSlots(s) - s.consumables.length),
              ),
            },
            (_, i) => (
              <div className="rg-empty-slot" key={`empty-${i}`}>
                <span>✦</span>
                <small>消耗牌槽位</small>
              </div>
            ),
          )}
        </div>
      </section>
    </div>
  );
}

export function RunSidebar({
  run: s,
  scoreStep,
  animateNumbers = true,
  onReference,
  onDeck,
  onNew,
  onTrace,
}: {
  run: RunState;
  scoreStep?: ScoreStep;
  animateNumbers?: boolean;
  onReference: () => void;
  onDeck: () => void;
  onNew: () => void;
  onTrace: () => void;
}) {
  const hidden = s.deck.some((c) => s.selected.includes(c.uid) && c.faceDown);
  const evaluation = selectedHand(s);
  const preview =
    scoreStep ??
    (s.selected.length
      ? handValues(s, evaluation.id)
      : (s.lastHand ?? { chips: 0, mult: 0 }));
  const deck = DECKS.find((d) => d.id === s.config.deck)!;
  const playing = ["playing", "cashout", "lost", "won"].includes(s.phase);
  const afterShop =
    s.phase === "shop" ||
    (s.phase === "pack" && s.pack?.returnPhase === "shop");
  const nextTarget = afterShop
    ? blindTarget({
        ...s,
        ante: s.ante + (s.blind === 2 ? 1 : 0),
        blind: (s.blind + 1) % 3,
        bossDisabled: false,
      })
    : blindTarget(s);
  return (
    <aside className="rg-sidebar">
      <div className="rg-run-identity">
        <span style={{ "--deck-color": deck.color } as CSSProperties}>♠</span>
        <div>
          <b>{deck.name}</b>
          <small>
            {STAKES[s.config.stake]} · {s.endless ? "无尽模式" : "单人闯关"}
          </small>
        </div>
      </div>
      <section className="rg-blind-meter">
        <span className="rg-overline">
          {playing ? blindName(s) : "NEXT BLIND"}
        </span>
        <p>{playing ? "本关目标" : "下一关目标"}</p>
        <strong className="rg-target">
          {number(playing ? s.target : nextTarget)}
        </strong>
        <small>至少得分</small>
      </section>
      <section className="rg-score-meter">
        <div>
          <span>本关得分</span>
          <b aria-live={scoreStep ? "off" : "polite"}>
            <ScoreNumber
              value={s.score}
              animate={!!scoreStep && animateNumbers}
              duration={
                scoreStep?.phase === "bank" ? scoreStep.duration * 0.8 : 0
              }
              integer
            />
          </b>
        </div>
        <div
          className="rg-progress"
          role="progressbar"
          aria-label="本关得分进度"
          aria-valuemin={0}
          aria-valuemax={s.target}
          aria-valuenow={Math.min(s.target, s.score)}
        >
          <i
            style={{
              width: `${Math.min(100, (s.score / Math.max(1, s.target)) * 100)}%`,
            }}
          />
        </div>
      </section>
      <section
        className={`rg-formula ${scoreStep ? "rg-formula-scoring" : ""}`}
      >
        <button onClick={onReference} className="rg-hand-name">
          {hidden
            ? "未知牌型"
            : s.selected.length
              ? evaluation.name
              : (s.lastHand?.name ?? "选择手牌")}
          <span>
            {!hidden && (s.selected.length || s.lastHand)
              ? `Lv.${s.levels[s.selected.length ? evaluation.id : s.lastHand!.id]}`
              : "↗"}
          </span>
        </button>
        <div>
          <strong className="rg-chip-value">
            {hidden ? (
              "?"
            ) : (
              <ScoreNumber
                value={preview.chips}
                animate={!!scoreStep && animateNumbers}
                duration={
                  scoreStep?.phase === "deal"
                    ? 0
                    : Math.min(220, (scoreStep?.duration ?? 0) * 0.75)
                }
              />
            )}
          </strong>
          <span>×</span>
          <strong className="rg-mult-value">
            {hidden ? (
              "?"
            ) : (
              <ScoreNumber
                value={preview.mult}
                animate={!!scoreStep && animateNumbers}
                duration={
                  scoreStep?.phase === "deal"
                    ? 0
                    : Math.min(220, (scoreStep?.duration ?? 0) * 0.75)
                }
              />
            )}
          </strong>
        </div>
        <small>
          {scoreStep
            ? "正在逐项结算筹码与倍率"
            : s.selected.length
              ? "牌型基础值 · 出牌时叠加卡牌与小丑"
              : s.lastHand
                ? "上一手的最终筹码与倍率"
                : "筹码 × 倍率 = 本手得分"}
        </small>
      </section>
      <div className="rg-counters">
        <div>
          <span>出牌</span>
          <b className="rg-blue">{s.handsLeft}</b>
        </div>
        <div>
          <span>弃牌</span>
          <b className="rg-coral">{s.discardsLeft}</b>
        </div>
        <div className="rg-money-counter">
          <span>资金</span>
          <b>${number(s.money)}</b>
        </div>
      </div>
      <div className="rg-round-counters">
        <span>
          底注{" "}
          <b>
            {s.ante}
            <small> / {s.endless ? "∞" : "8"}</small>
          </b>
        </span>
        <span>
          关卡 <b>{s.round}</b>
        </span>
      </div>
      <div className="rg-sidebar-links">
        <button onClick={onReference}>
          牌型速查 <span>↗</span>
        </button>
        <button onClick={onDeck}>
          查看牌组 <span>{s.deck.length} 张</span>
        </button>
        <button disabled={!s.lastHand || !!scoreStep} onClick={onTrace}>
          计分明细 <span>↗</span>
        </button>
        <button onClick={onNew}>
          新的一局 <span>↻</span>
        </button>
      </div>
      <div className="rg-run-seed">
        <span>SEED</span>
        <code>{s.config.seed}</code>
      </div>
    </aside>
  );
}

export function BlindSelection({ run: s, act }: { run: RunState; act: Act }) {
  const [tagDetails, setTagDetails] = useState<{
    name: string;
    desc: string;
  } | null>(null);
  return (
    <section className="rg-blind-selection">
      <div className="rg-stage-heading">
        <div>
          <span className="rg-overline">
            ANTE {String(s.ante).padStart(2, "0")}
          </span>
          <h2>选择你的下一步。</h2>
        </div>
        <span>小盲 → 大盲 → Boss</span>
      </div>
      <div className="rg-blind-cards">
        {[0, 1, 2].map((i) => {
          const current = s.blind === i,
            past = i < s.blind,
            tag = i < 2 ? TAG_MAP[s.skipTags[i]] : null;
          return (
            <article
              className={`rg-blind-card rg-blind-${i} ${current ? "rg-current-blind" : ""} ${past ? "rg-past-blind" : ""}`}
              key={i}
            >
              <div className="rg-blind-card-label">
                <span>
                  {i === 0
                    ? "SMALL BLIND"
                    : i === 1
                      ? "BIG BLIND"
                      : "BOSS BLIND"}
                </span>
                <b>{past ? "✓" : String(i + 1).padStart(2, "0")}</b>
              </div>
              <div className="rg-blind-token">
                <span>{i === 0 ? "♠" : i === 1 ? "♣" : "✦"}</span>
              </div>
              <h3>
                {i === 2
                  ? BOSS_MAP[s.boss].name
                  : i === 0
                    ? "小盲注"
                    : "大盲注"}
              </h3>
              <p className="rg-blind-required">
                至少得分<strong>{number(blindTarget(s, i))}</strong>
              </p>
              <p className="rg-blind-reward">
                奖励{" "}
                <b>
                  {"$".repeat(
                    i === 0
                      ? s.config.stake >= 1
                        ? 0
                        : 3
                      : i === 1
                        ? 4
                        : s.ante % 8 === 0
                          ? 8
                          : 5,
                  ) || "$0"}
                </b>
              </p>
              <p className="rg-blind-rule">
                {i === 2
                  ? bossDescription(s)
                  : i === 0
                    ? "从熟悉的牌型开始，攒下第一笔构筑资金。"
                    : "目标变高了。让你的牌组开始发挥作用。"}
              </p>
              <button
                className={`rg-button ${current ? "rg-primary" : ""}`}
                disabled={!current}
                onClick={() => act({ type: "startBlind" })}
              >
                {past ? "已结束" : current ? "选择盲注" : "等待前一关"}
              </button>
              {tag ? (
                <div className="rg-skip-blind">
                  <button
                    disabled={!current}
                    onClick={() => act({ type: "skipBlind" })}
                  >
                    跳过盲注 <span>→ {tag.name}</span>
                  </button>
                  <p className="rg-tag-description">{tag.desc}</p>
                  <button
                    className="rg-tag-details"
                    aria-label={`查看${tag.name}效果`}
                    onClick={() => setTagDetails(tag)}
                  >
                    标签效果 ↗
                  </button>
                </div>
              ) : (
                <div className="rg-boss-required">
                  这场对决，必须面对。
                  {s.vouchers.includes("director") && (
                    <button
                      disabled={
                        !canAfford(s, 10) ||
                        (!s.vouchers.includes("retcon") && s.bossRerolls > 0)
                      }
                      onClick={() => act({ type: "rerollBoss" })}
                    >
                      重抽 Boss · $10
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {!!s.tags.length && (
        <div className="rg-active-tags">
          <span>待兑现的标签</span>
          {s.tags
            .filter((t) => t in TAG_MAP)
            .map((t, i) => (
              <span title={TAG_MAP[t].desc} key={`${t}-${i}`}>
                {TAG_MAP[t].name}
              </span>
            ))}
        </div>
      )}
      {tagDetails && (
        <Dialog
          title={tagDetails.name}
          eyebrow="跳盲标签"
          onClose={() => setTagDetails(null)}
        >
          <p className="rg-offer-detail">{tagDetails.desc}</p>
        </Dialog>
      )}
    </section>
  );
}

export function HandArea({
  run: s,
  act,
  busy = false,
  pack = false,
  scoreStep,
  triggerId,
}: {
  run: RunState;
  act: Act;
  busy?: boolean;
  pack?: boolean;
  scoreStep?: ScoreStep;
  triggerId?: number;
}) {
  const selected = s.hand.filter((id) => s.selected.includes(id));
  const focus = s.deck.find((c) => c.uid === s.selected.at(-1));
  const focusIndex = focus ? s.hand.indexOf(focus.uid) : -1;
  return (
    <section
      className={`rg-hand-area ${pack ? "rg-pack-hand" : ""}`}
      aria-label="你的手牌"
    >
      <div className="rg-hand-toolbar">
        <span>
          {pack ? "选择要改造的手牌" : "你的手牌"}{" "}
          <b>
            {s.hand.length}/{handSize(s)}
          </b>
        </span>
        <div>
          <span>排序</span>
          <button
            aria-pressed={(s.handSort ?? "rank") === "rank"}
            disabled={busy}
            onClick={() => act({ type: "sort", by: "rank" })}
          >
            点数
          </button>
          <button
            aria-pressed={s.handSort === "suit"}
            disabled={busy}
            onClick={() => act({ type: "sort", by: "suit" })}
          >
            花色
          </button>
        </div>
      </div>
      <div className="rg-hand-scroller">
        <div
          className="rg-hand-row"
          style={{ "--hand-count": s.hand.length } as CSSProperties}
        >
          {s.hand.map((id, i) => {
            const c = s.deck.find((c) => c.uid === id)!;
            return (
              <button
                key={id}
                className={`rg-hand-card ${selected.includes(id) ? "rg-card-selected" : ""} ${cardDebuffed(s, c) && !c.faceDown ? "rg-card-debuffed" : ""} ${scoreStep?.trace?.card === id ? "rg-effect-active" : ""}`}
                data-card-id={id}
                aria-label={`${cardName(c)}${c.faceDown ? "" : `，${cardDetails(c)}`}${s.forcedCard === id ? "，必须选中" : ""}`}
                aria-pressed={selected.includes(id)}
                disabled={busy}
                onClick={() => act({ type: "select", uid: id })}
                style={{ "--deal-index": i, zIndex: i } as CSSProperties}
              >
                <div
                  className={`rg-trigger-face ${scoreStep?.trace?.card === id ? "rg-triggering" : ""}`}
                  key={scoreStep?.trace?.card === id ? triggerId : id}
                >
                  <RunCardFace card={c} />
                </div>
                {s.forcedCard === id && (
                  <span className="rg-forced-mark">必选</span>
                )}
                {cardDebuffed(s, c) && !c.faceDown && (
                  <span className="rg-debuff-mark">失效</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="rg-selected-note">
        {focus ? (
          <>
            <span>
              <b>{cardName(focus)}</b> · {cardDetails(focus)}
            </span>
            <div className="rg-card-order">
              <button
                disabled={busy || focusIndex === 0}
                aria-label="将选中手牌向左移动"
                onClick={() =>
                  act({ type: "moveCard", uid: focus.uid, direction: -1 })
                }
              >
                ←
              </button>
              <button
                disabled={busy || focusIndex === s.hand.length - 1}
                aria-label="将选中手牌向右移动"
                onClick={() =>
                  act({ type: "moveCard", uid: focus.uid, direction: 1 })
                }
              >
                →
              </button>
            </div>
          </>
        ) : (
          <span>
            {pack
              ? "点选下方手牌，再使用上方的塔罗或幻灵牌。"
              : "点选 1–5 张牌。只有组成牌型的牌参与计分。"}
          </span>
        )}
      </div>
      {!pack && (
        <div className="rg-hand-actions">
          <button
            className="rg-button rg-play-button"
            disabled={busy || !selected.length}
            onClick={() => act({ type: "play" })}
          >
            {busy ? "计分中…" : "出牌"} <small>Enter</small>
          </button>
          <span>
            已选 <b>{selected.length}</b> / 5
          </span>
          <button
            className="rg-button rg-discard-button"
            disabled={busy || !selected.length || s.discardsLeft <= 0}
            onClick={() => act({ type: "discard" })}
          >
            弃牌 <small>D</small>
          </button>
        </div>
      )}
      {!pack && (
        <div className="rg-deck-remaining">
          <span>♠</span>牌堆剩余 <b>{s.drawPile.length}</b> / {s.deck.length}
          <small>出牌、弃牌后自动补牌</small>
        </div>
      )}
    </section>
  );
}

export function PlayingStage({
  run: s,
  busy,
  onTrace,
  playback,
  animateNumbers = true,
  onSkip,
}: {
  run: RunState;
  busy: boolean;
  onTrace: () => void;
  playback?: ScorePlayback | null;
  animateNumbers?: boolean;
  onSkip?: () => void;
}) {
  const step = playback?.steps[playback.index];
  return (
    <section
      className={`rg-playing-stage ${busy ? "rg-scoring" : ""}`}
      data-score-phase={step?.phase}
      data-score-step={playback?.index}
    >
      <div className="rg-table-caption">
        <span>{blindName(s)}</span>
        <span>
          {playback ? (
            <>
              <span>
                计分 {playback.index + 1} / {playback.steps.length}
              </span>
              <button
                className="rg-skip-scoring"
                onClick={onSkip}
                aria-label="跳过计分动效"
              >
                跳过
              </button>
            </>
          ) : s.handsUsed ? (
            `第 ${s.handsUsed} 手`
          ) : (
            "GOOD LUCK, PLAYER."
          )}
        </span>
      </div>
      {s.blind === 2 && (
        <div className="rg-boss-notice">
          <span>✦ {BOSS_MAP[s.boss].name}</span>
          {s.bossDisabled ||
          s.jokers.some((j) => j.id === "chicot" && jokerActive(s, j))
            ? "能力已解除"
            : bossDescription(s)}
        </div>
      )}
      {s.lastHand ? (
        <div
          className="rg-last-hand"
          key={`${s.totalHands}-${s.lastHand.score}`}
        >
          <div
            className="rg-played-content"
            style={
              { "--played-count": s.lastHand.cards.length } as CSSProperties
            }
          >
            <div className="rg-last-cards">
              {s.lastHand.cards.map((c) => (
                <div
                  key={c.uid}
                  data-scored-card={c.uid}
                  className={
                    (s.lastHand!.scoring.includes(c.uid)
                      ? "rg-scored-card"
                      : "rg-unscored-card") +
                    (step?.trace?.card === c.uid ? " rg-effect-active" : "")
                  }
                >
                  <div
                    className={`rg-trigger-face ${step?.trace?.card === c.uid ? "rg-triggering" : ""}`}
                    key={step?.trace?.card === c.uid ? playback?.index : c.uid}
                  >
                    <RunCardFace card={c} showFace />
                  </div>
                </div>
              ))}
            </div>
            <div className={`rg-last-result ${step ? "rg-tally-result" : ""}`}>
              <span>{s.lastHand.name}</span>
              <strong
                className={
                  step?.phase === "total" || step?.phase === "bank"
                    ? "rg-score-total"
                    : undefined
                }
              >
                +
                <ScoreNumber
                  value={step?.subtotal ?? s.lastHand.score}
                  animate={!!step && animateNumbers}
                  duration={
                    step?.phase === "deal"
                      ? 0
                      : Math.min(300, (step?.duration ?? 0) * 0.75)
                  }
                  integer
                />
              </strong>
              {step ? (
                <ScoreCue step={step} key={playback!.index} />
              ) : (
                <button
                  onClick={onTrace}
                  aria-label={s.lastHand.blocked ?? "查看计分明细"}
                >
                  {s.lastHand.blocked ?? (
                    <>
                      <span className="rg-trace-expanded">查看计分明细</span>
                      <span className="rg-trace-compact">明细</span> ↗
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="rg-first-hand">
          <span>♠</span>
          <div>
            <h2>好戏，从这一手开始。</h2>
            <p>用有限的出牌次数，打破目标分数。</p>
          </div>
          <span>✧</span>
        </div>
      )}
      {playback && (
        <span className="rg-sr-only" role="status">
          正在结算这一手，结束后可继续操作。
        </span>
      )}
    </section>
  );
}

export function Cashout({
  run: s,
  act,
  busy,
}: {
  run: RunState;
  act: Act;
  busy: boolean;
}) {
  const p = s.payout!;
  const rows = [
    { label: "盲注奖励", amount: p.blind },
    { label: `剩余 ${s.handsLeft} 次出牌`, amount: p.hands },
    ...(p.discards ? [{ label: "剩余弃牌", amount: p.discards }] : []),
    ...p.extras,
    { label: "资金利息", amount: p.interest },
  ];
  return (
    <section className="rg-cashout">
      <span className="rg-overline">BLIND DEFEATED</span>
      <h2>过关，好牌！</h2>
      <p>
        {blindName(s)} · <b>{number(s.score)}</b> / {number(s.target)} 分
      </p>
      <div className="rg-receipt">
        <div className="rg-receipt-title">
          本关结算<span>ROUND {String(s.round).padStart(2, "0")}</span>
        </div>
        {rows.map((r, i) => (
          <div key={i}>
            <span>{r.label}</span>
            <b>
              {r.amount >= 0 ? "+" : "−"}${Math.abs(r.amount)}
            </b>
          </div>
        ))}
        <div className="rg-receipt-total">
          <span>收入合计</span>
          <strong>${p.total}</strong>
        </div>
      </div>
      <button
        className="rg-button rg-primary"
        disabled={busy}
        onClick={() => act({ type: "cashout" })}
      >
        领取 ${p.total}{" "}
        <span>→ {s.won && !s.endless ? "通关" : "进入商店"}</span>
      </button>
    </section>
  );
}

function OfferCard({
  run: s,
  offer: o,
  act,
  pack = false,
}: {
  run: RunState;
  offer: Offer;
  act: Act;
  pack?: boolean;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const reason = offerReason(s, o, pack);
  const name =
    o.kind === "joker"
      ? JOKERS[o.joker.id].name
      : o.kind === "card"
        ? cardName(o.card)
        : itemName(o.item);
  const desc =
    o.kind === "joker"
      ? JOKERS[o.joker.id].desc
      : o.kind === "card"
        ? cardDetails(o.card)
        : itemDescription(o.item);
  return (
    <article className={`rg-offer ${o.sold ? "rg-offer-sold" : ""}`}>
      <button
        className="rg-offer-art"
        aria-label={`查看${name}效果`}
        onClick={() => setShowDetails(true)}
      >
        {o.kind === "joker" ? (
          <JokerFace joker={o.joker} />
        ) : o.kind === "card" ? (
          <RunCardFace card={o.card} />
        ) : (
          <ConsumableFace item={o.item} />
        )}
        {o.sold && (
          <span className="rg-sold-stamp">{pack ? "已选取" : "已售出"}</span>
        )}
      </button>
      <div className="rg-offer-info">
        <h3>{name}</h3>
        <p>{desc}</p>
        {o.kind === "joker" && (
          <div className="rg-offer-modifiers">
            {EDITIONS[o.joker.edition]}
            {o.joker.eternal && " · 永恒"}
            {o.joker.perish !== null && " · 易腐 5 关"}
            {o.joker.rental && " · 租赁 $3/关"}
          </div>
        )}
      </div>
      <button
        className="rg-button rg-offer-buy"
        data-offer-id={o.uid}
        disabled={!!reason}
        title={reason ?? desc}
        onClick={() => act({ type: pack ? "pickPack" : "buy", uid: o.uid })}
        aria-label={
          reason
            ? `${name}：${reason}`
            : `${pack ? "选取" : "购买"}${name}${pack ? "" : ` $${offerPrice(s, o)}`}`
        }
      >
        {reason ??
          (pack
            ? o.kind === "joker" || o.kind === "card"
              ? "选取"
              : "立即使用"
            : `购买 · $${offerPrice(s, o)}`)}
      </button>
      {showDetails && (
        <Dialog
          title={name}
          eyebrow="卡牌效果"
          onClose={() => setShowDetails(false)}
        >
          <p className="rg-offer-detail">{desc}</p>
          {o.kind === "joker" && (
            <p className="rg-offer-detail">
              {EDITIONS[o.joker.edition]}
              {o.joker.eternal && " · 永恒"}
              {o.joker.perish !== null && " · 易腐 5 关"}
              {o.joker.rental && " · 租赁 $3/关"}
            </p>
          )}
          <p className="rg-offer-detail">
            {reason ??
              (pack ? "关闭详情后选取此牌。" : `售价 $${offerPrice(s, o)}`)}
          </p>
        </Dialog>
      )}
    </article>
  );
}

export function Shop({ run: s, act }: { run: RunState; act: Act }) {
  const shop = s.shop!;
  return (
    <section className="rg-shop">
      <div className="rg-stage-heading">
        <div>
          <span className="rg-overline">THE LUCKY SHOP</span>
          <h2>给好运，加点筹码。</h2>
        </div>
        <button
          className="rg-button rg-primary"
          onClick={() => act({ type: "leaveShop" })}
        >
          下一盲注 <span>→</span>
        </button>
      </div>
      <div className="rg-shop-main">
        <div className="rg-shop-shelf">
          <div className="rg-shelf-heading">
            <span>本次上架</span>
            <button
              className="rg-button rg-reroll"
              disabled={!canAfford(s, rerollPrice(s))}
              onClick={() => act({ type: "reroll" })}
            >
              ↻ 刷新 · ${rerollPrice(s)}
            </button>
          </div>
          <div className="rg-shop-offers">
            {shop.offers.map((o) => (
              <OfferCard run={s} offer={o} act={act} key={o.uid} />
            ))}
          </div>
        </div>
        <div className="rg-voucher-shelf">
          <span className="rg-shelf-label">优惠券 · 本局永久生效</span>
          {shop.voucherIds.length ? (
            shop.voucherIds.map((id) => (
              <article className="rg-voucher" key={id}>
                <span>VOUCHER</span>
                <b>✂</b>
                <h3>{VOUCHER_MAP[id].name}</h3>
                <p>{VOUCHER_MAP[id].desc}</p>
                <button
                  className="rg-button"
                  disabled={!canAfford(s, voucherPrice(s))}
                  onClick={() => act({ type: "voucher", id })}
                >
                  兑换 · ${voucherPrice(s)}
                </button>
              </article>
            ))
          ) : (
            <div className="rg-voucher-empty">
              本底注优惠券已兑换
              <br />
              <span>新的底注会带来新的优惠券。</span>
            </div>
          )}
        </div>
      </div>
      <div className="rg-pack-shelf">
        <div>
          <span className="rg-overline">A LITTLE SURPRISE</span>
          <h3>拆开未知。</h3>
          <p>
            每包都有随机内容，
            <br />
            为你的构筑找一块新拼图。
          </p>
        </div>
        {shop.packs.map((p) => (
          <article
            className={`rg-pack-offer ${p.sold ? "rg-offer-sold" : ""}`}
            key={p.uid}
          >
            <PackFace pack={p} />
            <div>
              <b>
                {p.size === "jumbo" ? "巨型" : p.size === "mega" ? "超级" : ""}
                {PACK_NAMES[p.kind]}
              </b>
              <p>
                随机{" "}
                {p.size === "normal"
                  ? p.kind === "buffoon" || p.kind === "spectral"
                    ? 2
                    : 3
                  : p.kind === "buffoon" || p.kind === "spectral"
                    ? 4
                    : 5}{" "}
                张 · 选 {p.size === "mega" ? 2 : 1} 张
              </p>
              <button
                className="rg-button"
                data-pack-id={p.uid}
                disabled={p.sold || !canAfford(s, packPrice(s, p))}
                onClick={() => act({ type: "openPack", uid: p.uid })}
              >
                {p.sold ? "已打开" : `打开 · $${packPrice(s, p)}`}
              </button>
            </div>
          </article>
        ))}
      </div>
      <p className="rg-shop-note">
        小丑槽位满了？点按上方持有的小丑，可以出售或调整顺序。
      </p>
    </section>
  );
}

export function PackSelection({ run: s, act }: { run: RunState; act: Act }) {
  const p = s.pack!;
  return (
    <section className="rg-pack-selection">
      <div className="rg-stage-heading">
        <div>
          <span className="rg-overline">CHOOSE YOUR LUCK</span>
          <h2>{PACK_NAMES[p.kind]}</h2>
        </div>
        <span>
          还可选择 <b>{p.picks}</b> 张
        </span>
      </div>
      <p className="rg-pack-instruction">
        {["arcana", "spectral"].includes(p.kind)
          ? "需要改造卡牌时，先选中下方手牌，再点击「立即使用」。"
          : p.kind === "celestial"
            ? "选中的星球牌立即升级对应牌型。"
            : p.kind === "buffoon"
              ? "选取的小丑加入你的构筑，需要有空槽位。"
              : "选取的扑克牌永久加入你的牌组。"}
      </p>
      <div className="rg-pack-choices">
        {p.choices.map((o) => (
          <OfferCard run={s} offer={o} act={act} pack key={o.uid} />
        ))}
      </div>
      {s.hand.length > 0 && <HandArea run={s} act={act} pack />}
      <button
        className="rg-button rg-skip-pack"
        onClick={() => act({ type: "skipPack" })}
      >
        {p.choices.some((o) => o.sold) ? "跳过剩余选牌" : "跳过这个卡包"} →
      </button>
    </section>
  );
}

export function RunEnd({
  run: s,
  act,
  onNew,
}: {
  run: RunState;
  act: Act;
  onNew: () => void;
}) {
  const won = s.phase === "won";
  return (
    <section className={`rg-end ${won ? "rg-end-won" : ""}`}>
      <span className="rg-end-emblem">{won ? "✦" : "♠"}</span>
      <span className="rg-overline">
        {won ? "A RUN TO REMEMBER" : "EVERY RUN IS A NEW STORY"}
      </span>
      <h2>{won ? "好戏，才刚开始。" : "这一局，到这里。"}</h2>
      <p>
        {won
          ? "你击败了第 8 底注的 Boss。下一步，向无尽进发。"
          : `止步第 ${s.ante} 底注 · ${blindName(s)}。下一次，会有另一种可能。`}
      </p>
      <div className="rg-end-stats">
        <span>
          最佳单手<b>{number(s.bestHand)}</b>
        </span>
        <span>
          总得分<b>{number(s.totalScore)}</b>
        </span>
        <span>
          完成出牌<b>{s.totalHands}</b>
        </span>
      </div>
      <div className="rg-end-seed">
        本局种子 <code>{s.config.seed}</code>
      </div>
      <div className="rg-end-actions">
        {won && (
          <button
            className="rg-button rg-primary"
            onClick={() => act({ type: "endless" })}
          >
            继续无尽模式 →
          </button>
        )}
        <button
          className={`rg-button ${won ? "" : "rg-primary"}`}
          onClick={onNew}
        >
          再开一局 ↻
        </button>
      </div>
    </section>
  );
}

export function InspectContent({
  run: s,
  inspect,
  act,
}: {
  run: RunState;
  inspect: Inspect;
  act: Act;
}) {
  const allowed = ["blind", "playing", "shop", "pack"].includes(s.phase);
  if (inspect.kind === "joker") {
    const j = s.jokers.find((j) => j.uid === inspect.uid);
    if (!j) return <p>这张小丑已经离开牌桌。</p>;
    const index = s.jokers.indexOf(j),
      meta = JOKERS[j.id],
      hidden = bossIs(s, "acorn");
    return (
      <div className="rg-inspect">
        <div className="rg-inspect-art">
          <JokerFace joker={j} hidden={hidden} />
        </div>
        <div>
          <span className="rg-overline">
            {hidden
              ? `JOKER ${index + 1}`
              : `${RARITIES[meta.rarity - 1]} · 小丑牌`}
          </span>
          <h3>{hidden ? "背面朝上的小丑" : meta.name}</h3>
          <p>
            {hidden
              ? "琥珀橡果打乱了小丑顺序，并将它们翻面。你仍然可以调整位置或出售。"
              : meta.desc}
          </p>
          {!hidden && (
            <>
              <strong className="rg-inspect-current">
                {jokerStatus(j, s)}
              </strong>
              <p className="rg-edition-description">{EDITIONS[j.edition]}</p>
              {j.eternal && <p>永恒：不可出售或摧毁。</p>}
              {j.perish !== null && (
                <p>易腐：{j.perish ? `${j.perish} 关后失效。` : "已失效。"}</p>
              )}
              {j.rental && <p>租赁：每关支付 $3。</p>}
            </>
          )}
          <div className="rg-inspect-order">
            <button
              className="rg-button"
              disabled={index === 0}
              onClick={() =>
                act({ type: "moveJoker", uid: j.uid, direction: -1 })
              }
            >
              ← 向左
            </button>
            <span>
              位置 {index + 1}/{s.jokers.length}
            </span>
            <button
              className="rg-button"
              disabled={index === s.jokers.length - 1}
              onClick={() =>
                act({ type: "moveJoker", uid: j.uid, direction: 1 })
              }
            >
              向右 →
            </button>
          </div>
          <button
            className="rg-button rg-sell-button"
            disabled={!allowed || j.eternal}
            onClick={() => act({ type: "sellJoker", uid: j.uid })}
          >
            {j.eternal ? "永恒 · 不可出售" : `出售 · $${sellJokerValue(j)}`}
          </button>
        </div>
      </div>
    );
  }
  const c = s.consumables.find((c) => c.uid === inspect.uid);
  if (!c) return <p>这张消耗牌已被使用。</p>;
  const reason = useReason(s, c);
  return (
    <div className="rg-inspect">
      <div className="rg-inspect-art">
        <ConsumableFace item={c} />
      </div>
      <div>
        <span className="rg-overline">
          {itemKind(c)}
          {c.negative ? " · 负片，不占用槽位" : ""}
        </span>
        <h3>{itemName(c)}</h3>
        <p>{itemDescription(c)}</p>
        {reason && (
          <p className="rg-use-reason">
            {reason}
            {reason.includes("选")
              ? "关闭此窗口，先在牌桌选中要改造的手牌。"
              : ""}
          </p>
        )}
        {!reason && s.selected.length > 0 && (
          <p>
            已选：
            {s.hand
              .filter((id) => s.selected.includes(id))
              .map((id) => cardName(s.deck.find((c) => c.uid === id)!))
              .join("、")}
          </p>
        )}
        <div className="rg-consumable-actions">
          <button
            className="rg-button rg-primary"
            disabled={!!reason}
            onClick={() => act({ type: "use", uid: c.uid })}
          >
            使用这张牌
          </button>
          <button
            className="rg-button rg-sell-button"
            disabled={!allowed}
            onClick={() => act({ type: "sellConsumable", uid: c.uid })}
          >
            出售 · ${sellConsumableValue(c)}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ScoreTrace({ run: s }: { run: RunState }) {
  const hand = s.lastHand;
  if (!hand) return <p>打出第一手牌后，这里会记录完整的计分过程。</p>;
  return (
    <div className="rg-trace">
      <div className="rg-trace-total">
        <span>
          {hand.name} · Lv.{hand.level}
        </span>
        <strong>
          <span className="rg-blue">{number(hand.chips)}</span> ×{" "}
          <span className="rg-coral">{number(hand.mult)}</span> ={" "}
          {number(hand.score)}
        </strong>
      </div>
      {hand.blocked && (
        <p className="rg-use-reason">{hand.blocked}，本手得分为 0。</p>
      )}
      <p>
        先计算牌型，再按顺序结算打出的牌、留在手中的牌和小丑。倍率乘算的位置会改变结果。
      </p>
      <ol>
        {hand.trace.map((t, i) => (
          <li key={i}>
            <span>{t.label}</span>
            <b>
              {t.chips !== undefined && (
                <span className="rg-blue">
                  {i ? "+" : ""}
                  {number(t.chips)} 筹码{" "}
                </span>
              )}
              {t.mult !== undefined && (
                <span className="rg-coral">
                  {i ? "+" : ""}
                  {number(t.mult)} 倍率{" "}
                </span>
              )}
              {t.factor !== undefined && (
                <span className="rg-coral">×{number(t.factor)} </span>
              )}
              {t.money !== undefined && (
                <span className="rg-gold">
                  {t.money > 0 ? "+" : ""}${t.money}
                </span>
              )}
            </b>
          </li>
        ))}
      </ol>
    </div>
  );
}

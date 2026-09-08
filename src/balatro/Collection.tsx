import { useState } from "react";
import { SUITS, SUIT_SYMBOL } from "../poker";
import {
  BOSSES,
  ENHANCEMENTS,
  HANDS,
  HAND_IDS,
  JOKER_LIST,
  RARITIES,
  SEALS,
  SPECTRALS,
  TAROTS,
  VOUCHERS,
} from "./data";
import { handValues } from "./engine";
import { JokerArt, RunCardFace } from "./CardArt";
import { cardDetails, cardName, number } from "./presentation";
import type { RunState } from "./types";

type Tab =
  | "jokers"
  | "hands"
  | "tarot"
  | "spectral"
  | "vouchers"
  | "bosses"
  | "modifiers";
const tabs: [Tab, string][] = [
  ["jokers", "小丑"],
  ["hands", "牌型 / 星球"],
  ["tarot", "塔罗"],
  ["spectral", "幻灵"],
  ["vouchers", "优惠券"],
  ["bosses", "Boss"],
  ["modifiers", "卡牌效果"],
];
const examples = [
  "最高一张牌",
  "两张相同点数",
  "两组不同对子",
  "三张相同点数",
  "五张连续点数",
  "五张相同花色",
  "三条 + 一对",
  "四张相同点数",
  "同花 + 顺子",
  "五张相同点数",
  "同花 + 葫芦",
  "同花 + 五条",
];

export function Collection({
  run,
  initialTab = "jokers",
}: {
  run: RunState | null;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [query, setQuery] = useState("");
  const [rarity, setRarity] = useState(0);
  const matches = (name: string, desc: string) =>
    `${name} ${desc}`.toLowerCase().includes(query.trim().toLowerCase());
  const jokers = JOKER_LIST.filter(
    (j) => (!rarity || j.rarity === rarity) && matches(j.name, j.desc),
  );
  const generic =
    tab === "tarot"
      ? TAROTS
      : tab === "spectral"
        ? SPECTRALS
        : tab === "vouchers"
          ? VOUCHERS
          : BOSSES;
  return (
    <div className="rg-collection">
      <div className="rg-reference-tabs" role="tablist" aria-label="图鉴分类">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => {
              setTab(id);
              setQuery("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "hands" ? (
        <>
          <p className="rg-reference-intro">
            出牌使用其中最大的牌型。每张星球牌提升对应牌型 1
            级；五条、同花葫芦和同花五条需改造牌组才能组成。
          </p>
          <div className="rg-hands-table-wrap">
            <table className="rg-hands-table">
              <thead>
                <tr>
                  <th>牌型 / 星球</th>
                  <th>组成</th>
                  <th>等级</th>
                  <th>筹码 × 倍率</th>
                  <th>每级成长</th>
                </tr>
              </thead>
              <tbody>
                {[...HAND_IDS].reverse().map((id) => {
                  const h = HANDS[id],
                    values = run ? handValues(run, id) : h;
                  return (
                    <tr key={id}>
                      <td>
                        <b>{h.name}</b>
                        <small>{h.planet}</small>
                      </td>
                      <td>{examples[HAND_IDS.indexOf(id)]}</td>
                      <td>Lv.{run?.levels[id] ?? 1}</td>
                      <td>
                        <b className="rg-blue">{number(values.chips)}</b> ×{" "}
                        <b className="rg-coral">{number(values.mult)}</b>
                      </td>
                      <td>
                        <span className="rg-blue">+{h.addChips}</span> /{" "}
                        <span className="rg-coral">+{h.addMult}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="rg-reference-intro">
            A 可以接 K，也可以接 2；顺子不能跨过 A 环绕。普通牌筹码：A 为
            11，J/Q/K 为
            10，其余等于点数。打出的闲牌不计分，石头牌和「飞溅」例外。
          </p>
        </>
      ) : tab === "modifiers" ? (
        <div className="rg-reference-grid">
          {Object.entries(ENHANCEMENTS)
            .filter(([id]) => id !== "base")
            .map(([id, desc]) => (
              <article key={id}>
                <h3>{desc.split(" · ")[0]}</h3>
                <p>{desc.split(" · ")[1]}</p>
              </article>
            ))}
          {Object.entries(SEALS)
            .filter(([id]) => id !== "none")
            .map(([id, desc]) => (
              <article key={id}>
                <h3>{desc.split(" · ")[0]}</h3>
                <p>{desc.split(" · ")[1]}</p>
              </article>
            ))}
          <article>
            <h3>特殊版本</h3>
            <p>
              闪箔 +50 筹码；镭射 +10 倍率；多彩 ×1.5
              倍率；负片让这张牌不占用原有槽位。
            </p>
          </article>
          <article>
            <h3>高注贴纸</h3>
            <p>
              黑注起可能永恒；橙注起可能易腐，5
              关后失效；金注起可能租赁，每关支付 $3。
            </p>
          </article>
        </div>
      ) : (
        <>
          <div className="rg-reference-filter">
            <input
              aria-label="搜索图鉴"
              placeholder="搜索名称或效果，例如：概率、倍率、红桃"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {tab === "jokers" && (
              <select
                aria-label="小丑稀有度"
                value={rarity}
                onChange={(e) => setRarity(Number(e.target.value))}
              >
                <option value={0}>全部稀有度</option>
                {RARITIES.map((name, i) => (
                  <option key={name} value={i + 1}>
                    {name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {tab === "jokers" ? (
            <>
              <p className="rg-reference-intro">
                150 张小丑全卡池开放。普通 / 非普通 / 稀有按 70% / 25% / 5%
                抽取；传奇由稀有的「灵魂」生成。部分小丑需要先满足牌组条件。
              </p>
              <div className="rg-reference-grid rg-joker-reference">
                {jokers.map((j) => (
                  <article key={j.id}>
                    <JokerArt id={j.id} />
                    <div>
                      <span>
                        {RARITIES[j.rarity - 1]} · ${j.cost}
                      </span>
                      <h3>{j.name}</h3>
                      <p>{j.desc}</p>
                      {run?.discovered.includes(`joker:${j.id}`) && (
                        <small className="rg-discovered">本局已发现</small>
                      )}
                    </div>
                  </article>
                ))}
              </div>
              {!jokers.length && (
                <p className="rg-empty-search">
                  没有匹配的小丑，换个关键词试试。
                </p>
              )}
            </>
          ) : (
            <div className="rg-reference-grid">
              {generic
                .filter((m) => matches(m.name, m.desc))
                .map((m) => (
                  <article key={m.id}>
                    <h3>{m.name}</h3>
                    <p>{m.desc}</p>
                    {"requires" in m && m.requires && (
                      <small>
                        需先兑换：
                        {VOUCHERS.find((v) => v.id === m.requires)?.name}
                      </small>
                    )}
                  </article>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function DeckReference({ run: s }: { run: RunState }) {
  const [suit, setSuit] = useState("all");
  const cards = [...s.deck]
    .filter((c) => suit === "all" || c.suit === suit)
    .sort(
      (a, b) =>
        SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || b.rank - a.rank,
    );
  return (
    <div className="rg-deck-reference">
      <p>
        牌组共 <b>{s.deck.length}</b>{" "}
        张。这里按花色与点数展示构筑内容，不代表实际抽牌顺序。
      </p>
      <div className="rg-reference-tabs" role="group" aria-label="筛选牌组花色">
        <button aria-pressed={suit === "all"} onClick={() => setSuit("all")}>
          全部
        </button>
        {SUITS.map((suitId) => (
          <button
            aria-pressed={suit === suitId}
            key={suitId}
            onClick={() => setSuit(suitId)}
          >
            {SUIT_SYMBOL[suitId]}{" "}
            {s.deck.filter((c) => c.suit === suitId).length}
          </button>
        ))}
      </div>
      <div className="rg-deck-grid">
        {cards.map((c) => (
          <div key={c.uid}>
            <RunCardFace card={c} showFace />
            <b>{cardName({ ...c, faceDown: false })}</b>
            <small>{cardDetails({ ...c, faceDown: false })}</small>
          </div>
        ))}
      </div>
      <div className="rg-owned-vouchers">
        <h3>已兑换优惠券 · {s.vouchers.length}</h3>
        {s.vouchers.length ? (
          s.vouchers.map((id) => (
            <p key={id}>
              <b>{VOUCHERS.find((v) => v.id === id)?.name}</b> ·{" "}
              {VOUCHERS.find((v) => v.id === id)?.desc}
            </p>
          ))
        ) : (
          <p>在商店兑换优惠券，获得持续整局的效果。</p>
        )}
      </div>
    </div>
  );
}

export function RulesContent() {
  return (
    <div className="rg-rules">
      <p className="rg-rules-lead">
        以扑克牌型得分，用随机小丑构筑连锁效果。击败第 8 底注的 Boss 即可通关。
      </p>
      <ol>
        <li>
          <b>选择盲注</b>
          <p>
            每个底注包含小盲、大盲和 Boss。小盲与大盲可以跳过换取标签奖励；Boss
            必须击败。
          </p>
        </li>
        <li>
          <b>选 1–5 张牌，出牌或弃牌</b>
          <p>
            基础手牌上限为 8 张，每关 4 次出牌、3
            次弃牌；牌组和小丑会改变次数。出牌后补齐手牌，只计算组成牌型的牌，达到目标立即过关。
          </p>
        </li>
        <li>
          <b>筹码 × 倍率，越叠越高</b>
          <p>
            先计算牌型基础值，再从左到右结算卡牌、留在手中的牌、小丑。+倍率和
            ×倍率的顺序很关键。点按小丑可以调换位置。
          </p>
        </li>
        <li>
          <b>过关拿钱，商店补强</b>
          <p>
            盲注奖金、剩余出牌和利息构成收入。每持有 $5 产生 $1 利息，基础上限
            $5。购买小丑，使用星球升级牌型，用塔罗与幻灵改造牌组。
          </p>
        </li>
        <li>
          <b>接受随机，也创造机会</b>
          <p>
            洗牌、Boss、标签、商品、卡包和概率效果都由本局种子决定。相同种子配合相同牌组、注级与操作，可重复相同路线；继续游戏会保留随机进度。
          </p>
        </li>
      </ol>
      <div className="rg-keyboard-help">
        <span>
          <kbd>1–9</kbd> 选牌
        </span>
        <span>
          <kbd>Enter</kbd> 出牌
        </span>
        <span>
          <kbd>D</kbd> 弃牌
        </span>
        <span>
          <kbd>Esc</kbd> 关闭弹窗
        </span>
      </div>
      <p>
        游戏每步自动保存到当前浏览器。回到大厅后，可再次进入闯关模式继续。此模式使用独立的牌组和存档。
      </p>
    </div>
  );
}

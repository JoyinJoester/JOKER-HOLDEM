import {
  JOKERS,
  JOKER_IDS,
  MODE_META,
  MODE_ORDER,
  RAINBOW_PERCENT,
  SHOP_PRICES,
  type JokerId,
} from "./modes";
import { HAND_NAMES, money, type GameState, type ShopAction } from "./poker";
import { Icon, Portrait } from "./visuals";

function JokerFace({
  id,
  compact = false,
}: {
  id: JokerId;
  compact?: boolean;
}) {
  const joker = JOKERS[id];
  return (
    <div
      className={`collectible-joker joker-${id} ${compact ? "compact-joker" : ""}`}
      style={{ "--joker-color": joker.color } as React.CSSProperties}
    >
      <span className="collectible-type">JOKER</span>
      <span className="collectible-glyph">{joker.glyph}</span>
      {id === "joker" && <Portrait character={1} />}
      <span className="collectible-name">{joker.name}</span>
      <span className="collectible-corner">{joker.glyph}</span>
    </div>
  );
}

export function JokerRack({
  game,
  seat,
  onOpen,
}: {
  game: GameState;
  seat: number;
  onOpen: () => void;
}) {
  const player = game.players[seat];
  return (
    <section className="joker-rack">
      <div className="rack-title">
        <span>
          你的小丑牌 <b>{player.jokers.length}/3</b>
        </span>
        <span className="coin-counter">◈ {player.coins}</span>
      </div>
      <button
        className="rack-cards"
        onClick={onOpen}
        aria-label={game.shop ? "返回小丑商店" : "查看小丑效果"}
      >
        {player.jokers.map((id, i) => (
          <JokerFace key={`${id}-${i}`} id={id} compact />
        ))}
        {Array.from({ length: 3 - player.jokers.length }, (_, i) => (
          <span className="empty-joker-slot" key={i}>
            +
          </span>
        ))}
      </button>
      <p>
        {game.shop
          ? "商店营业中 · 点此购买与出售"
          : "持有即生效 · 每手结束后逛商店"}
      </p>
    </section>
  );
}

export function JokerShop({
  game,
  seat,
  onAction,
  busy,
}: {
  game: GameState;
  seat: number;
  onAction: (action: ShopAction) => void;
  busy: boolean;
}) {
  const player = game.players[seat];
  const locked = busy || player.ready || player.stack <= 0;
  const readyCount = game.players.filter((p) => p.stack > 0 && p.ready).length;
  const liveCount = game.players.filter((p) => p.stack > 0).length;
  return (
    <div className="joker-shop">
      <div className="shop-wallet">
        <div>
          <span>你的小丑币</span>
          <strong>◈ {player.coins}</strong>
        </div>
        <p>
          每手 +2 币，赢家额外 +3 币。
          <br />
          <span>小丑币与下注筹码分别计算。</span>
        </p>
      </div>
      <div className="shop-section-label">
        <span>
          公共货架 <small>其他牌手也能购买</small>
        </span>
        <button
          className="small-button"
          onClick={() => onAction({ type: "refresh" })}
          disabled={locked || player.coins < SHOP_PRICES.refresh}
        >
          <Icon name="reset" size={12} />
          刷新 · 1 币
        </button>
      </div>
      <div className="shop-offers">
        {game.shop?.offers.map((id) => (
          <article className="shop-offer" key={id}>
            <JokerFace id={id} />
            <p>{JOKERS[id].desc}</p>
            <button
              className="small-button buy-joker"
              aria-label={`购买${JOKERS[id].name}`}
              disabled={
                locked ||
                player.coins < SHOP_PRICES.buy ||
                player.jokers.length >= SHOP_PRICES.slots
              }
              onClick={() => onAction({ type: "buy", jokerId: id })}
            >
              购买 <span>◈ 5</span>
            </button>
          </article>
        ))}
        {game.shop?.offers.length === 0 && (
          <div className="sold-out">
            这一批已经售罄。<span>花 1 枚小丑币，刷新公共货架。</span>
          </div>
        )}
      </div>
      <div className="shop-section-label">
        <span>
          你持有的小丑 <small>{player.jokers.length} / 3 个位置</small>
        </span>
        <span>出售返还 2 币</span>
      </div>
      <div className="shop-inventory">
        {player.jokers.map((id, index) => (
          <div className="inventory-joker" key={`${id}-${index}`}>
            <span style={{ color: JOKERS[id].color }}>{JOKERS[id].glyph}</span>
            <div>
              <strong>{JOKERS[id].name}</strong>
              <small>{JOKERS[id].desc}</small>
            </div>
            <button
              className="text-button"
              aria-label={`出售${JOKERS[id].name}`}
              disabled={locked}
              onClick={() => onAction({ type: "sell", jokerId: id })}
            >
              出售
            </button>
          </div>
        ))}
        {!player.jokers.length && (
          <p className="empty-inventory">还没有小丑牌，去货架上挑一张吧。</p>
        )}
      </div>
      <div className="shop-ready-row">
        <div>
          <span>
            {readyCount} / {liveCount} 位牌手已准备
          </span>
          <p>全部准备后，自动开始下一手。</p>
        </div>
        <button
          className="primary-button"
          disabled={locked}
          onClick={() => onAction({ type: "ready" })}
        >
          {player.stack <= 0
            ? "正在观战"
            : player.ready
              ? "已准备，等其他人…"
              : "准备，继续发牌"}
          <Icon name="check" />
        </button>
      </div>
    </div>
  );
}

export function ModeReference({ game }: { game: GameState }) {
  return (
    <div className="mode-reference">
      <p className="mode-rule-summary">
        当前模式：<strong>{MODE_META[game.config.mode].name}</strong> · 起始 $
        {money(MODE_META[game.config.mode].buyIn)} ·{" "}
        {game.config.mode === "blitz" ? "每手" : "每 4 手"}盲注翻倍
      </p>
      {game.config.mode === "jokers" ? (
        <>
          {JOKER_IDS.map((id) => (
            <div className="joker-rule-row" key={id}>
              <span style={{ color: JOKERS[id].color }}>
                {JOKERS[id].glyph}
              </span>
              <div>
                <strong>{JOKERS[id].name}</strong>
                <p>{JOKERS[id].desc}</p>
              </div>
            </div>
          ))}
          <p className="rule-footnote">
            首手赠送 1 张小丑牌和 4 枚小丑币。每手后进入商店：买牌 5 币、出售 2
            币、刷新公共货架 1 币。最多持有 3
            张，同款可叠加；落败返还合计不超过本手投入，弃牌不触发返还。额外奖励由牌桌发放；赏金由其他牌手支付。
          </p>
        </>
      ) : game.config.mode === "rainbow" ? (
        <>
          <div className="rainbow-multipliers">
            {HAND_NAMES.map((name, i) => (
              <div key={name}>
                <span>{i === 8 ? "同花顺 / 皇家同花顺" : name}</span>
                <strong>×{RAINBOW_PERCENT[i] / 100}</strong>
              </div>
            ))}
          </div>
          <p className="rule-footnote">
            仅摊牌获胜触发倍率。先按正常规则分配主池、边池和平局份额，再按自己实际赢得的底池份额发放额外奖励。未被跟注的退回筹码不参与倍率。
          </p>
        </>
      ) : (
        <>
          {MODE_ORDER.map((mode) => (
            <div className="mode-rule-card" key={mode}>
              <span style={{ color: MODE_META[mode].accent }}>
                {MODE_META[mode].glyph}
              </span>
              <div>
                <strong>{MODE_META[mode].name}</strong>
                <p>{MODE_META[mode].detail}</p>
              </div>
            </div>
          ))}
          <p className="rule-footnote">
            所有模式都支持 1–5 个 AI 对手与 2–6
            人联机。房主可在开局前切换模式、人数、AI 难度及空位补位方式。
          </p>
        </>
      )}
    </div>
  );
}

export function BonusSummary({
  game,
  seat,
}: {
  game: GameState;
  seat: number;
}) {
  const bonuses = game.bonuses.filter((b) => b.playerId === seat);
  if (!bonuses.length) return null;
  return (
    <div className="bonus-summary" aria-label="本手模式加成">
      {bonuses.map((bonus, index) => (
        <span key={index} className={bonus.amount < 0 ? "negative-bonus" : ""}>
          <i>
            {bonus.source === "rainbow"
              ? "◈"
              : bonus.source === "bounty-tax"
                ? "−"
                : JOKERS[bonus.source].glyph}
          </i>
          {bonus.label}
          <strong>
            {bonus.amount >= 0 ? "+" : "−"}${money(Math.abs(bonus.amount))}
          </strong>
        </span>
      ))}
    </div>
  );
}

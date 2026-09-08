import type { CSSProperties } from "react";
import { PlayingCard } from "../visuals";
import {
  HANDS,
  JOKERS,
  PACK_COLORS,
  PACK_NAMES,
  RARITIES,
  RARITY_COLORS,
} from "./data";
import { itemKind, itemName } from "./presentation";
import type { Consumable, HandId, Joker, PackOffer, RunCard } from "./types";

const hash = (id: string) =>
  [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
const palettes = [
  ["#d77862", "#2f655c", "#f0cc82"],
  ["#77abc8", "#344b64", "#e1ae83"],
  ["#91aa7b", "#395648", "#e1c795"],
  ["#b698bf", "#59496b", "#d7aa8b"],
  ["#d9a462", "#704b3e", "#92bcb0"],
  ["#b8beb6", "#3b6765", "#ed8d72"],
];

export function JokerArt({ id }: { id: string }) {
  const h = hash(id),
    [main, dark, light] = palettes[h % palettes.length];
  return (
    <svg
      className="rg-joker-art"
      viewBox="0 0 60 56"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect width="60" height="56" fill={main} />
      {Array.from({ length: 12 }, (_, i) => (
        <rect
          key={i}
          x={(i * 17 + (h % 11)) % 60}
          y={(i * 13 + (h % 7)) % 56}
          width="4"
          height="4"
          fill={light}
          opacity=".25"
        />
      ))}
      <path d="M0 0h60v4H0zM0 52h60v4H0z" fill={dark} opacity=".4" />
      <path
        d="M15 22h30v18h-5v5H20v-5h-5zM9 16h9v10H9zm33 0h9v10h-9z"
        fill={dark}
      />
      <path d="M20 19h20v19h-4v6H24v-6h-4z" fill="#f1e5c7" />
      <path
        d={
          h % 2
            ? "M12 10h7V6h8v13h5V4h8v9h8v-5h5v17H9V15h3Z"
            : "M12 9h8v8h7V5h6v12h8V9h8v17H12Z"
        }
        fill={dark}
      />
      <path d="M16 12h5v13h-5zm13-4h5v17h-5zm14 8h5v9h-5z" fill={light} />
      <path d="M22 28h5v5h-5zm12 0h5v5h-5z" fill={dark} />
      <path
        d={h % 3 ? "M26 36h8v3h-8zm3-4h3v3h-3z" : "M24 35h3v3h6v-3h3v6H24Z"}
        fill={main}
      />
      <path d="M18 45h10v5h4v-5h10v4h6v7H12v-7h6z" fill={dark} />
      <path d="M22 46h6v5h-6zm10 0h6v5h-6z" fill={light} />
      <rect x="3" y="33" width="14" height="15" fill="#f1e5c7" />
      <text
        x="10"
        y="44"
        textAnchor="middle"
        fontSize="12"
        fill={dark}
        fontFamily="serif"
      >
        {JOKERS[id].glyph}
      </text>
      {JOKERS[id].rarity >= 3 && (
        <path d="M45 31h4v4h4v4h-4v4h-4v-4h-4v-4h4z" fill={light} />
      )}
    </svg>
  );
}

export function JokerFace({
  joker,
  hidden = false,
}: {
  joker: Pick<Joker, "id" | "edition" | "eternal" | "perish" | "rental">;
  hidden?: boolean;
}) {
  if (hidden)
    return (
      <div className="rg-special-card rg-mystery" aria-hidden="true">
        <span>?</span>
        <small>JOKER</small>
      </div>
    );
  const meta = JOKERS[joker.id];
  return (
    <div
      className={`rg-special-card rg-joker-face rg-edition-${joker.edition} ${joker.perish === 0 ? "rg-expired" : ""}`}
      style={
        { "--card-accent": RARITY_COLORS[meta.rarity - 1] } as CSSProperties
      }
      aria-hidden="true"
    >
      <div className="rg-card-top">
        <span>JOKER</span>
        <span>{String(meta.rarity).padStart(2, "0")}</span>
      </div>
      <JokerArt id={joker.id} />
      <b className="rg-card-name">{meta.name}</b>
      <small className="rg-card-rarity">{RARITIES[meta.rarity - 1]}</small>
      {(joker.eternal || joker.perish !== null || joker.rental) && (
        <div className="rg-stickers">
          {joker.eternal && <i>∞</i>}
          {joker.perish !== null && <i>{joker.perish}</i>}
          {joker.rental && <i>$</i>}
        </div>
      )}
    </div>
  );
}

export function ConsumableFace({ item }: { item: Consumable }) {
  const color =
    item.kind === "planet"
      ? HANDS[item.id as HandId].color
      : item.kind === "tarot"
        ? "#bd9acb"
        : "#91c7bf";
  const h = hash(item.id);
  return (
    <div
      className={`rg-special-card rg-consumable-face rg-${item.kind} ${item.negative ? "rg-edition-negative" : ""}`}
      style={{ "--card-accent": color } as CSSProperties}
      aria-hidden="true"
    >
      <div className="rg-card-top">
        <span>
          {item.kind === "planet"
            ? "PLANET"
            : item.kind === "tarot"
              ? "ARCANA"
              : "SPECTRAL"}
        </span>
        <span>✦</span>
      </div>
      <svg
        className="rg-consumable-art"
        viewBox="0 0 60 64"
        shapeRendering="crispEdges"
      >
        <path
          d="M7 7h2v2H7zm40 8h3v3h-3zM12 45h3v3h-3zm34 8h2v2h-2zM30 5h2v2h-2z"
          fill="#e5dcc3"
        />
        {item.kind === "planet" ? (
          <>
            <circle cx="30" cy="32" r={13 + (h % 5)} fill={color} />
            <path
              d="M15 26h30v5H15zm5 10h26v5H20z"
              fill="#f7e9c8"
              opacity=".3"
            />
            <ellipse
              cx="30"
              cy="32"
              rx="27"
              ry="6"
              fill="none"
              stroke={color}
              strokeWidth="3"
              transform="rotate(-27 30 32)"
            />
            <path d="M30 18v28h9V21Z" fill="#152f3c" opacity=".15" />
          </>
        ) : (
          <>
            <path
              d="M27 10h6v7h7v7h7v16h-7v7h-7v7h-6v-7h-7v-7h-7V24h7v-7h7Z"
              stroke={color}
              strokeWidth="2"
              fill="none"
            />
            <path
              d={
                h % 2
                  ? "M27 20h6v6h6v12h-6v6h-6v-6h-6V26h6z"
                  : "M20 25h20v4h-6v15h-8V29h-6zm6-8h8v6h-8z"
              }
              fill={color}
            />
            <rect x="28" y="29" width="4" height="7" fill="#f1e5c7" />
          </>
        )}
      </svg>
      <b className="rg-card-name">{itemName(item)}</b>
      <small className="rg-card-rarity">{itemKind(item)}</small>
    </div>
  );
}

export function RunCardFace({
  card,
  showFace = false,
}: {
  card: RunCard;
  showFace?: boolean;
}) {
  const hidden = !!card.faceDown && !showFace;
  return (
    <div
      className={`rg-playing-face ${hidden ? "" : `rg-enhancement-${card.enhancement} rg-edition-${card.edition}`}`}
      aria-hidden="true"
    >
      {!hidden && card.enhancement === "stone" ? (
        <div className="rg-stone-face">
          <span>◆</span>
          <b>+50</b>
        </div>
      ) : (
        <PlayingCard card={card} hidden={hidden} />
      )}
      {!hidden && card.seal !== "none" && (
        <i className={`rg-seal rg-seal-${card.seal}`}>✦</i>
      )}
      {!hidden &&
        card.enhancement !== "base" &&
        card.enhancement !== "stone" && (
          <span className="rg-enhancement-mark">
            {
              {
                bonus: "+30",
                mult: "+4",
                wild: "✦",
                glass: "×2",
                steel: "×1.5",
                gold: "$",
                lucky: "?",
              }[card.enhancement]
            }
          </span>
        )}
    </div>
  );
}

export function PackFace({ pack }: { pack: PackOffer }) {
  return (
    <div
      className={`rg-pack-art rg-pack-${pack.kind}`}
      style={{ "--card-accent": PACK_COLORS[pack.kind] } as CSSProperties}
      aria-hidden="true"
    >
      <span className="rg-pack-crimp" />
      <small>JOKER & CO.</small>
      <span className="rg-pack-emblem">
        {
          {
            buffoon: "☺",
            arcana: "✧",
            celestial: "⊙",
            spectral: "◈",
            standard: "♠",
          }[pack.kind]
        }
      </span>
      <b>{PACK_NAMES[pack.kind]}</b>
      <span>
        {pack.size === "normal"
          ? "BOOSTER"
          : pack.size === "jumbo"
            ? "JUMBO"
            : "MEGA"}
      </span>
      <span className="rg-pack-crimp" />
    </div>
  );
}

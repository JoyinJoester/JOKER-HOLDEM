import { useEffect, useRef } from "react";
import { rankLabel, SUIT_SYMBOL, type Card, type Suit } from "./poker";

type IconName =
  | "sound"
  | "muted"
  | "settings"
  | "help"
  | "arrow"
  | "close"
  | "cards"
  | "reset"
  | "history"
  | "expand"
  | "check"
  | "star"
  | "trophy";
const paths: Record<IconName, string[]> = {
  sound: [
    "M11 5 6 9H3v6h3l5 4V5Z",
    "M15 8a6 6 0 0 1 0 8",
    "M18 5a10 10 0 0 1 0 14",
  ],
  muted: ["M11 5 6 9H3v6h3l5 4V5Z", "m16 9 6 6m0-6-6 6"],
  settings: [
    "M9 3h6l1 4 4 1 1 5-3 2 1 4-5 2-3-3-4 1-3-4 2-3-1-4 4-1Z",
    "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  ],
  help: [
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    "M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4",
    "M12 17h.01",
  ],
  arrow: ["M4 12h16", "m14 6 6 6-6 6"],
  close: ["m6 6 12 12M6 18 18 6"],
  cards: ["M7 4h13v16H7Z", "M4 7H2v14h13", "m13 8-3 4 3 4 3-4-3-4Z"],
  reset: ["M3 11a9 9 0 1 1 2 7", "M3 4v7h7"],
  history: ["M3 11a9 9 0 1 1 2 7", "M3 5v6h6", "M12 7v6l4 2"],
  expand: ["M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"],
  check: ["m5 12 4 4L19 6"],
  star: ["m12 2 3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1 3-7Z"],
  trophy: [
    "M7 3h10v8a5 5 0 0 1-10 0V3Z",
    "M7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 16v5m-5 0h10",
  ],
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      {paths[name].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

const suitPaths: Record<Suit, string> = {
  hearts: "M1 3H3V1H7V3H9V1H13V3H15V9H13V11H11V13H9V15H7V13H5V11H3V9H1Z",
  diamonds:
    "M7 0H9V2H11V4H13V6H15V10H13V12H11V14H9V16H7V14H5V12H3V10H1V6H3V4H5V2H7Z",
  spades:
    "M7 0H9V2H11V4H13V6H15V10H13V12H9V10H8V13H10V15H6V13H7V10H6V12H3V10H1V6H3V4H5V2H7Z",
  clubs:
    "M6 0H10V2H12V6H10V7H12V6H14V8H16V12H14V14H10V12H9V14H11V16H5V14H7V12H6V14H2V12H0V8H2V6H4V7H6V6H4V2H6Z",
};

export function PixelSuit({
  suit,
  className = "",
}: {
  suit: Suit;
  className?: string;
}) {
  return (
    <svg
      className={`pixel-suit ${className}`}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <path d={suitPaths[suit]} />
    </svg>
  );
}

export function Portrait({
  character = 1,
  className = "",
}: {
  character?: number;
  className?: string;
}) {
  const base = [
    "#629eab",
    "#cd7461",
    "#caaa61",
    "#7892a4",
    "#a594b5",
    "#81a68f",
  ][character % 6];
  return (
    <svg
      className={`portrait ${className}`}
      viewBox="0 0 32 32"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect width="32" height="32" fill={base} />
      <path
        d="M0 0h4v4H0zm8 4h4v4H8zm12-4h4v4h-4zm8 8h4v4h-4zM0 20h4v4H0zm24 8h4v4h-4z"
        fill="#fff"
        opacity=".12"
      />
      {character === 0 && (
        <>
          <path d="M9 5h14v3h3v14h-3v4h5v6H4v-6h5v-4H6V8h3Z" fill="#283e4b" />
          <path d="M10 10h12v12h-3v3h-6v-3h-3Z" fill="#e7c5a0" />
          <path d="M8 11h17v5h-3v2h-5v-5h-2v5h-5v-2H8Z" fill="#26383d" />
          <path d="M11 12h3v1h-3zm8 0h3v1h-3z" fill="#91d3d2" />
          <path d="M15 21h5v2h-5z" fill="#9a5b53" />
          <path d="M8 26h5v3h6v-3h5v6H8Z" fill="#88c4ce" />
        </>
      )}
      {character === 1 && (
        <>
          <path
            d="M6 3h5v3h5V3h5v4h5V5h3v9h-5v11h-5v3h-8v-3H7V14H3V7h3Z"
            fill="#334c52"
          />
          <path d="M6 3h5v3h5v8H5V7h1zm15 4h5V5h3v9H19V9h2Z" fill="#ce453a" />
          <path d="M16 3h5v7h-2v4h-3Z" fill="#e8ba64" />
          <path d="M9 14h14v9h-3v4h-8v-4H9Z" fill="#f2e5c8" />
          <path d="M10 16h4v3h-4zm9 0h3v3h-3z" fill="#32454a" />
          <path
            d="M14 20h4v2h-4zm-3 2h3v2h6v-2h2v4h-4v2h-5v-2h-2Z"
            fill="#ca4a3e"
          />
          <path d="M7 28h7v4H4v-2h3zm12 0h6v2h3v2H18v-4Z" fill="#e8ba64" />
          <path d="M3 5h3v3H3zm23-2h3v3h-3zM16 1h5v3h-5Z" fill="#efd798" />
        </>
      )}
      {character === 2 && (
        <>
          <path
            d="M5 6h5v3h12V6h5v16h-4v4h-4v3h6v3H7v-3h6v-3H9v-4H5Z"
            fill="#a04d34"
          />
          <path
            d="M7 8h3v5H7zm15 0h3v5h-3zM8 15h16v7h-4v4h-8v-4H8Z"
            fill="#f0c789"
          />
          <path d="M8 15h6v4h-6zm10 0h6v4h-6z" fill="#3c4542" />
          <path d="M10 16h3v1h-3zm9 0h3v1h-3z" fill="#e9dcba" />
          <path d="M14 21h4v3h-4zm-2 5h8v2h-8z" fill="#3c4542" />
          <path d="M3 4h20v3H3zm6-3h11v4H9Z" fill="#344c45" />
          <path d="M9 3h11v2H9Z" fill="#da7950" />
          <path d="M7 29h6v3H7zm12 0h6v3h-6Z" fill="#427262" />
        </>
      )}
      {character === 3 && (
        <>
          <path
            d="M15 2h2v5h-2zM8 8h16v3h3v13h-3v3h-5v3h7v2H6v-2h7v-3H8v-3H5V11h3Z"
            fill="#344756"
          />
          <path d="M14 0h4v3h-4z" fill="#efd272" />
          <path d="M9 10h14v13H9Z" fill="#bcc8b7" />
          <path d="M9 13h14v5H9Z" fill="#3a585a" />
          <path d="M11 14h3v3h-3zm7 0h3v3h-3z" fill="#78d2c4" />
          <path d="M12 21h8v2h-8Z" fill="#596d6c" />
          <path d="M3 13h3v8H3zm23 0h3v8h-3Z" fill="#e3b767" />
          <path d="M9 29h14v3H9Z" fill="#abc4c0" />
        </>
      )}
      {character === 4 && (
        <>
          <path
            d="M7 2h6v10h6V2h6v18h-3v6h-3v3h6v3H7v-3h6v-3H9v-6H6V12h1Z"
            fill="#34434c"
          />
          <path
            d="M9 3h3v11H9zm11 0h3v11h-3zM9 14h14v8h-4v4h-6v-4H9Z"
            fill="#ede4cf"
          />
          <path
            d="M10 4h2v7h-2zm11 0h2v7h-2zm-10 13h3v3h-3zm8 0h3v3h-3z"
            fill="#d49b9b"
          />
          <path d="M11 16h3v2h-3zm8 0h3v2h-3zM15 20h3v2h-3z" fill="#36464a" />
          <path d="M10 28h12v4H10Z" fill="#835f92" />
          <path d="M13 27h3v3h-3zm4 0h3v3h-3z" fill="#e7c473" />
        </>
      )}
      {character === 5 && (
        <>
          <path
            d="M9 2h14v9h5v3h-3v10h-5v4h6v4H6v-4h6v-4H7V14H4v-3h5Z"
            fill="#263e3d"
          />
          <path d="M10 3h12v6H10zm-3 8h18v3H7Z" fill="#346a52" />
          <path d="M10 8h12v3H10Z" fill="#e0c485" />
          <path d="M10 15h12v8h-3v4h-6v-4h-3Z" fill="#ddc49b" />
          <path d="M10 16h4v4h-4zm8 0h4v4h-4z" fill="#3b4946" />
          <path d="M19 16h2v3h-2z" fill="#b2ded3" />
          <path d="M13 22h6v2h-6Z" fill="#8b6450" />
          <path d="M8 28h5l3 3 3-3h5v4H8Z" fill="#427d5f" />
          <path d="M15 28h3v3h-3Z" fill="#e2be6f" />
        </>
      )}
    </svg>
  );
}

const pips: Record<number, [number, number][]> = {
  2: [
    [50, 25],
    [50, 75],
  ],
  3: [
    [50, 23],
    [50, 50],
    [50, 77],
  ],
  4: [
    [30, 25],
    [70, 25],
    [30, 75],
    [70, 75],
  ],
  5: [
    [30, 25],
    [70, 25],
    [50, 50],
    [30, 75],
    [70, 75],
  ],
  6: [
    [30, 23],
    [70, 23],
    [30, 50],
    [70, 50],
    [30, 77],
    [70, 77],
  ],
  7: [
    [30, 23],
    [70, 23],
    [50, 37],
    [30, 50],
    [70, 50],
    [30, 77],
    [70, 77],
  ],
  8: [
    [30, 20],
    [70, 20],
    [30, 40],
    [70, 40],
    [30, 60],
    [70, 60],
    [30, 80],
    [70, 80],
  ],
  9: [
    [30, 20],
    [70, 20],
    [30, 40],
    [70, 40],
    [50, 50],
    [30, 60],
    [70, 60],
    [30, 80],
    [70, 80],
  ],
  10: [
    [30, 20],
    [70, 20],
    [50, 30],
    [30, 40],
    [70, 40],
    [30, 60],
    [70, 60],
    [50, 70],
    [30, 80],
    [70, 80],
  ],
};

export function PlayingCard({
  card,
  hidden = false,
  placeholder,
  small = false,
  highlighted = false,
  index = 0,
}: {
  card?: Card;
  hidden?: boolean;
  placeholder?: string;
  small?: boolean;
  highlighted?: boolean;
  index?: number;
}) {
  const className = `playing-card ${small ? "small-card" : ""} ${hidden ? "card-back" : ""} ${placeholder ? "card-placeholder" : ""} ${highlighted ? "winning-card" : ""}`;
  if (placeholder)
    return (
      <div className={className} aria-label={`等待${placeholder}`}>
        <span className="placeholder-suit">
          {["♠", "♥", "♣", "♦", "♠"][index]}
        </span>
        <span className="placeholder-word">{placeholder}</span>
        <i />
      </div>
    );
  if (hidden || !card)
    return (
      <div className={className} aria-label="未公开的底牌">
        <div className="back-weave">
          <div className="back-diamond">
            <PixelSuit suit="spades" />
          </div>
        </div>
      </div>
    );
  const red = card.suit === "hearts" || card.suit === "diamonds";
  return (
    <div
      className={`${className} card-face ${red ? "red-suit" : "black-suit"}`}
      style={{ "--deal-index": index } as React.CSSProperties}
      role="img"
      aria-label={`${SUIT_SYMBOL[card.suit]}${rankLabel(card.rank)}`}
    >
      <div className="card-corner top-corner">
        <b>{rankLabel(card.rank)}</b>
        <PixelSuit suit={card.suit} />
      </div>
      <div className="card-illustration">
        {card.rank === 14 ? (
          <PixelSuit suit={card.suit} className="ace-suit" />
        ) : card.rank > 10 ? (
          <div className="royal-portrait">
            <Portrait
              character={card.rank === 11 ? 1 : card.rank === 12 ? 2 : 3}
            />
            <div className="royal-reflection">
              <Portrait
                character={card.rank === 11 ? 1 : card.rank === 12 ? 2 : 3}
              />
            </div>
          </div>
        ) : (
          pips[card.rank].map(([x, y], i) => (
            <span
              key={i}
              className={`pip ${y > 50 ? "pip-inverted" : ""}`}
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <PixelSuit suit={card.suit} />
            </span>
          ))
        )}
      </div>
      <div className="card-corner bottom-corner">
        <b>{rankLabel(card.rank)}</b>
        <PixelSuit suit={card.suit} />
      </div>
    </div>
  );
}

export function ChipStack({ small = false }: { small?: boolean }) {
  return (
    <span
      className={`chip-stack ${small ? "small-stack" : ""}`}
      aria-hidden="true"
    >
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

export function JokerNote({ onClick }: { onClick: () => void }) {
  return (
    <button className="joker-note" onClick={onClick} aria-label="查看牌型速查">
      <div className="joker-paper">
        <span className="joker-sideword">JOKER</span>
        <div className="joker-art">
          <span className="art-star star-one">✦</span>
          <span className="art-star star-two">✧</span>
          <Portrait character={1} />
          <span className="joker-edition">THE WILD ONE</span>
        </div>
        <span className="joker-small-suit">♠</span>
      </div>
      <div className="joker-note-caption">
        <span>运气偏爱，敢出牌的人。</span>
        <span>
          牌型速查 <Icon name="arrow" size={14} />
        </span>
      </div>
    </button>
  );
}

/** A tiny original shader supplies the gently marbled felt, with a CSS fallback. */
export function Atmosphere({ animate }: { animate: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      powerPreference: "low-power",
    });
    if (!gl) return;
    const vertex = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(
      vertex,
      "attribute vec2 p; void main(){gl_Position=vec4(p,0.,1.);}",
    );
    gl.compileShader(vertex);
    const fragment = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(
      fragment,
      `precision mediump float;
      uniform vec2 resolution; uniform float time;
      void main(){
        vec2 uv=gl_FragCoord.xy/resolution; vec2 p=uv*vec2(resolution.x/resolution.y,1.);
        float t=time*.016;
        p+=.14*vec2(sin(p.y*5.+t),cos(p.x*4.-t));
        float w=sin(p.x*8.+p.y*4.+2.*sin(p.y*5.-p.x*2.+t));
        float w2=sin(p.x*4.-p.y*7.+sin(p.x*5.+t));
        vec3 color=mix(vec3(.065,.19,.16),vec3(.14,.32,.26),smoothstep(-1.,1.,w*.7+w2*.3));
        float vignette=1.-.48*length((uv-.5)*vec2(1.,.8));
        float grain=fract(sin(dot(gl_FragCoord.xy,vec2(12.98,78.23)))*4375.85)*.018;
        gl_FragColor=vec4(color*vignette+grain,1.);
      }`,
    );
    gl.compileShader(fragment);
    const program = gl.createProgram()!;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const resolution = gl.getUniformLocation(program, "resolution");
    const time = gl.getUniformLocation(program, "time");
    let frame = 0;
    let last = -100;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const resize = () => {
      canvas.width = Math.min(window.innerWidth, 1800);
      canvas.height = Math.min(window.innerHeight, 1200);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    const draw = (ms: number) => {
      if (ms - last > 75 && !document.hidden) {
        gl.uniform1f(time, ms / 1000);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        last = ms;
      }
      if (animate && !reduceMotion) frame = requestAnimationFrame(draw);
    };
    resize();
    draw(0);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, [animate]);
  return <canvas ref={ref} className="atmosphere" aria-hidden="true" />;
}

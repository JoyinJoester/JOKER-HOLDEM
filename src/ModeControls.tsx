import {
  MODE_META,
  MODE_ORDER,
  type GameMode,
  type TableConfig,
} from "./modes";

export function ModePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: GameMode;
  onChange: (value: GameMode) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mode-picker" role="group" aria-label="游戏玩法">
      {MODE_ORDER.map((mode) => {
        const meta = MODE_META[mode];
        return (
          <button
            type="button"
            key={mode}
            disabled={disabled}
            aria-pressed={mode === value}
            className={`game-mode-card mode-${mode} ${mode === value ? "selected-mode" : ""}`}
            onClick={() => onChange(mode)}
            style={{ "--mode-color": meta.accent } as React.CSSProperties}
          >
            <span className="mode-card-symbol" aria-hidden="true">
              {meta.glyph}
            </span>
            <span className="mode-card-copy">
              <strong>{meta.name}</strong>
              <small>{meta.en}</small>
            </span>
            <span className="mode-card-check">{mode === value ? "✓" : ""}</span>
            <span className="mode-card-description">{meta.desc}</span>
          </button>
        );
      })}
    </div>
  );
}

export function NumberChoices({
  value,
  onChange,
  start,
  end,
  label,
  disabled = false,
  minimum = start,
}: {
  value: number;
  onChange: (value: number) => void;
  start: number;
  end: number;
  label: string;
  disabled?: boolean;
  minimum?: number;
}) {
  return (
    <div className="number-choices" role="group" aria-label={label}>
      {Array.from({ length: end - start + 1 }, (_, i) => i + start).map(
        (count) => (
          <button
            key={count}
            type="button"
            aria-label={`${count} ${label}`}
            aria-pressed={value === count}
            disabled={disabled || count < minimum}
            onClick={() => onChange(count)}
          >
            {count}
          </button>
        ),
      )}
    </div>
  );
}

export function DifficultyChoices({
  value,
  onChange,
  disabled = false,
}: {
  value: TableConfig["difficulty"];
  onChange: (value: TableConfig["difficulty"]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="difficulty-choices" role="group" aria-label="AI 难度">
      {(["easy", "normal", "hard"] as const).map((difficulty, i) => (
        <button
          type="button"
          key={difficulty}
          aria-pressed={value === difficulty}
          disabled={disabled}
          onClick={() => onChange(difficulty)}
        >
          {["轻松", "标准", "挑战"][i]}
        </button>
      ))}
    </div>
  );
}

export function RoomOptions({
  value,
  onChange,
  disabled = false,
  minimumSeats = 2,
}: {
  value: TableConfig;
  onChange: (value: TableConfig) => void;
  disabled?: boolean;
  minimumSeats?: number;
}) {
  return (
    <div className="room-options">
      <div className="setup-label">游戏玩法</div>
      <ModePicker
        value={value.mode}
        onChange={(mode) => onChange({ ...value, mode })}
        disabled={disabled}
      />
      <p className="mode-detail">{MODE_META[value.mode].detail}</p>
      <div className="setup-label">
        牌桌座位 <span>{value.seats} 人</span>
      </div>
      <NumberChoices
        label="人牌桌"
        value={value.seats}
        start={2}
        end={6}
        minimum={minimumSeats}
        disabled={disabled}
        onChange={(seats) => onChange({ ...value, seats })}
      />
      <label className="fill-bots-option">
        <input
          type="checkbox"
          checked={value.fillBots}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...value, fillBots: event.target.checked })
          }
        />
        <span>
          空位由 AI 补齐
          <small>
            {value.fillBots
              ? "朋友人数不限，一个人也可以开局。"
              : "纯真人对战，至少两位朋友入座后开局。"}
          </small>
        </span>
      </label>
      {value.fillBots && (
        <>
          <div className="setup-label">AI 难度</div>
          <DifficultyChoices
            value={value.difficulty}
            disabled={disabled}
            onChange={(difficulty) => onChange({ ...value, difficulty })}
          />
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { clampElo, ELO_MAX, ELO_MIN, strengthName } from "@/lib/chess/strength";

export function StrengthField({
  elo,
  onChange,
  label = "Adversário",
}: {
  elo: number;
  onChange: (elo: number) => void;
  label?: string;
}) {
  const [text, setText] = useState(String(elo));
  useEffect(() => setText(String(elo)), [elo]);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        <p className="font-display text-2xl tabular-nums">{elo}</p>
      </div>
      <p className="text-sm">{strengthName(elo)}</p>
      <input
        className="range mt-2"
        type="range"
        min={ELO_MIN}
        max={ELO_MAX}
        step={10}
        value={elo}
        aria-label={label}
        onChange={(e) => onChange(clampElo(Number(e.target.value)))}
      />
      <label className="mt-2 block text-sm text-muted">
        Elo específico
        <input
          className="field no-spin mt-1 max-w-40"
          inputMode="numeric"
          aria-label="Elo específico"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
          onBlur={() => {
            const next = clampElo(Number(text));
            setText(String(next));
            onChange(next);
          }}
        />
      </label>
    </div>
  );
}

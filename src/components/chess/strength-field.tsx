import { useEffect, useState } from "react";
import { clampElo, strengthName, STRENGTHS } from "@/lib/chess/strength";

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
      <p className="mb-1.5 text-sm text-muted">{label}</p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {STRENGTHS.map((s) => (
          <button
            key={s.elo}
            type="button"
            className={`btn h-14 w-full px-2 text-center text-xs leading-tight ${s.elo === elo ? "btn btn-primary" : "btn"}`}
            onClick={() => onChange(s.elo)}
          >
            {s.label}
          </button>
        ))}
      </div>
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
      <p className="mt-1 text-xs text-muted">
        {strengthName(elo)}. Abaixo de 100 vira 100. Acima de 3600 vira 3600.
      </p>
    </div>
  );
}

import { useState } from "react";
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
  const [open, setOpen] = useState(false);
  const named = STRENGTHS.find((s) => s.elo === elo);
  return (
    <div>
      <p className="mb-1.5 text-sm text-muted">{label}</p>
      <button type="button" className="btn w-full justify-between" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{named ? named.label : strengthName(elo)}</span>
        <span className="text-muted">{open ? "Fechar" : "Escolher"}</span>
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {STRENGTHS.map((s) => (
            <button
              key={s.elo}
              type="button"
              className={s.elo === elo ? "btn btn-primary" : "btn"}
              onClick={() => {
                onChange(s.elo);
                setOpen(false);
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <label className="mt-2 block text-sm text-muted">
        Elo específico
        <input
          className="field mt-1 max-w-40"
          type="number"
          min={100}
          max={3600}
          value={elo}
          onChange={(e) => onChange(clampElo(Number(e.target.value)))}
        />
      </label>
    </div>
  );
}

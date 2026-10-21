import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/chess/shell";
import { AttemptReview } from "@/components/chess/puzzle-review";
import { PuzzleRun } from "@/components/chess/puzzle-run";
import { StrengthField } from "@/components/chess/strength-field";
import { corpus, type Puzzle } from "@/lib/chess/corpus";
import { clampElo } from "@/lib/chess/strength";
import { useVault } from "@/lib/chess/store";

export const Route = createFileRoute("/problemas")({ component: Problemas });

const THEMES = [
  ["mate", "Mates"],
  ["middlegame", "Meio-jogo"],
  ["endgame", "Finais"],
  ["opening", "Aberturas"],
  ["fork", "Garfos"],
  ["pin", "Cravadas"],
  ["skewer", "Raios X"],
  ["sacrifice", "Sacrifícios"],
  ["kingsideAttack", "Ataque ao rei"],
  ["defensiveMove", "Defesa"],
] as const;

const TIMES = [
  { value: "0", label: "Sem limite", sec: 0, storm: false },
  { value: "5", label: "5 segundos", sec: 5, storm: false },
  { value: "10", label: "10 segundos", sec: 10, storm: false },
  { value: "15", label: "15 segundos", sec: 15, storm: false },
  { value: "30", label: "30 segundos", sec: 30, storm: false },
  { value: "60", label: "1 minuto", sec: 60, storm: false },
  { value: "120", label: "2 minutos", sec: 120, storm: false },
  { value: "180", label: "3 minutos", sec: 180, storm: false },
  { value: "storm", label: "Tempestade 3 min", sec: 0, storm: true },
] as const;

function Problemas() {
  const myRating = useVault((s) => s.rating);
  const attempts = useVault((s) => s.attempts);
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [themes, setThemes] = useState<string[]>([]);
  const [target, setTarget] = useState(clampElo(myRating));
  const [touched, setTouched] = useState(false);
  const [timeId, setTimeId] = useState<(typeof TIMES)[number]["value"]>("0");
  const [timeOpen, setTimeOpen] = useState(false);
  const [autoNext, setAutoNext] = useState(false);
  const [infinite, setInfinite] = useState(false);
  const [started, setStarted] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [key, setKey] = useState(0);
  const time = TIMES.find((t) => t.value === timeId) ?? TIMES[0];

  useEffect(() => {
    void corpus().then((c) => setPuzzles(c.puzzles));
  }, []);

  useEffect(() => {
    if (!touched && !started) setTarget(clampElo(myRating));
  }, [myRating, touched, started]);

  function toggleTheme(id: string) {
    setThemes((current) => (current.includes(id) ? current.filter((t) => t !== id) : [...current, id]));
    setStarted(false);
  }

  return (
    <Shell>
      <div className="mb-4">
        <h1 className="font-display text-3xl">Problemas</h1>
        <p className="text-sm text-muted">
          {puzzles.length ? `${puzzles.length.toLocaleString("pt-PT")} posições. Escolha temas, elo e tempo.` : "A carregar…"}
        </p>
        <div className="mt-3">
          <p className="mb-1.5 text-sm text-muted">Temas</p>
          <div className="flex flex-wrap gap-1.5">
            {THEMES.map(([id, label]) => (
              <button key={id} type="button" className={themes.includes(id) ? "btn btn-primary" : "btn"} onClick={() => toggleTheme(id)}>
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">{themes.length ? "Um problema precisa de todos os temas marcados." : "Sem filtro: qualquer tema."}</p>
        </div>
        <div className="mt-4 max-w-md">
          <StrengthField
            label="Elo dos problemas"
            elo={target}
            onChange={(elo) => {
              setTouched(true);
              setTarget(elo);
              setStarted(false);
            }}
          />
        </div>
        <div className="mt-4 max-w-md">
          <p className="mb-1.5 text-sm text-muted">Tempo por problema</p>
          <button type="button" className="btn w-full justify-between" onClick={() => setTimeOpen((v) => !v)}>
            <span>{time.label}</span>
            <span className="text-muted">{timeOpen ? "Fechar" : "Escolher"}</span>
          </button>
          {timeOpen && (
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {TIMES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={t.value === timeId ? "btn btn-primary" : "btn"}
                  onClick={() => {
                    setTimeId(t.value);
                    setTimeOpen(false);
                    setStarted(false);
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mt-4 space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={infinite} onChange={(e) => setInfinite(e.target.checked)} />
            Tentativas infinitas
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)} />
            Recomeçar automaticamente
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!puzzles.length}
            onClick={() => {
              setReviewing(false);
              setStarted(true);
              setKey((k) => k + 1);
            }}
          >
            {started ? "Novos problemas" : "Começar"}
          </button>
          <button type="button" className="btn" onClick={() => setReviewing((v) => !v)}>
            Rever os feitos
          </button>
        </div>
      </div>
      {reviewing && (
        <div className="mb-6">
          <h2 className="mb-3 font-display text-2xl">Problemas feitos</h2>
          <AttemptReview items={attempts} />
        </div>
      )}
      {started && puzzles.length > 0 && !reviewing && (
        <PuzzleRun
          key={key}
          puzzles={puzzles}
          themes={themes}
          targetRating={target}
          limitSec={time.storm ? null : time.sec || null}
          storm={time.storm}
          autoNext={autoNext}
          infinite={infinite}
        />
      )}
    </Shell>
  );
}

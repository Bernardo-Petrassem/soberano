import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/chess/shell";
import { Choice } from "@/components/chess/choice";
import { PuzzleRun } from "@/components/chess/puzzle-run";
import { corpus, type Puzzle } from "@/lib/chess/corpus";

export const Route = createFileRoute("/problemas")({ component: Problemas });

const THEMES = [
  ["", "Todos os temas"],
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

function Problemas() {
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [theme, setTheme] = useState("");
  const [timed, setTimed] = useState(false);
  const [key, setKey] = useState(0);

  useEffect(() => {
    void corpus().then((c) => setPuzzles(c.puzzles));
  }, []);

  return (
    <Shell>
      <div className="mb-4">
        <h1 className="font-display text-3xl">Problemas</h1>
        <p className="text-sm text-muted">
          {puzzles.length ? `${puzzles.length.toLocaleString("pt-PT")} posições da base pública, por rating.` : "A carregar…"}
        </p>
        <div className="mt-3">
          <Choice
            label="Tema"
            value={theme}
            onChange={(value) => {
              setTheme(value);
              setKey((k) => k + 1);
            }}
            options={THEMES.map(([id, label]) => ({ value: id, label }))}
          />
        </div>
        <button
          type="button"
          className={`mt-3 ${timed ? "btn btn-primary" : "btn"}`}
          onClick={() => {
            setTimed((v) => !v);
            setKey((k) => k + 1);
          }}
        >
          {timed ? "Tempestade 3 min" : "Modo calmo"}
        </button>
      </div>
      {puzzles.length > 0 && <PuzzleRun key={key} puzzles={puzzles} theme={theme} timed={timed} />}
    </Shell>
  );
}

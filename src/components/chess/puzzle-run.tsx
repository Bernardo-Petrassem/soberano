import { useEffect, useMemo, useState } from "react";
import type { Role } from "chessops/types";
import { Board } from "@/components/chess/board";
import { Panel } from "@/components/chess/shell";
import type { Puzzle } from "@/lib/chess/corpus";
import {
  checkedKing,
  destsOf,
  fenOf,
  lastSquares,
  legalMove,
  loadFen,
  needsPromotion,
  playUciOn,
  positionAt,
  sanAndUci,
} from "@/lib/chess/logic";
import { knock } from "@/lib/chess/sound";
import { useVault } from "@/lib/chess/store";

const THEME_PT: Record<string, string> = {
  mate: "mate",
  mateIn1: "mate em 1",
  mateIn2: "mate em 2",
  middlegame: "meio-jogo",
  endgame: "final",
  opening: "abertura",
  fork: "garfo",
  pin: "cravada",
  skewer: "raio X",
  sacrifice: "sacrifício",
  hangingPiece: "peça pendurada",
  discoveredAttack: "descoberta",
  kingsideAttack: "ataque ao rei",
  crushing: "decisivo",
  advantage: "vantagem",
  defensiveMove: "defesa",
  quietMove: "lance quieto",
  short: "combo curto",
  long: "combo longo",
};

function pick(puzzles: Puzzle[], rating: number, theme: string, avoid: Set<string>): Puzzle | null {
  let pool = theme ? puzzles.filter((p) => p.themes.includes(theme)) : puzzles;
  if (!pool.length) pool = puzzles;
  const fresh = pool.filter((p) => !avoid.has(p.id));
  if (fresh.length) pool = fresh;
  const near = pool.filter((p) => Math.abs(p.rating - rating) < 160);
  const src = near.length > 8 ? near : pool;
  return src[Math.floor(Math.random() * src.length)] ?? null;
}

export function PuzzleRun({
  puzzles,
  theme,
  timed,
}: {
  puzzles: Puzzle[];
  theme: string;
  timed: boolean;
}) {
  const rating = useVault((s) => s.rating);
  const setRating = useVault((s) => s.setRating);
  const sound = useVault((s) => s.sound);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [step, setStep] = useState(1);
  const [wrong, setWrong] = useState(false);
  const [solved, setSolved] = useState(false);
  const [strikes, setStrikes] = useState(0);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(timed ? 180 : 0);
  const [over, setOver] = useState(false);
  const seen = useMemo(() => new Set<string>(), []);

  function next(fromRating = rating) {
    const p = pick(puzzles, fromRating, theme, seen);
    if (!p) return;
    seen.add(p.id);
    setPuzzle(p);
    setStep(1);
    setWrong(false);
    setSolved(false);
  }

  useEffect(() => {
    if (puzzles.length) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzles, theme, timed]);

  useEffect(() => {
    if (!timed || over) return;
    const id = window.setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          setOver(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [timed, over]);

  const shown = useMemo(() => {
    if (!puzzle) return null;
    return positionAt(puzzle.fen, puzzle.line, Math.min(step, puzzle.line.length));
  }, [puzzle, step]);

  function grade(ok: boolean) {
    if (!puzzle) return;
    const expected = 1 / (1 + 10 ** ((puzzle.rating - rating) / 400));
    const nextRating = rating + 20 * ((ok ? 1 : 0) - expected);
    setRating(nextRating);
    return nextRating;
  }

  function play(from: string, to: string, promotion?: Role) {
    if (!puzzle || !shown || wrong || solved || over) return;
    const move = legalMove(shown, from, to, promotion);
    if (!move) return;
    const { uci } = sanAndUci(shown, move);
    const expected = puzzle.line[step];
    if (uci !== expected) {
      knock(sound);
      setWrong(true);
      grade(false);
      if (timed) {
        setStrikes((n) => {
          if (n + 1 >= 3) setOver(true);
          return n + 1;
        });
      }
      return;
    }
    knock(sound);
    const after = step + 1;
    if (after >= puzzle.line.length) {
      setStep(after);
      setSolved(true);
      grade(true);
      if (timed) setScore((n) => n + 1);
      return;
    }
    setStep(after + 1);
    if (after + 1 >= puzzle.line.length) {
      setSolved(true);
      grade(true);
      if (timed) setScore((n) => n + 1);
    }
  }

  if (!puzzle || !shown) return <p className="text-muted">A escolher um problema…</p>;
  const themes = puzzle.themes.map((t) => THEME_PT[t]).filter(Boolean).slice(0, 4);
  const userTurn = !wrong && !solved && !over && step < puzzle.line.length && step % 2 === 1;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,42rem)_18rem]">
      <Board
        fen={fenOf(shown)}
        dests={userTurn ? destsOf(shown) : {}}
        lastMove={lastSquares(puzzle.line[step - 1])}
        checkSquare={checkedKing(shown)}
        interactive={userTurn}
        sideToMove={shown.turn}
        orientation={shown.turn}
        isPromotion={(from, to) => needsPromotion(shown, from, to)}
        onMove={play}
      />
      <Panel>
        <p className="font-display text-2xl text-brass">{timed ? `${left}s` : `Rating ${rating}`}</p>
        <p className="mt-1 text-sm text-muted">
          Problema {puzzle.rating}
          {timed ? ` · ${score} certos · ${strikes}/3 erros` : ""}
        </p>
        <p className="mt-2 text-sm">{themes.join(" · ") || "táctica"}</p>
        {wrong && <p className="mt-3 text-sm text-blood">Não era esse. A linha segue no tabuleiro se avançar.</p>}
        {solved && <p className="mt-3 text-sm text-good">Resolvido.</p>}
        {over && <p className="mt-3 text-sm">Tempo ou três erros. {score} problemas.</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {(wrong || solved) && !over && (
            <button type="button" className="btn btn-primary" onClick={() => next()}>
              Seguinte
            </button>
          )}
          {wrong && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                const pos = loadFen(puzzle.fen);
                if (!pos) return;
                for (const uci of puzzle.line) playUciOn(pos, uci);
                setStep(puzzle.line.length);
              }}
            >
              Ver solução
            </button>
          )}
          {over && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setOver(false);
                setStrikes(0);
                setScore(0);
                setLeft(180);
                next();
              }}
            >
              Outra série
            </button>
          )}
        </div>
        <p className="mt-3 text-xs text-muted">
          O primeiro lance da base já foi do adversário. Encontre a continuação. Pode importar o CSV completo na Biblioteca.
        </p>
      </Panel>
    </div>
  );
}

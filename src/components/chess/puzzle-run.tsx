import { useEffect, useMemo, useRef, useState } from "react";
import type { Color, Role } from "chessops/types";
import { Board } from "@/components/chess/board";
import { Panel } from "@/components/chess/shell";
import { formatWatch, useStopwatch } from "@/components/chess/stopwatch";
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
  const [solved, setSolved] = useState(false);
  const [review, setReview] = useState(false);
  const [hint, setHint] = useState("");
  const [explore, setExplore] = useState<string | null>(null);
  const [strikes, setStrikes] = useState(0);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(timed ? 180 : 0);
  const [over, setOver] = useState(false);
  const seen = useMemo(() => new Set<string>(), []);
  const penalized = useRef(false);
  const running = !over && !review && !solved;
  const watch = useStopwatch(running);

  function next(fromRating = rating) {
    const p = pick(puzzles, fromRating, theme, seen);
    if (!p) return;
    seen.add(p.id);
    setPuzzle(p);
    setStep(1);
    setSolved(false);
    setReview(false);
    setHint("");
    setExplore(null);
    penalized.current = false;
    watch.reset();
  }

  useEffect(() => {
    if (puzzles.length) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzles, theme, timed]);

  useEffect(() => {
    if (!timed || over || review || solved) return;
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
  }, [timed, over, review, solved]);

  const solver: Color = useMemo(() => {
    if (!puzzle) return "white";
    return positionAt(puzzle.fen, puzzle.line, 1)?.turn ?? "white";
  }, [puzzle]);

  const shown = useMemo(() => {
    if (!puzzle) return null;
    if (explore) return loadFen(explore);
    return positionAt(puzzle.fen, puzzle.line, Math.min(step, puzzle.line.length));
  }, [puzzle, step, explore]);

  function grade(ok: boolean) {
    if (!puzzle) return;
    const expected = 1 / (1 + 10 ** ((puzzle.rating - rating) / 400));
    const nextRating = rating + 20 * ((ok ? 1 : 0) - expected);
    setRating(nextRating);
    return nextRating;
  }

  function play(from: string, to: string, promotion?: Role) {
    if (!puzzle || !shown || over || review) return;
    const move = legalMove(shown, from, to, promotion);
    if (!move) return;
    if (solved) {
      const next = loadFen(fenOf(shown));
      const { uci } = sanAndUci(shown, move);
      if (next && playUciOn(next, uci)) setExplore(fenOf(next));
      return;
    }
    const { uci } = sanAndUci(shown, move);
    const expected = puzzle.line[step];
    if (uci !== expected) {
      knock(sound);
      setHint("Não era esse. Pode tentar outro lance.");
      if (!penalized.current) {
        penalized.current = true;
        grade(false);
        if (timed) {
          setStrikes((n) => {
            if (n + 1 >= 3) setOver(true);
            return n + 1;
          });
        }
      }
      return;
    }
    knock(sound);
    setHint("");
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
  const userTurn = (!solved && !over && !review && step < puzzle.line.length && step % 2 === 1) || (solved && !review && !over);
  const atEnd = step >= puzzle.line.length;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,42rem)_18rem]">
      <Board
        key={puzzle.id}
        fen={fenOf(shown)}
        dests={userTurn ? destsOf(shown) : {}}
        lastMove={explore ? null : lastSquares(puzzle.line[Math.min(step, puzzle.line.length) - 1])}
        checkSquare={checkedKing(shown)}
        interactive={userTurn}
        sideToMove={shown.turn}
        orientation={solver}
        isPromotion={(from, to) => needsPromotion(shown, from, to)}
        onMove={play}
      />
      <Panel>
        <p className="font-display text-3xl tabular-nums text-brass">{formatWatch(watch.ms)}</p>
        <p className="mt-1 text-sm text-muted">
          {timed ? `Tempestade ${left}s · ${score} certos · ${strikes}/3 erros · ` : ""}
          Rating {rating}
        </p>
        <p className="mt-2 text-sm">
          Problema {puzzle.rating}
          <span className="text-muted"> · {puzzle.id}</span>
        </p>
        <p className="mt-1 text-sm">{themes.join(" · ") || "táctica"}</p>
        {review && <p className="mt-3 text-sm text-muted">Solução, lance a lance. O cronómetro está parado.</p>}
        {hint && !review && <p className="mt-3 text-sm text-blood">{hint}</p>}
        {solved && !review && (
          <p className="mt-3 text-sm text-good">
            {shown.isEnd()
              ? "Resolvido. Não há lance legal: a posição acabou. O tabuleiro mantém a sua cor."
              : "Resolvido. Pode continuar a jogar daqui. O tabuleiro mantém a sua cor."}
          </p>
        )}
        {over && <p className="mt-3 text-sm">Tempo ou três erros. {score} problemas.</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {(solved || review) && !over && (
            <button type="button" className="btn btn-primary" onClick={() => next()}>
              Seguinte
            </button>
          )}
          {!review && !over && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setReview(true);
                setStep(1);
                setExplore(null);
                setHint("");
              }}
            >
              Ver solução
            </button>
          )}
          {review && (
            <>
              <button type="button" className="btn" disabled={step <= 1} onClick={() => setStep((s) => Math.max(1, s - 1))}>
                Anterior
              </button>
              <button
                type="button"
                className="btn"
                disabled={atEnd}
                onClick={() => setStep((s) => Math.min(puzzle.line.length, s + 1))}
              >
                Seguinte passo
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setReview(false);
                  setStep(1);
                  setSolved(false);
                  setExplore(null);
                }}
              >
                Tentar de novo
              </button>
            </>
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
          O primeiro lance da base já foi do adversário. Um erro não trava o tabuleiro. A solução anda um lance de cada vez.
        </p>
      </Panel>
    </div>
  );
}

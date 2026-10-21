import { useEffect, useMemo, useRef, useState } from "react";
import type { Color, Role } from "chessops/types";
import { Board } from "@/components/chess/board";
import { AttemptReview } from "@/components/chess/puzzle-review";
import { Panel } from "@/components/chess/shell";
import { formatWatch, useStopwatch } from "@/components/chess/stopwatch";
import type { Puzzle } from "@/lib/chess/corpus";
import {
  checkedKing,
  destsOf,
  fenOf,
  lastSquares,
  legalMove,
  needsPromotion,
  positionAt,
  sanAndUci,
} from "@/lib/chess/logic";
import { knock } from "@/lib/chess/sound";
import { useVault, type PuzzleAttempt } from "@/lib/chess/store";

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

const MATE_THEMES = new Set(["mate", "mateIn1", "mateIn2", "mateIn3", "mateIn4", "mateIn5"]);

function pick(puzzles: Puzzle[], rating: number, themes: string[], avoid: Set<string>): Puzzle | null {
  let pool = themes.length ? puzzles.filter((p) => themes.every((t) => p.themes.includes(t))) : puzzles;
  if (!pool.length) return null;
  const fresh = pool.filter((p) => !avoid.has(p.id));
  if (fresh.length) pool = fresh;
  const near = pool.filter((p) => Math.abs(p.rating - rating) < 160);
  const src = near.length > 8 ? near : pool;
  return src[Math.floor(Math.random() * src.length)] ?? null;
}

function themeLine(puzzle: Puzzle): string {
  const end = positionAt(puzzle.fen, puzzle.line, puzzle.line.length);
  const mate = Boolean(end?.isCheckmate());
  const names = puzzle.themes
    .filter((t) => (mate ? !MATE_THEMES.has(t) : t !== "mate" && !t.startsWith("mateIn")))
    .map((t) => THEME_PT[t])
    .filter(Boolean);
  if (mate) names.unshift(`mate em ${Math.max(1, Math.ceil((puzzle.line.length - 1) / 2))}`);
  return names.slice(0, 4).join(" · ") || "táctica";
}

export function PuzzleRun({
  puzzles,
  themes,
  targetRating,
  limitSec = null,
  storm = false,
  autoNext = false,
  infinite = false,
  autoAdvance = false,
}: {
  puzzles: Puzzle[];
  themes: string[];
  targetRating?: number;
  limitSec?: number | null;
  storm?: boolean;
  autoNext?: boolean;
  infinite?: boolean;
  autoAdvance?: boolean;
}) {
  const rating = useVault((s) => s.rating);
  const setRating = useVault((s) => s.setRating);
  const logAttempt = useVault((s) => s.logAttempt);
  const sound = useVault((s) => s.sound);
  const goal = targetRating ?? rating;
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [empty, setEmpty] = useState(false);
  const [step, setStep] = useState(1);
  const [live, setLive] = useState(1);
  const [solved, setSolved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [review, setReview] = useState(false);
  const [hint, setHint] = useState("");
  const [wait, setWait] = useState(false);
  const [strikes, setStrikes] = useState(0);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(limitSec ?? 0);
  const [stormLeft, setStormLeft] = useState(storm ? 180 : 0);
  const [over, setOver] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [session, setSession] = useState<PuzzleAttempt[]>([]);
  const seen = useMemo(() => new Set<string>(), []);
  const penalized = useRef(false);
  const expired = useRef(false);
  const waitId = useRef(0);
  const advanceId = useRef(0);
  const stopRef = useRef(false);
  const playedRef = useRef<string[]>([]);
  const clockOn = !over && !review && !solved && !failed && !timedOut && !stopped && step === live && !wait;
  const limitOn = !over && !review && !solved && !failed && !timedOut && !stopped && step === live;
  const watch = useStopwatch(clockOn);

  function clearWait() {
    window.clearTimeout(waitId.current);
    window.clearTimeout(advanceId.current);
    setWait(false);
  }

  function remember(current: Puzzle, ok: boolean, wrong?: string) {
    const attempt: PuzzleAttempt = {
      puzzleId: current.id,
      fen: current.fen,
      line: current.line,
      themes: current.themes,
      rating: current.rating,
      ok,
      at: new Date().toISOString(),
      played: wrong ? [...playedRef.current, wrong] : [...playedRef.current],
      wrong,
    };
    if (!attempt.played.length) attempt.played = current.line.slice(0, 1);
    logAttempt(attempt);
    setSession((list) => [...list, attempt]);
  }

  function next(fromRating = goal) {
    if (stopRef.current) return;
    const p = pick(puzzles, fromRating, themes, seen);
    if (!p) {
      setEmpty(true);
      setPuzzle(null);
      return;
    }
    seen.add(p.id);
    clearWait();
    setEmpty(false);
    setPuzzle(p);
    setStep(1);
    setLive(1);
    setSolved(false);
    setFailed(false);
    setReview(false);
    setHint("");
    setTimedOut(false);
    penalized.current = false;
    expired.current = false;
    playedRef.current = p.line.slice(0, 1);
    setLeft(limitSec ?? 0);
    watch.reset();
  }

  useEffect(() => {
    if (puzzles.length) next();
    return () => {
      window.clearTimeout(waitId.current);
      window.clearTimeout(advanceId.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzles, themes.join("|"), limitSec, storm]);

  useEffect(() => {
    if (!limitSec || !limitOn) return;
    const id = window.setInterval(() => setLeft((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [limitSec, limitOn, puzzle?.id]);

  useEffect(() => {
    if (!storm || over || review || solved || stopped) return;
    const id = window.setInterval(() => {
      setStormLeft((s) => {
        if (s <= 1) {
          setOver(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [storm, over, review, solved, stopped]);

  useEffect(() => {
    if (!limitSec || left !== 0 || solved || failed || timedOut || over || stopped || expired.current) return;
    expired.current = true;
    if (!penalized.current && puzzle) {
      penalized.current = true;
      grade(false);
      remember(puzzle, false);
      if (storm) {
        setStrikes((n) => {
          if (n + 1 >= 3) setOver(true);
          return n + 1;
        });
      }
    }
    if ((autoNext || autoAdvance) && !over && !stopRef.current) next();
    else setTimedOut(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, limitSec, solved, failed, timedOut, over, autoNext, autoAdvance]);

  const solver: Color = useMemo(() => {
    if (!puzzle) return "white";
    return positionAt(puzzle.fen, puzzle.line, 1)?.turn ?? "white";
  }, [puzzle]);

  const shown = useMemo(() => {
    if (!puzzle) return null;
    return positionAt(puzzle.fen, puzzle.line, Math.min(step, puzzle.line.length));
  }, [puzzle, step]);

  function grade(ok: boolean) {
    if (!puzzle) return;
    const expected = 1 / (1 + 10 ** ((puzzle.rating - rating) / 400));
    setRating(rating + 20 * ((ok ? 1 : 0) - expected));
  }

  function finishSolve() {
    if (!puzzle) return;
    setSolved(true);
    grade(true);
    playedRef.current = [...puzzle.line];
    remember(puzzle, true);
    if (storm) setScore((n) => n + 1);
    if (autoAdvance && !stopRef.current) {
      advanceId.current = window.setTimeout(() => next(), 700);
    }
  }

  function play(from: string, to: string, promotion?: Role) {
    if (!puzzle || !shown || over || review || solved || failed || timedOut || stopped || wait) return;
    if (step !== live || step % 2 !== 1) return;
    const move = legalMove(shown, from, to, promotion);
    if (!move) return;
    const { uci } = sanAndUci(shown, move);
    const expected = puzzle.line[step];
    if (uci !== expected) {
      knock(sound);
      if (!infinite) {
        setHint("Não era esse. O desafio fica por aqui.");
        if (!penalized.current) {
          penalized.current = true;
          grade(false);
          remember(puzzle, false, uci);
          if (storm) {
            setStrikes((n) => {
              if (n + 1 >= 3) setOver(true);
              return n + 1;
            });
          }
        }
        setFailed(true);
        if (autoAdvance && !stopRef.current) advanceId.current = window.setTimeout(() => next(), 900);
        return;
      }
      setHint("Não era esse. Pode tentar outro lance.");
      if (!penalized.current) {
        penalized.current = true;
        grade(false);
        if (storm) {
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
    playedRef.current = puzzle.line.slice(0, after);
    if (after >= puzzle.line.length) {
      setStep(after);
      setLive(after);
      finishSolve();
      return;
    }
    setStep(after);
    setLive(after);
    setWait(true);
    window.clearTimeout(waitId.current);
    waitId.current = window.setTimeout(() => {
      const landed = after + 1;
      setWait(false);
      setLive(landed);
      setStep((current) => (current === after ? landed : current));
      playedRef.current = puzzle.line.slice(0, landed);
      if (landed >= puzzle.line.length) finishSolve();
    }, 400);
  }

  function jump(to: number) {
    if (!puzzle) return;
    const cap = review ? puzzle.line.length : live;
    setStep(Math.max(1, Math.min(cap, to)));
  }

  function stop() {
    stopRef.current = true;
    clearWait();
    setStopped(true);
  }

  if (stopped) {
    return (
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-2xl">Revisão do treino</h2>
          <button
            type="button"
            className="btn"
            onClick={() => {
              stopRef.current = false;
              setStopped(false);
              setSession([]);
              next();
            }}
          >
            Novo treino
          </button>
        </div>
        <AttemptReview items={session} auto />
      </div>
    );
  }

  if (empty || !puzzle || !shown) {
    return <p className="text-muted">{empty ? "Sem problemas com esta combinação de temas." : "A escolher um problema…"}</p>;
  }
  const themesText = themeLine(puzzle);
  const userTurn = !solved && !failed && !over && !review && !timedOut && !wait && step === live && step % 2 === 1 && step < puzzle.line.length;
  const mateNow = shown.isCheckmate();

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,42rem)_18rem]">
      <div>
        <Board
          key={puzzle.id}
          fen={fenOf(shown)}
          dests={userTurn ? destsOf(shown) : {}}
          lastMove={lastSquares(puzzle.line[Math.min(step, puzzle.line.length) - 1])}
          checkSquare={checkedKing(shown)}
          interactive={userTurn}
          sideToMove={shown.turn}
          orientation={solver}
          isPromotion={(from, to) => needsPromotion(shown, from, to)}
          onMove={play}
        />
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button type="button" className="btn" onClick={() => jump(1)}>
            Início
          </button>
          <button type="button" className="btn" onClick={() => jump(step - 1)} disabled={step <= 1}>
            Anterior
          </button>
          <button type="button" className="btn" onClick={() => jump(step + 1)} disabled={step >= (review ? puzzle.line.length : live)}>
            Seguinte
          </button>
          <button type="button" className="btn" onClick={() => jump(review ? puzzle.line.length : live)}>
            Fim
          </button>
        </div>
      </div>
      <Panel>
        <p className="font-display text-3xl tabular-nums text-brass">{formatWatch(watch.ms)}</p>
        {limitSec != null && limitSec > 0 && (
          <p className="mt-1 text-sm text-muted">Limite {left}s{autoNext ? " · recomeça sozinho" : ""}</p>
        )}
        <p className="mt-1 text-sm text-muted">
          {storm ? `Tempestade ${stormLeft}s · ${score} certos · ${strikes}/3 erros · ` : ""}
          Rating {rating}
        </p>
        <p className="mt-2 text-sm">
          Elo {puzzle.rating}
          <span className="text-muted"> · {puzzle.id}</span>
        </p>
        <p className="mt-1 text-sm">{themesText}</p>
        {wait && <p className="mt-3 text-sm text-muted">O adversário responde em seguida.</p>}
        {review && <p className="mt-3 text-sm text-muted">Solução, lance a lance. O cronómetro está parado.</p>}
        {hint && !review && <p className="mt-3 text-sm text-blood">{hint}</p>}
        {timedOut && !review && <p className="mt-3 text-sm text-blood">Tempo esgotado neste problema.</p>}
        {failed && !review && <p className="mt-3 text-sm text-blood">Desafio perdido neste problema.</p>}
        {solved && !review && (
          <p className="mt-3 text-sm text-good">{mateNow ? "Resolvido. Xeque-mate." : "Resolvido."}</p>
        )}
        {over && <p className="mt-3 text-sm">Tempo ou três erros. {score} problemas.</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {autoAdvance && !over && (
            <button type="button" className="btn" onClick={stop}>
              Parar
            </button>
          )}
          {(solved || failed || review || timedOut) && !over && !autoAdvance && (
            <button type="button" className="btn btn-primary" onClick={() => next()}>
              Seguinte
            </button>
          )}
          {!review && !over && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                clearWait();
                setReview(true);
                setStep(1);
                setHint("");
              }}
            >
              Ver solução
            </button>
          )}
          {review && infinite && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setReview(false);
                setStep(1);
                setLive(1);
                setSolved(false);
                setFailed(false);
                setHint("");
                setTimedOut(false);
                playedRef.current = puzzle.line.slice(0, 1);
              }}
            >
              Tentar de novo
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
                setStormLeft(180);
                next();
              }}
            >
              Outra série
            </button>
          )}
        </div>
        <p className="mt-3 text-xs text-muted">
          {infinite ? "Pode errar e tentar outra vez." : "Um lance errado perde o problema."} A resposta espera 0,4s.
        </p>
      </Panel>
    </div>
  );
}

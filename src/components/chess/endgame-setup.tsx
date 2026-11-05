import { useEffect, useMemo, useRef, useState } from "react";
import { Shuffle } from "lucide-react";
import type { Color, Role } from "chessops/types";
import { Board } from "@/components/chess/board";
import { Panel } from "@/components/chess/shell";
import { StrengthField } from "@/components/chess/strength-field";
import { Engine } from "@/lib/chess/engine";
import { checkedKing, destsOf, fenOf, lastSquares, legalMove, needsPromotion, playUciOn, positionAt, sanAndUci } from "@/lib/chess/logic";
import { publicUrl } from "@/lib/chess/public-url";
import { useVault, type PerfectAttempt } from "@/lib/chess/store";

export type EndgameChoice = {
  elo: number;
  side: Color;
  local: boolean;
  perfect: boolean;
};

const WARN =
  "As peças pretas estão em desvantagem posicional. Se você as escolher, o Stockfish jogará lances errados de propósito para te dar uma chance de virar o jogo. Quanto maior o Elo, mais fino é o erro.";

export function EndgameCard({
  title,
  goal,
  onBack,
  onStart,
}: {
  title: string;
  goal: string;
  onBack: () => void;
  onStart: (choice: EndgameChoice) => void;
}) {
  const [perfect, setPerfect] = useState(false);
  const [local, setLocal] = useState(false);
  const [elo, setElo] = useState(1200);
  const [color, setColor] = useState<"white" | "black" | "random">("white");

  function begin() {
    const side: Color = color === "random" ? (Math.random() < 0.5 ? "white" : "black") : color;
    onStart({ elo, side, local: perfect ? false : local, perfect });
  }

  return (
    <Panel className="mx-auto max-w-xl">
      <button type="button" className="btn" onClick={onBack}>
        Voltar
      </button>
      <h2 className="mt-3 font-display text-3xl">{title}</h2>
      <p className="mt-1 text-sm text-muted">{goal}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" className={!perfect ? "btn btn-primary" : "btn"} onClick={() => setPerfect(false)}>
          Contra o modelo
        </button>
        <button type="button" className={perfect ? "btn btn-primary" : "btn"} onClick={() => setPerfect(true)}>
          Final Perfeito
        </button>
      </div>
      {!perfect && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className={!local ? "btn btn-primary" : "btn"} onClick={() => setLocal(false)}>
            Motor
          </button>
          <button type="button" className={local ? "btn btn-primary" : "btn"} onClick={() => setLocal(true)}>
            Duas pessoas
          </button>
        </div>
      )}
      {!perfect && !local && (
        <div className="mt-4">
          <StrengthField elo={elo} onChange={setElo} label="Modelo" />
          <p className="mt-3 text-xs text-blood">{WARN}</p>
        </div>
      )}
      {perfect && (
        <p className="mt-4 text-sm text-muted">
          Cada lance seu tem de ser o melhor da posição. O outro lado responde com o lance perfeito. No fim, a revisão mostra a seta do Stockfish, como na solução de um problema.
        </p>
      )}
      <p className="mt-5 mb-2 text-sm text-muted">A sua cor</p>
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["white", "Brancas"],
            ["random", "Sorteio"],
            ["black", "Pretas"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={color === id ? "btn btn-primary flex-col py-3" : "btn flex-col py-3"} onClick={() => setColor(id)}>
            {id === "random" ? (
              <Shuffle className="size-7" aria-hidden="true" />
            ) : (
              <img src={publicUrl(id === "white" ? "/pieces/wK.svg" : "/pieces/bK.svg")} alt="" className="size-9" />
            )}
            <span className="text-xs">{label}</span>
          </button>
        ))}
      </div>
      <button type="button" className="btn btn-primary mt-5 w-full" onClick={begin}>
        {perfect ? "Começar o Final Perfeito" : "Começar"}
      </button>
    </Panel>
  );
}

function sameUci(a: string, b: string) {
  if (a.slice(0, 4) !== b.slice(0, 4)) return false;
  if (!a[4] && !b[4]) return true;
  return (a[4] ?? "q") === (b[4] ?? "q");
}

function arrowOf(uci: string | undefined): [string, string] | null {
  if (!uci || uci.length < 4) return null;
  return [uci.slice(0, 2), uci.slice(2, 4)];
}

export function PerfectDrill({
  fen,
  side,
  endgameId,
  name,
  onExit,
}: {
  fen: string;
  side: Color;
  endgameId: string;
  name: string;
  onExit: () => void;
}) {
  const attempts = useVault((s) => s.perfectAttempts);
  const logPerfect = useVault((s) => s.logPerfect);
  const setRecord = useVault((s) => s.setPerfectRecord);
  const [ucis, setUcis] = useState<string[]>([]);
  const [best, setBest] = useState<string[]>([]);
  const [expected, setExpected] = useState("");
  const [status, setStatus] = useState<"play" | "fail" | "done" | "review">("play");
  const [note, setNote] = useState("A calcular o lance perfeito…");
  const [missBest, setMissBest] = useState("");
  const [good, setGood] = useState(0);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [back, setBack] = useState<"play" | "fail" | "done">("play");
  const saved = useRef(false);

  const pos = useMemo(() => positionAt(fen, ucis, ucis.length), [fen, ucis]);
  const mine = attempts.filter((item) => item.endgameId === endgameId);
  const review = mine.find((item) => item.id === reviewId) ?? null;
  const reviewPos = review ? positionAt(review.fen, review.played, step) : null;

  useEffect(() => {
    if (status !== "play" || !pos) return;
    if (pos.isCheckmate() || pos.isStalemate() || pos.isInsufficientMaterial() || pos.halfmoves >= 150) {
      setStatus("done");
      setNote("Final perfeito.");
      return;
    }
    const userTurn = pos.turn === side;
    const live = fenOf(pos);
    let cancel = false;
    setExpected("");
    if (userTurn) setNote("A calcular o lance perfeito…");
    const timer = window.setTimeout(() => {
      void Engine.shared()
        .go(live, { movetime: userTurn ? 420 : 280, skill: 20, elo: null, multipv: 1 })
        .then((res) => {
          if (cancel || !res.uci) {
            if (!cancel && userTurn) setNote("Motor indisponível.");
            return;
          }
          if (userTurn) {
            setExpected(res.uci);
            setNote("");
            return;
          }
          const livePos = positionAt(fen, ucis, ucis.length);
          if (!livePos || !playUciOn(livePos.clone(), res.uci)) {
            setNote("O motor não devolveu um lance legal.");
            return;
          }
          setUcis((list) => [...list, res.uci]);
          setBest((list) => [...list, res.uci]);
        })
        .catch(() => {
          if (!cancel && userTurn) setNote("Motor indisponível.");
        });
    }, 60);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [fen, pos, side, status, ucis.length]);

  useEffect(() => {
    if (saved.current || (status !== "fail" && status !== "done")) return;
    saved.current = true;
    const ok = status === "done";
    const attempt: PerfectAttempt = {
      id: crypto.randomUUID(),
      endgameId,
      name,
      fen,
      side,
      played: ucis,
      best,
      ok,
      moves: good,
      at: new Date().toISOString(),
      missBest: ok ? undefined : missBest,
    };
    logPerfect(attempt);
    setRecord(endgameId, name, good, ok);
    setReviewId(attempt.id);
  }, [best, endgameId, fen, good, logPerfect, missBest, name, setRecord, side, status, ucis]);

  function play(from: string, to: string, promotion?: Role) {
    if (!pos || status !== "play" || pos.turn !== side || !expected) return;
    const move = legalMove(pos, from, to, promotion);
    if (!move) return;
    const uci = sanAndUci(pos, move).uci;
    if (!sameUci(uci, expected)) {
      setMissBest(expected);
      setStatus("fail");
      setNote("Não era o lance perfeito. A seta mostra o certo.");
      return;
    }
    setUcis((list) => [...list, uci]);
    setBest((list) => [...list, expected]);
    setGood((n) => n + 1);
    setExpected("");
  }

  function openReview(item: PerfectAttempt) {
    setBack(status === "review" ? back : status);
    setReviewId(item.id);
    setStep(0);
    setStatus("review");
  }

  if (status === "review" && review && reviewPos) {
    const next = step < review.played.length ? review.best[step] : review.missBest;
    return (
      <div>
        <div className="mb-3 flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={onExit}>
            Sair
          </button>
          <button type="button" className="btn" onClick={() => setStatus(back)}>
            Voltar à tentativa
          </button>
        </div>
        <h2 className="mb-3 font-display text-2xl">Revisão · {name}</h2>
        <div className="grid items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <ul className="max-h-80 space-y-1 overflow-auto text-sm">
            {mine.map((item) => (
              <li key={item.id}>
                <button type="button" className={item.id === review.id ? "btn btn-primary w-full justify-start" : "btn w-full justify-start"} onClick={() => openReview(item)}>
                  {item.ok ? "Perfeito" : "Falhou"} · {item.moves} lances
                </button>
              </li>
            ))}
          </ul>
          <div>
            <Board
              fen={fenOf(reviewPos)}
              orientation={review.side}
              lastMove={lastSquares(review.played[step - 1])}
              checkSquare={checkedKing(reviewPos)}
              hintArrow={arrowOf(next)}
            />
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button type="button" className="btn" onClick={() => setStep(0)}>Início</button>
              <button type="button" className="btn" onClick={() => setStep((n) => Math.max(0, n - 1))}>Anterior</button>
              <button type="button" className="btn" onClick={() => setStep((n) => Math.min(review.played.length, n + 1))}>Seguinte</button>
              <button type="button" className="btn" onClick={() => setStep(review.played.length)}>Fim</button>
            </div>
            <p className="mt-3 text-sm text-muted">A seta é o lance perfeito nesta posição, como na solução de um problema.</p>
          </div>
        </div>
      </div>
    );
  }

  const showArrow = status === "fail" ? arrowOf(missBest) : null;
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={onExit}>
          Parar
        </button>
        {mine.length > 0 && (
          <button type="button" className="btn" onClick={() => openReview(mine[0]!)}>
            Rever tentativas
          </button>
        )}
      </div>
      <h2 className="mb-1 font-display text-2xl">Final Perfeito · {name}</h2>
      <p className="mb-3 text-sm text-muted">{good} lances perfeitos</p>
      {pos && (
        <Board
          fen={fenOf(pos)}
          orientation={side}
          dests={status === "play" && pos.turn === side && expected ? destsOf(pos) : {}}
          lastMove={lastSquares(ucis[ucis.length - 1])}
          checkSquare={checkedKing(pos)}
          interactive={status === "play" && pos.turn === side && Boolean(expected)}
          sideToMove={pos.turn}
          isPromotion={(from, to) => needsPromotion(pos, from, to)}
          hintArrow={showArrow}
          onMove={play}
        />
      )}
      {note && <p className={`mt-3 text-sm ${status === "fail" ? "text-blood" : status === "done" ? "text-good" : "text-muted"}`}>{note}</p>}
      {status === "done" && <p className="mt-2 text-sm text-brass">Recorde guardado na Evolução.</p>}
    </div>
  );
}

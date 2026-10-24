import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Settings } from "lucide-react";
import { parseSan } from "chessops/san";
import { makeSquare } from "chessops/util";
import type { Color, Role } from "chessops/types";
import { Shell, Panel } from "@/components/chess/shell";
import { Board } from "@/components/chess/board";
import { LiveGame } from "@/components/chess/live-game";
import { PuzzleRun } from "@/components/chess/puzzle-run";
import { StrengthField } from "@/components/chess/strength-field";
import { formatWatch, useStopwatch } from "@/components/chess/stopwatch";
import { corpus, type Opening, type Puzzle } from "@/lib/chess/corpus";
import { generateEndgame, type EndgameId } from "@/lib/chess/endgames";
import { Engine } from "@/lib/chess/engine";
import {
  ENDGAMES,
  MARK_CLASS,
  START_FEN,
  TIME_CONTROLS,
  checkedKing,
  destsOf,
  fenOf,
  formatClock,
  legalMove,
  loadFen,
  needsPromotion,
  openingColor,
  sanAndUci,
  ucisFromSans,
  type Mark,
  type TimeId,
} from "@/lib/chess/logic";
import { reviewLine } from "@/lib/chess/review";
import { eloToEngine, strengthName } from "@/lib/chess/strength";
import { useVault } from "@/lib/chess/store";

export const Route = createFileRoute("/treino")({ component: Treino });

type Tab = "aberturas" | "finais" | "meio";
const FAMILIES = ["Flanco", "Semiabertas", "Abertas", "Fechadas", "Indianas"];

function lineFen(moves: string) {
  const chess = loadFen(START_FEN);
  if (!chess) return START_FEN;
  for (const san of moves.split(" ")) {
    if (!san) continue;
    const mv = parseSan(chess, san);
    if (!mv) break;
    chess.play(mv);
  }
  return fenOf(chess);
}

function rootOf(name: string) {
  return name.split(":")[0]!.trim();
}

function Treino() {
  const saved = useVault((s) => s.drill);
  const saveDrill = useVault((s) => s.saveDrill);
  const [tab, setTab] = useState<Tab>("aberturas");
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState("");
  const [page, setPage] = useState(0);
  const [openRoot, setOpenRoot] = useState("");
  const [preview, setPreview] = useState<Opening | null>(null);
  const [endQueue, setEndQueue] = useState<string[]>(saved?.endgames ?? []);
  const [side, setSide] = useState<Color>(saved?.color ?? "white");
  const [elo, setElo] = useState(saved?.elo ?? 1200);
  const [solo, setSolo] = useState(false);
  const [session, setSession] = useState<null | { opening: Opening; kind: "line" | "practice" | "card" }>(null);
  const [endAt, setEndAt] = useState(0);
  const [endOn, setEndOn] = useState(false);
  const [fen, setFen] = useState<string | null>(null);
  const [spin, setSpin] = useState(0);

  useEffect(() => {
    void corpus().then((c) => {
      setOpenings(c.openings);
      setPuzzles(c.puzzles);
    });
  }, []);

  const pool = useMemo(() => {
    const q = query.trim().toLowerCase();
    return openings.filter((o) => {
      if (family && o.family !== family) return false;
      if (q.length >= 2 && !`${o.eco} ${o.name} ${o.family}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [openings, query, family]);

  const roots = useMemo(() => {
    const map = new Map<string, Opening[]>();
    for (const opening of pool) {
      const root = rootOf(opening.name);
      const list = map.get(root) ?? [];
      list.push(opening);
      map.set(root, list);
    }
    return [...map.entries()];
  }, [pool]);

  useEffect(() => {
    setPage(0);
  }, [query, family]);

  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(roots.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const windowed = roots.slice(safePage * pageSize, safePage * pageSize + pageSize);

  function persist() {
    saveDrill({ openings: [], endgames: endQueue, elo, color: side });
  }

  function backToList() {
    setSession(null);
  }

  return (
    <Shell>
      <h1 className="font-display text-3xl">Treino</h1>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:max-w-lg">
        {(
          [
            ["aberturas", "Aberturas"],
            ["finais", "Finais"],
            ["meio", "Meio-jogo"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "btn btn-primary" : "btn"} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "aberturas" && session && (
        <div className="mt-4">
          <button type="button" className="btn btn-primary mb-3" onClick={backToList}>
            Voltar à lista
          </button>
          <h2 className="mb-3 font-display text-2xl">
            {session.opening.eco} {session.opening.name}
          </h2>
          {session.kind === "line" && <Trainer key={`${session.opening.eco}-${session.opening.name}`} opening={session.opening} />}
          {session.kind === "practice" && (
            <PracticeOpening opening={session.opening} elo={elo} onElo={setElo} onBack={backToList} />
          )}
          {session.kind === "card" && <FromLine opening={session.opening} onBack={backToList} />}
        </div>
      )}

      {tab === "aberturas" && !session && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <Panel>
            <p className="text-sm text-muted">{openings.length ? `${openings.length.toLocaleString("pt-PT")} linhas` : "A carregar…"}</p>
            <input className="field mt-2" placeholder="Nome ou ECO" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" className={!family ? "btn btn-primary" : "btn"} onClick={() => setFamily("")}>
                Todas
              </button>
              {FAMILIES.map((name) => (
                <button key={name} type="button" className={family === name ? "btn btn-primary" : "btn"} onClick={() => setFamily(name)}>
                  {name}
                </button>
              ))}
            </div>
            <ul className="mt-3 max-h-[28rem] space-y-1 overflow-auto text-sm">
              {windowed.map(([root, list]) => (
                <li key={root}>
                  <button type="button" className="w-full rounded-lg px-2 py-2 text-left hover:bg-panel-2" onClick={() => setOpenRoot((v) => (v === root ? "" : root))}>
                    <span className="text-brass">{list[0]?.eco}</span> {root}
                    <span className="text-muted"> · {list.length}</span>
                  </button>
                  {openRoot === root && (
                    <ul className="mb-2 ml-2 space-y-1">
                      {list.slice(0, 20).map((o) => (
                        <li key={`${o.eco}-${o.name}-${o.moves}`}>
                          <button type="button" className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-panel-2" onClick={() => setPreview(o)}>
                            {o.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
              <button type="button" className="btn" disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                Anteriores
              </button>
              <span>
                {roots.length ? `${safePage * pageSize + 1}–${Math.min(roots.length, (safePage + 1) * pageSize)} de ${roots.length}` : "0"}
              </span>
              <button type="button" className="btn" disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>
                Seguintes
              </button>
            </div>
          </Panel>
          <div className="space-y-4">
            {preview ? (
              <Panel>
                <h2 className="font-display text-2xl">
                  {preview.eco} {preview.name}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {preview.family}. {preview.moves}
                </p>
                <p className="mt-1 text-sm">Só com as {openingColor(preview.moves) === "white" ? "brancas" : "pretas"}.</p>
                <div className="mt-3">
                  <Board fen={lineFen(preview.moves)} orientation={openingColor(preview.moves)} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setSession({ opening: preview, kind: "line" })}
                  >
                    Montar linha
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setSession({ opening: preview, kind: "practice" })}
                  >
                    Praticar abertura
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setSession({ opening: preview, kind: "card" })}
                  >
                    Jogar a partir da linha
                  </button>
                </div>
              </Panel>
            ) : (
              <p className="text-muted">Escolha uma abertura. A linha só se joga com a cor para a qual foi feita.</p>
            )}
          </div>
        </div>
      )}

      {tab === "finais" && endOn && fen && (
        <EndgamePlay
          id={(endQueue[endAt] || ENDGAMES[0]!.id) as EndgameId}
          fen={fen}
          elo={elo}
          side={side}
          solo={solo}
          spin={spin}
          hasNext={endAt < endQueue.length - 1}
          onStop={() => setEndOn(false)}
          onAgain={() => setSpin((n) => n + 1)}
          onFresh={() => {
            setFen(generateEndgame((endQueue[endAt] || "pp") as EndgameId));
            setSpin((n) => n + 1);
          }}
          onNext={() => {
            const next = endAt + 1;
            setEndAt(next);
            setFen(generateEndgame(endQueue[next] as EndgameId));
            setSpin((n) => n + 1);
          }}
        />
      )}

      {tab === "finais" && !endOn && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <Panel>
            <ul className="space-y-1 text-sm">
              {ENDGAMES.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className="w-full rounded-lg px-2 py-2 text-left hover:bg-panel-2"
                    onClick={() => {
                      setFen(generateEndgame(e.id as EndgameId));
                      setEndQueue((q) => (q.includes(e.id) ? q : [...q, e.id]));
                    }}
                  >
                    {e.name}
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel>
            <h2 className="font-display text-2xl">Fila de finais</h2>
            {fen && <div className="mt-3"><Board fen={fen} orientation={side} /></div>}
            {endQueue.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Escolha um final para o pré-visualizar.</p>
            ) : (
              <ul className="mt-3 space-y-1 text-sm">
                {endQueue.map((id) => {
                  const item = ENDGAMES.find((e) => e.id === id);
                  return (
                    <li key={id} className="flex items-center justify-between gap-2">
                      <span>{item?.name ?? id}</span>
                      <button type="button" className="text-muted" onClick={() => setEndQueue((q) => q.filter((x) => x !== id))}>
                        Tirar
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 text-sm text-muted">{ENDGAMES.find((e) => e.id === endQueue.at(-1))?.goal}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" className={side === "white" ? "btn btn-primary" : "btn"} onClick={() => setSide("white")}>
                Brancas
              </button>
              <button type="button" className={side === "black" ? "btn btn-primary" : "btn"} onClick={() => setSide("black")}>
                Pretas
              </button>
            </div>
            <div className="mt-3">
              <StrengthField elo={elo} onChange={setElo} />
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={solo} onChange={(e) => setSolo(e.target.checked)} />
              Sozinho, sem motor
            </label>
            <p className="mt-2 text-xs text-muted">Com as pretas, o motor erra de propósito. Quanto maior o elo, mais fino é o erro. O peão passado não se promove sozinho.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn" onClick={persist}>
                Guardar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!endQueue.length}
                onClick={() => {
                  setEndAt(0);
                  setFen(generateEndgame(endQueue[0] as EndgameId));
                  setEndOn(true);
                  setSpin(0);
                }}
              >
                Começar ({endQueue.length})
              </button>
            </div>
          </Panel>
        </div>
      )}

      {tab === "meio" && puzzles.length > 0 && (
        <div className="mt-4">
          <p className="mb-3 text-sm text-muted">Acertar passa ao seguinte. Parar abre a revisão.</p>
          <PuzzleRun puzzles={puzzles} themes={["middlegame"]} autoAdvance />
        </div>
      )}
      {tab === "meio" && puzzles.length === 0 && <p className="mt-4 text-muted">A carregar problemas…</p>}
    </Shell>
  );
}

function EndgamePlay({
  id,
  fen,
  elo,
  side,
  solo,
  spin,
  hasNext,
  onStop,
  onAgain,
  onFresh,
  onNext,
}: {
  id: EndgameId;
  fen: string;
  elo: number;
  side: Color;
  solo: boolean;
  spin: number;
  hasNext: boolean;
  onStop: () => void;
  onAgain: () => void;
  onFresh: () => void;
  onNext: () => void;
}) {
  const drill = ENDGAMES.find((e) => e.id === id) ?? ENDGAMES[0]!;
  const engine = eloToEngine(elo);
  const human = solo ? "both" : side;
  return (
    <div className="mt-4">
      <h2 className="font-display text-2xl">{drill.name}</h2>
      <p className="mt-1 mb-3 text-sm text-muted">{drill.goal}</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={onStop}>
          Parar
        </button>
        <button type="button" className="btn" onClick={onFresh}>
          Outra posição
        </button>
        <button type="button" className="btn" onClick={onAgain}>
          Jogar de novo
        </button>
        {hasNext && (
          <button type="button" className="btn btn-primary" onClick={onNext}>
            Seguinte
          </button>
        )}
      </div>
      <LiveGame
        key={`${id}-${spin}-${human}-${elo}`}
        config={{
          startFen: fen,
          human,
          bot: solo ? null : { name: strengthName(engine.nominal), skill: engine.skill, elo: engine.elo, nominal: engine.nominal },
          clock: null,
          tcLabel: drill.name,
          slipElo: !solo && human === "black" ? engine.nominal : null,
          whiteName: human === "both" ? "Brancas" : human === "white" ? "Você" : strengthName(engine.nominal),
          blackName: human === "both" ? "Pretas" : human === "black" ? "Você" : strengthName(engine.nominal),
        }}
      />
    </div>
  );
}

function Trainer({ opening }: { opening: Opening }) {
  const side = openingColor(opening.moves);
  const line = opening.moves;
  const sans = useMemo(() => line.split(" ").filter(Boolean), [line]);
  const [ply, setPly] = useState(0);
  const [note, setNote] = useState("");
  const [gear, setGear] = useState(false);
  const [timed, setTimed] = useState(false);
  const [seconds, setSeconds] = useState(60);
  const [restartOnMiss, setRestartOnMiss] = useState(false);
  const [autoRestart, setAutoRestart] = useState(false);
  const [hintOn, setHintOn] = useState(false);
  const [hintSan, setHintSan] = useState("");
  const [locked, setLocked] = useState(false);
  const replay = useMemo(() => {
    const chess = loadFen(START_FEN);
    let last: [string, string] | null = null;
    if (!chess) return { chess: null, last };
    for (let i = 0; i < ply; i++) {
      const mv = parseSan(chess, sans[i] ?? "");
      if (!mv || !("from" in mv)) break;
      last = [makeSquare(mv.from), makeSquare(mv.to)];
      chess.play(mv);
    }
    return { chess, last };
  }, [ply, sans]);
  const pos = replay.chess;
  const rating = useVault((s) => s.rating);
  const done = ply >= sans.length;
  const watch = useStopwatch(Boolean(pos) && !done && !locked);
  const [marks, setMarks] = useState<Mark[] | null>(null);
  const [busy, setBusy] = useState("");
  const limit = Math.max(5, seconds) * 1000;

  function restart() {
    setPly(0);
    setNote("");
    setMarks(null);
    setLocked(false);
    setHintSan("");
    watch.reset();
  }

  useEffect(() => {
    if (!pos || done || locked || pos.turn === side) return;
    const id = window.setTimeout(() => setPly((n) => n + 1), 320);
    return () => window.clearTimeout(id);
  }, [ply, pos, done, locked, side]);

  useEffect(() => {
    if (!timed || locked || done || watch.ms < limit) return;
    if (autoRestart) restart();
    else {
      setNote("Tempo esgotado.");
      setLocked(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch.ms, timed, locked, done, limit, autoRestart]);

  useEffect(() => {
    if (!hintOn || !pos || done || pos.turn !== side) {
      setHintSan("");
      return;
    }
    const fen = fenOf(pos);
    let cancel = false;
    void Engine.shared()
      .go(fen, { movetime: 240, skill: 20, elo: null })
      .then((res) => {
        if (cancel || !res.uci) return;
        const live = loadFen(fen);
        if (!live) return;
        const promo = res.uci[4];
        const role = promo === "q" ? "queen" : promo === "r" ? "rook" : promo === "b" ? "bishop" : promo === "n" ? "knight" : undefined;
        const move = legalMove(live, res.uci.slice(0, 2), res.uci.slice(2, 4), role);
        if (!move) return;
        setHintSan(sanAndUci(live, move).san);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [hintOn, ply, done, side, pos]);

  if (!pos) return null;
  const mine = pos.turn === side && !done && !locked;

  function play(from: string, to: string, promotion?: Role) {
    if (!pos || pos.turn !== side || done || locked) return;
    const move = legalMove(pos, from, to, promotion);
    if (!move) return;
    const packed = sanAndUci(pos, move);
    if (packed.san !== sans[ply]) {
      setNote(`Neste ponto o livro joga ${sans[ply]}.`);
      if (autoRestart) restart();
      else if (restartOnMiss) setLocked(true);
      return;
    }
    setNote("");
    setPly((n) => n + 1);
  }

  const clockLabel = timed ? formatClock(Math.max(0, limit - watch.ms)) : formatWatch(watch.ms);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,42rem)_16rem]">
      <Board
        fen={fenOf(pos)}
        orientation={side}
        dests={mine ? destsOf(pos) : {}}
        lastMove={replay.last}
        checkSquare={checkedKing(pos)}
        interactive={mine}
        sideToMove={pos.turn}
        isPromotion={(from, to) => needsPromotion(pos, from, to)}
        onMove={play}
      />
      <Panel>
        <div className="flex items-start justify-between gap-2">
          <p className="font-display text-3xl tabular-nums text-brass">{clockLabel}</p>
          <div className="relative">
            <button type="button" className={gear ? "btn btn-primary" : "btn"} aria-label="Configurações" onClick={() => setGear((v) => !v)}>
              <Settings className="size-4" />
            </button>
            {gear && (
              <div className="absolute right-0 z-20 mt-2 w-64 space-y-2 rounded-xl border border-line bg-panel p-3 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} />
                  Com tempo
                </label>
                <label className="block text-muted">
                  Segundos para a linha
                  <input className="field mt-1" type="number" min={5} max={900} value={seconds} onChange={(e) => setSeconds(Math.max(5, Number(e.target.value) || 5))} />
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={restartOnMiss} onChange={(e) => setRestartOnMiss(e.target.checked)} />
                  Reiniciar se errar
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={autoRestart} onChange={(e) => setAutoRestart(e.target.checked)} />
                  Reiniciar automaticamente
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={hintOn} onChange={(e) => setHintOn(e.target.checked)} />
                  Sugestão do Stockfish
                </label>
              </div>
            )}
          </div>
        </div>
        <p className="mt-1 text-sm text-muted">
          {opening.family} · só com as {side === "white" ? "brancas" : "pretas"}
        </p>
        {hintOn && hintSan && <p className="mt-2 text-sm text-brass">Sugestão: {hintSan}</p>}
        <p className="mt-2 text-sm">
          {sans.map((san, i) => (
            <span key={`${san}-${i}`}>
              {i % 2 === 0 ? `${i / 2 + 1}. ` : ""}
              {san} {marks?.[i] && <span className={MARK_CLASS[marks[i]]}>{marks[i]} </span>}
            </span>
          ))}
        </p>
        {done && <p className="mt-3 text-sm text-good">Linha completa.</p>}
        {note && <p className="mt-3 text-sm text-blood">{note}</p>}
        {busy && <p className="mt-2 text-sm text-muted">{busy}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={restart}>
            Recomeçar
          </button>
          {!done && !locked && (
            <button type="button" className="btn" onClick={() => setPly((n) => n + 1)}>
              Mostrar lance
            </button>
          )}
          <button
            type="button"
            className="btn"
            disabled={ply === 0 || Boolean(busy)}
            onClick={() => {
              const ucis = ucisFromSans(START_FEN, sans.slice(0, ply));
              setBusy("A classificar…");
              void reviewLine(START_FEN, ucis, (doneN, total) => setBusy(`${doneN}/${total}`), rating, marks ?? undefined).then((m) => {
                setMarks(m);
                setBusy("");
              });
            }}
          >
            Analisar
          </button>
        </div>
      </Panel>
    </div>
  );
}

const ALERT = new Set<TimeId>(["ultra", "super"]);

function PracticeOpening({ opening, elo, onElo, onBack }: { opening: Opening; elo: number; onElo: (elo: number) => void; onBack: () => void }) {
  const side = openingColor(opening.moves);
  const [gear, setGear] = useState(false);
  const [useClock, setUseClock] = useState(false);
  const [minutes, setMinutes] = useState(5);
  const [inc, setInc] = useState(0);
  const [ready, setReady] = useState(false);
  const [hintOn, setHintOn] = useState(false);
  const [over, setOver] = useState(false);
  const [spin, setSpin] = useState(0);
  const engine = eloToEngine(elo);
  const sans = opening.moves.split(" ").filter(Boolean);
  const prelude = ready ? { sans, ucis: ucisFromSans(START_FEN, sans) } : undefined;
  const initial = useClock ? Math.max(0, minutes) * 60_000 : 0;
  const name = strengthName(engine.nominal);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" className={over ? "btn btn-primary" : "btn"} onClick={onBack}>
          {over ? "Voltar" : "Parar"}
        </button>
        <div className="relative">
          <button type="button" className={gear ? "btn btn-primary" : "btn"} aria-label="Configurações" onClick={() => setGear((v) => !v)}>
            <Settings className="size-4" />
          </button>
          {gear && (
            <div className="absolute left-0 z-20 mt-2 w-72 space-y-2 rounded-xl border border-line bg-panel p-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={useClock} onChange={(e) => setUseClock(e.target.checked)} />
                Com tempo
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-muted">
                  Minutos
                  <input className="field mt-1" type="number" min={0} max={180} value={minutes} onChange={(e) => setMinutes(Math.max(0, Number(e.target.value) || 0))} />
                </label>
                <label className="text-muted">
                  Acréscimo
                  <input className="field mt-1" type="number" min={0} max={60} value={inc} onChange={(e) => setInc(Math.max(0, Number(e.target.value) || 0))} />
                </label>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={ready}
                  onChange={(e) => {
                    setReady(e.target.checked);
                    setSpin((n) => n + 1);
                    setOver(false);
                  }}
                />
                Começar com a posição já feita
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={hintOn} onChange={(e) => setHintOn(e.target.checked)} />
                Sugestão do Stockfish
              </label>
              <StrengthField elo={elo} onChange={onElo} />
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setSpin((n) => n + 1);
                  setOver(false);
                  setGear(false);
                }}
              >
                Aplicar
              </button>
            </div>
          )}
        </div>
        <p className="text-sm text-muted">A jogar com as {side === "white" ? "brancas" : "pretas"}.</p>
      </div>
      <LiveGame
          key={`${spin}-${ready}-${useClock}-${minutes}-${inc}-${elo}`}
          config={{
            human: side,
            bot: { name, skill: engine.skill, elo: engine.elo, nominal: engine.nominal },
            useBook: true,
            opening: opening.name,
            prelude,
            clock: initial ? { initial, inc: inc * 1000 } : null,
            tcLabel: opening.name,
            pace: "human",
            showHint: hintOn,
            whiteName: side === "white" ? "Você" : name,
            blackName: side === "black" ? "Você" : name,
            onEnd: (ending) => {
              if (ending.reason === "Xeque-mate") setOver(true);
            },
          }}
        />
    </div>
  );
}

function FromLine({ opening, onBack }: { opening: Opening; onBack: () => void }) {
  const side = openingColor(opening.moves);
  const [local, setLocal] = useState(false);
  const [elo, setElo] = useState(1200);
  const [tc, setTc] = useState<TimeId | "custom">("blitz3");
  const [minutes, setMinutes] = useState(3);
  const [seconds, setSeconds] = useState(0);
  const [inc, setInc] = useState(2);
  const [noClock, setNoClock] = useState(false);
  const [going, setGoing] = useState(false);
  const [over, setOver] = useState(false);
  const engine = eloToEngine(elo);
  const sans = opening.moves.split(" ").filter(Boolean);

  function applyPreset(id: TimeId) {
    const control = TIME_CONTROLS.find((t) => t.id === id)!;
    setTc(id);
    setNoClock(control.initial === 0);
    setMinutes(Math.floor(control.initial / 60_000));
    setSeconds(Math.round((control.initial % 60_000) / 1000));
    setInc(Math.round(control.inc / 1000));
  }

  if (!going) {
    return (
      <Panel className="max-w-xl">
        <h3 className="font-display text-2xl">Jogar a partir da linha</h3>
        <p className="mt-1 text-sm text-muted">A posição da linha já está feita. A sua cor: {side === "white" ? "brancas" : "pretas"}.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" className={!local ? "btn btn-primary" : "btn"} onClick={() => setLocal(false)}>
            Robô
          </button>
          <button type="button" className={local ? "btn btn-primary" : "btn"} onClick={() => setLocal(true)}>
            Outra pessoa
          </button>
        </div>
        {!local && (
          <div className="mt-4">
            <StrengthField elo={elo} onChange={setElo} />
          </div>
        )}
        <p className="mt-4 mb-1.5 text-sm text-muted">Tempo</p>
        <div className="flex flex-wrap gap-1.5">
          {TIME_CONTROLS.map((t) => {
            const on = tc === t.id;
            const alert = ALERT.has(t.id);
            const cls = on ? (alert ? "btn btn-blood" : "btn btn-primary") : alert ? "btn btn-blood-quiet" : "btn";
            return (
              <button key={t.id} type="button" className={cls} onClick={() => applyPreset(t.id)}>
                {t.id === "ultra" ? "Ultra bullet" : t.id === "super" ? "Super bullet" : t.label}
              </button>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <label className="text-sm text-muted">
            Minutos
            <input
              className="field mt-1"
              type="number"
              min={0}
              max={180}
              value={minutes}
              onChange={(e) => {
                setMinutes(Math.max(0, Number(e.target.value) || 0));
                setTc("custom");
                setNoClock(false);
              }}
            />
          </label>
          <label className="text-sm text-muted">
            Segundos
            <input
              className="field mt-1"
              type="number"
              min={0}
              max={59}
              value={seconds}
              onChange={(e) => {
                setSeconds(Math.max(0, Number(e.target.value) || 0));
                setTc("custom");
                setNoClock(false);
              }}
            />
          </label>
          <label className="text-sm text-muted">
            Acréscimo
            <input
              className="field mt-1"
              type="number"
              min={0}
              max={60}
              value={inc}
              onChange={(e) => {
                setInc(Math.max(0, Number(e.target.value) || 0));
                setTc("custom");
              }}
            />
          </label>
        </div>
        <button type="button" className="btn btn-primary mt-4" onClick={() => setGoing(true)}>
          Começar
        </button>
      </Panel>
    );
  }

  const name = strengthName(engine.nominal);
  const initial = noClock ? 0 : minutes * 60_000 + seconds * 1000;
  const preset = TIME_CONTROLS.find((t) => t.id === tc);
  const label = noClock ? "Sem relógio" : preset && tc !== "custom" ? preset.label : `${minutes}+${inc}`;
  return (
    <div>
      <button type="button" className={over ? "btn btn-primary mb-3" : "btn mb-3"} onClick={onBack}>
        {over ? "Voltar" : "Parar"}
      </button>
      <LiveGame
          config={{
            human: local ? "both" : side,
            bot: local ? null : { name, skill: engine.skill, elo: engine.elo, nominal: engine.nominal },
            prelude: { sans, ucis: ucisFromSans(START_FEN, sans) },
            clock: initial ? { initial, inc: inc * 1000 } : null,
            tcLabel: label,
            pace: "human",
            whiteName: local ? "Brancas" : side === "white" ? "Você" : name,
            blackName: local ? "Pretas" : side === "black" ? "Você" : name,
            onEnd: (ending) => {
              if (ending.reason === "Xeque-mate") setOver(true);
            },
          }}
        />
    </div>
  );
}


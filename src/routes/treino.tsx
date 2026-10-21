import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import {
  ENDGAMES,
  MARK_CLASS,
  START_FEN,
  checkedKing,
  destsOf,
  fenOf,
  legalMove,
  loadFen,
  needsPromotion,
  sanAndUci,
  ucisFromSans,
  type Mark,
} from "@/lib/chess/logic";
import { publicUrl } from "@/lib/chess/public-url";
import { reviewLine } from "@/lib/chess/review";
import { eloToEngine } from "@/lib/chess/strength";
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
  const [queue, setQueue] = useState<Opening[]>(saved?.openings ?? []);
  const [endQueue, setEndQueue] = useState<string[]>(saved?.endgames ?? []);
  const [side, setSide] = useState<Color>(saved?.color ?? "white");
  const [elo, setElo] = useState(saved?.elo ?? 1200);
  const [solo, setSolo] = useState(false);
  const [study, setStudy] = useState<Opening | null>(null);
  const [drill, setDrill] = useState<Opening[] | null>(null);
  const [drillAt, setDrillAt] = useState(0);
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
  const engine = eloToEngine(elo);

  function persist() {
    saveDrill({ openings: queue, endgames: endQueue, elo, color: side });
  }

  function toggleQueue(opening: Opening) {
    setQueue((list) => {
      const has = list.some((o) => o.eco === opening.eco && o.name === opening.name && o.moves === opening.moves);
      return has ? list.filter((o) => !(o.eco === opening.eco && o.name === opening.name)) : [...list, opening].slice(0, 24);
    });
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

      {tab === "aberturas" && study && (
        <div className="mt-4">
          <button type="button" className="btn mb-3" onClick={() => setStudy(null)}>
            Voltar à lista
          </button>
          <h2 className="mb-3 font-display text-2xl">
            {study.eco} {study.name}
          </h2>
          <Trainer key={`${study.eco}-${study.name}-${side}`} opening={study} side={side} />
        </div>
      )}

      {tab === "aberturas" && drill && (
        <div className="mt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">
              {drillAt + 1} de {drill.length} · {drill[drillAt]?.name}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn" onClick={() => setDrill(null)}>
                Parar
              </button>
              <button type="button" className="btn" onClick={() => setSpin((n) => n + 1)}>
                Jogar de novo
              </button>
              {drillAt < drill.length - 1 && (
                <button type="button" className="btn btn-primary" onClick={() => setDrillAt((n) => n + 1)}>
                  Seguinte
                </button>
              )}
            </div>
          </div>
          <LiveGame
            key={`${drill[drillAt]?.name}-${drillAt}-${spin}`}
            config={{
              human: side,
              bot: { name: `Stockfish ${engine.nominal}`, skill: engine.skill, elo: engine.elo, nominal: engine.nominal },
              useBook: true,
              opening: drill[drillAt]?.name,
              clock: null,
              tcLabel: drill[drillAt]?.name ?? "Abertura",
              whiteName: side === "white" ? "Você" : `Stockfish ${engine.nominal}`,
              blackName: side === "black" ? "Você" : `Stockfish ${engine.nominal}`,
            }}
          />
        </div>
      )}

      {tab === "aberturas" && !study && !drill && (
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
                <div className="mt-3">
                  <Board fen={lineFen(preview.moves)} orientation={side} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="btn" onClick={() => setStudy(preview)}>
                    Estudar a linha
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => toggleQueue(preview)}>
                    {queue.some((o) => o.name === preview.name && o.eco === preview.eco) ? "Tirar da fila" : "Pôr na fila"}
                  </button>
                </div>
              </Panel>
            ) : (
              <p className="text-muted">Escolha uma abertura para a ver e a meter na fila. Estudar a linha continua disponível.</p>
            )}
            <Panel>
              <p className="text-sm text-muted">Fila · {queue.length}</p>
              {queue.length === 0 ? (
                <p className="mt-2 text-sm">Sem informação</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {queue.map((o) => (
                    <li key={`${o.eco}-${o.name}`} className="flex items-center justify-between gap-2">
                      <span>
                        {o.eco} {o.name}
                      </span>
                      <button type="button" className="text-muted" onClick={() => toggleQueue(o)}>
                        Tirar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" className={side === "white" ? "btn btn-primary" : "btn"} onClick={() => setSide("white")}>
                  <img src={publicUrl("/pieces/wK.svg")} alt="" className="size-6" /> Brancas
                </button>
                <button type="button" className={side === "black" ? "btn btn-primary" : "btn"} onClick={() => setSide("black")}>
                  <img src={publicUrl("/pieces/bK.svg")} alt="" className="size-6" /> Pretas
                </button>
              </div>
              <div className="mt-3">
                <StrengthField elo={elo} onChange={setElo} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="btn" onClick={persist}>
                  Guardar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!queue.length && !preview}
                  onClick={() => {
                    const list = queue.length ? queue : preview ? [preview] : [];
                    setDrill(list);
                    setDrillAt(0);
                    setSpin(0);
                  }}
                >
                  Começar ({queue.length || (preview ? 1 : 0)})
                </button>
              </div>
            </Panel>
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
              <p className="mt-3 text-sm text-muted">Sem informação. Escolha um final para o pré-visualizar e o pôr na fila.</p>
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
          bot: solo ? null : { name: `Stockfish ${engine.nominal}`, skill: engine.skill, elo: engine.elo, nominal: engine.nominal },
          clock: null,
          tcLabel: drill.name,
          slipElo: !solo && human === "black" ? engine.nominal : null,
          whiteName: human === "both" ? "Brancas" : human === "white" ? "Você" : `Stockfish ${engine.nominal}`,
          blackName: human === "both" ? "Pretas" : human === "black" ? "Você" : `Stockfish ${engine.nominal}`,
        }}
      />
    </div>
  );
}

function Trainer({ opening, side }: { opening: Opening; side: Color }) {
  const line = opening.moves;
  const sans = useMemo(() => line.split(" ").filter(Boolean), [line]);
  const [ply, setPly] = useState(0);
  const [note, setNote] = useState("");
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
  const watch = useStopwatch(Boolean(pos) && ply < sans.length);
  const [marks, setMarks] = useState<Mark[] | null>(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!pos || ply >= sans.length || pos.turn === side) return;
    const id = window.setTimeout(() => setPly((n) => n + 1), 320);
    return () => window.clearTimeout(id);
  }, [ply, pos, sans.length, side]);

  if (!pos) return null;
  const done = ply >= sans.length;
  const mine = pos.turn === side && !done;

  function play(from: string, to: string, promotion?: Role) {
    if (!pos || pos.turn !== side || ply >= sans.length) return;
    const move = legalMove(pos, from, to, promotion);
    if (!move) return;
    const packed = sanAndUci(pos, move);
    if (packed.san !== sans[ply]) {
      setNote(`Neste ponto o livro joga ${sans[ply]}.`);
      return;
    }
    setNote("");
    setPly((n) => n + 1);
  }

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
        <p className="font-display text-3xl tabular-nums text-brass">{formatWatch(watch.ms)}</p>
        <p className="mt-1 text-sm text-muted">{opening.family}</p>
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
          <button
            type="button"
            className="btn"
            onClick={() => {
              setPly(0);
              setNote("");
              setMarks(null);
              watch.reset();
            }}
          >
            Jogar de novo
          </button>
          {!done && (
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

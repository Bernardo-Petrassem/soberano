import { useEffect, useMemo, useState } from "react";
import { parseSan } from "chessops/san";
import { makeSquare } from "chessops/util";
import type { Role } from "chessops/types";
import { Board } from "@/components/chess/board";
import { Panel } from "@/components/chess/shell";
import { corpus, EMPTY_OPENING_FILTER, matchOpening, openingFilterActive, openingPasses, type Opening, type OpeningFilterValue } from "@/lib/chess/corpus";
import { OpeningFilterForm } from "@/components/chess/opening-filter";
import { START_FEN, checkedKing, destsOf, fenOf, legalMove, loadFen, needsPromotion, openingColor, sanAndUci } from "@/lib/chess/logic";
import { useVault } from "@/lib/chess/store";

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

export function Repertoire() {
  const cards = useVault((s) => s.repertoire);
  const upsert = useVault((s) => s.upsertCard);
  const grade = useVault((s) => s.gradeCard);
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<OpeningFilterValue>(EMPTY_OPENING_FILTER);
  const [applied, setApplied] = useState<OpeningFilterValue>(EMPTY_OPENING_FILTER);
  const [page, setPage] = useState(0);
  const [openRoot, setOpenRoot] = useState("");
  const [preview, setPreview] = useState<Opening | null>(null);
  const [training, setTraining] = useState(false);
  const [ply, setPly] = useState(0);
  const [note, setNote] = useState("");

  useEffect(() => {
    void corpus().then((c) => setOpenings(c.openings));
  }, []);

  const pool = useMemo(() => {
    const q = query.trim();
    return openings.filter((o) => openingPasses(o, applied) && matchOpening(o, q));
  }, [openings, query, applied]);

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
    setOpenRoot("");
  }, [query, applied]);

  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(roots.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const windowed = roots.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const saved = preview ? cards.find((card) => card.eco === preview.eco && card.name === preview.name) : null;
  const side = preview ? openingColor(preview.moves) : "white";
  const sans = preview?.moves.split(" ").filter(Boolean) ?? [];
  const replay = useMemo(() => {
    const chess = loadFen(START_FEN);
    let last: [string, string] | null = null;
    if (!chess || !training) return { chess: null, last };
    for (let i = 0; i < ply; i++) {
      const mv = parseSan(chess, sans[i] ?? "");
      if (!mv || !("from" in mv)) break;
      last = [makeSquare(mv.from), makeSquare(mv.to)];
      chess.play(mv);
    }
    return { chess, last };
  }, [training, ply, sans]);

  useEffect(() => {
    const pos = replay.chess;
    if (!pos || !saved || !training || ply >= sans.length || pos.turn === side) return;
    const id = window.setTimeout(() => setPly((n) => n + 1), 280);
    return () => window.clearTimeout(id);
  }, [replay.chess, saved, training, ply, sans.length, side]);

  function play(from: string, to: string, promotion?: Role) {
    const pos = replay.chess;
    if (!pos || !saved || pos.turn !== side || ply >= sans.length) return;
    const move = legalMove(pos, from, to, promotion);
    if (!move) return;
    const packed = sanAndUci(pos, move);
    if (packed.san.replace(/[+#]/g, "") !== (sans[ply] ?? "").replace(/[+#]/g, "")) {
      setNote(`O repertório joga ${sans[ply]}. A linha volta em dez minutos.`);
      grade(saved.id, false);
      setPly(0);
      return;
    }
    setNote("");
    const next = ply + 1;
    setPly(next);
    if (next >= sans.length) {
      grade(saved.id, true);
      setNote("Linha memorizada. A próxima revisão fica mais longe.");
    }
  }

  const pos = replay.chess;
  const mine = Boolean(pos && saved && pos.turn === side && ply < sans.length);

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <Panel>
        <p className="text-sm text-muted">{openings.length ? `${openings.length.toLocaleString("pt-PT")} linhas` : "A carregar…"}</p>
        <input className="field mt-2" placeholder="Nome, ECO ou lances (e4 e5 Nf3)" value={query} onChange={(e) => setQuery(e.target.value)} />
        <OpeningFilterForm
          draft={draft}
          active={openingFilterActive(applied)}
          onDraft={setDraft}
          onApply={() => setApplied({ ...draft })}
          onClear={() => {
            setDraft(EMPTY_OPENING_FILTER);
            setApplied(EMPTY_OPENING_FILTER);
          }}
        />
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
                      <button
                        type="button"
                        className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-panel-2"
                        onClick={() => {
                          setPreview(o);
                          setTraining(false);
                          setPly(0);
                          setNote("");
                        }}
                      >
                        {o.name}
                        <span className="mt-0.5 block truncate text-xs text-muted">{o.moves}</span>
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
          <span>{roots.length ? `${safePage * pageSize + 1}–${Math.min(roots.length, (safePage + 1) * pageSize)} de ${roots.length}` : "0"}</span>
          <button type="button" className="btn" disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>
            Seguintes
          </button>
        </div>
      </Panel>
      <div>
        {preview ? (
          <Panel>
            <h2 className="font-display text-2xl">
              {preview.eco} {preview.name}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {preview.family}. {preview.moves}
            </p>
            <div className="mt-3">
              {training && pos ? (
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
              ) : (
                <Board fen={lineFen(preview.moves)} orientation={side} />
              )}
            </div>
            {note && <p className="mt-2 text-sm text-brass">{note}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  upsert({ eco: preview.eco, name: preview.name, moves: preview.moves });
                  setNote("Linha guardada no repertório.");
                }}
              >
                Guardar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  upsert({ eco: preview.eco, name: preview.name, moves: preview.moves });
                  setTraining(true);
                  setPly(0);
                  setNote("");
                }}
              >
                Treinar de memória
              </button>
              {training && (
                <button type="button" className="btn" onClick={() => { setPly(0); setNote(""); }}>
                  Recomeçar
                </button>
              )}
            </div>
          </Panel>
        ) : (
          <p className="text-muted">Escolha uma abertura. A busca aceita nome, ECO ou lances, como e4 c5.</p>
        )}
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { parseSan } from "chessops/san";
import { makeSquare } from "chessops/util";
import type { Color, Role } from "chessops/types";
import { Shell, Panel } from "@/components/chess/shell";
import { Board } from "@/components/chess/board";
import { LiveGame } from "@/components/chess/live-game";
import { PuzzleRun } from "@/components/chess/puzzle-run";
import { corpus, type Opening, type Puzzle } from "@/lib/chess/corpus";
import {
  BOTS,
  ENDGAMES,
  START_FEN,
  checkedKing,
  destsOf,
  fenOf,
  legalMove,
  loadFen,
  needsPromotion,
  sanAndUci,
} from "@/lib/chess/logic";

export const Route = createFileRoute("/treino")({ component: Treino });

type Tab = "aberturas" | "finais" | "meio";

function Treino() {
  const [tab, setTab] = useState<Tab>("aberturas");
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [puzzles, setPuzzles] = useState<Puzzle[]>([]);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Opening | null>(null);
  const [side, setSide] = useState<Color>("white");
  const [drill, setDrill] = useState<(typeof ENDGAMES)[number] | null>(null);
  const [solo, setSolo] = useState(false);

  useEffect(() => {
    void corpus().then((c) => {
      setOpenings(c.openings);
      setPuzzles(c.puzzles);
    });
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const src = q.length < 2 ? openings.slice(0, 18) : openings.filter((o) => `${o.eco} ${o.name} ${o.family}`.toLowerCase().includes(q));
    return src.slice(0, 24);
  }, [openings, query]);

  return (
    <Shell>
      <h1 className="font-display text-3xl">Treino</h1>
      <div className="mt-3 flex flex-wrap gap-2">
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

      {tab === "aberturas" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <Panel>
            <p className="text-sm text-muted">{openings.length.toLocaleString("pt-PT")} linhas ECO</p>
            <input className="field mt-2" placeholder="Nome ou ECO" value={query} onChange={(e) => setQuery(e.target.value)} />
            <ul className="mt-3 max-h-[28rem] space-y-1 overflow-auto text-sm">
              {results.map((o) => (
                <li key={`${o.eco}-${o.name}-${o.moves}`}>
                  <button type="button" className="w-full rounded-lg px-2 py-2 text-left hover:bg-panel-2" onClick={() => setPicked(o)}>
                    <span className="text-brass">{o.eco}</span> {o.name}
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          <div>
            {picked ? (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-2xl">
                    {picked.eco} {picked.name}
                  </h2>
                  <select className="field w-auto" value={side} onChange={(e) => setSide(e.target.value as Color)}>
                    <option value="white">Jogar de brancas</option>
                    <option value="black">Jogar de pretas</option>
                  </select>
                </div>
                <Trainer key={`${picked.eco}-${picked.name}-${side}`} opening={picked} side={side} />
              </>
            ) : (
              <p className="text-muted">Escolha uma abertura. Se desviar, o livro mostra o lance certo — pode repetir à vontade.</p>
            )}
          </div>
        </div>
      )}

      {tab === "finais" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <Panel>
            <ul className="space-y-2 text-sm">
              {ENDGAMES.map((e) => (
                <li key={e.id}>
                  <button type="button" className="w-full rounded-lg px-2 py-2 text-left hover:bg-panel-2" onClick={() => setDrill(e)}>
                    {e.name}
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          <div>
            {drill ? (
              <>
                <h2 className="font-display text-2xl">{drill.name}</h2>
                <p className="mt-1 mb-3 text-sm text-muted">{drill.goal}</p>
                <div className="mb-3 flex gap-2">
                  <button type="button" className={!solo ? "btn btn-primary" : "btn"} onClick={() => setSolo(false)}>
                    Contra o bot
                  </button>
                  <button type="button" className={solo ? "btn btn-primary" : "btn"} onClick={() => setSolo(true)}>
                    Sozinho
                  </button>
                </div>
                <LiveGame
                  key={`${drill.id}-${solo}`}
                  config={{
                    startFen: drill.fen,
                    human: solo ? "both" : (loadFen(drill.fen)?.turn ?? "white"),
                    bot: solo ? null : BOTS[3],
                    clock: null,
                    tcLabel: drill.name,
                    whiteName: solo ? "Brancas" : loadFen(drill.fen)?.turn === "black" ? "Amador forte" : "Você",
                    blackName: solo ? "Pretas" : loadFen(drill.fen)?.turn === "black" ? "Você" : "Amador forte",
                  }}
                />
              </>
            ) : (
              <p className="text-muted">Dez finais clássicos, com objectivo escrito. O resto dos finais táticos está nos problemas.</p>
            )}
          </div>
        </div>
      )}

      {tab === "meio" && puzzles.length > 0 && (
        <div className="mt-4">
          <p className="mb-3 text-sm text-muted">Posições de meio-jogo da base, no seu rating.</p>
          <PuzzleRun puzzles={puzzles} theme="middlegame" timed={false} />
        </div>
      )}
    </Shell>
  );
}

function Trainer({ opening, side }: { opening: Opening; side: Color }) {
  const line = opening.moves;
  const sans = useMemo(() => line.split(" "), [line]);
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

  useEffect(() => {
    if (!pos || ply >= sans.length || pos.turn === side) return;
    const id = window.setTimeout(() => setPly((n) => n + 1), 320);
    return () => window.clearTimeout(id);
  }, [ply, pos, sans.length, side]);

  if (!pos) return null;
  const done = ply >= sans.length;
  const mine = pos.turn === side && !done;

  function play(from: string, to: string, promotion?: Role) {
    const move = legalMove(pos!, from, to, promotion);
    if (!move) return;
    const packed = sanAndUci(pos!, move);
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
        <p className="text-sm text-muted">{opening.family}</p>
        <p className="mt-2 text-sm">{sans.map((san, i) => `${i % 2 === 0 ? `${i / 2 + 1}. ` : ""}${san}`).join(" ")}</p>
        {done && <p className="mt-3 text-sm text-good">Linha completa. Pode recomeçar.</p>}
        {note && <p className="mt-3 text-sm text-blood">{note}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => { setPly(0); setNote(""); }}>
            Recomeçar
          </button>
          {!done && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setNote(`Livro: ${sans[ply]}`);
                setPly((n) => n + 1);
              }}
            >
              Mostrar lance
            </button>
          )}
        </div>
      </Panel>
    </div>
  );
}

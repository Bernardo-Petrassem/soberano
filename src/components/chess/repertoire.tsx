import { useEffect, useMemo, useState } from "react";
import { parseSan } from "chessops/san";
import { makeSquare } from "chessops/util";
import type { Role } from "chessops/types";
import { Board } from "@/components/chess/board";
import { Panel } from "@/components/chess/shell";
import { corpus, matchOpening, type Opening } from "@/lib/chess/corpus";
import { START_FEN, checkedKing, destsOf, fenOf, legalMove, loadFen, needsPromotion, openingColor, sanAndUci } from "@/lib/chess/logic";
import { useVault } from "@/lib/chess/store";

export function Repertoire() {
  const cards = useVault((s) => s.repertoire);
  const upsert = useVault((s) => s.upsertCard);
  const grade = useVault((s) => s.gradeCard);
  const remove = useVault((s) => s.removeCard);
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [ply, setPly] = useState(0);
  const [note, setNote] = useState("");

  useEffect(() => {
    void corpus().then((c) => setOpenings(c.openings));
  }, []);

  const found = useMemo(() => {
    const q = query.trim();
    if (q.length < 2 && !/^[a-e]/i.test(q)) return [];
    return openings.filter((o) => matchOpening(o, q)).slice(0, 12);
  }, [openings, query]);

  const due = cards.filter((c) => c.due <= Date.now()).length;
  const card = cards.find((c) => c.id === active) ?? null;
  const side = card ? openingColor(card.moves) : "white";
  const sans = card?.moves.split(" ").filter(Boolean) ?? [];
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

  useEffect(() => {
    const pos = replay.chess;
    if (!pos || !card || ply >= sans.length || pos.turn === side) return;
    const id = window.setTimeout(() => setPly((n) => n + 1), 280);
    return () => window.clearTimeout(id);
  }, [replay.chess, card, ply, sans.length, side]);

  function play(from: string, to: string, promotion?: Role) {
    const pos = replay.chess;
    if (!pos || !card || pos.turn !== side || ply >= sans.length) return;
    const move = legalMove(pos, from, to, promotion);
    if (!move) return;
    const packed = sanAndUci(pos, move);
    if (packed.san.replace(/[+#]/g, "") !== (sans[ply] ?? "").replace(/[+#]/g, "")) {
      setNote(`O repertório joga ${sans[ply]}. A linha volta amanhã de manhã — na verdade, em dez minutos.`);
      grade(card.id, false);
      setPly(0);
      return;
    }
    setNote("");
    const next = ply + 1;
    setPly(next);
    if (next >= sans.length) {
      grade(card.id, true);
      setNote("Linha memorizada. A próxima revisão fica mais longe.");
    }
  }

  const pos = replay.chess;
  const mine = Boolean(pos && card && pos.turn === side && ply < sans.length);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {cards.length ? `${cards.length} linhas no repertório · ${due} para rever agora` : "Nenhuma linha guardada. Pesquise pelo nome ou pelo ECO, por exemplo A00."}
      </p>
      <input className="field" placeholder="Nome ou ECO (A00)" value={query} onChange={(e) => setQuery(e.target.value)} />
      {found.length > 0 && (
        <ul className="max-h-40 space-y-1 overflow-auto text-sm">
          {found.map((o) => (
            <li key={`${o.eco}-${o.name}`}>
              <button
                type="button"
                className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-panel-2"
                onClick={() => {
                  upsert({ eco: o.eco, name: o.name, moves: o.moves });
                  setQuery("");
                  setNote(`${o.eco} entrou no repertório.`);
                }}
              >
                <span className="text-brass">{o.eco}</span> {o.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <ul className="max-h-36 space-y-1 overflow-auto text-sm">
        {cards.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => { setActive(item.id); setPly(0); setNote(""); }}>
              <span className="text-brass">{item.eco}</span> {item.name}
              <span className="text-muted"> · {item.due <= Date.now() ? "rever" : "em dia"}</span>
            </button>
            <button type="button" className="text-xs text-muted" onClick={() => remove(item.id)}>
              Tirar
            </button>
          </li>
        ))}
      </ul>
      {card && pos && (
        <Panel>
          <p className="font-display text-xl">
            {card.eco} {card.name}
          </p>
          <p className="mt-1 text-sm text-muted">Jogue as {side === "white" ? "brancas" : "pretas"} de memória. Acertar afasta a revisão. Errar traz a linha de volta em dez minutos.</p>
          <div className="mt-3">
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
          </div>
          {note && <p className="mt-2 text-sm text-brass">{note}</p>}
          <button type="button" className="btn mt-3" onClick={() => { setPly(0); setNote(""); }}>
            Recomeçar linha
          </button>
        </Panel>
      )}
    </div>
  );
}

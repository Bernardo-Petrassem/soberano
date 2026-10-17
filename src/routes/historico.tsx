import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell, Panel } from "@/components/chess/shell";
import { Board } from "@/components/chess/board";
import { checkedKing, fenOf, lastSquares, MARK_CLASS, positionAt } from "@/lib/chess/logic";
import { reviewLine } from "@/lib/chess/review";
import { useHydrated, useVault } from "@/lib/chess/store";

export const Route = createFileRoute("/historico")({ component: Historico });

function Historico() {
  const hydrated = useHydrated();
  const games = useVault((s) => s.games);
  const rating = useVault((s) => s.rating);
  const setMarks = useVault((s) => s.setMarks);
  const removeGame = useVault((s) => s.removeGame);
  const [id, setId] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState("");
  const game = games.find((g) => g.id === id) ?? null;
  const pos = game ? positionAt(game.startFen, game.ucis, cursor) : null;

  return (
    <Shell>
      <h1 className="font-display text-3xl">Histórico</h1>
      {!hydrated ? (
        <p className="mt-4 text-muted">A abrir o caderno…</p>
      ) : games.length === 0 ? (
        <p className="mt-4 text-muted">Ainda não há partidas guardadas. Termine uma no tabuleiro.</p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <ul className="space-y-2">
            {games.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  className="w-full rounded-xl border border-line bg-panel px-3 py-3 text-left"
                  onClick={() => {
                    setId(g.id);
                    setCursor(g.ucis.length);
                  }}
                >
                  <span className="block text-sm">
                    {g.white} — {g.black}
                  </span>
                  <span className="text-xs text-muted">
                    {g.result} · {g.reason} · {g.tc}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {game && pos && (
            <div>
              <div className="mb-3 flex flex-wrap gap-2">
                <button type="button" className="btn" onClick={() => setCursor((c) => Math.max(0, c - 1))}>
                  Anterior
                </button>
                <button type="button" className="btn" onClick={() => setCursor((c) => Math.min(game.ucis.length, c + 1))}>
                  Seguinte
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    void navigator.clipboard.writeText(game.pgn);
                  }}
                >
                  Copiar PGN
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setBusy("A classificar…");
                    void reviewLine(game.startFen, game.ucis, (done, total) => setBusy(`${done}/${total}`), rating).then((marks) => {
                      setMarks(game.id, marks);
                      setBusy("");
                    });
                  }}
                >
                  Classificar
                </button>
                <button type="button" className="btn" onClick={() => removeGame(game.id)}>
                  Apagar
                </button>
              </div>
              {busy && <p className="mb-2 text-sm text-muted">{busy}</p>}
              <Board fen={fenOf(pos)} lastMove={lastSquares(game.ucis[cursor - 1])} checkSquare={checkedKing(pos)} />
              <Panel className="mt-3">
                <ol className="max-h-48 space-y-1 overflow-auto text-sm">
                  {game.sans.map((san, i) => (
                    <li key={i}>
                      <button type="button" className={cursor === i + 1 ? "text-brass" : ""} onClick={() => setCursor(i + 1)}>
                        {i % 2 === 0 ? `${i / 2 + 1}. ` : ""}
                        {san}
                      </button>{" "}
                      {game.marks?.[i] && <span className={MARK_CLASS[game.marks[i]]}>{game.marks[i]}</span>}
                    </li>
                  ))}
                </ol>
              </Panel>
            </div>
          )}
        </div>
      )}
    </Shell>
  );
}

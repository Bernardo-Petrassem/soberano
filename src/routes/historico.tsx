import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell, Panel } from "@/components/chess/shell";
import { Board } from "@/components/chess/board";
import { Evolution } from "@/components/chess/evolution";
import { checkedKing, fenOf, lastSquares, MARK_CLASS, pairedSans, positionAt } from "@/lib/chess/logic";
import { reviewLine } from "@/lib/chess/review";
import { useHydrated, useVault } from "@/lib/chess/store";

export const Route = createFileRoute("/historico")({ component: Historico });

function Historico() {
  const hydrated = useHydrated();
  const games = useVault((s) => s.games);
  const rating = useVault((s) => s.rating);
  const setMarks = useVault((s) => s.setMarks);
  const removeGame = useVault((s) => s.removeGame);
  const [tab, setTab] = useState<"partidas" | "evolucao">("partidas");
  const [id, setId] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState("");
  const game = games.find((g) => g.id === id) ?? null;
  const pos = game ? positionAt(game.startFen, game.ucis, cursor) : null;

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl">Histórico</h1>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={tab === "partidas" ? "btn btn-primary" : "btn"} onClick={() => setTab("partidas")}>
            Partidas
          </button>
          <button type="button" className={tab === "evolucao" ? "btn btn-primary" : "btn"} onClick={() => setTab("evolucao")}>
            Evolução
          </button>
        </div>
      </div>
      {tab === "evolucao" ? (
        <div className="mt-4">
          <Evolution
            onOpen={(gameId) => {
              setId(gameId);
              const found = games.find((g) => g.id === gameId);
              setCursor(found?.ucis.length ?? 0);
              setTab("partidas");
            }}
          />
        </div>
      ) : !hydrated ? (
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
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button type="button" className="btn" onClick={() => setCursor(0)}>
                  Início
                </button>
                <button type="button" className="btn" onClick={() => setCursor((c) => Math.max(0, c - 1))}>
                  Anterior
                </button>
                <button type="button" className="btn" onClick={() => setCursor((c) => Math.min(game.ucis.length, c + 1))}>
                  Seguinte
                </button>
                <button type="button" className="btn" onClick={() => setCursor(game.ucis.length)}>
                  Fim
                </button>
              </div>
              <Board fen={fenOf(pos)} lastMove={lastSquares(game.ucis[cursor - 1])} checkSquare={checkedKing(pos)} />
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn" onClick={() => void navigator.clipboard.writeText(game.pgn)}>
                  Copiar PGN
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setBusy(game.markVersion === 2 && game.marks && game.marks.length >= game.ucis.length ? "Já classificados." : "A classificar os lances novos…");
                    void reviewLine(game.startFen, game.ucis, (done, total) => setBusy(`${done}/${total}`), rating, game.markVersion === 2 ? game.marks : undefined).then(
                      (marks) => {
                        setMarks(game.id, marks);
                        setBusy("");
                      },
                    );
                  }}
                >
                  Classificar
                </button>
                <button type="button" className="btn" onClick={() => removeGame(game.id)}>
                  Apagar
                </button>
              </div>
              {busy && <p className="mt-2 text-sm text-muted">{busy}</p>}
              <Panel className="mt-3">
                <ol className="max-h-48 space-y-1 overflow-auto text-sm">
                  {pairedSans(game.startFen, game.sans).map((row) => (
                    <li key={row.white?.ply ?? row.black?.ply} className="grid grid-cols-[2.5rem_1fr_1fr] gap-1">
                      <span className="text-muted">{row.no}.</span>
                      {row.white ? (
                        <button type="button" className={cursor === row.white.ply ? "text-brass" : ""} onClick={() => setCursor(row.white!.ply)}>
                          {row.white.san} {game.marks?.[row.white.ply - 1] && <span className={MARK_CLASS[game.marks[row.white.ply - 1]!]}>{game.marks[row.white.ply - 1]}</span>}
                        </button>
                      ) : (
                        <span className="text-muted">…</span>
                      )}
                      {row.black ? (
                        <button type="button" className={cursor === row.black.ply ? "text-brass" : ""} onClick={() => setCursor(row.black!.ply)}>
                          {row.black.san} {game.marks?.[row.black.ply - 1] && <span className={MARK_CLASS[game.marks[row.black.ply - 1]!]}>{game.marks[row.black.ply - 1]}</span>}
                        </button>
                      ) : (
                        <span />
                      )}
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

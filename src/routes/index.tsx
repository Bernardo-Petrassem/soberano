import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell, Panel } from "@/components/chess/shell";
import { Board } from "@/components/chess/board";
import { corpus, peekCorpus } from "@/lib/chess/corpus";
import { START_FEN } from "@/lib/chess/logic";
import { useHydrated, useVault } from "@/lib/chess/store";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const hydrated = useHydrated();
  const games = useVault((s) => s.games);
  const rating = useVault((s) => s.rating);
  const [counts, setCounts] = useState({ openings: 0, puzzles: 0 });

  useEffect(() => {
    void corpus().then((c) => setCounts({ openings: c.openings.length, puzzles: c.puzzles.length }));
  }, []);

  const ready = peekCorpus();
  const openings = ready?.openings.length || counts.openings;
  const puzzles = ready?.puzzles.length || counts.puzzles;

  return (
    <Shell>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,24rem)]">
        <div>
          <p className="text-sm tracking-[0.18em] text-brass uppercase">Estudo local</p>
          <h1 className="mt-2 font-display text-5xl leading-tight text-cream">O tabuleiro fica neste computador.</h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            Motor Stockfish, {openings ? openings.toLocaleString("pt-PT") : "milhares de"} aberturas da base ECO pública e{" "}
            {puzzles ? puzzles.toLocaleString("pt-PT") : "milhares de"} problemas da base Lichess. Partidas sem servidor de
            jogo: o encontro é directo, com o seu endereço fixo.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/jogar" className="btn btn-primary">
              Jogar agora
            </Link>
            <Link to="/problemas" className="btn">
              Resolver um problema
            </Link>
            <Link to="/treino" className="btn">
              Treinar uma abertura
            </Link>
          </div>
        </div>
        <div className="space-y-4">
          <Board fen={START_FEN} interactive={false} />
          <Panel>
          <h2 className="font-display text-2xl">O seu caderno</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Rating táctico</dt>
              <dd>{hydrated ? rating : "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Partidas guardadas</dt>
              <dd>{hydrated ? games.length : "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Aberturas</dt>
              <dd>{openings || "…"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Problemas</dt>
              <dd>{puzzles || "…"}</dd>
            </div>
          </dl>
          {hydrated && games[0] && (
            <p className="mt-4 text-sm text-muted">
              Última partida: {games[0].white}–{games[0].black} {games[0].result}
            </p>
          )}
          </Panel>
        </div>
      </div>
    </Shell>
  );
}

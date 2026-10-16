import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell, Panel } from "@/components/chess/shell";
import {
  clearExtras,
  corpus,
  importPuzzleStream,
  mergeImports,
  parseOpeningText,
  parsePuzzleText,
  subscribeCorpus,
} from "@/lib/chess/corpus";

export const Route = createFileRoute("/biblioteca")({ component: Biblioteca });

function Biblioteca() {
  const [stats, setStats] = useState({ openings: 0, puzzles: 0, bundledOpenings: 0, bundledPuzzles: 0 });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const c = await corpus();
    setStats({
      openings: c.openings.length,
      puzzles: c.puzzles.length,
      bundledOpenings: c.bundledOpenings,
      bundledPuzzles: c.bundledPuzzles,
    });
  }

  useEffect(() => {
    void refresh();
    return subscribeCorpus(() => {
      void refresh();
    });
  }, []);

  async function onFile(file: File) {
    setBusy(true);
    setNote("");
    try {
      const name = file.name.toLowerCase();
      const puzzleLike =
        name.endsWith(".csv") ||
        (file.size > 1_500_000 && !name.endsWith(".pgn") && !name.endsWith(".tsv") && !name.endsWith(".json"));
      if (puzzleLike && file.stream) {
        const puzzles = await importPuzzleStream(file.stream(), (n) => setNote(`A ler ${n.toLocaleString("pt-PT")} linhas…`));
        const saved = await mergeImports([], puzzles);
        setNote(`Importados ${puzzles.length.toLocaleString("pt-PT")} problemas. No total, ${saved.puzzles.toLocaleString("pt-PT")} extra.`);
      } else {
        const text = await file.text();
        const head = text.slice(0, 400).toLowerCase();
        if (head.includes("puzzleid") || head.includes(",fen,") || head.startsWith("[{") && head.includes("fen")) {
          const puzzles = parsePuzzleText(text);
          const saved = await mergeImports([], puzzles);
          setNote(`${puzzles.length} problemas lidos. Extra guardado: ${saved.puzzles}.`);
        } else {
          const openings = parseOpeningText(text, file.name);
          if (!openings.length) {
            setNote("Não reconheci aberturas nesse ficheiro. Use TSV do Lichess, PGN ou o formato eco|família|nome|lances.");
          } else {
            const saved = await mergeImports(openings, []);
            setNote(`${openings.length} linhas importadas. Extra guardado: ${saved.openings}.`);
          }
        }
      }
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Falha ao importar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <h1 className="font-display text-3xl">Biblioteca</h1>
      <p className="mt-2 max-w-2xl text-muted">
        As aberturas embarcadas vêm da base ECO pública do Lichess ({stats.bundledOpenings.toLocaleString("pt-PT")} linhas). Os problemas são uma amostra estratificada da base pública ({stats.bundledPuzzles.toLocaleString("pt-PT")}), não uma lista digitada. O ficheiro completo cabe aqui por importação e fica neste navegador.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Panel>
          <p className="text-sm text-muted">Aberturas disponíveis</p>
          <p className="font-display text-4xl">{stats.openings.toLocaleString("pt-PT")}</p>
        </Panel>
        <Panel>
          <p className="text-sm text-muted">Problemas disponíveis</p>
          <p className="font-display text-4xl">{stats.puzzles.toLocaleString("pt-PT")}</p>
        </Panel>
      </div>
      <Panel className="mt-4">
        <h2 className="font-display text-xl">Importar</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Aberturas: TSV eco, nome, pgn — ou PGN com tag Opening, ou eco|família|nome|lances.</li>
          <li>Problemas: CSV da base Lichess (PuzzleId,FEN,Moves,Rating,…) ou JSON.</li>
        </ul>
        <label className="btn btn-primary mt-4">
          Escolher ficheiro
          <input
            className="sr-only"
            type="file"
            accept=".pgn,.tsv,.csv,.txt,.json"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void onFile(file);
            }}
          />
        </label>
        {note && <p className="mt-3 text-sm">{note}</p>}
        <button
          type="button"
          className="btn mt-4"
          onClick={() => {
            void clearExtras().then(() => setNote("Importações locais apagadas. A base embarcada mantém-se."));
          }}
        >
          Apagar só o que foi importado
        </button>
      </Panel>
    </Shell>
  );
}

import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";

export function ShareButton({
  fen,
  fenFinal,
  pgnNow,
  pgnAll,
}: {
  fen: string;
  fenFinal: string;
  pgnNow: string;
  pgnAll: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      window.setTimeout(() => setCopied((current) => (current === id ? "" : current)), 1400);
    } catch {
      setCopied("");
    }
  }

  return (
    <>
      <button type="button" className="btn mt-3" onClick={() => { setCopied(""); setOpen(true); }}>
        <Share2 className="size-4" aria-hidden="true" />
        Compartilhar
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-lg rounded-2xl border border-line bg-panel p-5"
            role="dialog"
            aria-labelledby="share-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-brass">Análise</p>
                <h2 id="share-title" className="font-display text-3xl">Compartilhar</h2>
              </div>
              <button type="button" className="btn size-11 px-0" aria-label="Fechar" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <section className="rounded-xl border border-line bg-paper p-4">
                <h3 className="font-display text-xl">Posição atual</h3>
                <p className="mt-2 truncate text-xs text-muted" title={fen}>{fen}</p>
                <div className="mt-3 flex flex-col gap-2">
                  <button type="button" className="btn" onClick={() => void copy("fen", fen)}>
                    {copied === "fen" ? "FEN copiado" : "Copiar FEN"}
                  </button>
                  <button type="button" className="btn" onClick={() => void copy("pgn-now", pgnNow)}>
                    {copied === "pgn-now" ? "PGN copiado" : "Copiar PGN"}
                  </button>
                </div>
              </section>
              <section className="rounded-xl border border-line bg-paper p-4">
                <h3 className="font-display text-xl">Partida inteira</h3>
                <p className="mt-2 text-xs text-muted">PGN completo e FEN depois do último lance.</p>
                <div className="mt-3 flex flex-col gap-2">
                  <button type="button" className="btn" onClick={() => void copy("pgn", pgnAll)}>
                    {copied === "pgn" ? "PGN copiado" : "Copiar PGN"}
                  </button>
                  <button type="button" className="btn" onClick={() => void copy("fen-final", fenFinal)}>
                    {copied === "fen-final" ? "FEN copiado" : "Copiar FEN final"}
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

import { useEffect, useState } from "react";
import { Settings } from "lucide-react";

export function StudyMenu({
  clean,
  onClean,
  canUndo,
  onClear,
  onUndo,
  onFlip,
  hintOn,
  onHint,
}: {
  clean: boolean;
  onClean: (on: boolean) => void;
  canUndo: boolean;
  onClear: () => void;
  onUndo: () => void;
  onFlip: () => void;
  hintOn: boolean;
  onHint: () => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  return (
    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="btn size-11 px-0"
        aria-label="Configurações"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Settings className="size-4" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute left-0 top-12 z-40 w-72 rounded-xl border border-line bg-panel p-4 shadow-lg">
          <p className="font-display text-xl">Configurações</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm">Modo Limpo</p>
              <p className="text-xs text-muted">Só o tabuleiro, os lances e a navegação.</p>
            </div>
            <button type="button" className="switch" role="switch" aria-checked={clean} aria-label="Modo Limpo" onClick={() => onClean(!clean)}>
              <span />
            </button>
          </div>
          <div className="mt-4 space-y-2">
            <button type="button" className="btn w-full" onClick={onClear}>
              Limpar tabuleiro
            </button>
            <button type="button" className="btn w-full" disabled={!canUndo} onClick={onUndo}>
              Desfazer limpeza
            </button>
            <p className="text-xs text-muted">Atalho L limpa. L outra vez desfaz.</p>
          </div>
          <div className="mt-4 space-y-2 border-t border-line pt-3">
            <button type="button" className={hintOn ? "btn btn-primary w-full" : "btn w-full"} onClick={onHint}>
              {hintOn ? "Sugestão ligada" : "Sugestão do Stockfish"}
              <span className="text-muted">S</span>
            </button>
            <button type="button" className="btn w-full" onClick={onFlip}>
              Girar tabuleiro
              <span className="text-muted">F</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

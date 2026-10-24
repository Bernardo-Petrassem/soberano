import { useEffect, useState } from "react";
import { Board } from "@/components/chess/board";
import { Panel } from "@/components/chess/shell";
import { checkedKing, fenOf, hangingCount, lastSquares, loadFen, MARK_CLASS, playUciOn, positionAt, type Mark } from "@/lib/chess/logic";
import { reviewDetail } from "@/lib/chess/review";
import type { PuzzleAttempt } from "@/lib/chess/store";
import { useVault } from "@/lib/chess/store";

const WEIGHT: Record<Mark, number> = {
  Livro: 100,
  Brilhante: 100,
  "!!!": 100,
  "★": 100,
  Ótimo: 100,
  Excelente: 90,
  Bom: 65,
  Imprecisão: 35,
  Erro: 12,
  Gafe: 0,
};

type Report = {
  marks: Mark[];
  best: string[];
  precision: number;
  missed: number;
  hanging: number;
};

export function AttemptReview({ items, auto = false }: { items: PuzzleAttempt[]; auto?: boolean }) {
  const rating = useVault((s) => s.rating);
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(auto && items.length ? "A analisar…" : "");
  const [reports, setReports] = useState<Report[]>([]);

  const [armed, setArmed] = useState(auto);

  useEffect(() => {
    let cancel = false;
    setReports([]);
    setIndex(0);
    setStep(0);
    if (!items.length || !armed) {
      setBusy("");
      return;
    }
    void (async () => {
      const out: Report[] = [];
      for (let i = 0; i < items.length; i++) {
        if (cancel) return;
        const item = items[i]!;
        setBusy(`A analisar ${i + 1}/${items.length}`);
        const detail = await reviewDetail(item.fen, item.played, () => undefined, rating);
        const user = detail.marks.filter((_, idx) => idx % 2 === 1);
        const precision = user.length ? Math.round(user.reduce((sum, mark) => sum + WEIGHT[mark], 0) / user.length) : item.ok ? 100 : 0;
        const markedMiss = user.filter((mark) => mark === "Imprecisão" || mark === "Erro" || mark === "Gafe").length;
        const missed = markedMiss + (!item.ok && markedMiss === 0 ? 1 : 0);
        let hanging = 0;
        const pos = loadFen(item.fen);
        if (pos) {
          const solver = positionAt(item.fen, item.line, 1)?.turn;
          item.played.forEach((uci, idx) => {
            const mover = pos.turn;
            playUciOn(pos, uci);
            if (solver && mover === solver) hanging += hangingCount(pos, mover);
          });
        }
        out.push({ ...detail, precision, missed, hanging });
        if (!cancel) setReports([...out]);
      }
      if (!cancel) setBusy("");
    })();
    return () => {
      cancel = true;
    };
  }, [items, rating, armed]);

  if (!items.length) return <p className="text-sm text-muted">Ainda não há problemas revistos.</p>;
  const item = items[index] ?? items[0]!;
  const report = reports[index];
  const pos = positionAt(item.fen, item.played, step);
  const shown = pos ? fenOf(pos) : item.fen;
  const avg = reports.length ? Math.round(reports.reduce((s, r) => s + r.precision, 0) / reports.length) : null;
  const missed = reports.reduce((s, r) => s + r.missed, 0);
  const hanging = reports.reduce((s, r) => s + r.hanging, 0);
  const bestUser = report?.best.filter((_, idx) => idx % 2 === 1) ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Panel>
          <p className="text-sm text-muted">Precisão</p>
          <p className="font-display text-3xl">{avg == null ? "—" : `${avg}%`}</p>
        </Panel>
        <Panel>
          <p className="text-sm text-muted">Chances perdidas</p>
          <p className="font-display text-3xl">{reports.length ? missed : "—"}</p>
        </Panel>
        <Panel>
          <p className="text-sm text-muted">Peças penduradas</p>
          <p className="font-display text-3xl">{reports.length ? hanging : "—"}</p>
        </Panel>
      </div>
      {busy && <p className="text-sm text-muted">{busy}</p>}
      {!auto && !armed && items.length > 0 && (
        <button type="button" className="btn btn-primary" onClick={() => setArmed(true)}>
          Analisar com o motor
        </button>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <ul className="max-h-80 space-y-1 overflow-auto text-sm">
          {items.map((attempt, i) => (
            <li key={`${attempt.puzzleId}-${attempt.at}`}>
              <button
                type="button"
                className={i === index ? "btn btn-primary w-full justify-start" : "btn w-full justify-start"}
                onClick={() => {
                  setIndex(i);
                  setStep(attempt.played.length);
                }}
              >
                {attempt.ok ? "Certo" : "Falhou"} · {attempt.rating}
                {reports[i] ? ` · ${reports[i]!.precision}%` : ""}
              </button>
            </li>
          ))}
        </ul>
        <div>
          {pos && (
            <Board fen={shown} lastMove={lastSquares(item.played[step - 1])} checkSquare={checkedKing(pos)} orientation={positionAt(item.fen, item.line, 1)?.turn ?? "white"} />
          )}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button type="button" className="btn" onClick={() => setStep(0)}>
              Início
            </button>
            <button type="button" className="btn" onClick={() => setStep((s) => Math.max(0, s - 1))}>
              Anterior
            </button>
            <button type="button" className="btn" onClick={() => setStep((s) => Math.min(item.played.length, s + 1))}>
              Seguinte
            </button>
            <button type="button" className="btn" onClick={() => setStep(item.played.length)}>
              Fim
            </button>
          </div>
          <Panel className="mt-3">
            <p className="text-sm">
              {item.ok ? "Resolvido" : "Não resolvido"}
              {report ? ` · precisão ${report.precision}% · ${report.missed} chances perdidas · ${report.hanging} peças penduradas` : ""}
            </p>
            <p className="mt-2 text-sm text-muted">Melhores lances do motor</p>
            <p className="mt-1 text-sm">{bestUser.length ? bestUser.join(" ") : busy ? "…" : "—"}</p>
            {report && step > 0 && report.marks[step - 1] && (
              <p className="mt-2 text-sm">
                Lance {step}: <span className={MARK_CLASS[report.marks[step - 1]!]}>{report.marks[step - 1]}</span>
                {report.best[step - 1] ? ` · motor ${report.best[step - 1]}` : ""}
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

import type { Color } from "chessops/types";
import { winPercent } from "@/lib/chess/logic";

/** Vertical bar: cream grows from the side at the bottom of the board when that side is better. */
export function EvalBar({ whiteCp, orientation }: { whiteCp: number; orientation: Color }) {
  const white = Math.max(2, Math.min(98, winPercent(whiteCp)));
  const bottom = orientation === "white" ? white : 100 - white;
  const mate = Math.abs(whiteCp) > 9000;
  const label = mate ? (whiteCp > 0 ? "+M" : "−M") : `${whiteCp > 0 ? "+" : ""}${(whiteCp / 100).toFixed(1)}`;
  return (
    <div className="relative w-8 shrink-0 self-stretch overflow-hidden rounded-full bg-[#14110e] ring-1 ring-line" title={`Avaliação ${label}`}>
      <div className="absolute inset-x-0 bottom-0 bg-[#f7f1e6]" style={{ height: `${bottom}%` }} />
      <span
        className={`absolute inset-x-0 text-center text-[10px] font-semibold leading-none ${bottom > 22 ? "bottom-1 text-ink" : "top-1 text-[#f7f1e6]"}`}
      >
        {label}
      </span>
    </div>
  );
}

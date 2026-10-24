import type { Chess } from "chessops/chess";
import { destsOf, needsPromotion } from "@/lib/chess/logic";
import { cpOf, type GoResult } from "@/lib/chess/engine";

export const ELO_MIN = 100;
export const ELO_MAX = 3600;

export const STRENGTHS: { elo: number; label: string }[] = [
  { elo: 100, label: "Iniciante (100)" },
  { elo: 400, label: "Novato (400)" },
  { elo: 600, label: "Aprendiz (600)" },
  { elo: 900, label: "Clube (900)" },
  { elo: 1200, label: "Amador (1200)" },
  { elo: 1500, label: "Candidato (1500)" },
  { elo: 1800, label: "Forte (1800)" },
  { elo: 2100, label: "Mestre (2100)" },
  { elo: 2400, label: "Mestre FIDE (2400)" },
  { elo: 2800, label: "Grande mestre (2800)" },
  { elo: 3200, label: "Elite (3200)" },
  { elo: 3600, label: "Stockfish (3600)" },
];

export function clampElo(elo: number): number {
  return Math.max(ELO_MIN, Math.min(ELO_MAX, Math.round(elo) || ELO_MIN));
}

export function strengthName(elo: number): string {
  const exact = STRENGTHS.find((s) => s.elo === elo);
  if (exact) return exact.label;
  return `Stockfish (${clampElo(elo)})`;
}

/** Maps a nominal Elo onto Stockfish. 3600 is full strength; below 800 the skill level carries the weakness. */
export function eloToEngine(nominal: number): { skill: number; elo: number | null; nominal: number } {
  const n = clampElo(nominal);
  if (n >= 3300) return { skill: 20, elo: null, nominal: n };
  if (n < 800) {
    const skill = Math.max(0, Math.min(8, Math.round((n - 100) / 90)));
    return { skill, elo: null, nominal: n };
  }
  return { skill: 20, elo: Math.min(2800, n), nominal: n };
}

export function weakenUci(pos: Chess, uci: string, nominal: number): string {
  if (nominal >= 800 || !uci) return uci;
  const chance = (800 - nominal) / 750;
  if (Math.random() > chance) return uci;
  const all: string[] = [];
  for (const [from, tos] of Object.entries(destsOf(pos))) {
    for (const to of tos) all.push(needsPromotion(pos, from, to) ? `${from}${to}q` : `${from}${to}`);
  }
  if (all.length < 2) return uci;
  return all[Math.floor(Math.random() * all.length)] ?? uci;
}

/** Intentional inaccuracy. High Elo loses a few centipawns; low Elo drops a piece. */
export function slipUci(res: GoResult, elo: number, legal: string[]): string {
  const pvs = res.pvs.filter((p) => p.pv[0]);
  const best = pvs[0]?.pv[0] || res.uci;
  if (!best) return legal[0] ?? "";
  const t = Math.min(1, Math.max(0, (clampElo(elo) - 100) / 3500));
  const want = 460 * (1 - t) * (1 - t) + 16 * t;
  if (t > 0.82 && Math.random() < 0.4) return best;
  const bestCp = cpOf(pvs[0] ?? res);
  let pick = best;
  let dist = Number.POSITIVE_INFINITY;
  for (const pv of pvs) {
    const loss = bestCp - cpOf(pv);
    if (loss < 0) continue;
    const d = Math.abs(loss - want);
    if (d < dist && pv.pv[0]) {
      dist = d;
      pick = pv.pv[0];
    }
  }
  if (want > 180 && pvs.length < 3 && legal.length > 1 && Math.random() < 0.55) {
    const alt = legal.filter((u) => u !== best);
    if (alt.length) return alt[Math.floor(Math.random() * alt.length)] ?? pick;
  }
  return pick;
}

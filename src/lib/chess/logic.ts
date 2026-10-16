import { Chess, normalizeMove } from "chessops/chess";
import { makeFen, parseFen } from "chessops/fen";
import { makeSan, parseSan } from "chessops/san";
import { Board } from "chessops/board";
import { SquareSet } from "chessops/squareSet";
import {
  kingCastlesTo,
  makeSquare,
  makeUci,
  parseSquare,
  parseUci,
  squareFile,
  squareRank,
} from "chessops/util";
import type { Color, Move, NormalMove, Role, Square } from "chessops/types";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type Mark =
  | "Livro"
  | "Brilhante"
  | "Ótimo"
  | "Excelente"
  | "Bom"
  | "Imprecisão"
  | "Erro"
  | "Gafe";

export const TIME_CONTROLS = [
  { id: "none", label: "Sem relógio", initial: 0, inc: 0 },
  { id: "classico", label: "Clássico 30+0", initial: 30 * 60_000, inc: 0 },
  { id: "rapido", label: "Rápido 15+10", initial: 15 * 60_000, inc: 10_000 },
  { id: "blitz5", label: "Blitz 5+0", initial: 5 * 60_000, inc: 0 },
  { id: "blitz3", label: "Blitz 3+2", initial: 3 * 60_000, inc: 2_000 },
  { id: "bullet2", label: "Bullet 2+1", initial: 2 * 60_000, inc: 1_000 },
  { id: "bullet", label: "Bullet 1+0", initial: 60_000, inc: 0 },
  { id: "super", label: "Super bullet 30s", initial: 30_000, inc: 0 },
  { id: "ultra", label: "Ultra bullet 15s", initial: 15_000, inc: 0 },
] as const;

export type TimeId = (typeof TIME_CONTROLS)[number]["id"];

export const BOTS = [
  { id: "novato", name: "Novato", skill: 0, elo: 600 },
  { id: "aprendiz", name: "Aprendiz", skill: 2, elo: 900 },
  { id: "clube", name: "Clube", skill: 5, elo: 1200 },
  { id: "amador", name: "Amador forte", skill: 8, elo: 1500 },
  { id: "candidato", name: "Candidato", skill: 12, elo: 1800 },
  { id: "mestre", name: "Mestre", skill: 16, elo: 2100 },
  { id: "mf", name: "Mestre FIDE", skill: 19, elo: 2400 },
  { id: "stockfish", name: "Stockfish", skill: 20, elo: null },
] as const;

const MAT: Record<Role, number> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
  king: 0,
};

export function opposite(color: Color): Color {
  return color === "white" ? "black" : "white";
}

export function loadFen(fen: string): Chess | null {
  const setup = parseFen(fen.trim());
  if (setup.isErr) return null;
  const pos = Chess.fromSetup(setup.unwrap());
  return pos.isErr ? null : pos.unwrap();
}

export function fenOf(pos: Chess): string {
  return makeFen(pos.toSetup());
}

export function fenKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

export function squareName(square: Square): string {
  return makeSquare(square);
}

export function destsOf(pos: Chess): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const [from, dests] of pos.allDests()) {
    const names = new Set<string>();
    for (const to of dests) {
      names.add(makeSquare(to));
      const piece = pos.board.get(from);
      if (piece?.role === "king" && pos.board.get(to)?.color === pos.turn) {
        const side = to > from ? "h" : "a";
        names.add(makeSquare(kingCastlesTo(pos.turn, side)));
      }
    }
    if (names.size) map[makeSquare(from)] = [...names];
  }
  return map;
}

export function needsPromotion(pos: Chess, from: string, to: string): boolean {
  const f = parseSquare(from);
  const t = parseSquare(to);
  if (f == null || t == null) return false;
  const piece = pos.board.get(f);
  if (piece?.role !== "pawn") return false;
  const rank = squareRank(t);
  return rank === 0 || rank === 7;
}

export function legalMove(pos: Chess, from: string, to: string, promotion?: Role): NormalMove | null {
  const f = parseSquare(from);
  const t = parseSquare(to);
  if (f == null || t == null) return null;
  const move: NormalMove = { from: f, to: t, promotion };
  if (!pos.isLegal(move)) return null;
  return move;
}

export function uciOf(pos: Chess, move: Move): string {
  return makeUci(normalizeMove(pos, move));
}

export function sanAndUci(pos: Chess, move: NormalMove): { san: string; uci: string } {
  const san = makeSan(pos, move);
  const uci = uciOf(pos, move);
  return { san, uci };
}

export function playUciOn(pos: Chess, uci: string): boolean {
  const move = parseUci(uci);
  if (!move || !("from" in move) || !pos.isLegal(move)) return false;
  pos.play(move);
  return true;
}

export function positionAt(startFen: string, ucis: string[], cursor: number): Chess | null {
  const pos = loadFen(startFen);
  if (!pos) return null;
  const end = Math.max(0, Math.min(cursor, ucis.length));
  for (let i = 0; i < end; i++) {
    if (!playUciOn(pos, ucis[i]!)) break;
  }
  return pos;
}

export function sansFrom(startFen: string, ucis: string[]): string[] {
  const pos = loadFen(startFen);
  if (!pos) return [];
  const sans: string[] = [];
  for (const uci of ucis) {
    const move = parseUci(uci);
    if (!move || !("from" in move) || !pos.isLegal(move)) break;
    sans.push(makeSan(pos, move));
    pos.play(move);
  }
  return sans;
}

export type Ending = { winner?: Color; reason: string; result: string };

export function endingOf(pos: Chess, keys: string[]): Ending | null {
  if (pos.isCheckmate()) {
    const winner = opposite(pos.turn);
    return { winner, reason: "Xeque-mate", result: winner === "white" ? "1-0" : "0-1" };
  }
  if (pos.isStalemate()) return { reason: "Afogamento", result: "1/2-1/2" };
  if (pos.isInsufficientMaterial()) return { reason: "Material insuficiente", result: "1/2-1/2" };
  if (pos.halfmoves >= 100) return { reason: "Regra dos 50 lances", result: "1/2-1/2" };
  const key = fenKey(fenOf(pos));
  if (keys.filter((k) => k === key).length >= 3) {
    return { reason: "Tripla repetição", result: "1/2-1/2" };
  }
  return null;
}

export function flagEnding(pos: Chess, color: Color): Ending {
  const opp = opposite(color);
  if (pos.hasInsufficientMaterial(opp)) {
    return { reason: "Tempo, sem material de mate", result: "1/2-1/2" };
  }
  return {
    winner: opp,
    reason: "Tempo esgotado",
    result: opp === "white" ? "1-0" : "0-1",
  };
}

export function material(pos: Chess, color: Color): number {
  let score = 0;
  for (const [, piece] of pos.board) {
    if (piece.color === color) score += MAT[piece.role];
  }
  return score;
}

export function winPercent(cp: number): number {
  const clamped = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
}

export function classifyMove(opts: {
  book: boolean;
  cpBefore: number;
  cpAfterForMover: number;
  playedIsBest: boolean;
  secondGap: number;
  sacrifice: boolean;
  onlyMove: boolean;
}): Mark {
  if (opts.book && opts.cpBefore - opts.cpAfterForMover < 80) return "Livro";
  const loss = winPercent(opts.cpBefore) - winPercent(opts.cpAfterForMover);
  if (
    opts.playedIsBest &&
    opts.sacrifice &&
    !opts.onlyMove &&
    opts.secondGap >= 120 &&
    loss < 8
  ) {
    return "Brilhante";
  }
  if (opts.playedIsBest && opts.secondGap >= 180 && loss < 5) return "Ótimo";
  if (loss < 2) return "Excelente";
  if (loss < 5) return "Bom";
  if (loss < 10) return "Imprecisão";
  if (loss < 20) return "Erro";
  return "Gafe";
}

export function toPgn(opts: {
  startFen: string;
  sans: string[];
  white: string;
  black: string;
  result: string;
  event?: string;
  variant960?: boolean;
}): string {
  const headers: [string, string][] = [
    ["Event", opts.event ?? "Soberano"],
    ["Site", "local"],
    ["Date", new Date().toISOString().slice(0, 10).replace(/-/g, ".")],
    ["White", opts.white],
    ["Black", opts.black],
    ["Result", opts.result || "*"],
  ];
  if (opts.variant960) headers.push(["Variant", "Chess960"]);
  if (fenKey(opts.startFen) !== fenKey(START_FEN) || opts.variant960) {
    headers.push(["SetUp", "1"], ["FEN", opts.startFen]);
  }
  let body = "";
  opts.sans.forEach((san, i) => {
    if (i % 2 === 0) body += `${i / 2 + 1}. `;
    body += `${san} `;
  });
  const head = headers.map(([k, v]) => `[${k} "${v.replaceAll('"', "")}]`).join("\n");
  return `${head}\n\n${body}${opts.result || "*"}\n`;
}

export function parseMainline(pgn: string): { startFen: string; sans: string[] } | null {
  const text = pgn.trim();
  if (!text) return null;
  const fenHeader = /\[FEN\s+"([^"]+)"\]/i.exec(text)?.[1];
  const body = text.replace(/\[[^\]]*\]/g, " ");
  const sans = body
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .split(/\s+/)
    .filter((t) => t && !/^\d+\.+$/.test(t) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
  const startFen = fenHeader || START_FEN;
  const pos = loadFen(startFen);
  if (!pos) return null;
  const ok: string[] = [];
  for (const san of sans) {
    const mv = parseSan(pos, san);
    if (!mv) break;
    ok.push(san);
    pos.play(mv);
  }
  if (!ok.length && !fenHeader) return null;
  return { startFen, sans: ok };
}

export function ucisFromSans(startFen: string, sans: string[]): string[] {
  const pos = loadFen(startFen);
  if (!pos) return [];
  const ucis: string[] = [];
  for (const san of sans) {
    const mv = parseSan(pos, san);
    if (!mv || !("from" in mv)) break;
    ucis.push(uciOf(pos, mv));
    pos.play(mv);
  }
  return ucis;
}

export function formatClock(ms: number): string {
  const safe = Math.max(0, Math.ceil(ms / 100) * 100);
  if (safe < 20_000) return (safe / 1000).toFixed(1);
  const total = Math.ceil(safe / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function checkedKing(pos: Chess): string | null {
  if (!pos.isCheck()) return null;
  const king = pos.board.kingOf(pos.turn);
  return king == null ? null : makeSquare(king);
}

export function piecesOf(fen: string): { square: string; color: Color; role: Role }[] {
  const board = fen.split(" ")[0] ?? "";
  const out: { square: string; color: Color; role: Role }[] = [];
  const ranks = board.split("/");
  const roles: Record<string, Role> = {
    p: "pawn",
    n: "knight",
    b: "bishop",
    r: "rook",
    q: "queen",
    k: "king",
  };
  ranks.forEach((rank, r) => {
    let file = 0;
    for (const ch of rank) {
      const n = Number(ch);
      if (n) {
        file += n;
        continue;
      }
      const role = roles[ch.toLowerCase()];
      if (!role) continue;
      const sq = parseSquare(`${"abcdefgh"[file]}${8 - r}`);
      if (sq != null) {
        out.push({ square: makeSquare(sq), color: ch === ch.toUpperCase() ? "white" : "black", role });
      }
      file += 1;
    }
  });
  return out;
}

export function lastSquares(uci?: string): [string, string] | null {
  if (!uci || uci.length < 4) return null;
  return [uci.slice(0, 2), uci.slice(2, 4)];
}

/** Scharnagl index 0–959. Standard chess is 518. */
export function chess960Rank(index: number): string {
  let n = ((index % 960) + 960) % 960;
  const pos = Array(8).fill("");
  pos[[1, 3, 5, 7][n % 4]!] = "b";
  n = Math.floor(n / 4);
  pos[[0, 2, 4, 6][n % 4]!] = "b";
  n = Math.floor(n / 4);
  const empties = () => pos.flatMap((p, i) => (p ? [] : [i]));
  pos[empties()[n % 6]!] = "q";
  n = Math.floor(n / 6);
  const combos = [
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [1, 2],
    [1, 3],
    [1, 4],
    [2, 3],
    [2, 4],
    [3, 4],
  ];
  const slots = empties();
  const pair = combos[n] ?? [0, 1];
  pos[slots[pair[0]!]!] = "n";
  pos[slots[pair[1]!]!] = "n";
  const rest = empties();
  pos[rest[0]!] = "r";
  pos[rest[1]!] = "k";
  pos[rest[2]!] = "r";
  return pos.join("");
}

const ROLE_OF: Record<string, Role> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

export function fenFrom960(index: number): string {
  const rank = chess960Rank(index);
  const board = Board.empty();
  for (let f = 0; f < 8; f++) {
    const role = ROLE_OF[rank[f]!]!;
    board.set(f, { role, color: "white" });
    board.set(56 + f, { role, color: "black" });
    board.set(8 + f, { role: "pawn", color: "white" });
    board.set(48 + f, { role: "pawn", color: "black" });
  }
  let rights = SquareSet.empty();
  for (let f = 0; f < 8; f++) {
    if (rank[f] === "r") rights = rights.with(f).with(56 + f);
  }
  const pos = Chess.fromSetup({
    board,
    pockets: undefined,
    turn: "white",
    castlingRights: rights,
    epSquare: undefined,
    remainingChecks: undefined,
    halfmoves: 0,
    fullmoves: 1,
  });
  if (pos.isErr) return START_FEN;
  return fenOf(pos.unwrap());
}

export function fileOf(square: string): number {
  const sq = parseSquare(square);
  return sq == null ? 0 : squareFile(sq);
}

export const ENDGAMES: { id: string; name: string; goal: string; fen: string }[] = [
  { id: "qq", name: "Dama contra rei", goal: "Leve o rei à borda e dê mate sem afogar.", fen: "4k3/8/8/8/8/8/3Q4/4K3 w - - 0 1" },
  { id: "rr", name: "Torre contra rei", goal: "Corte o rei e suba a torre com o seu rei.", fen: "4k3/8/8/8/8/8/3R4/4K3 w - - 0 1" },
  { id: "bb", name: "Dois bispos", goal: "Empurre o rei para um canto da cor dos bispos.", fen: "8/8/8/4k3/8/8/4BB2/4K3 w - - 0 1" },
  { id: "bn", name: "Bispo e cavalo", goal: "O canto certo é o da cor do bispo. Não tenha pressa.", fen: "8/8/8/3k4/8/8/5BN1/4K3 w - - 0 1" },
  { id: "pp", name: "Peão passado", goal: "Rei na frente do peão. Oposição decide.", fen: "8/8/8/4k3/8/4P3/4K3/8 w - - 0 1" },
  { id: "lucena", name: "Lucena", goal: "Ponte da torre: afaste o rei preto e promova.", fen: "1K1k4/1P6/8/8/8/8/8/R7 w - - 0 1" },
  { id: "philidor", name: "Philidor", goal: "Pretas defendem. Torre na sexta, xeque por trás quando o peão avança.", fen: "4k3/8/8/3p4/8/8/4K3/r7 b - - 0 1" },
  { id: "qr", name: "Dama contra torre", goal: "Force a torre a afastar-se do rei.", fen: "8/8/8/3k4/8/3r4/3Q4/3K4 w - - 0 1" },
  { id: "rp", name: "Torre e peão", goal: "Peão passado com torre por trás.", fen: "8/8/8/3k4/3P4/8/3K4/3R4 w - - 0 1" },
  { id: "opb", name: "Bispos de cores opostas", goal: "Muitas vezes é empate. Procure dois peões passados distantes.", fen: "8/5k2/2b5/3P4/3K4/8/2B5/8 w - - 0 1" },
];

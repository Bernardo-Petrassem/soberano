import { attacks } from "chessops";
import { Chess } from "chessops/chess";
import { Board } from "chessops/board";
import { SquareSet } from "chessops/squareSet";
import type { Color, Role, Square } from "chessops/types";
import { fenOf } from "@/lib/chess/logic";

export type EndgameId = "qq" | "rr" | "bb" | "bn" | "pp" | "lucena" | "philidor" | "qr" | "rp" | "opb";

type Spec = { role: Role; color: Color };

function rnd(n: number) {
  return Math.floor(Math.random() * n);
}

function shuffle(list: number[]) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    const a = out[i]!;
    out[i] = out[j]!;
    out[j] = a;
  }
  return out;
}

function kingsFar(a: number, b: number) {
  return Math.max(Math.abs((a & 7) - (b & 7)), Math.abs((a >> 3) - (b >> 3))) >= 2;
}

function attacked(pos: Chess, square: Square, by: Color) {
  for (const [sq, piece] of pos.board) {
    if (piece.color === by && attacks(piece, sq, pos.board.occupied).has(square)) return true;
  }
  return false;
}

/** A non-king piece the enemy attacks and nobody defends. */
function hasHanging(pos: Chess) {
  for (const [sq, piece] of pos.board) {
    if (piece.role === "king") continue;
    const enemy: Color = piece.color === "white" ? "black" : "white";
    if (attacked(pos, sq, enemy) && !attacked(pos, sq, piece.color)) return true;
  }
  return false;
}

function bishopTone(square: number) {
  return ((square & 7) + (square >> 3)) & 1;
}

function build(specs: Spec[], squares: number[], turn: Color): Chess | null {
  if (new Set(squares).size !== squares.length) return null;
  const kings = specs.flatMap((s, i) => (s.role === "king" ? [squares[i]!] : []));
  if (kings.length === 2 && !kingsFar(kings[0]!, kings[1]!)) return null;
  const board = Board.empty();
  specs.forEach((s, i) => board.set(squares[i] as Square, { role: s.role, color: s.color }));
  for (const [sq, piece] of board) {
    if (piece.role === "pawn" && ((sq >> 3) === 0 || (sq >> 3) === 7)) return null;
  }
  const made = Chess.fromSetup({
    board,
    pockets: undefined,
    turn,
    castlingRights: SquareSet.empty(),
    epSquare: undefined,
    remainingChecks: undefined,
    halfmoves: 0,
    fullmoves: 1,
  });
  if (made.isErr) return null;
  const pos = made.unwrap();
  if (pos.isEnd() || hasHanging(pos)) return null;
  return pos;
}

function scatter(specs: Spec[], turn: Color, accept: (pos: Chess) => boolean) {
  const deck = Array.from({ length: 64 }, (_, i) => i);
  for (let n = 0; n < 700; n++) {
    const squares = shuffle(deck).slice(0, specs.length);
    const pos = build(specs, squares, turn);
    if (pos && accept(pos)) return fenOf(pos);
  }
  return null;
}

function tonesDiffer(pos: Chess) {
  const tones: number[] = [];
  for (const [sq, piece] of pos.board) if (piece.role === "bishop") tones.push(bishopTone(sq));
  return tones.length >= 2 && tones[0] !== tones[1];
}

function pawnHitsBishop(pos: Chess) {
  const bishops: Square[] = [];
  for (const [sq, piece] of pos.board) if (piece.role === "bishop") bishops.push(sq);
  for (const [sq, piece] of pos.board) {
    if (piece.role !== "pawn") continue;
    const hits = attacks(piece, sq, pos.board.occupied);
    if (bishops.some((b) => hits.has(b))) return true;
  }
  return false;
}

function lucena() {
  for (let n = 0; n < 250; n++) {
    const file = 1 + rnd(6);
    const pawn = file + 48;
    const wk = file + 56;
    let bkFile = rnd(8);
    if (Math.abs(bkFile - file) < 2) bkFile = (file + 3) % 8;
    const bk = bkFile + (rnd(2) ? 56 : 48);
    const rook = rnd(8) + rnd(5) * 8;
    const pos = build(
      [
        { role: "king", color: "white" },
        { role: "pawn", color: "white" },
        { role: "rook", color: "white" },
        { role: "king", color: "black" },
      ],
      [wk, pawn, rook, bk],
      "white",
    );
    if (pos) return fenOf(pos);
  }
  return null;
}

function philidor() {
  for (let n = 0; n < 400; n++) {
    const file = rnd(8);
    const pawn = file + 32;
    const wk = ((file + rnd(3) - 1 + 8) % 8) + 24;
    const wr = rnd(8) + rnd(3) * 8;
    const br = rnd(8) + 40;
    const bk = rnd(8) + 56;
    const pos = build(
      [
        { role: "pawn", color: "white" },
        { role: "king", color: "white" },
        { role: "rook", color: "white" },
        { role: "rook", color: "black" },
        { role: "king", color: "black" },
      ],
      [pawn, wk, wr, br, bk],
      "black",
    );
    if (pos) return fenOf(pos);
  }
  return null;
}

const FALLBACK: Record<EndgameId, string> = {
  qq: "8/8/8/4k3/8/8/3Q4/4K3 w - - 0 1",
  rr: "8/8/8/4k3/8/8/3R4/4K3 w - - 0 1",
  bb: "8/8/4k3/8/8/8/4BB2/4K3 w - - 0 1",
  bn: "8/8/3k4/8/8/8/5BN1/4K3 w - - 0 1",
  pp: "8/8/4k3/8/8/4P3/4K3/8 w - - 0 1",
  lucena: "1K6/1P6/8/3k4/8/8/8/R7 w - - 0 1",
  philidor: "5k2/8/r7/P7/1K6/6R1/8/8 b - - 0 1",
  qr: "8/r7/8/4k3/7Q/8/2K5/8 w - - 0 1",
  rp: "8/2K5/k7/2P5/8/8/8/6R1 w - - 0 1",
  opb: "1k6/1pp1b3/7P/7P/B7/8/3K4/8 w - - 0 1",
};

/** A fresh, legal endgame. Nothing is hanging on the first move. */
export function generateEndgame(id: EndgameId): string {
  let fen: string | null = null;
  if (id === "qq") {
    fen = scatter(
      [
        { role: "king", color: "white" },
        { role: "queen", color: "white" },
        { role: "king", color: "black" },
      ],
      "white",
      () => true,
    );
  } else if (id === "rr") {
    fen = scatter(
      [
        { role: "king", color: "white" },
        { role: "rook", color: "white" },
        { role: "king", color: "black" },
      ],
      "white",
      () => true,
    );
  } else if (id === "bb") {
    fen = scatter(
      [
        { role: "king", color: "white" },
        { role: "bishop", color: "white" },
        { role: "bishop", color: "white" },
        { role: "king", color: "black" },
      ],
      "white",
      tonesDiffer,
    );
  } else if (id === "bn") {
    fen = scatter(
      [
        { role: "king", color: "white" },
        { role: "bishop", color: "white" },
        { role: "knight", color: "white" },
        { role: "king", color: "black" },
      ],
      "white",
      () => true,
    );
  } else if (id === "pp") {
    fen = scatter(
      [
        { role: "king", color: "white" },
        { role: "pawn", color: "white" },
        { role: "king", color: "black" },
      ],
      "white",
      () => true,
    );
  } else if (id === "lucena") fen = lucena();
  else if (id === "philidor") fen = philidor();
  else if (id === "qr") {
    fen = scatter(
      [
        { role: "king", color: "white" },
        { role: "queen", color: "white" },
        { role: "rook", color: "black" },
        { role: "king", color: "black" },
      ],
      "white",
      () => true,
    );
  } else if (id === "rp") {
    fen = scatter(
      [
        { role: "king", color: "white" },
        { role: "rook", color: "white" },
        { role: "pawn", color: "white" },
        { role: "king", color: "black" },
      ],
      "white",
      () => true,
    );
  } else {
    fen = scatter(
      [
        { role: "king", color: "white" },
        { role: "bishop", color: "white" },
        { role: "pawn", color: "white" },
        { role: "pawn", color: "white" },
        { role: "king", color: "black" },
        { role: "bishop", color: "black" },
        { role: "pawn", color: "black" },
        { role: "pawn", color: "black" },
      ],
      "white",
      (pos) => tonesDiffer(pos) && !pawnHitsBishop(pos),
    );
  }
  return fen ?? FALLBACK[id];
}

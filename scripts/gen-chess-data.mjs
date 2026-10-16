/**
 * Validates the local opening book and builds a tactic set.
 * Run: node scripts/gen-chess-data.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { Chess } from "chessops/chess";
import { makeFen } from "chessops/fen";
import { makeSan, parseSan } from "chessops/san";
import { makeUci, parseSquare } from "chessops/util";
import { normalizeMove } from "chessops/chess";
import { Board } from "chessops/board";
import { SquareSet } from "chessops/squareSet";

const ROLE = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
const VAL = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };

function fenKey(fen) {
  return fen.split(" ").slice(0, 4).join(" ");
}

function legalMoves(pos) {
  const moves = [];
  for (const [from, dests] of pos.allDests()) {
    for (const to of dests) {
      const piece = pos.board.get(from);
      if (piece?.role === "pawn" && (to < 8 || to > 55)) {
        for (const promotion of ["queen", "rook", "bishop", "knight"]) {
          const move = { from, to, promotion };
          if (pos.isLegal(move)) moves.push(move);
        }
      } else {
        const move = { from, to };
        if (pos.isLegal(move)) moves.push(move);
      }
    }
  }
  return moves;
}

function loadLines() {
  const raw = readFileSync(new URL("./opening-lines.txt", import.meta.url), "utf8");
  const openings = [];
  const errors = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [eco, family, name, moves, goal] = trimmed.split("|");
    let pos = Chess.default();
    const sans = moves.trim().split(/\s+/);
    let ok = true;
    for (const san of sans) {
      const mv = parseSan(pos, san);
      if (!mv) {
        errors.push(`${name}: ilegal «${san}» em ${makeFen(pos.toSetup())}`);
        ok = false;
        break;
      }
      pos.play(mv);
    }
    if (!ok) continue;
    openings.push({ eco, family, name, moves: sans.join(" "), ...(goal ? { goal } : {}) });
  }
  return { openings, errors };
}

function chess960Rank(index) {
  const n0 = index % 960;
  let n = n0;
  const pos = Array(8).fill("");
  pos[[1, 3, 5, 7][n % 4]] = "b";
  n = Math.floor(n / 4);
  pos[[0, 2, 4, 6][n % 4]] = "b";
  n = Math.floor(n / 4);
  const empties = () => pos.flatMap((p, i) => (p ? [] : [i]));
  pos[empties()[n % 6]] = "q";
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
  const [i, j] = combos[n];
  pos[slots[i]] = "n";
  pos[slots[j]] = "n";
  const rest = empties();
  pos[rest[0]] = "r";
  pos[rest[1]] = "k";
  pos[rest[2]] = "r";
  return pos.join("");
}

function fenFromRank(rank, turn = "white") {
  const board = Board.empty();
  for (let f = 0; f < 8; f++) {
    board.set(f, { role: ROLE[rank[f]], color: "white" });
    board.set(56 + f, { role: ROLE[rank[f]], color: "black" });
    board.set(8 + f, { role: "pawn", color: "white" });
    board.set(48 + f, { role: "pawn", color: "black" });
  }
  let rights = SquareSet.empty();
  for (let f = 0; f < 8; f++) {
    if (rank[f] === "r") rights = rights.with(f).with(56 + f);
  }
  const setup = {
    board,
    pockets: undefined,
    turn,
    castlingRights: rights,
    epSquare: undefined,
    remainingChecks: undefined,
    halfmoves: 0,
    fullmoves: 1,
  };
  const pos = Chess.fromSetup(setup);
  if (pos.isErr) throw new Error(String(pos.error));
  return makeFen(pos.unwrap().toSetup());
}

function verify960() {
  const seen = new Set();
  let standard = -1;
  for (let n = 0; n < 960; n++) {
    const rank = chess960Rank(n);
    if (seen.has(rank)) throw new Error("960 duplicado " + n);
    seen.add(rank);
    if (rank === "rnbqkbnr") standard = n;
    if (n === 0 || n === 518 || n === 959) fenFromRank(rank);
  }
  if (seen.size !== 960) throw new Error("960 incompleto");
  return standard;
}

function pieceCount(pos) {
  let n = 0;
  for (const _ of pos.board) n++;
  return n;
}

function materialKey(pos) {
  const c = { pawn: 0, knight: 0, bishop: 0, rook: 0, queen: 0, king: 0 };
  for (const [, piece] of pos.board) c[piece.role]++;
  return `${c.queen}${c.rook}${c.bishop}${c.knight}${c.pawn}`;
}

function matesInOne(pos) {
  const found = [];
  for (const move of legalMoves(pos)) {
    const copy = pos.clone();
    copy.play(move);
    if (copy.isCheckmate()) found.push(move);
  }
  return found;
}

function playRandom(pos, steps) {
  for (let i = 0; i < steps && !pos.isEnd() && pos.halfmoves < 80; i++) {
    const moves = legalMoves(pos);
    if (!moves.length) break;
    const captures = moves.filter((m) => pos.board.get(m.to) || pos.board.pawn.has(m.from) && m.to === pos.epSquare);
    const pool = captures.length && Math.random() < 0.42 ? captures : moves;
    pos.play(pool[Math.floor(Math.random() * pool.length)]);
  }
  return pos;
}

function themesFor(pos, move, depth) {
  const themes = ["mate", depth === 1 ? "mateEm1" : "mateEm2"];
  const piece = pos.board.get(move.from);
  if (piece) {
    const names = { queen: "dama", rook: "torre", bishop: "bispo", knight: "cavalo", pawn: "peao", king: "rei" };
    themes.push(names[piece.role]);
  }
  if (move.promotion) themes.push("promocao");
  const captured = pos.board.get(move.to);
  if (captured && piece && VAL[captured.role] + 0.5 < VAL[piece.role]) themes.push("sacrificio");
  const copy = pos.clone();
  copy.play(move);
  const king = copy.board.kingOf(copy.turn);
  if (king != null && (king < 8 || king >= 56) && (piece?.role === "rook" || piece?.role === "queen")) {
    themes.push("fileira");
  }
  return themes;
}

function rate(pos, depth) {
  const pieces = pieceCount(pos);
  const mob = legalMoves(pos).length;
  const base = depth === 1 ? 420 : 980;
  return Math.max(280, Math.min(2100, Math.round(base + pieces * 18 + mob * 7)));
}

function randomScatter(whiteRoles, blackRoles) {
  const board = Board.empty();
  const used = new Set();
  const put = (color, role) => {
    for (let t = 0; t < 40; t++) {
      const sq = Math.floor(Math.random() * 64);
      if (used.has(sq)) continue;
      if (role === "pawn" && (sq < 8 || sq >= 56)) continue;
      used.add(sq);
      board.set(sq, { color, role });
      return true;
    }
    return false;
  };
  if (!put("white", "king") || !put("black", "king")) return null;
  for (const role of whiteRoles) if (!put("white", role)) return null;
  for (const role of blackRoles) if (!put("black", role)) return null;
  const turn = Math.random() < 0.55 ? "white" : "black";
  const pos = Chess.fromSetup({
    board,
    pockets: undefined,
    turn,
    castlingRights: SquareSet.empty(),
    epSquare: undefined,
    remainingChecks: undefined,
    halfmoves: Math.floor(Math.random() * 10),
    fullmoves: 12 + Math.floor(Math.random() * 30),
  });
  if (pos.isErr) return null;
  return pos.unwrap();
}

function generatePuzzles() {
  const puzzles = [];
  const seen = new Set();
  const caps = new Map();
  const deadline = Date.now() + 12000;

  function tryAdd(pos, depth, move, line) {
    if (puzzles.length >= 900) return false;
    const fen = makeFen(pos.toSetup());
    const key = fenKey(fen);
    if (seen.has(key)) return false;
    const pieces = pieceCount(pos);
    if (pieces <= 3) return false;
    const sig = materialKey(pos);
    const cap = pieces <= 5 ? 18 : 8;
    const used = caps.get(sig) ?? 0;
    if (used >= cap) return false;
    caps.set(sig, used + 1);
    seen.add(key);
    puzzles.push({
      id: (depth === 1 ? "m1-" : "m2-") + puzzles.length.toString(36),
      fen,
      rating: rate(pos, depth) + (pieces > 10 ? 80 : 0),
      themes: themesFor(pos, move, depth),
      line,
    });
    return true;
  }

  const bags = [
    [["queen"], []],
    [["rook"], []],
    [["queen", "rook"], []],
    [["queen", "bishop"], ["pawn"]],
    [["rook", "bishop"], ["pawn"]],
    [["queen", "knight"], ["pawn", "pawn"]],
    [["rook", "rook"], ["rook"]],
    [["queen", "pawn"], ["pawn"]],
    [["queen", "bishop", "knight"], ["bishop", "pawn"]],
    [["rook", "pawn", "pawn"], ["pawn"]],
    [["queen", "rook", "pawn"], ["rook", "pawn"]],
    [["bishop", "bishop"], []],
    [["queen", "knight", "pawn"], ["knight"]],
    [["rook", "knight"], ["pawn", "pawn"]],
  ];

  let spins = 0;
  while (puzzles.length < 520 && Date.now() < deadline && spins < 30000) {
    spins++;
    const [w, b] = bags[spins % bags.length];
    const pos = randomScatter(w, b);
    if (!pos || pos.isEnd()) continue;
    const mates = matesInOne(pos);
    if (mates.length !== 1) continue;
    tryAdd(pos, 1, mates[0], [makeUci(normalizeMove(pos, mates[0]))]);
  }

  const midDeadline = Math.min(deadline, Date.now() + 4000);
  let games = 0;
  while (puzzles.length < 700 && Date.now() < midDeadline && games < 2500) {
    games++;
    const pos = Chess.default();
    for (let ply = 0; ply < 36 && !pos.isEnd() && pos.halfmoves < 70; ply++) {
      if (ply > 8 && ply % 2 === 0) {
        const mates = matesInOne(pos);
        if (mates.length === 1) {
          tryAdd(pos, 1, mates[0], [makeUci(normalizeMove(pos, mates[0]))]);
        }
      }
      const moves = legalMoves(pos);
      if (!moves.length) break;
      const captures = moves.filter((m) => pos.board.get(m.to));
      const pool = captures.length && Math.random() < 0.5 ? captures : moves;
      pos.play(pool[Math.floor(Math.random() * pool.length)]);
    }
  }

  let guard2 = 0;
  while (puzzles.filter((p) => p.line.length === 3).length < 70 && Date.now() < deadline && guard2 < 2500) {
    guard2++;
    const pos =
      Math.random() < 0.5
        ? randomScatter(["queen", "rook"], ["pawn"])
        : randomScatter(["queen"], ["knight", "pawn"]);
    if (!pos || pos.isEnd()) continue;
    const moves = legalMoves(pos);
    if (moves.length < 2 || moves.length > 16) continue;
    for (const move of moves) {
      const c = pos.clone();
      c.play(move);
      if (!c.isCheck() || c.isEnd()) continue;
      const replies = legalMoves(c);
      if (replies.length !== 1) continue;
      const c2 = c.clone();
      c2.play(replies[0]);
      if (c2.isEnd()) continue;
      const mates = matesInOne(c2);
      if (!mates.length) continue;
      tryAdd(pos, 2, move, [
        makeUci(normalizeMove(pos, move)),
        makeUci(normalizeMove(c, replies[0])),
        makeUci(normalizeMove(c2, mates[0])),
      ]);
      break;
    }
  }

  puzzles.sort((a, b) => a.rating - b.rating || a.id.localeCompare(b.id));
  return puzzles;
}

function endgame(turn, squares) {
  const board = Board.empty();
  for (const [name, color, role] of squares) {
    const sq = parseSquare(name);
    board.set(sq, { color, role });
  }
  const setup = {
    board,
    pockets: undefined,
    turn,
    castlingRights: SquareSet.empty(),
    epSquare: undefined,
    remainingChecks: undefined,
    halfmoves: 0,
    fullmoves: 1,
  };
  const pos = Chess.fromSetup(setup);
  if (pos.isErr) throw new Error("final ilegal " + squares.map((s) => s[0]).join(" "));
  return makeFen(pos.unwrap().toSetup());
}

function drillsFrom(openings) {
  const drills = [
    {
      id: "kq",
      group: "Finais",
      title: "Dama contra rei",
      goal: "Corte o rei com a dama e aproxime o seu rei. Mate sem afogar.",
      fen: endgame("white", [
        ["e1", "white", "king"],
        ["d1", "white", "queen"],
        ["e8", "black", "king"],
      ]),
      color: "white",
      kind: "mate",
      botId: "peao",
    },
    {
      id: "kr",
      group: "Finais",
      title: "Torre contra rei",
      goal: "Corte por fileiras. O rei ajuda a torre a empurrar o rei inimigo até à borda.",
      fen: endgame("white", [
        ["e1", "white", "king"],
        ["a1", "white", "rook"],
        ["e8", "black", "king"],
      ]),
      color: "white",
      kind: "mate",
      botId: "peao",
    },
    {
      id: "kbb",
      group: "Finais",
      title: "Dois bispos",
      goal: "Bispos em cores opostas empurram o rei para um canto da cor certa.",
      fen: endgame("white", [
        ["e2", "white", "king"],
        ["c1", "white", "bishop"],
        ["f1", "white", "bishop"],
        ["a8", "black", "king"],
      ]),
      color: "white",
      kind: "mate",
      botId: "aprendiz",
    },
    {
      id: "kbn",
      group: "Finais",
      title: "Bispo e cavalo",
      goal: "Leve o rei inimigo ao canto da cor do bispo. É o mate mais técnico.",
      fen: endgame("white", [
        ["e1", "white", "king"],
        ["a2", "white", "bishop"],
        ["b1", "white", "knight"],
        ["e8", "black", "king"],
      ]),
      color: "white",
      kind: "mate",
      botId: "aprendiz",
    },
    {
      id: "kpk",
      group: "Finais",
      title: "Rei e peão",
      goal: "Tome a oposição e só avance o peão quando o rei o apoiar.",
      fen: endgame("white", [
        ["e3", "white", "king"],
        ["e2", "white", "pawn"],
        ["e5", "black", "king"],
      ]),
      color: "white",
      kind: "play",
      botId: "cavalo",
    },
    {
      id: "lucena",
      group: "Finais",
      title: "Posição de Lucena",
      goal: "Ponte da torre: cheque na lateral, interponha a torre e promova.",
      fen: endgame("white", [
        ["b8", "white", "king"],
        ["b7", "white", "pawn"],
        ["a1", "white", "rook"],
        ["d7", "black", "king"],
      ]),
      color: "white",
      kind: "play",
      botId: "bispo",
    },
    {
      id: "philidor",
      group: "Finais",
      title: "Defesa de Philidor",
      goal: "Mantenha a torre na sexta e não deixe o rei branco avançar. Aguente o empate.",
      fen: endgame("black", [
        ["e5", "white", "king"],
        ["e1", "white", "rook"],
        ["e4", "white", "pawn"],
        ["e8", "black", "king"],
        ["a6", "black", "rook"],
      ]),
      color: "black",
      kind: "play",
      botId: "cavalo",
    },
    {
      id: "qvsp",
      group: "Finais",
      title: "Dama contra peão na sétima",
      goal: "A dama precisa de xeque e de aproximar o rei. Cuidado com a promoção.",
      fen: endgame("black", [
        ["c7", "white", "pawn"],
        ["c8", "white", "king"],
        ["a5", "black", "queen"],
        ["e5", "black", "king"],
      ]),
      color: "black",
      kind: "play",
      botId: "cavalo",
    },
  ];

  for (const opening of openings) {
    if (!opening.goal) continue;
    let pos = Chess.default();
    for (const san of opening.moves.split(" ")) {
      const mv = parseSan(pos, san);
      pos.play(mv);
    }
    drills.push({
      id: "op-" + drills.length.toString(36),
      group: "Meio-jogo",
      title: opening.name,
      goal: opening.goal,
      fen: makeFen(pos.toSetup()),
      color: "white",
      kind: "play",
      botId: "dama",
    });
  }
  return drills;
}

function esc(value) {
  return JSON.stringify(value);
}

const { openings, errors } = loadLines();
if (!openings.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
const standard = verify960();
const puzzles = generatePuzzles();
const drills = drillsFrom(openings);
let positions = 0;
for (const opening of openings) positions += opening.moves.split(" ").length;

const out = `/* Generated by scripts/gen-chess-data.mjs — do not edit by hand. */
export type OpeningLine = {
  eco: string;
  family: string;
  name: string;
  moves: string;
  goal?: string;
};

export const OPENINGS: OpeningLine[] = ${JSON.stringify(openings, null, 2)};

export type Puzzle = {
  id: string;
  fen: string;
  rating: number;
  themes: string[];
  line: string[];
};

export const PUZZLES: Puzzle[] = ${JSON.stringify(puzzles)};

export type Drill = {
  id: string;
  group: "Finais" | "Meio-jogo";
  title: string;
  goal: string;
  fen: string;
  color: "white" | "black";
  kind: "mate" | "hold" | "play";
  botId: string;
};

export const DRILLS: Drill[] = ${JSON.stringify(drills, null, 2)};

export const BOOK_STATS = { lines: ${openings.length}, positions: ${positions}, puzzles: ${puzzles.length}, chess960Standard: ${standard} };
`;

writeFileSync(new URL("../src/lib/chess/generated.ts", import.meta.url), out);
console.log(
  JSON.stringify(
    {
      lines: openings.length,
      errors: errors.length,
      positions,
      puzzles: puzzles.length,
      mates2: puzzles.filter((p) => p.line.length === 3).length,
      drills: drills.length,
      chess960Standard: standard,
      errorSample: errors.slice(0, 12),
    },
    null,
    2,
  ),
);
if (errors.length) console.log(errors.join("\n"));

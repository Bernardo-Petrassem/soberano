/**
 * Downloads the public Lichess ECO opening book and a stratified sample of the
 * public Lichess puzzle database. Output is static JSON the app ships with.
 * Import of the full dumps stays available in the Biblioteca.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { Decompress } from "fzstd";
import { Chess } from "chessops/chess";
import { parseFen } from "chessops/fen";
import { parseSan } from "chessops/san";
import { parseUci } from "chessops/util";

const FAMILY = {
  A: "Flanco",
  B: "Semiabertas",
  C: "Abertas",
  D: "Fechadas",
  E: "Indianas",
};

function sanTokens(pgn) {
  return pgn
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .split(/\s+/)
    .filter((t) => t && !/^\d+\.+$/.test(t) && t !== "*" && !/^(1-0|0-1|1\/2-1\/2)$/.test(t));
}

function lineOk(sans) {
  let pos = Chess.default();
  for (const san of sans) {
    const mv = parseSan(pos, san);
    if (!mv) return false;
    pos.play(mv);
  }
  return true;
}

async function loadOpenings() {
  const files = ["a", "b", "c", "d", "e"];
  const openings = [];
  const seen = new Set();
  for (const file of files) {
    const res = await fetch(
      `https://raw.githubusercontent.com/lichess-org/chess-openings/master/${file}.tsv`,
    );
    if (!res.ok) throw new Error(`openings ${file}: ${res.status}`);
    const text = await res.text();
    for (const raw of text.split("\n")) {
      if (!raw || raw.startsWith("eco\t")) continue;
      const [eco, name, pgn] = raw.split("\t");
      if (!eco || !name || !pgn) continue;
      const sans = sanTokens(pgn);
      if (!sans.length || !lineOk(sans)) continue;
      const key = `${eco}|${name}|${sans.join(" ")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      openings.push([eco, FAMILY[eco[0]] || "Outras", name, sans.join(" ")]);
    }
  }
  openings.sort((a, b) => a[0].localeCompare(b[0]) || a[2].localeCompare(b[2]));
  return openings;
}

function puzzleLegal(fen, moves) {
  const setup = parseFen(fen);
  if (setup.isErr) return false;
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) return false;
  const chess = pos.value;
  for (const uci of moves.split(" ")) {
    const mv = parseUci(uci);
    if (!mv || !chess.isLegal(mv)) return false;
    chess.play(mv);
  }
  return true;
}

async function loadPuzzles() {
  const bytes = 10_000_000;
  const res = await fetch("https://database.lichess.org/lichess_db_puzzle.csv.zst", {
    headers: { Range: `bytes=0-${bytes - 1}` },
  });
  if (!res.ok && res.status !== 206) throw new Error(`puzzles: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const buckets = new Map();
  const seenCount = new Map();
  const per = 100;
  let header = true;
  let text = "";
  let kept = 0;
  let scanned = 0;

  const take = (line) => {
    if (!line) return;
    if (header) {
      header = false;
      return;
    }
    scanned++;
    const cols = line.split(",");
    if (cols.length < 8) return;
    const [id, fen, moves, ratingRaw, , , , themes] = cols;
    const rating = Number(ratingRaw);
    if (!id || !fen || !moves || !Number.isFinite(rating)) return;
    if (rating < 400 || rating > 2800) return;
    const ucis = moves.trim().split(/\s+/);
    if (ucis.length < 2 || ucis.length > 11) return;
    const bucket = Math.round(rating / 50) * 50;
    const n = (seenCount.get(bucket) ?? 0) + 1;
    seenCount.set(bucket, n);
    let arr = buckets.get(bucket);
    if (!arr) {
      arr = [];
      buckets.set(bucket, arr);
    }
    const row = [id, fen, rating, themes, moves.trim()];
    if (arr.length < per) {
      if (!puzzleLegal(fen, moves.trim())) return;
      arr.push(row);
      kept++;
      return;
    }
    const j = Math.floor(Math.random() * n);
    if (j < per) {
      if (!puzzleLegal(fen, moves.trim())) return;
      arr[j] = row;
    }
  };

  const dec = new Decompress((data) => {
    text += new TextDecoder().decode(data, { stream: true });
    let nl = text.indexOf("\n");
    while (nl >= 0) {
      const line = text.slice(0, nl).replace(/\r$/, "");
      text = text.slice(nl + 1);
      take(line);
      nl = text.indexOf("\n");
    }
  });

  const slice = 262144;
  for (let i = 0; i < buf.length; i += slice) {
    try {
      dec.push(buf.subarray(i, Math.min(buf.length, i + slice)), false);
    } catch {
      break;
    }
  }

  const puzzles = [...buckets.values()].flat();
  puzzles.sort((a, b) => a[2] - b[2] || String(a[0]).localeCompare(String(b[0])));
  return { puzzles, scanned, kept };
}

mkdirSync(new URL("../public/data/", import.meta.url), { recursive: true });
const openings = await loadOpenings();
const { puzzles, scanned, kept } = await loadPuzzles();
if (openings.length < 1000) throw new Error(`too few openings: ${openings.length}`);
if (puzzles.length < 500) throw new Error(`too few puzzles: ${puzzles.length}`);

writeFileSync(
  new URL("../public/data/openings.json", import.meta.url),
  JSON.stringify(openings),
);
writeFileSync(
  new URL("../public/data/puzzles.json", import.meta.url),
  JSON.stringify(puzzles),
);
writeFileSync(
  new URL("../public/data/corpus-meta.json", import.meta.url),
  JSON.stringify(
    {
      openings: openings.length,
      puzzles: puzzles.length,
      scanned,
      kept,
      openingSource: "https://github.com/lichess-org/chess-openings",
      puzzleSource: "https://database.lichess.org/lichess_db_puzzle.csv.zst",
      note: "Amostra estratificada da base pública. A Biblioteca importa o ficheiro completo.",
    },
    null,
    2,
  ),
);
console.log(`openings ${openings.length} puzzles ${puzzles.length} scanned ${scanned}`);

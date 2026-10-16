import { Chess } from "chessops/chess";
import { parseSan } from "chessops/san";
import { fenKey, fenOf, loadFen, parseMainline, START_FEN, uciOf, ucisFromSans } from "@/lib/chess/logic";
import { publicUrl } from "@/lib/chess/public-url";

export type Opening = { eco: string; family: string; name: string; moves: string };
export type Puzzle = { id: string; fen: string; rating: number; themes: string[]; line: string[] };

type Edge = { uci: string; san: string; name: string; eco: string };

export type Corpus = {
  openings: Opening[];
  puzzles: Puzzle[];
  bundledOpenings: number;
  bundledPuzzles: number;
  bookMove: (fen: string, openingName?: string) => string | null;
  isBookMove: (fen: string, uci: string) => boolean;
  namesAt: (fen: string) => { eco: string; name: string }[];
};

type Bundle = {
  openings: Opening[];
  puzzles: Puzzle[];
};

let bundlePromise: Promise<Bundle> | null = null;
let current: Corpus | null = null;
const listeners = new Set<() => void>();

export function subscribeCorpus(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify() {
  for (const fn of listeners) fn();
}

async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("soberano", 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains("kv")) req.result.createObjectStore("kv");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", mode);
    const req = run(tx.objectStore("kv"));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function readExtras(): Promise<{ openings: Opening[]; puzzles: Puzzle[] }> {
  if (typeof indexedDB === "undefined") return { openings: [], puzzles: [] };
  const openings = (await idb<Opening[] | undefined>("readonly", (s) => s.get("openings"))) ?? [];
  const puzzles = (await idb<Puzzle[] | undefined>("readonly", (s) => s.get("puzzles"))) ?? [];
  return { openings, puzzles };
}

export async function writeExtras(openings: Opening[], puzzles: Puzzle[]) {
  await idb("readwrite", (s) => s.put(openings, "openings"));
  await idb("readwrite", (s) => s.put(puzzles, "puzzles"));
}

function indexBook(openings: Opening[]) {
  const byFen = new Map<string, Edge[]>();
  for (const op of openings) {
    let pos = Chess.default();
    for (const san of op.moves.split(" ")) {
      if (!san) continue;
      const key = fenKey(fenOf(pos));
      const mv = parseSan(pos, san);
      if (!mv || !("from" in mv)) break;
      const uci = uciOf(pos, mv);
      const list = byFen.get(key) ?? [];
      if (!list.some((e) => e.uci === uci && e.name === op.name)) {
        list.push({ uci, san, name: op.name, eco: op.eco });
      }
      byFen.set(key, list);
      pos.play(mv);
    }
  }
  return byFen;
}

function assemble(base: Bundle, extraOpenings: Opening[], extraPuzzles: Puzzle[]): Corpus {
  const openings = [...base.openings, ...extraOpenings];
  const puzzles = [...base.puzzles, ...extraPuzzles];
  const byFen = indexBook(openings);
  return {
    openings,
    puzzles,
    bundledOpenings: base.openings.length,
    bundledPuzzles: base.puzzles.length,
    bookMove(fen, openingName) {
      const edges = byFen.get(fenKey(fen)) ?? [];
      if (!edges.length) return null;
      const pref = openingName ? edges.filter((e) => e.name === openingName) : [];
      const pool = pref.length ? pref : edges;
      return pool[Math.floor(Math.random() * pool.length)]!.uci;
    },
    isBookMove(fen, uci) {
      return (byFen.get(fenKey(fen)) ?? []).some((e) => e.uci === uci);
    },
    namesAt(fen) {
      const edges = byFen.get(fenKey(fen)) ?? [];
      const seen = new Set<string>();
      const out: { eco: string; name: string }[] = [];
      for (const e of edges) {
        if (seen.has(e.name)) continue;
        seen.add(e.name);
        out.push({ eco: e.eco, name: e.name });
      }
      return out.slice(0, 4);
    },
  };
}

async function loadBundle(): Promise<Bundle> {
  bundlePromise ??= (async () => {
    const [o, p] = await Promise.all([
      fetch(publicUrl("/data/openings.json")).then((r) => r.json() as Promise<[string, string, string, string][]>),
      fetch(publicUrl("/data/puzzles.json")).then(
        (r) => r.json() as Promise<[string, string, number, string, string][]>,
      ),
    ]);
    return {
      openings: o.map(([eco, family, name, moves]) => ({ eco, family, name, moves })),
      puzzles: p.map(([id, fen, rating, themes, line]) => ({
        id,
        fen,
        rating,
        themes: themes.split(" ").filter(Boolean),
        line: line.split(" ").filter(Boolean),
      })),
    };
  })();
  return bundlePromise;
}

export async function corpus(): Promise<Corpus> {
  if (current) return current;
  const [base, extras] = await Promise.all([loadBundle(), readExtras()]);
  current = assemble(base, extras.openings, extras.puzzles);
  return current;
}

export function peekCorpus(): Corpus | null {
  return current;
}

function sanTokens(pgn: string): string[] {
  return pgn
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .split(/\s+/)
    .filter((t) => t && !/^\d+\.+$/.test(t) && t !== "*" && !/^(1-0|0-1|1\/2-1\/2)$/.test(t));
}

function acceptOpening(posSans: string[]): boolean {
  let pos = Chess.default();
  for (const san of posSans) {
    const mv = parseSan(pos, san);
    if (!mv) return false;
    pos.play(mv);
  }
  return posSans.length > 0;
}

export function parseOpeningText(text: string, filename: string): Opening[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(data)) return [];
      const out: Opening[] = [];
      for (const row of data) {
        if (Array.isArray(row) && row.length >= 4) {
          const sans = String(row[3]).split(/\s+/).filter(Boolean);
          if (acceptOpening(sans)) {
            out.push({
              eco: String(row[0] || "A00"),
              family: String(row[1] || "Importada"),
              name: String(row[2] || "Linha"),
              moves: sans.join(" "),
            });
          }
        } else if (row && typeof row === "object") {
          const rec = row as Record<string, unknown>;
          const moves = String(rec.moves ?? rec.pgn ?? "");
          const sans = sanTokens(moves);
          if (acceptOpening(sans)) {
            out.push({
              eco: String(rec.eco ?? "A00"),
              family: String(rec.family ?? "Importada"),
              name: String(rec.name ?? "Linha"),
              moves: sans.join(" "),
            });
          }
        }
      }
      return out;
    } catch {
      /* fall through */
    }
  }
  if (trimmed.includes("[Event") || trimmed.includes("[White") || /\n1\.\s/.test(trimmed)) {
    const chunks = trimmed.split(/\n(?=\[)/);
    const out: Opening[] = [];
    chunks.forEach((chunk, i) => {
      const parsed = parseMainline(chunk);
      if (!parsed || !parsed.sans.length) return;
      if (fenKey(parsed.startFen) !== fenKey(START_FEN)) return;
      const eco = /\[ECO\s+"([^"]+)"\]/i.exec(chunk)?.[1] ?? "A00";
      const name = /\[Opening\s+"([^"]+)"\]/i.exec(chunk)?.[1] ?? `PGN ${filename} ${i + 1}`;
      const sans = parsed.sans.slice(0, 24);
      if (!acceptOpening(sans)) return;
      out.push({ eco, family: "Importada", name, moves: sans.join(" ") });
    });
    if (out.length) return out;
  }
  const out: Opening[] = [];
  const lines = trimmed.split(/\n/);
  const header = lines[0]?.toLowerCase() ?? "";
  const start = header.includes("eco") && header.includes("pgn") ? 1 : 0;
  for (const raw of lines.slice(start)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const tab = line.split("\t");
    if (tab.length >= 3 && /^[A-E]\d{2}$/.test(tab[0] ?? "")) {
      const sans = sanTokens(tab[2] ?? "");
      if (acceptOpening(sans)) {
        const eco = tab[0]!;
        out.push({ eco, family: familyOf(eco), name: tab[1] || eco, moves: sans.join(" ") });
      }
      continue;
    }
    const pipe = line.split("|");
    if (pipe.length >= 4) {
      const sans = sanTokens(pipe[3] ?? "");
      if (acceptOpening(sans)) {
        out.push({
          eco: pipe[0] || "A00",
          family: pipe[1] || "Importada",
          name: pipe[2] || "Linha",
          moves: sans.join(" "),
        });
      }
    }
  }
  return out;
}

function familyOf(eco: string): string {
  return { A: "Flanco", B: "Semiabertas", C: "Abertas", D: "Fechadas", E: "Indianas" }[eco[0] ?? ""] ?? "Importada";
}

function puzzleFromCols(cols: string[]): Puzzle | null {
  const [id, fen, moves, ratingRaw, , , , themes] = cols;
  const rating = Number(ratingRaw);
  if (!id || !fen || !moves || !Number.isFinite(rating)) return null;
  const line = moves.trim().split(/\s+/);
  if (line.length < 2) return null;
  if (!loadFen(fen)) return null;
  return {
    id,
    fen,
    rating,
    themes: (themes ?? "").split(" ").filter(Boolean),
    line,
  };
}

export function parsePuzzleText(text: string): Puzzle[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const data = JSON.parse(trimmed) as unknown;
      if (!Array.isArray(data)) return [];
      const out: Puzzle[] = [];
      for (const row of data) {
        if (Array.isArray(row) && row.length >= 5) {
          const p = puzzleFromCols([String(row[0]), String(row[1]), String(row[4]), String(row[2]), "", "", "", String(row[3])]);
          if (p) out.push(p);
        } else if (row && typeof row === "object") {
          const rec = row as Record<string, unknown>;
          const line = Array.isArray(rec.line) ? rec.line.join(" ") : String(rec.moves ?? rec.line ?? "");
          const themes = Array.isArray(rec.themes) ? rec.themes.join(" ") : String(rec.themes ?? "");
          const p = puzzleFromCols([
            String(rec.id ?? `imp-${out.length}`),
            String(rec.fen ?? ""),
            line,
            String(rec.rating ?? 1200),
            "",
            "",
            "",
            themes,
          ]);
          if (p) out.push(p);
        }
      }
      return out;
    } catch {
      return [];
    }
  }
  const out: Puzzle[] = [];
  const lines = trimmed.split(/\n/);
  const header = (lines[0] ?? "").toLowerCase();
  const start = header.includes("fen") && header.includes("puzzle") ? 1 : header.includes("fen") ? 1 : 0;
  for (const raw of lines.slice(start)) {
    if (!raw.trim()) continue;
    const cols = raw.split(",");
    const p = puzzleFromCols(cols);
    if (p) out.push(p);
  }
  return out;
}

const PER_BUCKET = 80;

function samplePuzzles(puzzles: Puzzle[], cap = 12000): Puzzle[] {
  if (puzzles.length <= cap) return puzzles;
  const buckets = new Map<number, Puzzle[]>();
  const seen = new Map<number, number>();
  for (const puzzle of puzzles) {
    const bucket = Math.round(puzzle.rating / 50) * 50;
    const n = (seen.get(bucket) ?? 0) + 1;
    seen.set(bucket, n);
    const arr = buckets.get(bucket) ?? [];
    if (!buckets.has(bucket)) buckets.set(bucket, arr);
    if (arr.length < PER_BUCKET) arr.push(puzzle);
    else {
      const j = Math.floor(Math.random() * n);
      if (j < PER_BUCKET) arr[j] = puzzle;
    }
  }
  return [...buckets.values()].flat().slice(0, cap);
}

export async function mergeImports(openings: Opening[], puzzles: Puzzle[]) {
  const extras = await readExtras();
  const nextOpen = dedupeOpenings([...extras.openings, ...openings]).slice(-8000);
  const nextPuz = samplePuzzles([...extras.puzzles, ...puzzles]);
  await writeExtras(nextOpen, nextPuz);
  const base = await loadBundle();
  current = assemble(base, nextOpen, nextPuz);
  notify();
  return { openings: nextOpen.length, puzzles: nextPuz.length };
}

export async function clearExtras() {
  await writeExtras([], []);
  const base = await loadBundle();
  current = assemble(base, [], []);
  notify();
}

function dedupeOpenings(list: Opening[]): Opening[] {
  const seen = new Set<string>();
  const out: Opening[] = [];
  for (const op of list) {
    const key = `${op.eco}|${op.name}|${op.moves}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(op);
  }
  return out;
}

export async function importPuzzleStream(
  stream: ReadableStream<Uint8Array>,
  onScan: (n: number) => void,
): Promise<Puzzle[]> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let header = true;
  let scanned = 0;
  const buckets = new Map<number, Puzzle[]>();
  const seen = new Map<number, number>();
  const take = (line: string) => {
    if (!line.trim()) return;
    if (header) {
      header = false;
      if (line.toLowerCase().includes("fen")) return;
    }
    scanned++;
    if (scanned % 2000 === 0) onScan(scanned);
    const cols = line.split(",");
    if (cols.length < 4 || cols.length > 40) return;
    const puzzle = puzzleFromCols(cols);
    if (!puzzle || puzzle.rating < 400 || puzzle.rating > 3000) return;
    const bucket = Math.round(puzzle.rating / 50) * 50;
    const n = (seen.get(bucket) ?? 0) + 1;
    seen.set(bucket, n);
    const arr = buckets.get(bucket) ?? [];
    if (!buckets.has(bucket)) buckets.set(bucket, arr);
    if (arr.length < PER_BUCKET) arr.push(puzzle);
    else if (Math.floor(Math.random() * n) < PER_BUCKET) arr[Math.floor(Math.random() * arr.length)] = puzzle;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl = buf.indexOf("\n");
    while (nl >= 0) {
      take(buf.slice(0, nl).replace(/\r$/, ""));
      buf = buf.slice(nl + 1);
      nl = buf.indexOf("\n");
    }
    if (scanned > 600_000) break;
  }
  if (buf.trim()) take(buf.trim());
  onScan(scanned);
  return [...buckets.values()].flat();
}

export function uciLine(startFen: string, sans: string[]): string[] {
  return ucisFromSans(startFen, sans);
}

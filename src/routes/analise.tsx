import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Chess } from "chessops/chess";
import { SquareSet } from "chessops/squareSet";
import { parseSquare } from "chessops/util";
import type { Color, Role } from "chessops/types";
import { Shell, Panel } from "@/components/chess/shell";
import { Board } from "@/components/chess/board";
import { Choice } from "@/components/chess/choice";
import { EvalBar } from "@/components/chess/eval-bar";
import { LiveGame } from "@/components/chess/live-game";
import { cpOf, Engine, type GoResult } from "@/lib/chess/engine";
import {
  BOTS,
  checkedKing,
  destsOf,
  fenOf,
  lastSquares,
  legalMove,
  loadFen,
  MARK_CLASS,
  parseMainline,
  positionAt,
  sanAndUci,
  START_FEN,
  ucisFromSans,
  type Mark,
} from "@/lib/chess/logic";
import { corpus } from "@/lib/chess/corpus";
import { reviewLine } from "@/lib/chess/review";
import { useVault } from "@/lib/chess/store";

export const Route = createFileRoute("/analise")({ component: Analise });

const TOOLS: { color: Color; role: Role; label: string }[] = [
  { color: "white", role: "king", label: "R" },
  { color: "white", role: "queen", label: "D" },
  { color: "white", role: "rook", label: "T" },
  { color: "white", role: "bishop", label: "B" },
  { color: "white", role: "knight", label: "C" },
  { color: "white", role: "pawn", label: "P" },
  { color: "black", role: "king", label: "r" },
  { color: "black", role: "queen", label: "d" },
  { color: "black", role: "rook", label: "t" },
  { color: "black", role: "bishop", label: "b" },
  { color: "black", role: "knight", label: "c" },
  { color: "black", role: "pawn", label: "p" },
];

function editSquare(fen: string, square: string, tool: { color: Color; role: Role } | "erase"): string | null {
  const pos = loadFen(fen);
  if (!pos) return null;
  const sq = parseSquare(square);
  if (sq == null) return null;
  const board = pos.board.clone();
  if (tool === "erase") board.take(sq);
  else board.set(sq, { color: tool.color, role: tool.role });
  const setup = {
    board,
    pockets: undefined,
    turn: pos.turn,
    castlingRights: SquareSet.empty(),
    epSquare: undefined,
    remainingChecks: undefined,
    halfmoves: 0,
    fullmoves: pos.fullmoves,
  };
  const next = Chess.fromSetup(setup);
  return next.isErr ? null : fenOf(next.unwrap());
}

function Analise() {
  const rating = useVault((s) => s.rating);
  const [fen, setFen] = useState(START_FEN);
  const [draft, setDraft] = useState(START_FEN);
  const [pgn, setPgn] = useState("");
  const [ucis, setUcis] = useState<string[]>([]);
  const [sans, setSans] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const [tool, setTool] = useState<{ color: Color; role: Role } | "erase" | null>(null);
  const [engineOn, setEngineOn] = useState(false);
  const [lines, setLines] = useState<GoResult | null>(null);
  const [whiteCp, setWhiteCp] = useState(0);
  const [names, setNames] = useState<{ eco: string; name: string }[]>([]);
  const [marks, setMarks] = useState<Mark[] | null>(null);
  const [progress, setProgress] = useState("");
  const [train, setTrain] = useState(false);
  const [trainBot, setTrainBot] = useState<(typeof BOTS)[number]["id"]>("clube");
  const [trainColor, setTrainColor] = useState<Color>("white");
  const [note, setNote] = useState("");

  const pos = positionAt(fen, ucis, cursor);
  const view = pos ? fenOf(pos) : fen;

  useEffect(() => {
    if (!pos) return;
    let cancel = false;
    const side = view.split(" ")[1] === "b" ? "black" : "white";
    const engine = Engine.shared();
    void engine
      .go(view, { movetime: engineOn ? 350 : 160, multipv: engineOn ? 3 : 1, skill: 20, elo: null })
      .then((res) => {
        if (cancel) return;
        if (engineOn) setLines(res);
        const cp = cpOf(res);
        setWhiteCp(side === "white" ? cp : -cp);
      })
      .catch(() => {
        if (!cancel) setNote("Motor indisponível.");
      });
    return () => {
      cancel = true;
    };
  }, [engineOn, view]);

  useEffect(() => {
    void corpus().then((c) => setNames(c.namesAt(view)));
  }, [view]);

  function applyFen(next: string) {
    setFen(next);
    setDraft(next);
    setUcis([]);
    setSans([]);
    setCursor(0);
    setMarks(null);
    setTrain(false);
    setNote("");
  }

  function ingest(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (loadFen(trimmed)) {
      applyFen(trimmed);
      setPgn(trimmed);
      return;
    }
    const parsed = parseMainline(trimmed);
    if (!parsed || parsed.sans.length === 0) {
      setNote("Não reconheci um PGN nem um FEN.");
      return;
    }
    const nextUcis = ucisFromSans(parsed.startFen, parsed.sans);
    setFen(parsed.startFen);
    setDraft(parsed.startFen);
    setPgn(trimmed);
    setSans(parsed.sans);
    setUcis(nextUcis);
    setCursor(nextUcis.length);
    setMarks(null);
    setTrain(false);
    setNote(nextUcis.length ? "Partida no tabuleiro. Recue um lance de cada vez." : "PGN sem lances jogáveis.");
  }

  function loadPgn() {
    ingest(pgn);
  }

  function applyDraft() {
    ingest(draft);
  }

  if (train && pos) {
    const bot = BOTS.find((b) => b.id === trainBot) ?? BOTS[2];
    const youWhite = trainColor === "white";
    return (
      <Shell>
        <button type="button" className="btn mb-4" onClick={() => setTrain(false)}>
          Voltar à análise
        </button>
        <LiveGame
          key={`${trainBot}-${trainColor}-${fenOf(pos)}`}
          config={{
            startFen: fenOf(pos),
            human: trainColor,
            bot: { name: bot.name, skill: bot.skill, elo: bot.elo },
            clock: null,
            tcLabel: `Treino · ${bot.name}`,
            whiteName: youWhite ? "Você" : bot.name,
            blackName: youWhite ? bot.name : "Você",
          }}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,42rem)_20rem]">
        <div>
          {pos && (
            <div className="flex items-stretch gap-1.5">
              <EvalBar whiteCp={whiteCp} orientation="white" />
              <div className="min-w-0 flex-1">
                <Board
                  fen={fenOf(pos)}
                  dests={tool ? {} : destsOf(pos)}
                  lastMove={lastSquares(ucis[cursor - 1])}
                  checkSquare={checkedKing(pos)}
                  interactive
                  sideToMove={pos.turn}
                  editRole={tool}
                  onEdit={(square) => {
                    if (!tool) return;
                    const next = editSquare(view, square, tool);
                    setNote(next ? "" : "Essa casa deixaria a posição ilegal.");
                    if (!next) return;
                    setFen(next);
                    setDraft(next);
                    setUcis([]);
                    setSans([]);
                    setCursor(0);
                    setMarks(null);
                  }}
                  onMove={(from, to, promotion) => {
                    const move = legalMove(pos, from, to, promotion);
                    if (!move) return;
                    const packed = sanAndUci(pos, move);
                    const nextUcis = [...ucis.slice(0, cursor), packed.uci];
                    const nextSans = [...sans.slice(0, cursor), packed.san];
                    setUcis(nextUcis);
                    setSans(nextSans);
                    setCursor(nextUcis.length);
                    setMarks(null);
                  }}
                />
              </div>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => setCursor((c) => Math.max(0, c - 1))}>
              Lance anterior
            </button>
            <button type="button" className="btn" onClick={() => setCursor((c) => Math.min(ucis.length, c + 1))}>
              Lance seguinte
            </button>
            <button type="button" className="btn" onClick={() => setEngineOn((v) => !v)}>
              {engineOn ? "Desligar motor" : "Ligar motor"}
            </button>
          </div>
          <div className="mt-3 space-y-3">
            <Choice
              label="Treinar contra"
              value={trainBot}
              onChange={setTrainBot}
              options={BOTS.map((b) => ({ value: b.id, label: b.elo ? `${b.name} ${b.elo}` : `${b.name} total` }))}
            />
            <Choice
              label="A sua cor"
              value={trainColor}
              onChange={setTrainColor}
              options={[
                { value: "white", label: "Brancas" },
                { value: "black", label: "Pretas" },
              ]}
            />
            <button type="button" className="btn btn-primary" onClick={() => setTrain(true)}>
              Treinar desta posição
            </button>
          </div>
        </div>
        <div className="space-y-4">
          <Panel>
            <h1 className="font-display text-2xl">Análise</h1>
            <textarea
              className="field mt-3 min-h-28"
              placeholder="Cole um PGN ou um FEN"
              value={pgn}
              onChange={(e) => setPgn(e.target.value)}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (!text.trim()) return;
                e.preventDefault();
                ingest(text);
              }}
            />
            <button type="button" className="btn mt-2" onClick={loadPgn}>
              Abrir PGN
            </button>
            <input
              className="field mt-3"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (!text.trim()) return;
                e.preventDefault();
                ingest(text);
              }}
              aria-label="FEN"
            />
            <button type="button" className="btn mt-2" onClick={applyDraft}>
              Posição FEN
            </button>
            {note && <p className="mt-2 text-sm text-blood">{note}</p>}
            {names.length > 0 && (
              <p className="mt-3 text-sm text-brass">{names.map((n) => `${n.eco} ${n.name}`).join(" · ")}</p>
            )}
          </Panel>
          <Panel>
            <p className="text-sm text-muted">Montar tabuleiro</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {TOOLS.map((t) => (
                <button
                  key={t.label + t.color}
                  type="button"
                  className={`btn min-h-10 px-2 ${tool !== "erase" && tool?.role === t.role && tool.color === t.color ? "btn-primary" : ""}`}
                  onClick={() => setTool(t)}
                >
                  {t.label}
                </button>
              ))}
              <button type="button" className={`btn min-h-10 ${tool === "erase" ? "btn-primary" : ""}`} onClick={() => setTool("erase")}>
                Apagar
              </button>
              <button
                type="button"
                className="btn min-h-10"
                onClick={() => {
                  const parts = view.split(" ");
                  parts[1] = parts[1] === "w" ? "b" : "w";
                  const candidate = parts.join(" ");
                  if (!loadFen(candidate)) {
                    setNote("Não dá para passar a vez: o rei ficaria em xeque.");
                    return;
                  }
                  setFen(candidate);
                  setDraft(candidate);
                  setUcis([]);
                  setSans([]);
                  setCursor(0);
                }}
              >
                Trocar vez
              </button>
            </div>
          </Panel>
          {engineOn && lines && (
            <Panel>
              <p className="text-sm text-muted">Avaliação</p>
              <p className="font-display text-2xl">{lines.mate != null ? `mate ${lines.mate}` : `${((lines.cp ?? 0) / 100).toFixed(2)}`}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {lines.pvs.map((pv) => (
                  <li key={pv.multipv}>
                    {pv.multipv}. {pv.mate != null ? `#${pv.mate}` : (cpOf(pv) / 100).toFixed(2)} {pv.pv.slice(0, 8).join(" ")}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {sans.length > 0 && (
            <Panel>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setProgress("A classificar…");
                  void reviewLine(fen, ucis, (done, total) => setProgress(`${done}/${total}`), rating).then((m) => {
                    setMarks(m);
                    setProgress("");
                  });
                }}
              >
                Classificar partida
              </button>
              {progress && <p className="mt-2 text-sm text-muted">{progress}</p>}
              <ol className="mt-3 max-h-64 space-y-1 overflow-auto text-sm">
                {sans.map((san, i) => (
                  <li key={i}>
                    <button type="button" className={cursor === i + 1 ? "text-brass" : ""} onClick={() => setCursor(i + 1)}>
                      {i % 2 === 0 ? `${i / 2 + 1}. ` : ""}
                      {san}
                    </button>{" "}
                    {marks?.[i] && <span className={MARK_CLASS[marks[i]]}>{marks[i]}</span>}
                  </li>
                ))}
              </ol>
            </Panel>
          )}
        </div>
      </div>
    </Shell>
  );
}

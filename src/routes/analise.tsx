import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chessops/chess";
import { SquareSet } from "chessops/squareSet";
import { parseSquare } from "chessops/util";
import type { Color, Role, Square } from "chessops/types";
import { Shell, Panel } from "@/components/chess/shell";
import { Board } from "@/components/chess/board";
import { EvalBar } from "@/components/chess/eval-bar";
import { LiveGame } from "@/components/chess/live-game";
import { EndgameLab } from "@/components/chess/endgame-lab";
import { Repertoire } from "@/components/chess/repertoire";
import { StrengthField } from "@/components/chess/strength-field";
import { TabStrip } from "@/components/chess/tab-strip";
import { cpOf, Engine, type GoResult } from "@/lib/chess/engine";
import { useLab } from "@/lib/chess/lab";
import {
  checkedKing,
  destsOf,
  fenOf,
  lastSquares,
  legalMove,
  loadFen,
  MARK_CLASS,
  needsPromotion,
  pairedSans,
  parseMainline,
  positionAt,
  sanAndUci,
  START_FEN,
  toPgn,
  ucisFromSans,
  type Mark,
} from "@/lib/chess/logic";
import { corpus } from "@/lib/chess/corpus";
import { reviewLine } from "@/lib/chess/review";
import { eloToEngine, strengthName } from "@/lib/chess/strength";
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
  if (tool !== "erase" && tool.role === "king") {
    const remove: Square[] = [];
    for (const [at, piece] of board) {
      if (piece.role === "king" && piece.color === tool.color && at !== sq) remove.push(at);
    }
    for (const at of remove) board.take(at);
  }
  if (tool === "erase") {
    if (board.get(sq)?.role === "king") return null;
    board.take(sq);
  } else board.set(sq, { color: tool.color, role: tool.role });
  const place = (turn: Color) => {
    const next = Chess.fromSetup({
      board,
      pockets: undefined,
      turn,
      castlingRights: SquareSet.empty(),
      epSquare: undefined,
      remainingChecks: undefined,
      halfmoves: 0,
      fullmoves: pos.fullmoves,
    });
    return next.isErr ? null : fenOf(next.unwrap());
  };
  return place(pos.turn) ?? place(pos.turn === "white" ? "black" : "white");
}

function Analise() {
  const rating = useVault((s) => s.rating);
  const tabs = useLab((s) => s.tabs);
  const activeId = useLab((s) => s.activeId);
  const note = useLab((s) => s.note);
  const patch = useLab((s) => s.patch);
  const setNote = useLab((s) => s.setNote);
  const tab = tabs.find((item) => item.id === activeId) ?? tabs[0]!;
  const [tool, setTool] = useState<{ color: Color; role: Role } | "erase" | null>(null);
  const [engineOn, setEngineOn] = useState(false);
  const [lines, setLines] = useState<GoResult | null>(null);
  const [whiteCp, setWhiteCp] = useState(0);
  const [names, setNames] = useState<{ eco: string; name: string }[]>([]);
  const [progress, setProgress] = useState("");
  const [section, setSection] = useState<"estudo" | "aberturas" | "finais">("estudo");
  const [train, setTrain] = useState(false);
  const [local, setLocal] = useState(false);
  const [elo, setElo] = useState(1200);
  const [trainColor, setTrainColor] = useState<Color>("white");
  const [playOpen, setPlayOpen] = useState(false);
  const [hintOn, setHintOn] = useState(false);
  const [hintArrow, setHintArrow] = useState<[string, string] | null>(null);
  const [round, setRound] = useState(0);
  const [copied, setCopied] = useState(false);
  const cache = useRef(new Map<string, GoResult>());

  const pos = useMemo(() => positionAt(tab.fen, tab.ucis, tab.cursor), [tab.fen, tab.ucis, tab.cursor]);
  const view = pos ? fenOf(pos) : tab.fen;

  useEffect(() => {
    if (!view || (!engineOn && !hintOn)) {
      setHintArrow(null);
      return;
    }
    const key = `${view}:${engineOn ? "full" : "hint"}`;
    const apply = (res: GoResult) => {
      if (engineOn) setLines(res);
      const side = view.split(" ")[1] === "b" ? "black" : "white";
      const cp = cpOf(res);
      const white = side === "white" ? cp : -cp;
      setWhiteCp((prev) => (prev === white ? prev : white));
      if (!hintOn) return;
      if (res.uci.length >= 4) {
        const from = res.uci.slice(0, 2);
        const to = res.uci.slice(2, 4);
        setHintArrow((prev) => (prev && prev[0] === from && prev[1] === to ? prev : [from, to]));
      } else {
        setHintArrow(null);
      }
    };
    const cached = cache.current.get(key);
    if (cached) {
      apply(cached);
      return;
    }
    let cancel = false;
    const timer = window.setTimeout(() => {
      void Engine.shared()
        .go(view, { movetime: engineOn ? 220 : 70, multipv: engineOn ? 3 : 1, skill: 20, elo: null })
        .then((res) => {
          if (cancel) return;
          cache.current.set(key, res);
          apply(res);
        })
        .catch(() => {
          if (!cancel && engineOn) setNote("Motor indisponível.");
        });
    }, 140);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [engineOn, hintOn, view, setNote]);

  useEffect(() => {
    void corpus().then((c) => setNames(c.namesAt(view)));
  }, [view]);

  function applyFen(next: string) {
    patch(tab.id, { fen: next, draft: next, ucis: [], sans: [], cursor: 0, marks: null, pgn: next });
    setTrain(false);
    setNote("");
  }

  function ingest(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (loadFen(trimmed)) {
      applyFen(trimmed);
      return;
    }
    const parsed = parseMainline(trimmed);
    if (!parsed || parsed.sans.length === 0) {
      setNote("Não reconheci um PGN nem um FEN.");
      return;
    }
    const nextUcis = ucisFromSans(parsed.startFen, parsed.sans);
    patch(tab.id, {
      fen: parsed.startFen,
      draft: parsed.startFen,
      pgn: trimmed,
      sans: parsed.sans,
      ucis: nextUcis,
      cursor: nextUcis.length,
      marks: null,
    });
    setTrain(false);
    setNote(nextUcis.length ? "Partida no tabuleiro. Recue um lance de cada vez." : "PGN sem lances jogáveis.");
  }

  if (train && pos) {
    const tuned = eloToEngine(elo);
    const youWhite = trainColor === "white";
    const botName = strengthName(tuned.nominal);
    return (
      <Shell>
        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => setTrain(false)}>
            Voltar à análise
          </button>
        </div>
        <LiveGame
          key={`${elo}-${trainColor}-${round}-${tab.cursor}-${tab.fen}-${local}`}
          config={{
            startFen: tab.fen,
            prelude: { sans: tab.sans.slice(0, tab.cursor), ucis: tab.ucis.slice(0, tab.cursor) },
            human: local ? "both" : trainColor,
            bot: local ? null : { name: botName, skill: tuned.skill, elo: tuned.elo, nominal: tuned.nominal },
            clock: null,
            tcLabel: local ? "Análise a duas" : `Treino · ${botName}`,
            kind: "analysis",
            whiteName: local ? "Brancas" : youWhite ? "Você" : botName,
            blackName: local ? "Pretas" : youWhite ? botName : "Você",
            showHint: hintOn,
            onPlayAgain: () => setRound((n) => n + 1),
          }}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <TabStrip />
      {note && <p className="mt-3 text-sm text-blood">{note}</p>}
      <div className="seg mt-4">
        {(
          [
            ["estudo", "Estudo"],
            ["aberturas", "Aberturas"],
            ["finais", "Finais"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={section === id} onClick={() => setSection(id)}>
            {label}
          </button>
        ))}
      </div>
      {section === "aberturas" && <div className="mt-4"><Repertoire /></div>}
      {section === "finais" && <div className="mt-4"><EndgameLab /></div>}
      {section === "estudo" && (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,42rem)_20rem]">
          <div>
            {pos && (
              <div className="flex items-stretch gap-1.5">
                <EvalBar whiteCp={whiteCp} orientation="white" />
                <div className="min-w-0 flex-1">
                  <Board
                    fen={fenOf(pos)}
                    dests={tool ? {} : destsOf(pos)}
                    lastMove={lastSquares(tab.ucis[tab.cursor - 1])}
                    checkSquare={checkedKing(pos)}
                    interactive
                    sideToMove={pos.turn}
                    editRole={tool}
                    hintArrow={hintOn ? hintArrow : null}
                    isPromotion={(from, to) => needsPromotion(pos, from, to)}
                    onEdit={(square) => {
                      if (!tool) return;
                      const next = editSquare(view, square, tool);
                      setNote(next ? "" : "Não deu. O rei muda de casa se o seleccionar e clicar no destino.");
                      if (!next) return;
                      patch(tab.id, { fen: next, draft: next, ucis: [], sans: [], cursor: 0, marks: null });
                    }}
                    onMove={(from, to, promotion) => {
                      const move = legalMove(pos, from, to, promotion);
                      if (!move) return;
                      const packed = sanAndUci(pos, move);
                      patch(tab.id, {
                        ucis: [...tab.ucis.slice(0, tab.cursor), packed.uci],
                        sans: [...tab.sans.slice(0, tab.cursor), packed.san],
                        cursor: tab.cursor + 1,
                        marks: tab.marks ? tab.marks.slice(0, tab.cursor) : null,
                      });
                    }}
                  />
                </div>
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button type="button" className="btn" onClick={() => patch(tab.id, { cursor: 0 })} disabled={tab.cursor === 0}>
                Início
              </button>
              <button type="button" className="btn" onClick={() => patch(tab.id, { cursor: Math.max(0, tab.cursor - 1) })} disabled={tab.cursor === 0}>
                Anterior
              </button>
              <button type="button" className="btn" onClick={() => patch(tab.id, { cursor: Math.min(tab.ucis.length, tab.cursor + 1) })} disabled={tab.cursor >= tab.ucis.length}>
                Seguinte
              </button>
              <button type="button" className="btn" onClick={() => patch(tab.id, { cursor: tab.ucis.length })} disabled={tab.cursor >= tab.ucis.length}>
                Fim
              </button>
            </div>
            <button type="button" className={hintOn ? "btn btn-primary mt-3" : "btn mt-3"} aria-pressed={hintOn} onClick={() => setHintOn((v) => !v)}>
              {hintOn ? "Sugestão ligada" : "Sugestão do Stockfish"}
            </button>
            <button type="button" className={engineOn ? "btn btn-primary mt-3 ml-2" : "btn mt-3 ml-2"} onClick={() => setEngineOn((v) => !v)}>
              {engineOn ? "Motor ligado" : "Ligar motor"}
            </button>
          </div>
          <div className="space-y-4">
            <Panel>
              <div className="flex items-center justify-between gap-2">
                <h1 className="font-display text-2xl">Análise</h1>
                <button type="button" className={playOpen ? "btn btn-primary" : "btn"} onClick={() => setPlayOpen((v) => !v)}>
                  {playOpen ? "Fechar" : "Jogar daqui"}
                </button>
              </div>
              {playOpen && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" className={!local ? "btn btn-primary" : "btn"} onClick={() => setLocal(false)}>
                      Motor
                    </button>
                    <button type="button" className={local ? "btn btn-primary" : "btn"} onClick={() => setLocal(true)}>
                      Duas pessoas
                    </button>
                  </div>
                  {!local && <StrengthField elo={elo} onChange={setElo} />}
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" className={trainColor === "white" ? "btn btn-primary" : "btn"} onClick={() => setTrainColor("white")}>
                      Brancas
                    </button>
                    <button type="button" className={trainColor === "black" ? "btn btn-primary" : "btn"} onClick={() => setTrainColor("black")}>
                      Pretas
                    </button>
                  </div>
                  <button type="button" className="btn btn-primary" onClick={() => setTrain(true)}>
                    Treinar desta posição
                  </button>
                </div>
              )}
              <textarea
                className="field mt-3 min-h-28"
                placeholder="Cole um PGN ou um FEN"
                value={tab.pgn}
                onChange={(e) => patch(tab.id, { pgn: e.target.value })}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  if (!text.trim()) return;
                  e.preventDefault();
                  ingest(text);
                }}
              />
              <button type="button" className="btn mt-2" onClick={() => ingest(tab.pgn)}>
                Abrir PGN
              </button>
              <input
                className="field mt-3"
                value={tab.draft}
                onChange={(e) => patch(tab.id, { draft: e.target.value })}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  if (!text.trim()) return;
                  e.preventDefault();
                  ingest(text);
                }}
                aria-label="FEN"
              />
              <button type="button" className="btn mt-2" onClick={() => ingest(tab.draft)}>
                Posição FEN
              </button>
              <button
                type="button"
                className="btn mt-2"
                onClick={() => {
                  const text = toPgn({
                    startFen: tab.fen,
                    sans: tab.sans,
                    white: "Brancas",
                    black: "Pretas",
                    result: "*",
                    event: "Análise",
                  });
                  void navigator.clipboard.writeText(text).then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  });
                }}
              >
                {copied ? "PGN copiado" : "Copiar PGN"}
              </button>
              {names.length > 0 && <p className="mt-3 text-sm text-brass">{names.map((n) => `${n.eco} ${n.name}`).join(" · ")}</p>}
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
                    patch(tab.id, { fen: candidate, draft: candidate, ucis: [], sans: [], cursor: 0, marks: null });
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
                <ul className="stable mt-2 h-28 space-y-1 overflow-auto text-sm">
                  {lines.pvs.map((pv) => (
                    <li key={pv.multipv}>
                      {pv.multipv}. {pv.mate != null ? `#${pv.mate}` : (cpOf(pv) / 100).toFixed(2)} {pv.pv.slice(0, 8).join(" ")}
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
            {tab.sans.length > 0 && (
              <Panel>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setProgress("A classificar…");
                    void reviewLine(tab.fen, tab.ucis, (done, total) => setProgress(`${done}/${total}`), rating, tab.marks ?? undefined).then((m: Mark[]) => {
                      patch(tab.id, { marks: m });
                      setProgress("");
                    });
                  }}
                >
                  Classificar partida
                </button>
                {progress && <p className="mt-2 text-sm text-muted">{progress}</p>}
                <ol className="mt-3 max-h-64 space-y-1 overflow-auto text-sm">
                  {pairedSans(tab.fen, tab.sans).map((row) => (
                    <li key={row.white?.ply ?? row.black?.ply} className="grid grid-cols-[2.5rem_1fr_1fr] gap-1">
                      <span className="text-muted">{row.no}.</span>
                      {row.white ? (
                        <button type="button" className={tab.cursor === row.white.ply ? "text-brass" : ""} onClick={() => patch(tab.id, { cursor: row.white!.ply })}>
                          {row.white.san} {tab.marks?.[row.white.ply - 1] && <span className={MARK_CLASS[tab.marks[row.white.ply - 1]!]}>{tab.marks[row.white.ply - 1]}</span>}
                        </button>
                      ) : (
                        <span className="text-muted">…</span>
                      )}
                      {row.black ? (
                        <button type="button" className={tab.cursor === row.black.ply ? "text-brass" : ""} onClick={() => patch(tab.id, { cursor: row.black!.ply })}>
                          {row.black.san} {tab.marks?.[row.black.ply - 1] && <span className={MARK_CLASS[tab.marks[row.black.ply - 1]!]}>{tab.marks[row.black.ply - 1]}</span>}
                        </button>
                      ) : (
                        <span />
                      )}
                    </li>
                  ))}
                </ol>
              </Panel>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}

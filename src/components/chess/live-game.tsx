import { useEffect, useMemo, useRef, useState } from "react";
import type { Color, Role } from "chessops/types";
import { Board } from "@/components/chess/board";
import { EvalBar } from "@/components/chess/eval-bar";
import { Panel } from "@/components/chess/shell";
import { formatWatch, useStopwatch } from "@/components/chess/stopwatch";
import { cpOf, Engine, thinkTime } from "@/lib/chess/engine";
import { corpus } from "@/lib/chess/corpus";
import {
  checkedKing,
  destsOf,
  endingOf,
  fenKey,
  fenOf,
  flagEnding,
  formatClock,
  lastSquares,
  legalMove,
  loadFen,
  needsPromotion,
  opposite,
  positionAt,
  sanAndUci,
  START_FEN,
  toPgn,
  type Ending,
} from "@/lib/chess/logic";
import { knock } from "@/lib/chess/sound";
import { useVault, type ArchivedGame } from "@/lib/chess/store";

type Clock = {
  white: number;
  black: number;
  inc: number;
  running: boolean;
  stamp: number;
  turn: Color;
};

export type LiveConfig = {
  startFen?: string;
  variant960?: boolean;
  human: "white" | "black" | "both";
  bot: { name: string; skill: number; elo: number | null } | null;
  useBook?: boolean;
  opening?: string;
  clock: { initial: number; inc: number } | null;
  tcLabel: string;
  whiteName: string;
  blackName: string;
  onUserMove?: (uci: string, ply: number) => void;
  inbound?: { nonce: number; uci: string; ply: number } | null;
  externalEnd?: { nonce: number; ending: Ending } | null;
  onResignRemote?: () => void;
  onDrawOffer?: () => void;
};

function fresh(config: LiveConfig) {
  const startFen = config.startFen || START_FEN;
  const pos = loadFen(startFen);
  const turn = pos?.turn ?? "white";
  return {
    startFen,
    ucis: [] as string[],
    sans: [] as string[],
    keys: [fenKey(startFen)],
    cursor: 0,
    redo: [] as string[],
    ending: null as Ending | null,
    clock: config.clock
      ? {
          white: config.clock.initial,
          black: config.clock.initial,
          inc: config.clock.inc,
          running: true,
          stamp: performance.now(),
          turn,
        }
      : (null as Clock | null),
    thinking: false,
    epoch: 0,
    note: "",
  };
}

function remain(clock: Clock, color: Color, now: number, frozen: boolean) {
  if (!clock.running || frozen || clock.turn !== color) return clock[color];
  return Math.max(0, clock[color] - (now - clock.stamp));
}

export function LiveGame({ config }: { config: LiveConfig }) {
  const [state, setState] = useState(() => fresh(config));
  const [orientation, setOrientation] = useState<Color>(config.human === "black" ? "black" : "white");
  const [now, setNow] = useState(() => performance.now());
  const [whiteCp, setWhiteCp] = useState(0);
  const [copied, setCopied] = useState(false);
  const archived = useRef(false);
  const sound = useVault((s) => s.sound);
  const archive = useVault((s) => s.archive);
  const remote = Boolean(config.onUserMove);

  const pos = useMemo(
    () => positionAt(state.startFen, state.ucis, state.cursor),
    [state.startFen, state.ucis, state.cursor],
  );
  const atEnd = state.cursor === state.ucis.length;
  const turn = pos?.turn ?? "white";
  const userTurn =
    !state.ending &&
    atEnd &&
    !state.thinking &&
    (config.human === "both" || config.human === turn);
  const dests = pos && userTurn ? destsOf(pos) : {};
  const viewFen = pos ? fenOf(pos) : "";
  const watch = useStopwatch(!config.clock && !state.ending);
  const botToMove = Boolean(config.bot) && config.human !== "both" && atEnd && !state.ending && config.human !== turn;

  useEffect(() => {
    if (!viewFen || state.thinking || botToMove) return;
    let cancel = false;
    const side = viewFen.split(" ")[1] === "b" ? "black" : "white";
    void Engine.shared()
      .go(viewFen, { movetime: 180, multipv: 1, skill: 20, elo: null })
      .then((res) => {
        if (cancel) return;
        const cp = cpOf(res);
        setWhiteCp(side === "white" ? cp : -cp);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [viewFen, state.thinking, botToMove]);

  useEffect(() => {
    if (!state.clock || state.ending) return;
    const id = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(id);
  }, [state.clock, state.ending]);

  useEffect(() => {
    if (!state.clock || state.ending || !pos) return;
    const left = remain(state.clock, state.clock.turn, now, false);
    if (left > 0) return;
    const ending = flagEnding(pos, state.clock.turn);
    setState((s) => (s.ending ? s : { ...s, ending, clock: s.clock ? { ...s.clock, running: false } : s.clock }));
  }, [now, state.clock, state.ending, pos]);

  function pushMove(uci: string, san: string, mover: Color) {
    knock(sound);
    setState((s) => {
      if (s.ending) return s;
      const ucis = [...s.ucis, uci];
      const next = positionAt(s.startFen, ucis, ucis.length);
      const keys = [...s.keys, next ? fenKey(fenOf(next)) : s.keys.at(-1)!];
      let ending = next ? endingOf(next, keys) : null;
      let clock = s.clock;
      if (clock) {
        const spent = clock.running ? performance.now() - clock.stamp : 0;
        const left = Math.max(0, clock[mover] - spent);
        if (left <= 0 && next) ending = flagEnding(next, mover);
        clock = {
          ...clock,
          [mover]: left <= 0 ? 0 : left + clock.inc,
          turn: opposite(mover),
          stamp: performance.now(),
          running: !ending,
        };
      }
      return {
        ...s,
        ucis,
        sans: [...s.sans, san],
        keys,
        cursor: ucis.length,
        redo: [],
        ending,
        clock,
        thinking: false,
        note: "",
      };
    });
  }

  function tryMove(from: string, to: string, promotion?: Role) {
    if (!pos || !userTurn) return;
    const move = legalMove(pos, from, to, promotion);
    if (!move) return;
    const { san, uci } = sanAndUci(pos, move);
    const mover = pos.turn;
    pushMove(uci, san, mover);
    config.onUserMove?.(uci, state.ucis.length);
  }

  useEffect(() => {
    const inbound = config.inbound;
    if (!inbound || state.ending) return;
    if (inbound.ply !== state.ucis.length) return;
    const current = positionAt(state.startFen, state.ucis, state.ucis.length);
    if (!current) return;
    const from = inbound.uci.slice(0, 2);
    const to = inbound.uci.slice(2, 4);
    const promo = inbound.uci[4];
    const role = promo === "q" ? "queen" : promo === "r" ? "rook" : promo === "b" ? "bishop" : promo === "n" ? "knight" : undefined;
    const move = legalMove(current, from, to, role);
    if (!move) return;
    const { san, uci } = sanAndUci(current, move);
    pushMove(uci, san, current.turn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.inbound?.nonce]);

  useEffect(() => {
    if (!config.bot || config.human === "both" || state.ending || !atEnd || !pos) return;
    if (config.human === turn) return;
    const epoch = state.epoch;
    let cancel = false;
    setState((s) => ({ ...s, thinking: true }));
    const clockLeft = state.clock ? remain(state.clock, turn, performance.now(), false) : null;
    void (async () => {
      try {
        const book = config.useBook ? await corpus() : null;
        let uci = book?.bookMove(fenOf(pos), config.opening) ?? "";
        if (!uci) {
          const engine = Engine.shared();
          const res = await engine.go(fenOf(pos), {
            skill: config.bot!.skill,
            elo: config.bot!.elo,
            movetime: thinkTime(config.bot!.skill, clockLeft),
            multipv: 1,
          });
          uci = res.uci;
        }
        if (cancel) return;
        setState((s) => {
          if (s.epoch !== epoch || s.ending || s.cursor !== s.ucis.length) return { ...s, thinking: false };
          return s;
        });
        const live = positionAt(state.startFen, state.ucis, state.ucis.length);
        if (!live || cancel) return;
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promo = uci[4];
        const role =
          promo === "q" ? "queen" : promo === "r" ? "rook" : promo === "b" ? "bishop" : promo === "n" ? "knight" : undefined;
        const move = legalMove(live, from, to, role);
        if (!move) {
          setState((s) => ({ ...s, thinking: false, note: "O motor não devolveu um lance legal." }));
          return;
        }
        const packed = sanAndUci(live, move);
        if (!cancel) pushMove(packed.uci, packed.san, live.turn);
      } catch (error) {
        if (!cancel) {
          setState((s) => ({
            ...s,
            thinking: false,
            note: error instanceof Error ? error.message : "Falha do motor.",
          }));
        }
      }
    })();
    return () => {
      cancel = true;
      setState((s) => (s.thinking ? { ...s, thinking: false } : s));
    };
    // The bot should think when the ply at the end changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ucis.length, state.cursor, state.epoch, state.ending, turn]);

  useEffect(() => {
    const end = config.externalEnd;
    if (!end) return;
    setState((s) => (s.ending ? s : { ...s, ending: end.ending, clock: s.clock ? { ...s.clock, running: false } : s.clock }));
  }, [config.externalEnd?.nonce]);

  useEffect(() => {
    if (!state.ending || archived.current) return;
    archived.current = true;
    const game: ArchivedGame = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      white: config.whiteName,
      black: config.blackName,
      result: state.ending.result,
      reason: state.ending.reason,
      pgn: toPgn({
        startFen: state.startFen,
        sans: state.sans,
        white: config.whiteName,
        black: config.blackName,
        result: state.ending.result,
        variant960: config.variant960,
        event: config.tcLabel,
      }),
      startFen: state.startFen,
      sans: state.sans,
      ucis: state.ucis,
      variant960: Boolean(config.variant960),
      tc: config.tcLabel,
    };
    archive(game);
  }, [state.ending, archive, config, state.sans, state.startFen, state.ucis]);

  function undo() {
    if (remote || state.thinking) return;
    setState((s) => {
      if (!s.ucis.length) return s;
      let cut = 1;
      if (config.bot && config.human !== "both" && s.ucis.length >= 2) cut = 2;
      const ucis = s.ucis.slice(0, -cut);
      return {
        ...s,
        redo: [...s.ucis.slice(-cut), ...s.redo],
        ucis,
        sans: s.sans.slice(0, -cut),
        keys: s.keys.slice(0, ucis.length + 1),
        cursor: ucis.length,
        ending: null,
        thinking: false,
        epoch: s.epoch + 1,
        clock: s.clock ? { ...s.clock, running: true, stamp: performance.now() } : s.clock,
      };
    });
  }

  function redo() {
    if (remote || !state.redo.length) return;
    const uci = state.redo[0]!;
    const current = positionAt(state.startFen, state.ucis, state.ucis.length);
    if (!current) return;
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promo = uci[4];
    const role = promo === "q" ? "queen" : promo === "r" ? "rook" : promo === "b" ? "bishop" : promo === "n" ? "knight" : undefined;
    const move = legalMove(current, from, to, role);
    if (!move) return;
    const packed = sanAndUci(current, move);
    setState((s) => ({ ...s, redo: s.redo.slice(1) }));
    pushMove(packed.uci, packed.san, current.turn);
  }

  function resign() {
    if (state.ending || !pos) return;
    const winner = config.human === "both" ? opposite(turn) : config.human === "white" ? "black" : "white";
    setState((s) => ({
      ...s,
      ending: { winner, reason: "Desistência", result: winner === "white" ? "1-0" : "0-1" },
      clock: s.clock ? { ...s.clock, running: false } : s.clock,
    }));
    config.onResignRemote?.();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft") setState((s) => ({ ...s, cursor: Math.max(0, s.cursor - 1) }));
      if (e.key === "ArrowRight") setState((s) => ({ ...s, cursor: Math.min(s.ucis.length, s.cursor + 1) }));
      if (e.key === "f") setOrientation((o) => opposite(o));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const whiteMs = state.clock ? remain(state.clock, "white", now, Boolean(state.ending)) : 0;
  const blackMs = state.clock ? remain(state.clock, "black", now, Boolean(state.ending)) : 0;
  const last = lastSquares(state.ucis[state.cursor - 1]);

  function copyPgn() {
    const text = toPgn({
      startFen: state.startFen,
      sans: state.sans,
      white: config.whiteName,
      black: config.blackName,
      result: state.ending?.result ?? "*",
      event: config.tcLabel,
      variant960: config.variant960,
    });
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,42rem)_18rem]">
      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <ClockPill name={orientation === "white" ? config.blackName : config.whiteName} ms={orientation === "white" ? blackMs : whiteMs} active={Boolean(state.clock) && turn !== orientation && !state.ending} show={Boolean(state.clock)} />
          <button type="button" className="btn" onClick={() => setOrientation((o) => opposite(o))}>
            Girar
          </button>
        </div>
        {pos && (
          <div className="flex items-stretch gap-1.5">
            <EvalBar whiteCp={whiteCp} orientation={orientation} />
            <div className="min-w-0 flex-1">
              <Board
                fen={fenOf(pos)}
                orientation={orientation}
                dests={dests}
                lastMove={last}
                checkSquare={checkedKing(pos)}
                interactive={userTurn}
                sideToMove={turn}
                isPromotion={(from, to) => needsPromotion(pos, from, to)}
                onMove={tryMove}
              />
            </div>
          </div>
        )}
        <div className="mt-3">
          <ClockPill name={orientation === "white" ? config.whiteName : config.blackName} ms={orientation === "white" ? whiteMs : blackMs} active={Boolean(state.clock) && turn === orientation && !state.ending} show={Boolean(state.clock)} />
        </div>
      </div>
      <Panel>
        <p className="font-display text-lg text-brass">{config.tcLabel}</p>
        {!config.clock && <p className="font-display mt-1 text-3xl tabular-nums">{formatWatch(watch.ms)}</p>}
        <p className="mt-1 text-sm text-muted">
          {config.whiteName} contra {config.blackName}
          {state.thinking ? " · a pensar…" : ""}
        </p>
        {state.ending && (
          <p className="mt-3 rounded-xl bg-felt px-3 py-2 text-sm">
            {state.ending.result} · {state.ending.reason}
          </p>
        )}
        {state.ending && (
          <button type="button" className="btn mt-3" onClick={copyPgn}>
            {copied ? "PGN copiado" : "Copiar PGN"}
          </button>
        )}
        {state.note && <p className="mt-2 text-sm text-blood">{state.note}</p>}
        {!atEnd && (
          <button type="button" className="btn mt-3 w-full" onClick={() => setState((s) => ({ ...s, cursor: s.ucis.length }))}>
            Voltar ao vivo
          </button>
        )}
        <ol className="mt-4 max-h-72 space-y-1 overflow-auto text-sm">
          {state.sans.map((san, i) =>
            i % 2 === 0 ? (
              <li key={i} className="grid grid-cols-[2rem_1fr_1fr] gap-1">
                <span className="text-muted">{i / 2 + 1}.</span>
                <button type="button" className={state.cursor === i + 1 ? "text-brass" : ""} onClick={() => setState((s) => ({ ...s, cursor: i + 1 }))}>
                  {san}
                </button>
                {state.sans[i + 1] && (
                  <button type="button" className={state.cursor === i + 2 ? "text-brass" : ""} onClick={() => setState((s) => ({ ...s, cursor: i + 2 }))}>
                    {state.sans[i + 1]}
                  </button>
                )}
              </li>
            ) : null,
          )}
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">
          {!remote && (
            <>
              <button type="button" className="btn" onClick={undo}>
                Desfazer
              </button>
              <button type="button" className="btn" onClick={redo}>
                Refazer
              </button>
            </>
          )}
          {remote && (
            <button type="button" className="btn" onClick={config.onDrawOffer} disabled={Boolean(state.ending)}>
              Propor empate
            </button>
          )}
          <button type="button" className="btn" onClick={resign} disabled={Boolean(state.ending)}>
            Desistir
          </button>
        </div>
        <p className="mt-3 text-xs text-muted">Setas do teclado revêem lances. Botão direito desenha setas. Arraste a peça até à casa.</p>
      </Panel>
    </div>
  );
}

function ClockPill({ name, ms, active, show }: { name: string; ms: number; active: boolean; show: boolean }) {
  return (
    <div className={`flex min-h-11 flex-1 items-center justify-between rounded-xl px-3 ${active ? "bg-brass text-ink" : "bg-panel text-cream"}`}>
      <span className="truncate text-sm">{name}</span>
      {show && <span className="font-display text-lg tabular-nums">{formatClock(ms)}</span>}
    </div>
  );
}

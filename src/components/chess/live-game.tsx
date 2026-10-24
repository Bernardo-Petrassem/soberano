import { useEffect, useMemo, useRef, useState } from "react";
import type { Color, Role } from "chessops/types";
import { Board, type Premove } from "@/components/chess/board";
import { EvalBar } from "@/components/chess/eval-bar";
import { Panel } from "@/components/chess/shell";
import { formatWatch, useStopwatch } from "@/components/chess/stopwatch";
import { cpOf, Engine, thinkTime } from "@/lib/chess/engine";
import { corpus } from "@/lib/chess/corpus";
import { slipUci, weakenUci } from "@/lib/chess/strength";
import {
  checkedKing,
  destsOf,
  endingOf,
  eloDelta,
  fenKey,
  fenOf,
  flagEnding,
  formatClock,
  isCapture,
  lastSquares,
  legalMove,
  loadFen,
  needsPromotion,
  opposite,
  pairedSans,
  playUciOn,
  positionAt,
  sanAndUci,
  START_FEN,
  toPgn,
  type Ending,
} from "@/lib/chess/logic";
import { capture, knock } from "@/lib/chess/sound";
import { useVault, displayName, type ArchivedGame } from "@/lib/chess/store";

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
  bot: { name: string; skill: number; elo: number | null; nominal?: number } | null;
  useBook?: boolean;
  opening?: string;
  clock: { initial: number; inc: number } | null;
  tcLabel: string;
  whiteName: string;
  blackName: string;
  /** Moves already played before the clock starts, kept in the PGN. */
  prelude?: { sans: string[]; ucis: string[] };
  rated?: boolean;
  pace?: "instant" | "human";
  /** When set and the human is black, the bot deliberately plays worse as this Elo drops. */
  slipElo?: number | null;
  onUserMove?: (uci: string, ply: number) => void;
  inbound?: { nonce: number; uci: string; ply: number } | null;
  externalEnd?: { nonce: number; ending: Ending } | null;
  onResignRemote?: () => void;
  onDrawOffer?: () => void;
  onEnd?: (ending: Ending) => void;
  showHint?: boolean;
};

function fresh(config: LiveConfig) {
  const startFen = config.startFen || START_FEN;
  const ucis = [...(config.prelude?.ucis ?? [])];
  const sans = [...(config.prelude?.sans ?? [])].slice(0, ucis.length);
  const keys = [fenKey(startFen)];
  const cursorPos = loadFen(startFen);
  if (cursorPos) {
    for (const uci of ucis) {
      playUciOn(cursorPos, uci);
      keys.push(fenKey(fenOf(cursorPos)));
    }
  }
  const turn = cursorPos?.turn ?? loadFen(startFen)?.turn ?? "white";
  return {
    startFen,
    ucis,
    sans,
    keys,
    cursor: ucis.length,
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
  const [ratingDelta, setRatingDelta] = useState<number | null>(null);
  const [premoves, setPremoves] = useState<Premove[]>([]);
  const [hintSan, setHintSan] = useState("");
  const archived = useRef(false);
  const began = useRef(performance.now());
  const premoveLock = useRef(false);
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
    const id = window.setInterval(() => setNow(performance.now()), 50);
    return () => window.clearInterval(id);
  }, [state.clock, state.ending]);

  useEffect(() => {
    if (!state.clock?.running || state.ending) return;
    const left = remain(state.clock, state.clock.turn, performance.now(), false);
    if (left > 0) return;
    const live = positionAt(state.startFen, state.ucis, state.ucis.length);
    if (!live) return;
    const loser = state.clock.turn;
    const ending = flagEnding(live, loser);
    setState((s) => {
      if (s.ending || !s.clock?.running) return s;
      const still = remain(s.clock, s.clock.turn, performance.now(), false);
      if (still > 0) return s;
      return {
        ...s,
        ending,
        clock: { ...s.clock, [s.clock.turn]: 0, running: false },
      };
    });
  }, [now, state.clock, state.ending, state.startFen, state.ucis]);

  useEffect(() => {
    if (state.ending) config.onEnd?.(state.ending);
  }, [state.ending, config.onEnd]);

  useEffect(() => {
    if (!config.showHint || !userTurn || !viewFen) {
      setHintSan("");
      return;
    }
    let cancel = false;
    void Engine.shared()
      .go(viewFen, { movetime: 240, skill: 20, elo: null })
      .then((res) => {
        if (cancel || !res.uci) return;
        const live = loadFen(viewFen);
        if (!live) return;
        const promo = res.uci[4];
        const role = promo === "q" ? "queen" : promo === "r" ? "rook" : promo === "b" ? "bishop" : promo === "n" ? "knight" : undefined;
        const move = legalMove(live, res.uci.slice(0, 2), res.uci.slice(2, 4), role);
        if (!move || cancel) return;
        setHintSan(sanAndUci(live, move).san);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [config.showHint, userTurn, viewFen]);

  function pushMove(uci: string, san: string, mover: Color) {
    const before = positionAt(state.startFen, state.ucis, state.ucis.length);
    if (before && isCapture(before, uci.slice(0, 2), uci.slice(2, 4))) capture(sound);
    else knock(sound);
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
    if (!userTurn || state.ending || !atEnd || !pos || !premoves.length || premoveLock.current) return;
    const pm = premoves[0]!;
    const move = legalMove(pos, pm.from, pm.to, pm.promotion);
    if (!move) {
      setPremoves([]);
      return;
    }
    premoveLock.current = true;
    const packed = sanAndUci(pos, move);
    setPremoves((q) => q.slice(1));
    pushMove(packed.uci, packed.san, pos.turn);
    window.setTimeout(() => {
      premoveLock.current = false;
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userTurn, state.ucis.length, state.ending, premoves]);

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
        let uci = "";
        const nominal = config.bot!.nominal ?? config.bot!.elo ?? 1500;
        const slip = config.slipElo != null && config.human === "black";
        let branching = 1;
        for (const tos of Object.values(destsOf(pos))) branching += tos.length;
        if (!slip) {
          const book = config.useBook ? await corpus() : null;
          uci = book?.bookMove(fenOf(pos), config.opening) ?? "";
        }
        if (!uci) {
          const engine = Engine.shared();
          const pace = config.pace === "instant" ? 80 : thinkTime(nominal, clockLeft, branching);
          const res = await engine.go(fenOf(pos), {
            skill: config.bot!.skill,
            elo: config.bot!.elo,
            movetime: pace,
            multipv: slip ? 4 : 1,
          });
          const legal: string[] = [];
          for (const [from, tos] of Object.entries(destsOf(pos))) {
            for (const to of tos) legal.push(needsPromotion(pos, from, to) ? `${from}${to}q` : `${from}${to}`);
          }
          uci = slip ? slipUci(res, config.slipElo ?? nominal, legal) : weakenUci(pos, res.uci, nominal);
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
      white: displayName(config.whiteName, "Brancas"),
      black: displayName(config.blackName, "Pretas"),
      result: state.ending.result,
      reason: state.ending.reason,
      pgn: toPgn({
        startFen: state.startFen,
        sans: state.sans,
        white: displayName(config.whiteName, "Brancas"),
        black: displayName(config.blackName, "Pretas"),
        result: state.ending.result,
        variant960: config.variant960,
        event: config.tcLabel,
      }),
      startFen: state.startFen,
      sans: state.sans,
      ucis: state.ucis,
      variant960: Boolean(config.variant960),
      tc: config.tcLabel,
      durationMs: Math.round(performance.now() - began.current),
      botName: config.bot?.name,
      human: config.human,
    };
    archive(game);
    if (config.rated && config.bot && config.human !== "both") {
      const me = useVault.getState().rating;
      const opp = config.bot.nominal ?? config.bot.elo ?? 2850;
      const winner = state.ending.winner;
      const score = !winner ? 0.5 : winner === config.human ? 1 : 0;
      const delta = eloDelta(me, opp, score);
      setRatingDelta(delta);
      useVault.getState().setRating(me + delta);
      const after = useVault.getState().rating;
      useVault.setState((s) => ({
        games: s.games.map((g) => (g.id === game.id ? { ...g, ratingBefore: me, ratingAfter: after } : g)),
      }));
    }
  }, [state.ending, archive, config, state.sans, state.startFen, state.ucis]);

  const timedOut = state.ending?.reason.startsWith("Tempo") ?? false;

  function undo() {
    if (remote || (state.thinking && !timedOut)) return;
    setPremoves([]);
    if (timedOut) {
      setState((s) => ({ ...s, cursor: Math.max(0, s.cursor - 1) }));
      return;
    }
    setState((s) => {
      if (!s.ucis.length) return s;
      let cut = 1;
      if (config.bot && config.human !== "both" && s.ucis.length >= 2) cut = 2;
      const ucis = s.ucis.slice(0, -cut);
      const next = positionAt(s.startFen, ucis, ucis.length);
      const turnNow = next?.turn ?? s.clock?.turn ?? "white";
      const left = s.clock ? s.clock[turnNow] : 0;
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
        clock: s.clock ? { ...s.clock, turn: turnNow, running: left > 0, stamp: performance.now() } : s.clock,
      };
    });
  }

  function redo() {
    if (remote) return;
    if (timedOut) {
      setState((s) => ({ ...s, cursor: Math.min(s.ucis.length, s.cursor + 1) }));
      return;
    }
    if (!state.redo.length || state.ending) return;
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
    setState((s) => (s.ending ? s : { ...s, redo: s.redo.slice(1) }));
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
      if (e.key === "Escape") setPremoves([]);
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
                premoves={premoves}
                allowPremove={config.human !== "both" && !state.ending && atEnd && !userTurn}
                premoveColor={config.human === "black" ? "black" : "white"}
                onPremove={(from, to, promotion) =>
                  setPremoves((q) => [...q, { from, to, promotion }].slice(-5))
                }
              />
            </div>
          </div>
        )}
        <div className="mt-3">
          <ClockPill name={orientation === "white" ? config.whiteName : config.blackName} ms={orientation === "white" ? whiteMs : blackMs} active={Boolean(state.clock) && turn === orientation && !state.ending} show={Boolean(state.clock)} />
        </div>
        {premoves.length > 0 && <p className="mt-2 text-xs text-muted">Pré-lance preparado. Esc apaga.</p>}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button type="button" className="btn" onClick={() => setState((s) => ({ ...s, cursor: 0 }))}>
            Início
          </button>
          <button type="button" className="btn" onClick={undo} disabled={remote || (timedOut ? state.cursor === 0 : state.ucis.length === 0) || (state.thinking && !timedOut)}>
            Desfazer
          </button>
          <button type="button" className="btn" onClick={redo} disabled={remote || (timedOut ? state.cursor >= state.ucis.length : state.redo.length === 0 || Boolean(state.ending))}>
            Refazer
          </button>
          <button type="button" className="btn" onClick={() => setState((s) => ({ ...s, cursor: s.ucis.length }))}>
            Fim
          </button>
        </div>
      </div>
      <Panel>
        <p className="font-display text-lg text-brass">{config.tcLabel}</p>
        {!config.clock && <p className="font-display mt-1 text-3xl tabular-nums">{formatWatch(watch.ms)}</p>}
        <p className="mt-1 text-sm text-muted">
          {displayName(config.whiteName, "Brancas")} contra {displayName(config.blackName, "Pretas")}
          {state.thinking ? " · a pensar…" : ""}
        </p>
        {config.showHint && hintSan && !state.ending && <p className="mt-2 text-sm text-brass">Sugestão: {hintSan}</p>}
        {state.ending && (
          <p className="mt-3 rounded-xl bg-felt px-3 py-2 text-sm">
            {state.ending.result} · {state.ending.reason}
            {ratingDelta != null ? ` · rating ${ratingDelta > 0 ? "+" : ""}${ratingDelta}` : ""}
          </p>
        )}
        <button type="button" className="btn mt-3" onClick={copyPgn}>
          {copied ? "PGN copiado" : "Copiar PGN"}
        </button>
        {state.note && <p className="mt-2 text-sm text-blood">{state.note}</p>}
        <ol className="mt-4 max-h-72 space-y-1 overflow-auto text-sm">
          {pairedSans(state.startFen, state.sans).map((row) => (
            <li key={row.white?.ply ?? row.black?.ply} className="grid grid-cols-[2.5rem_1fr_1fr] gap-1">
              <span className="text-muted">{row.no}.</span>
              {row.white ? (
                <button type="button" className={state.cursor === row.white.ply ? "text-brass" : ""} onClick={() => setState((s) => ({ ...s, cursor: row.white!.ply }))}>
                  {row.white.san}
                </button>
              ) : (
                <span className="text-muted">…</span>
              )}
              {row.black ? (
                <button type="button" className={state.cursor === row.black.ply ? "text-brass" : ""} onClick={() => setState((s) => ({ ...s, cursor: row.black!.ply }))}>
                  {row.black.san}
                </button>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-wrap gap-2">
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

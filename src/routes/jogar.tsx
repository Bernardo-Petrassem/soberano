import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Shuffle } from "lucide-react";
import { Shell, Panel } from "@/components/chess/shell";
import { LiveGame, type LiveConfig } from "@/components/chess/live-game";
import { StrengthField } from "@/components/chess/strength-field";
import { corpus, type Opening } from "@/lib/chess/corpus";
import { fenFrom960, loadFen, START_FEN, TIME_CONTROLS, type TimeId } from "@/lib/chess/logic";
import { publicUrl } from "@/lib/chess/public-url";
import { eloToEngine } from "@/lib/chess/strength";
import { useHydrated, useVault } from "@/lib/chess/store";

export const Route = createFileRoute("/jogar")({ component: Jogar });

const ALERT = new Set<TimeId>(["ultra", "super"]);

function Jogar() {
  const hydrated = useHydrated();
  const name = useVault((s) => s.name);
  const [local, setLocal] = useState(false);
  const [elo, setElo] = useState(1200);
  const [color, setColor] = useState<"white" | "black" | "random">("white");
  const [tc, setTc] = useState<TimeId | "custom">("blitz3");
  const [minutes, setMinutes] = useState(3);
  const [seconds, setSeconds] = useState(0);
  const [inc, setInc] = useState(2);
  const [noClock, setNoClock] = useState(false);
  const [variant, setVariant] = useState<"std" | "960">("std");
  const [idx, setIdx] = useState(518);
  const [book, setBook] = useState(true);
  const [rated, setRated] = useState(false);
  const [pace, setPace] = useState<"instant" | "human">("human");
  const [customOn, setCustomOn] = useState(false);
  const [fenText, setFenText] = useState(START_FEN);
  const [query, setQuery] = useState("");
  const [opening, setOpening] = useState("");
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [game, setGame] = useState<LiveConfig | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    void corpus().then((c) => setOpenings(c.openings));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return openings.filter((o) => `${o.eco} ${o.name} ${o.family}`.toLowerCase().includes(q)).slice(0, 8);
  }, [openings, query]);

  function applyPreset(id: TimeId) {
    const control = TIME_CONTROLS.find((t) => t.id === id)!;
    setTc(id);
    setNoClock(control.initial === 0);
    setMinutes(Math.floor(control.initial / 60_000));
    setSeconds(Math.round((control.initial % 60_000) / 1000));
    setInc(Math.round(control.inc / 1000));
  }

  function start() {
    const side = color === "random" ? (Math.random() < 0.5 ? "white" : "black") : color;
    const tuned = eloToEngine(elo);
    const bot = local ? null : { name: `Stockfish ${tuned.nominal}`, skill: tuned.skill, elo: tuned.elo, nominal: tuned.nominal };
    const human = bot ? side : "both";
    const typed = loadFen(fenText.trim());
    const startFen = customOn && typed ? fenText.trim() : variant === "960" ? fenFrom960(idx) : START_FEN;
    const initial = noClock ? 0 : Math.max(0, minutes) * 60_000 + Math.max(0, seconds) * 1000;
    const preset = TIME_CONTROLS.find((t) => t.id === tc);
    const label = noClock
      ? "Sem relógio"
      : preset && tc !== "custom"
        ? preset.label
        : seconds && !minutes
          ? `${seconds}s${inc ? `+${inc}` : ""}`
          : `${minutes}+${inc}`;
    const me = name || "Jogador";
    const whiteName = !bot ? "Brancas" : side === "black" ? bot.name : me;
    const blackName = !bot ? "Pretas" : side === "white" ? bot.name : me;
    setGame({
      startFen,
      variant960: variant === "960" && !customOn,
      human,
      bot,
      useBook: book && variant === "std" && !customOn && !local,
      opening: opening || undefined,
      clock: initial ? { initial, inc: Math.max(0, inc) * 1000 } : null,
      tcLabel: variant === "960" && !customOn ? `${label} · 960` : label,
      whiteName,
      blackName,
      rated: Boolean(bot) && rated,
      pace,
    });
    setNonce((n) => n + 1);
  }

  return (
    <Shell>
      {!game ? (
        <Panel className="mx-auto max-w-xl">
          <h1 className="font-display text-3xl">Jogar</h1>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" className={!local ? "btn btn-primary" : "btn"} onClick={() => setLocal(false)}>
              Contra o motor
            </button>
            <button type="button" className={local ? "btn btn-primary" : "btn"} onClick={() => setLocal(true)}>
              Duas pessoas
            </button>
          </div>
          {!local && (
            <div className="mt-4">
              <StrengthField elo={elo} onChange={setElo} />
            </div>
          )}
          <p className="mt-5 mb-1.5 text-sm text-muted">Tempo</p>
          <div className="flex flex-wrap gap-1.5">
            {TIME_CONTROLS.map((t) => {
              const on = tc === t.id;
              const alert = ALERT.has(t.id);
              const cls = on ? (alert ? "btn btn-blood" : "btn btn-primary") : alert ? "btn btn-blood-quiet" : "btn";
              return (
                <button key={t.id} type="button" className={cls} onClick={() => applyPreset(t.id)}>
                  {t.id === "ultra" ? "Ultra bullet" : t.id === "super" ? "Super bullet" : t.label}
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <label className="text-sm text-muted">
              Minutos
              <input
                className="field mt-1"
                type="number"
                min={0}
                max={180}
                value={minutes}
                onChange={(e) => {
                  setMinutes(Math.max(0, Number(e.target.value) || 0));
                  setTc("custom");
                  setNoClock(false);
                }}
              />
            </label>
            <label className="text-sm text-muted">
              Segundos
              <input
                className="field mt-1"
                type="number"
                min={0}
                max={59}
                value={seconds}
                onChange={(e) => {
                  setSeconds(Math.max(0, Number(e.target.value) || 0));
                  setTc("custom");
                  setNoClock(false);
                }}
              />
            </label>
            <label className="text-sm text-muted">
              Acréscimo
              <input
                className="field mt-1"
                type="number"
                min={0}
                max={60}
                value={inc}
                onChange={(e) => {
                  setInc(Math.max(0, Number(e.target.value) || 0));
                  setTc("custom");
                }}
              />
            </label>
          </div>
          {!local && (
            <div className="mt-4">
              <p className="mb-1.5 text-sm text-muted">Tempo de reflexão</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={pace === "instant" ? "btn btn-primary" : "btn"} onClick={() => setPace("instant")}>
                  Imediato
                </button>
                <button type="button" className={pace === "human" ? "btn btn-primary" : "btn"} onClick={() => setPace("human")}>
                  Humano
                </button>
              </div>
            </div>
          )}
          <p className="mt-5 mb-2 text-sm text-muted">A sua cor</p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["white", "Brancas"],
                ["random", "Sorteio"],
                ["black", "Pretas"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" className={color === id ? "btn btn-primary flex-col py-3" : "btn flex-col py-3"} onClick={() => setColor(id)}>
                {id === "random" ? (
                  <Shuffle className="size-7" aria-hidden="true" />
                ) : (
                  <img src={publicUrl(id === "white" ? "/pieces/wK.svg" : "/pieces/bK.svg")} alt="" className="size-9" />
                )}
                <span className="text-xs">{label}</span>
              </button>
            ))}
          </div>
          {!local && (
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={rated} onChange={(e) => setRated(e.target.checked)} />
              Partida valendo rating
            </label>
          )}
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-muted">Mais opções</summary>
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={variant === "std" ? "btn btn-primary" : "btn"} onClick={() => setVariant("std")}>
                  Clássico
                </button>
                <button type="button" className={variant === "960" ? "btn btn-primary" : "btn"} onClick={() => setVariant("960")}>
                  Xadrez 960
                </button>
              </div>
              {variant === "960" && (
                <label className="block text-sm text-muted">
                  Posição {idx}
                  <input className="field mt-1" type="number" min={0} max={959} value={idx} onChange={(e) => setIdx(Number(e.target.value))} />
                </label>
              )}
              {!local && variant === "std" && (
                <>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={book} onChange={(e) => setBook(e.target.checked)} />O motor segue o livro
                  </label>
                  <input className="field" placeholder="Forçar uma abertura" value={query} onChange={(e) => setQuery(e.target.value)} />
                  {filtered.length > 0 && (
                    <ul className="max-h-36 overflow-auto rounded-xl border border-line">
                      {filtered.map((o) => (
                        <li key={`${o.eco}-${o.name}`}>
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm hover:bg-panel-2"
                            onClick={() => {
                              setOpening(o.name);
                              setQuery(`${o.eco} ${o.name}`);
                            }}
                          >
                            {o.eco} · {o.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={customOn} onChange={(e) => setCustomOn(e.target.checked)} />
                Começar de uma posição
              </label>
              {customOn && (
                <textarea className="field min-h-20" value={fenText} onChange={(e) => setFenText(e.target.value)} aria-label="FEN inicial" />
              )}
            </div>
          </details>
          <button type="button" className="btn btn-primary mt-5 w-full" onClick={start} disabled={!hydrated}>
            Começar
          </button>
        </Panel>
      ) : (
        <div>
          <div className="mb-4 flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => setGame(null)}>
              Nova configuração
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setNonce((n) => n + 1)}>
              Jogar de novo
            </button>
          </div>
          <LiveGame key={nonce} config={game} />
        </div>
      )}
    </Shell>
  );
}

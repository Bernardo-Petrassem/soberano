import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Shell, Panel } from "@/components/chess/shell";
import { Choice } from "@/components/chess/choice";
import { LiveGame, type LiveConfig } from "@/components/chess/live-game";
import { corpus, type Opening } from "@/lib/chess/corpus";
import { BOTS, fenFrom960, START_FEN, TIME_CONTROLS, type TimeId } from "@/lib/chess/logic";
import { useHydrated, useVault } from "@/lib/chess/store";

export const Route = createFileRoute("/jogar")({ component: Jogar });

function Jogar() {
  const hydrated = useHydrated();
  const name = useVault((s) => s.name);
  const [botId, setBotId] = useState<(typeof BOTS)[number]["id"] | "local">("clube");
  const [color, setColor] = useState<"white" | "black" | "random">("white");
  const [tc, setTc] = useState<TimeId>("blitz3");
  const [variant, setVariant] = useState<"std" | "960">("std");
  const [idx, setIdx] = useState(518);
  const [book, setBook] = useState(true);
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
    return openings.filter((o) => `${o.eco} ${o.name} ${o.family}`.toLowerCase().includes(q)).slice(0, 12);
  }, [openings, query]);

  function start() {
    const control = TIME_CONTROLS.find((t) => t.id === tc)!;
    const side = color === "random" ? (Math.random() < 0.5 ? "white" : "black") : color;
    const bot = botId === "local" ? null : BOTS.find((b) => b.id === botId)!;
    const human = bot ? side : "both";
    const startFen = variant === "960" ? fenFrom960(idx) : START_FEN;
    const me = name || "Jogador";
    const whiteName = !bot ? "Brancas" : side === "black" ? bot.name : me;
    const blackName = !bot ? "Pretas" : side === "white" ? bot.name : me;
    setGame({
      startFen,
      variant960: variant === "960",
      human,
      bot,
      useBook: book && variant === "std",
      opening: opening || undefined,
      clock: control.initial ? { initial: control.initial, inc: control.inc } : null,
      tcLabel: variant === "960" ? `${control.label} · 960` : control.label,
      whiteName,
      blackName,
    });
    setNonce((n) => n + 1);
  }

  return (
    <Shell>
      {!game ? (
        <Panel className="mx-auto max-w-xl">
          <h1 className="font-display text-3xl">Nova partida</h1>
          <div className="mt-4">
            <Choice
              label="Adversário"
              value={botId}
              onChange={setBotId}
              options={[
                { value: "local", label: "Duas pessoas, neste ecrã" },
                ...BOTS.map((b) => ({
                  value: b.id,
                  label: b.elo ? `${b.name} · ${b.elo}` : `${b.name} · força total`,
                })),
              ]}
            />
          </div>
          <div className="mt-3 space-y-3">
            <Choice
              label="Cor"
              value={color}
              onChange={setColor}
              options={[
                { value: "white", label: "Brancas" },
                { value: "black", label: "Pretas" },
                { value: "random", label: "Sorteio" },
              ]}
            />
            <Choice
              label="Tempo"
              value={tc}
              onChange={setTc}
              options={TIME_CONTROLS.map((t) => ({ value: t.id, label: t.label }))}
            />
            <Choice
              label="Variante"
              value={variant}
              onChange={setVariant}
              options={[
                { value: "std", label: "Clássico" },
                { value: "960", label: "Xadrez 960" },
              ]}
            />
          </div>
          {variant === "960" && (
            <label className="mt-3 block text-sm text-muted">
              Posição {idx} (518 é a clássica)
              <input className="field mt-1" type="number" min={0} max={959} value={idx} onChange={(e) => setIdx(Number(e.target.value))} />
              <button type="button" className="btn mt-2" onClick={() => setIdx(Math.floor(Math.random() * 960))}>
                Posição aleatória
              </button>
            </label>
          )}
          {botId !== "local" && variant === "std" && (
            <div className="mt-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={book} onChange={(e) => setBook(e.target.checked)} />
                O bot segue o livro de aberturas
              </label>
              <input
                className="field mt-2"
                placeholder="Forçar uma abertura (escreva pelo menos 2 letras)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {filtered.length > 0 && (
                <ul className="mt-2 max-h-40 overflow-auto rounded-xl border border-line">
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
              {opening && <p className="mt-2 text-sm text-brass">Abertura: {opening}</p>}
            </div>
          )}
          <button type="button" className="btn btn-primary mt-5" onClick={start} disabled={!hydrated}>
            Começar
          </button>
        </Panel>
      ) : (
        <div>
          <button type="button" className="btn mb-4" onClick={() => setGame(null)}>
            Nova configuração
          </button>
          <LiveGame key={nonce} config={game} />
        </div>
      )}
    </Shell>
  );
}

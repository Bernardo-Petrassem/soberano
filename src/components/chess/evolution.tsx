import { useEffect, useMemo, useState } from "react";
import type { LineChart as LineChartType } from "recharts";
import { Panel } from "@/components/chess/shell";
import { TIME_CONTROLS } from "@/lib/chess/logic";
import { useVault, type ArchivedGame } from "@/lib/chess/store";

type Scale = "hours" | "days" | "months" | "years";
type ChartModule = {
  LineChart: typeof LineChartType;
  Line: typeof import("recharts").Line;
  XAxis: typeof import("recharts").XAxis;
  YAxis: typeof import("recharts").YAxis;
  Tooltip: typeof import("recharts").Tooltip;
  ResponsiveContainer: typeof import("recharts").ResponsiveContainer;
};

function scaleOf(span: number): Scale {
  if (span < 48 * 3600_000) return "hours";
  if (span < 62 * 86400_000) return "days";
  if (span < 800 * 86400_000) return "months";
  return "years";
}

function labelOf(ts: number, scale: Scale, origin: number) {
  const d = new Date(ts);
  if (scale === "hours") return `${Math.max(0, Math.round((ts - origin) / 3600_000))}h`;
  if (scale === "days") return `${d.getDate()}/${d.getMonth() + 1}`;
  if (scale === "months") return `${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
  return String(d.getFullYear());
}

function Chart({ data, color, unit }: { data: { name: string; value: number }[]; color: string; unit: string }) {
  const [mod, setMod] = useState<ChartModule | null>(null);
  useEffect(() => {
    let live = true;
    void import("recharts").then((lib) => {
      if (live) setMod(lib);
    });
    return () => {
      live = false;
    };
  }, []);
  if (!data.length) return <p className="text-sm text-muted">Sem informação</p>;
  if (!mod) return <p className="text-sm text-muted">A desenhar o gráfico…</p>;
  const { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } = mod;
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="name" stroke="var(--color-muted)" tick={{ fill: "var(--color-muted)", fontSize: 12 }} />
          <YAxis stroke="var(--color-muted)" tick={{ fill: "var(--color-muted)", fontSize: 12 }} width={40} />
          <Tooltip
            contentStyle={{ background: "var(--color-panel)", border: "1px solid var(--color-line)", borderRadius: 12, color: "var(--color-cream)" }}
            formatter={(value) => [`${value} ${unit}`, ""]}
          />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function humanScore(game: ArchivedGame) {
  if (!game.human || game.human === "both") return null;
  if (game.result === "1/2-1/2") return 0.5;
  const win = game.human === "white" ? game.result === "1-0" : game.result === "0-1";
  return win ? 1 : 0;
}

export function Evolution({ onOpen }: { onOpen: (id: string) => void }) {
  const games = useVault((s) => s.games);
  const ratingLog = useVault((s) => s.ratingLog);
  const rating = useVault((s) => s.rating);
  const setRating = useVault((s) => s.setRating);
  const dates = [
    ...games.map((g) => Date.parse(g.date)),
    ...ratingLog.map((p) => Date.parse(p.at)),
  ].filter((n) => Number.isFinite(n));
  const origin = dates.length ? Math.min(...dates) : Date.now();
  const span = dates.length ? Math.max(...dates) - origin : 0;
  const scale = scaleOf(span || 1);

  const hours = useMemo(() => {
    const timed = games.filter((g) => (g.durationMs ?? 0) > 0).slice().reverse();
    if (!timed.length) return [];
    let acc = 0;
    return timed.map((g) => {
      acc += (g.durationMs ?? 0) / 3_600_000;
      return { name: labelOf(Date.parse(g.date), scale, origin), value: Math.round(acc * 10) / 10 };
    });
  }, [games, origin, scale]);

  const elo = useMemo(() => {
    if (!ratingLog.length) return [];
    return ratingLog.map((p) => ({ name: labelOf(Date.parse(p.at), scale, origin), value: p.rating }));
  }, [ratingLog, origin, scale]);

  const records = useMemo(() => {
    const map = new Map<string, { w: number; d: number; l: number }>();
    for (const game of games) {
      if (!game.botName || !game.human || game.human === "both") continue;
      const row = map.get(game.botName) ?? { w: 0, d: 0, l: 0 };
      const score = humanScore(game);
      if (score === 1) row.w += 1;
      else if (score === 0.5) row.d += 1;
      else if (score === 0) row.l += 1;
      map.set(game.botName, row);
    }
    return [...map.entries()];
  }, [games]);

  const modalities = useMemo(() => {
    const labels: string[] = TIME_CONTROLS.map((t) => t.label);
    for (const game of games) if (!labels.includes(game.tc)) labels.push(game.tc);
    return labels.map((label) => {
      const found = games.filter((g) => g.tc === label);
      if (!found.length) return { label, game: null as ArchivedGame | null };
      const best = [...found].sort((a, b) => {
        const as = (humanScore(a) ?? 0) * 10 + ((a.ratingAfter ?? a.ratingBefore ?? 0) - (a.ratingBefore ?? 0)) / 100;
        const bs = (humanScore(b) ?? 0) * 10 + ((b.ratingAfter ?? b.ratingBefore ?? 0) - (b.ratingBefore ?? 0)) / 100;
        return bs - as;
      })[0]!;
      return { label, game: best };
    });
  }, [games]);

  const scaleName = scale === "hours" ? "horas" : scale === "days" ? "dias" : scale === "months" ? "meses" : "anos";

  return (
    <div className="space-y-4">
      <Panel>
        <label className="block text-sm text-muted">
          O seu rating
          <input
            className="field mt-1 max-w-40"
            type="number"
            min={100}
            max={3600}
            value={rating}
            onChange={(e) => setRating(Number(e.target.value) || rating)}
          />
        </label>
        <p className="mt-2 text-xs text-muted">A escala segue o jogo mais antigo: {dates.length ? scaleName : "sem datas"}.</p>
      </Panel>
      <Panel>
        <h2 className="font-display text-2xl">Horas jogadas</h2>
        <Chart data={hours} color="var(--color-brass)" unit="h" />
      </Panel>
      <Panel>
        <h2 className="font-display text-2xl">Evolução do Elo</h2>
        <Chart data={elo} color="var(--color-felt-2)" unit="" />
      </Panel>
      <Panel>
        <h2 className="font-display text-2xl">Recordes contra bots</h2>
        {records.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Sem informação</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {records.map(([name, row]) => (
              <li key={name} className="flex justify-between gap-3">
                <span>{name}</span>
                <span className="text-muted">
                  {row.w} vitórias · {row.d} empates · {row.l} derrotas
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel>
        <h2 className="font-display text-2xl">Melhores jogos</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {modalities.map(({ label, game }) => (
            <li key={label} className="flex flex-wrap items-center justify-between gap-2">
              <span>{label}</span>
              {game ? (
                <button type="button" className="text-brass" onClick={() => onOpen(game.id)}>
                  {game.result} · {game.white}–{game.black}
                </button>
              ) : (
                <span className="text-muted">Sem informação</span>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

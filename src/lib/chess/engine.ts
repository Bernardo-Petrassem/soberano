import { publicUrl } from "@/lib/chess/public-url";

export type PvLine = {
  multipv: number;
  cp?: number;
  mate?: number;
  pv: string[];
};

export type GoResult = {
  uci: string;
  cp?: number;
  mate?: number;
  pvs: PvLine[];
};

function parseInfo(line: string): PvLine | null {
  if (!line.includes(" pv ")) return null;
  const multipv = Number(/ multipv (\d+)/.exec(line)?.[1] ?? "1");
  const mate = / score mate (-?\d+)/.exec(line);
  const cp = / score cp (-?\d+)/.exec(line);
  const pv = (/ pv (.+)$/.exec(line)?.[1] ?? "")
    .split(/\s+/)
    .filter((t) => /^[a-h][1-8][a-h][1-8][nbrq]?$/.test(t));
  if (!pv.length) return null;
  return {
    multipv,
    cp: cp ? Number(cp[1]) : undefined,
    mate: mate ? Number(mate[1]) : undefined,
    pv,
  };
}

export function cpOf(line: { cp?: number; mate?: number } | undefined): number {
  if (!line) return 0;
  if (line.mate != null) return line.mate > 0 ? 10000 - line.mate : -10000 - line.mate;
  return line.cp ?? 0;
}

export class Engine {
  private worker: Worker;
  private listeners = new Set<(line: string) => void>();
  private ready: Promise<void>;
  private chain: Promise<void> = Promise.resolve();
  private static inst: Engine | null = null;

  static shared(): Engine {
    this.inst ??= new Engine();
    return this.inst;
  }

  constructor() {
    this.worker = new Worker(publicUrl("/engine/stockfish-19-lite-single.js"));
    this.worker.onmessage = (ev: MessageEvent<string>) => {
      const line = String(ev.data);
      for (const fn of [...this.listeners]) fn(line);
    };
    this.ready = this.boot();
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd);
  }

  private once(pred: (line: string) => boolean, ms: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.listeners.delete(on);
        reject(new Error("O motor não respondeu."));
      }, ms);
      const on = (line: string) => {
        if (!pred(line)) return;
        window.clearTimeout(timer);
        this.listeners.delete(on);
        resolve(line);
      };
      this.listeners.add(on);
    });
  }

  private async boot() {
    this.send("uci");
    await this.once((l) => l === "uciok", 30000);
    this.send("setoption name UCI_Chess960 value true");
    this.send("setoption name Threads value 1");
    this.send("setoption name Hash value 16");
    this.send("ucinewgame");
    this.send("isready");
    await this.once((l) => l === "readyok", 30000);
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.chain.then(job, job);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  stop() {
    this.send("stop");
  }

  go(
    fen: string,
    opts: { movetime?: number; depth?: number; skill?: number; elo?: number | null; multipv?: number },
  ): Promise<GoResult> {
    const movetime = opts.movetime ?? 240;
    return this.enqueue(async () => {
      await this.ready;
      this.send("stop");
      this.send("isready");
      await this.once((l) => l === "readyok", 10000);
      if (opts.skill != null) this.send(`setoption name Skill Level value ${Math.max(0, Math.min(20, opts.skill))}`);
      if (opts.elo) {
        this.send("setoption name UCI_LimitStrength value true");
        this.send(`setoption name UCI_Elo value ${Math.max(800, Math.min(2800, opts.elo))}`);
      } else {
        this.send("setoption name UCI_LimitStrength value false");
      }
      this.send(`setoption name MultiPV value ${opts.multipv ?? 1}`);
      this.send("isready");
      await this.once((l) => l === "readyok", 10000);
      this.send(`position fen ${fen}`);
      const lines = new Map<number, PvLine>();
      const waitBest = this.once((l) => l.startsWith("bestmove"), movetime + 12000);
      const onInfo = (line: string) => {
        if (!line.startsWith("info ")) return;
        const parsed = parseInfo(line);
        if (parsed) lines.set(parsed.multipv, parsed);
      };
      this.listeners.add(onInfo);
      this.send(opts.depth ? `go depth ${opts.depth}` : `go movetime ${movetime}`);
      let bestLine = "";
      try {
        bestLine = await waitBest;
      } finally {
        this.listeners.delete(onInfo);
      }
      const uci = bestLine.split(/\s+/)[1] ?? "";
      const pvs = [...lines.values()].sort((a, b) => a.multipv - b.multipv);
      const top = pvs[0];
      return {
        uci: uci === "(none)" ? "" : uci,
        cp: top?.cp,
        mate: top?.mate,
        pvs,
      };
    });
  }
}

/** Human pace. Higher Elo searches longer, so the delay grows with the depth that Elo can use. */
export function thinkTime(nominal: number, clockMs: number | null, branching = 20): number {
  const elo = Math.max(100, Math.min(3600, nominal || 1500));
  const t = (elo - 100) / 3500;
  const depth = 4 + Math.round(t * 14);
  const busy = Math.min(1.45, 0.75 + Math.max(1, branching) / 45);
  const want = Math.round((500 + depth * depth * 32) * busy);
  if (clockMs == null) return Math.min(14000, Math.max(700, want));
  const budget = Math.max(280, Math.floor(clockMs / Math.max(6, 20 - depth)));
  return Math.max(220, Math.min(want, budget, Math.max(180, clockMs - 40), 14000));
}

import { useState } from "react";
import type { Color } from "chessops/types";
import { Board } from "@/components/chess/board";
import { EndgameCard, PerfectDrill } from "@/components/chess/endgame-setup";
import { LiveGame } from "@/components/chess/live-game";
import { Panel } from "@/components/chess/shell";
import { ENDGAMES, loadFen, type Mark } from "@/lib/chess/logic";
import { generateEndgame, generateRandomEndgame, type EndgameId } from "@/lib/chess/endgames";
import { reviewLine } from "@/lib/chess/review";
import { eloToEngine, strengthName } from "@/lib/chess/strength";
import { useVault } from "@/lib/chess/store";

const WEIGHT: Record<Mark, number> = {
  Livro: 100,
  Brilhante: 100,
  "!!!": 100,
  "★": 100,
  Ótimo: 100,
  Excelente: 90,
  Bom: 65,
  Imprecisão: 35,
  Erro: 12,
  Gafe: 0,
};

export function EndgameLab() {
  const best = useVault((s) => s.endgameBest);
  const setBest = useVault((s) => s.setEndgameBest);
  const [elo, setElo] = useState(1200);
  const [side, setSide] = useState<Color>("white");
  const [solo, setSolo] = useState(false);
  const [pieces, setPieces] = useState("6");
  const [focus, setFocus] = useState("");
  const [fen, setFen] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [card, setCard] = useState(false);
  const [perfect, setPerfect] = useState(false);
  const [spin, setSpin] = useState(0);
  const [precision, setPrecision] = useState<number | null>(null);
  const engine = eloToEngine(elo);
  const drill = ENDGAMES.find((e) => e.id === focus);
  const title = focus === "random" ? "Final aleatório" : (drill?.name ?? "Final");

  function freshFen(id = focus) {
    if (id === "random") return generateRandomEndgame(Number(pieces) || 6);
    return generateEndgame((id || "pp") as EndgameId);
  }

  if (perfect && fen && focus) {
    return (
      <PerfectDrill
        fen={fen}
        side={side}
        endgameId={focus}
        name={title}
        onExit={() => setPerfect(false)}
      />
    );
  }

  if (card && focus) {
    return (
      <EndgameCard
        title={title}
        goal={focus === "random" ? "Uma posição nova. O objetivo é calcular, não decorar." : (drill?.goal ?? "")}
        onBack={() => setCard(false)}
        onStart={(choice) => {
          setElo(choice.elo);
          setSide(choice.side);
          setSolo(choice.local);
          setCard(false);
          if (choice.perfect) setPerfect(true);
          else setPlaying(true);
        }}
      />
    );
  }

  if (playing && fen) {
    return (
      <div>
        <div className="mb-3 flex flex-wrap gap-2">
          <button type="button" className="btn" onClick={() => setPlaying(false)}>
            Parar
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setFen(freshFen());
              setSpin((n) => n + 1);
              setPrecision(null);
            }}
          >
            Outra posição
          </button>
        </div>
        <h2 className="mb-3 font-display text-2xl">{title}</h2>
        {precision != null && <p className="mb-3 text-sm">Precisão desta tentativa: {precision}%</p>}
        <LiveGame
          key={`${focus}-${spin}-${side}-${elo}-${solo}`}
          config={{
            startFen: fen,
            human: solo ? "both" : side,
            bot: solo ? null : { name: strengthName(engine.nominal), skill: engine.skill, elo: engine.elo, nominal: engine.nominal },
            clock: null,
            tcLabel: title,
            kind: "endgame",
            slipElo: !solo && side === "black" ? engine.nominal : null,
            whiteName: side === "white" || solo ? "Você" : strengthName(engine.nominal),
            blackName: side === "black" || solo ? "Você" : strengthName(engine.nominal),
            onPlayAgain: () => {
              setFen(freshFen());
              setSpin((n) => n + 1);
              setPrecision(null);
            },
            onEnd: (_ending, played) => {
              void reviewLine(played.startFen, played.ucis, () => undefined, elo).then((marks) => {
                const start = loadFen(played.startFen);
                const user = marks.filter((_, i) => {
                  const whiteMove = start?.turn === "black" ? i % 2 === 1 : i % 2 === 0;
                  if (solo) return true;
                  return side === "white" ? whiteMove : !whiteMove;
                });
                if (!user.length) return;
                const pct = Math.round(user.reduce((sum, mark) => sum + WEIGHT[mark], 0) / user.length);
                setPrecision(pct);
                setBest(focus, pct);
              });
            },
          }}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <Panel>
        <ul className="space-y-1 text-sm">
          {ENDGAMES.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className={`w-full rounded-lg px-2 py-2 text-left hover:bg-panel-2 ${focus === e.id ? "bg-panel-2 text-brass" : ""}`}
                onClick={() => {
                  setFocus(e.id);
                  setFen(generateEndgame(e.id as EndgameId));
                  setPrecision(null);
                }}
              >
                {e.name}
                {best[e.id] != null && <span className="text-muted"> · {best[e.id]}%</span>}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              className={`w-full rounded-lg px-2 py-2 text-left hover:bg-panel-2 ${focus === "random" ? "bg-panel-2 text-brass" : ""}`}
              onClick={() => {
                const n = Math.max(3, Math.min(12, Number(pieces) || 6));
                setPieces(String(n));
                setFocus("random");
                setFen(generateRandomEndgame(n));
                setPrecision(null);
              }}
            >
              Final aleatório
            </button>
          </li>
        </ul>
      </Panel>
      <Panel>
        <h2 className="font-display text-2xl">{focus ? title : "Fila de finais"}</h2>
        {fen && (
          <div className="mt-3">
            <Board fen={fen} orientation={side} />
          </div>
        )}
        {!fen && <p className="mt-3 text-sm text-muted">Escolha um final para o pré-visualizar.</p>}
        {drill && <p className="mt-3 text-sm text-muted">{drill.goal}</p>}
        {focus === "random" && (
          <label className="mt-3 block text-sm text-muted">
            Peças no final aleatório
            <input
              className="field no-spin mt-1 max-w-28"
              inputMode="numeric"
              value={pieces}
              onChange={(e) => setPieces(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
              onBlur={() => setPieces(String(Math.max(3, Math.min(12, Number(pieces) || 6))))}
            />
          </label>
        )}
        {best[focus] != null && <p className="mt-3 text-sm text-brass">Melhor precisão: {best[focus]}%</p>}
        <button type="button" className="btn btn-primary mt-4" disabled={!focus || !fen} onClick={() => setCard(true)}>
          Jogar esse final
        </button>
      </Panel>
    </div>
  );
}

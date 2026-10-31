import { useState } from "react";
import type { Color } from "chessops/types";
import { LiveGame } from "@/components/chess/live-game";
import { ENDGAMES, loadFen, type Mark } from "@/lib/chess/logic";
import { generateEndgame, generateRandomEndgame, type EndgameId } from "@/lib/chess/endgames";
import { reviewLine } from "@/lib/chess/review";
import { eloToEngine, strengthName } from "@/lib/chess/strength";
import { useVault } from "@/lib/chess/store";
import { StrengthField } from "@/components/chess/strength-field";

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
  const [fen, setFen] = useState<string | null>(null);
  const [id, setId] = useState("pp");
  const [title, setTitle] = useState("");
  const [spin, setSpin] = useState(0);
  const [precision, setPrecision] = useState<number | null>(null);
  const engine = eloToEngine(elo);

  function begin(nextId: string, nextFen: string, nextTitle: string) {
    setId(nextId);
    setFen(nextFen);
    setTitle(nextTitle);
    setPrecision(null);
    setSpin((n) => n + 1);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Finais fixos ou uma posição nova, com poucas peças. A precisão mede os seus lances contra o motor. O alvo é 100%.</p>
      <div className="grid grid-cols-2 gap-1.5">
        {ENDGAMES.map((e) => (
          <button key={e.id} type="button" className="btn h-14 w-full px-2 text-xs leading-tight" onClick={() => begin(e.id, generateEndgame(e.id as EndgameId), e.name)}>
            {e.name}
            <span className="block text-[10px] opacity-70">{best[e.id] != null ? `${best[e.id]}%` : "novo"}</span>
          </button>
        ))}
      </div>
      <label className="block text-sm text-muted">
        Peças no final aleatório (3 a 12)
        <input
          className="field no-spin mt-1 max-w-28"
          inputMode="numeric"
          value={pieces}
          onChange={(e) => setPieces(e.target.value.replace(/[^\d]/g, "").slice(0, 2))}
          onBlur={() => {
            const n = Math.max(3, Math.min(12, Number(pieces) || 6));
            setPieces(String(n));
          }}
        />
      </label>
      <button
        type="button"
        className="btn"
        onClick={() => {
          const n = Math.max(3, Math.min(12, Number(pieces) || 6));
          begin("random", generateRandomEndgame(n), `Aleatório · ${n} peças`);
        }}
      >
        Gerar final aleatório
      </button>
      <StrengthField elo={elo} onChange={setElo} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={side === "white" ? "btn btn-primary" : "btn"} onClick={() => setSide("white")}>
          Brancas
        </button>
        <button type="button" className={side === "black" ? "btn btn-primary" : "btn"} onClick={() => setSide("black")}>
          Pretas
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={solo} onChange={(e) => setSolo(e.target.checked)} />
        Sozinho, sem motor
      </label>
      {best[id] != null && <p className="text-sm text-brass">Melhor precisão neste final: {best[id]}%</p>}
      {precision != null && <p className="text-sm">Precisão desta tentativa: {precision}%</p>}
      {fen && (
        <LiveGame
          key={`${id}-${spin}-${side}-${elo}-${solo}`}
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
            onPlayAgain: () => begin(id, id === "random" ? generateRandomEndgame(Number(pieces) || 6) : generateEndgame(id as EndgameId), title),
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
                setBest(id, pct);
              });
            },
          }}
        />
      )}
    </div>
  );
}

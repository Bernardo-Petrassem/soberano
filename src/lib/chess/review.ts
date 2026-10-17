import { corpus } from "@/lib/chess/corpus";
import { cpOf, Engine } from "@/lib/chess/engine";
import {
  classifyMove,
  destsOf,
  fenOf,
  loadFen,
  material,
  opposite,
  playUciOn,
  type Mark,
} from "@/lib/chess/logic";

export async function reviewLine(
  startFen: string,
  ucis: string[],
  onStep: (done: number, total: number) => void,
  elo = 1500,
): Promise<Mark[]> {
  const book = await corpus();
  const engine = Engine.shared();
  const pos = loadFen(startFen);
  if (!pos) return [];
  const movetime = elo >= 2200 ? 320 : elo >= 1600 ? 200 : elo >= 1000 ? 140 : 80;
  const afterTime = Math.max(60, Math.round(movetime * 0.7));
  const marks: Mark[] = [];
  for (let i = 0; i < ucis.length; i++) {
    const played = ucis[i]!;
    const beforeFen = fenOf(pos);
    const mover = pos.turn;
    const onlyMove = Object.values(destsOf(pos)).reduce((n, d) => n + d.length, 0) <= 1;
    const beforeMat = material(pos, mover) - material(pos, opposite(mover));
    const before = await engine.go(beforeFen, { movetime, multipv: 2, skill: 20, elo: null });
    const playedIsBest = before.uci === played || before.pvs[0]?.pv[0] === played;
    const bestCp = cpOf(before.pvs[0] ?? before);
    const secondCp = before.pvs[1] ? cpOf(before.pvs[1]) : bestCp - 200;
    if (!playUciOn(pos, played)) break;
    const afterMat = material(pos, mover) - material(pos, opposite(mover));
    const after = await engine.go(fenOf(pos), { movetime: afterTime, multipv: 1, skill: 20, elo: null });
    const afterForMover = -cpOf(after);
    marks.push(
      classifyMove({
        book: book.isBookMove(beforeFen, played),
        cpBefore: bestCp,
        cpAfterForMover: playedIsBest ? bestCp : afterForMover,
        playedIsBest,
        secondGap: bestCp - secondCp,
        sacrifice: afterMat < beforeMat,
        onlyMove,
        elo,
      }),
    );
    onStep(i + 1, ucis.length);
  }
  return marks;
}

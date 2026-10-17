import { useEffect, useRef, useState } from "react";
import type { Color, Role } from "chessops/types";
import { piecesOf } from "@/lib/chess/logic";
import { publicUrl } from "@/lib/chess/public-url";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const ROLE_CHAR: Record<Role, string> = { king: "K", queen: "Q", rook: "R", bishop: "B", knight: "N", pawn: "P" };

function Glyph({ role, color }: { role: Role; color: Color }) {
  const src = publicUrl(`/pieces/${color === "white" ? "w" : "b"}${ROLE_CHAR[role]}.svg`);
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className="pointer-events-none h-full w-full select-none drop-shadow-[0_1px_1px_rgb(0_0_0/0.45)]"
    />
  );
}

function sqAt(clientX: number, clientY: number, el: HTMLElement, orientation: Color): string | null {
  const rect = el.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null;
  let file = Math.min(7, Math.floor((x / rect.width) * 8));
  let row = Math.min(7, Math.floor((y / rect.height) * 8));
  if (orientation === "black") file = 7 - file;
  const rank = orientation === "white" ? 7 - row : row;
  return `${FILES[file]}${rank + 1}`;
}

function centerOf(square: string, orientation: Color) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const col = orientation === "white" ? file : 7 - file;
  const row = orientation === "white" ? 7 - rank : rank;
  return { x: (col + 0.5) * 12.5, y: (row + 0.5) * 12.5 };
}

export type Arrow = { from: string; to: string };

export function Board({
  fen,
  orientation = "white",
  dests = {},
  lastMove,
  checkSquare,
  interactive,
  isPromotion,
  onMove,
  sideToMove = "white",
  editRole,
  onEdit,
}: {
  fen: string;
  orientation?: Color;
  dests?: Record<string, string[]>;
  lastMove?: [string, string] | null;
  checkSquare?: string | null;
  interactive?: boolean;
  isPromotion?: (from: string, to: string) => boolean;
  onMove?: (from: string, to: string, promotion?: Role) => void;
  sideToMove?: Color;
  editRole?: { color: Color; role: Role } | "erase" | null;
  onEdit?: (square: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{
    from: string;
    role: Role;
    color: Color;
    x: number;
    y: number;
  } | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [marks, setMarks] = useState<string[]>([]);
  const arrowFrom = useRef<string | null>(null);
  const hold = useRef<number | 0>(0);
  const leftStreak = useRef(0);
  const pieces = piecesOf(fen);

  useEffect(() => {
    setSelected(null);
    setPromo(null);
    setDrag(null);
    setArrows([]);
    setMarks([]);
  }, [fen]);

  const pieceAt = (square: string) => pieces.find((p) => p.square === square);

  function finish(from: string, to: string) {
    if (from === to) {
      setSelected(from);
      return;
    }
    if (isPromotion?.(from, to)) {
      setPromo({ from, to });
      setSelected(null);
      return;
    }
    if (dests[from]?.includes(to)) onMove?.(from, to);
    setSelected(null);
  }

  function pointerDown(e: React.PointerEvent) {
    const el = ref.current;
    if (!el) return;
    const square = sqAt(e.clientX, e.clientY, el, orientation);
    if (!square) return;
    if (e.button === 2 || e.pointerType === "touch") {
      if (e.button === 2) {
        leftStreak.current = 0;
        arrowFrom.current = square;
        e.preventDefault();
        return;
      }
      window.clearTimeout(hold.current);
      hold.current = window.setTimeout(() => {
        arrowFrom.current = square;
      }, 380);
    }
    if (e.button !== 0) return;
    leftStreak.current += 1;
    if (leftStreak.current >= 2) {
      leftStreak.current = 0;
      setArrows([]);
      setMarks([]);
    }
    if (editRole && onEdit) return;
    const piece = pieceAt(square);
    if (selected && dests[selected]?.includes(square)) {
      finish(selected, square);
      return;
    }
    if (!piece || !interactive || !dests[square]?.length) {
      setSelected(null);
      return;
    }
    setSelected(square);
    setDrag({ from: square, role: piece.role, color: piece.color, x: e.clientX, y: e.clientY });
    el.setPointerCapture(e.pointerId);
  }

  function pointerMove(e: React.PointerEvent) {
    if (!drag) return;
    setDrag({ ...drag, x: e.clientX, y: e.clientY });
  }

  function pointerUp(e: React.PointerEvent) {
    window.clearTimeout(hold.current);
    const el = ref.current;
    const square = el ? sqAt(e.clientX, e.clientY, el, orientation) : null;
    if (arrowFrom.current && square) {
      const from = arrowFrom.current;
      arrowFrom.current = null;
      if (from === square) {
        setMarks((m) => (m.includes(square) ? m.filter((s) => s !== square) : [...m, square]));
      } else {
        setArrows((list) => {
          const exists = list.some((a) => a.from === from && a.to === square);
          return exists ? list.filter((a) => !(a.from === from && a.to === square)) : [...list, { from, to: square }];
        });
      }
    } else {
      arrowFrom.current = null;
    }
    if (editRole && onEdit && e.button === 0 && square) onEdit(square);
    if (drag && square) finish(drag.from, square);
    setDrag(null);
  }

  const grid = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const file = orientation === "white" ? col : 7 - col;
      const rank = orientation === "white" ? 7 - row : row;
      const name = `${FILES[file]}${rank + 1}`;
      const dark = (file + rank) % 2 === 0;
      const piece = pieceAt(name);
      const fromSq = lastMove?.[0] === name;
      const toSq = lastMove?.[1] === name;
      const isDest = selected ? dests[selected]?.includes(name) : false;
      const isSel = selected === name;
      const marked = marks.includes(name);
      const label = dark ? "#f6efe2" : "#4a3424";
      grid.push(
        <div
          key={name}
          data-sq={name}
          className="relative flex min-h-0 min-w-0 items-center justify-center"
          style={{
            background: dark ? "var(--color-dark-sq)" : "var(--color-light-sq)",
          }}
        >
          {fromSq && <span className="absolute inset-0" style={{ background: "rgba(255,255,255,0.72)" }} />}
          {toSq && <span className="absolute inset-0" style={{ background: "rgba(255,214,40,0.78)" }} />}
          {isSel && <span className="absolute inset-0" style={{ boxShadow: "inset 0 0 0 3px var(--color-brass)" }} />}
          {marked && <span className="absolute inset-1 rounded-full" style={{ background: "color-mix(in srgb, var(--color-blood) 45%, transparent)" }} />}
          {checkSquare === name && (
            <span className="absolute inset-0" style={{ boxShadow: "inset 0 0 0 3px var(--color-blood)" }} />
          )}
          {isDest && (
            <span
              className={
                piece
                  ? "absolute inset-1 rounded-full border-2 border-felt"
                  : "absolute size-[22%] rounded-full bg-felt/80"
              }
            />
          )}
          {piece && drag?.from !== name && (
            <span className="absolute inset-[7%]">
              <Glyph role={piece.role} color={piece.color} />
            </span>
          )}
          {col === 0 && (
            <span className="absolute top-0.5 left-1 text-[10px] font-semibold" style={{ color: label }}>
              {rank + 1}
            </span>
          )}
          {row === 7 && (
            <span className="absolute right-1 bottom-0.5 text-[10px] font-semibold" style={{ color: label }}>
              {FILES[file]}
            </span>
          )}
        </div>,
      );
    }
  }

  return (
    <div className="relative mx-auto w-full max-w-[min(100%,42rem,calc(100dvh-17rem))]">
      <div
        ref={ref}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={() => {
          setDrag(null);
          arrowFrom.current = null;
        }}
        onContextMenu={(e) => e.preventDefault()}
        className="grid aspect-square w-full touch-none grid-cols-8 grid-rows-8 overflow-hidden rounded-lg shadow-[0_18px_50px_rgb(0_0_0/0.35)] ring-1 ring-line select-none"
      >
        {grid}
        <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full">
          {arrows.map((a) => {
            const A = centerOf(a.from, orientation);
            const B = centerOf(a.to, orientation);
            return (
              <line
                key={`${a.from}${a.to}`}
                x1={A.x}
                y1={A.y}
                x2={B.x}
                y2={B.y}
                stroke="var(--color-felt-2)"
                strokeWidth="1.7"
                strokeLinecap="round"
                markerEnd="url(#arrow)"
                opacity="0.9"
              />
            );
          })}
          <defs>
            <marker id="arrow" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
              <path d="M0 0 L4 2 L0 4 z" fill="var(--color-felt-2)" />
            </marker>
          </defs>
        </svg>
        {promo && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink/50">
            <div className="flex gap-2 rounded-xl bg-panel p-3 ring-1 ring-line">
              {(["queen", "rook", "bishop", "knight"] as Role[]).map((role) => (
                <button
                  key={role}
                  type="button"
                  className="flex size-14 items-center justify-center rounded-lg bg-light-sq"
                  onClick={() => {
                    onMove?.(promo.from, promo.to, role);
                    setPromo(null);
                  }}
                >
                  <Glyph role={role} color={sideToMove} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {drag && (
        <div
          className="pointer-events-none fixed z-50 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
          style={{ left: drag.x, top: drag.y }}
        >
          <Glyph role={drag.role} color={drag.color} />
        </div>
      )}
    </div>
  );
}

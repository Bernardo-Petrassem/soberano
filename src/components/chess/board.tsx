import { useEffect, useRef, useState } from "react";
import type { Color, Role } from "chessops/types";
import { piecesOf } from "@/lib/chess/logic";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

function Glyph({ role, color }: { role: Role; color: Color }) {
  const white = color === "white";
  const fill = white ? "#fffaf2" : "#1a1612";
  const ink = white ? "#2a2118" : "#e7dcc8";
  return (
    <svg viewBox="0 0 45 45" className="pointer-events-none h-full w-full drop-shadow-[0_1px_1px_rgb(0_0_0/0.55)]" aria-hidden="true">
      <g fill={fill} stroke={ink} strokeWidth={white ? 1.55 : 1.25} strokeLinejoin="round" strokeLinecap="round">
        {role === "king" && (
          <>
            <path d="M22.5 11.6V6M20 8h5" fill="none" />
            <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" />
            <path d="M12.5 37c5.5 3.5 14.5 3.5 20 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-2.5-7.5-12-10.5-16-4-3 6 6 10.5 6 10.5z" />
            <path d="M12.5 30c5.5-3 14.5-3 20 0M12.5 33.5c5.5-3 14.5-3 20 0M12.5 37c5.5-3 14.5-3 20 0" fill="none" />
          </>
        )}
        {role === "queen" && (
          <>
            <path d="M8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm9.5 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM24 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm9.5 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM41 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
            <path d="M9 26c8.5 2 10 4 11.5 5 1.5-1 3-3 11.5-5-6 10-8 12-11.5 12S15 36 9 26z" />
            <path d="M15 30c4-2 11-2 15 0" fill="none" />
            <path d="M9.5 35.5c6 3 20 3 26 0v-3.5c-8 3-18 3-26 0z" />
          </>
        )}
        {role === "rook" && (
          <>
            <path d="M9 39h27v-3H9zM12 36V14h6v5h3v-5h6v5h3v-5h6v22" />
            <path d="M12 14h6M21 14h6M30 14h6M14 39h17" fill="none" />
          </>
        )}
        {role === "bishop" && (
          <>
            <path d="M9 36c3.4 2.5 10 3.5 13.5 2 3.5 1.5 10.1.5 13.5-2 0 0 1.6.5 2.5 0 .8 1.5.5 3.5.5 3.5-5 2-17 2-22.5 0 0 0-.3-2 .5-3.5 1-.5 2.5 0 2.5 0z" />
            <path d="M15 32c2.5 1.5 12.5 1.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5 6-15.5-6 4-5.5 14-5.5 14 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z" />
            <path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z" />
            <path d="M17.5 26h10M15 30h15" fill="none" />
          </>
        )}
        {role === "knight" && (
          <path d="M22 10c10.5 1 16.5 8 16 16 0 0 .5 1.5 0 2.5-1 1.5-2 2-2 2l-2 3h-6l1.5-4.5-4 3-1.5 4.5H9s1-4.5 2.5-7.5S14 18 14 15c0-2 1.5-4 3-5 1-.5 3-1 5 0zM14 14c-2 1-3 4-3 4" />
        )}
        {role === "pawn" && (
          <>
            <path d="M22.5 9a4 4 0 1 1-.01 8.01A4 4 0 0 1 22.5 9z" />
            <path d="M17 36.5c1.5-5 2.5-8 2.5-12.5S16 18 22.5 18 28 22 28 24s1 7.5 2.5 12.5" />
            <path d="M12.5 39h20" fill="none" />
            <path d="M12.5 36.5h20c-1.5 1.5-6 2.5-10 2.5s-8.5-1-10-2.5z" />
          </>
        )}
      </g>
    </svg>
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
  const pieces = piecesOf(fen);

  useEffect(() => {
    setSelected(null);
    setPromo(null);
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
      const isLast = lastMove?.includes(name);
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
          {isLast && <span className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--color-brass) 42%, transparent)" }} />}
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

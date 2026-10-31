import { create } from "zustand";
import { START_FEN, type Mark } from "@/lib/chess/logic";
import type { ArchivedGame } from "@/lib/chess/store";

export type LabTab = {
  id: string;
  title: string;
  fen: string;
  draft: string;
  pgn: string;
  sans: string[];
  ucis: string[];
  cursor: number;
  marks: Mark[] | null;
  hidden: boolean;
};

type Lab = {
  tabs: LabTab[];
  activeId: string;
  note: string;
  setNote: (note: string) => void;
  patch: (id: string, partial: Partial<LabTab>) => void;
  activate: (id: string) => void;
  hide: (id: string) => void;
  close: (id: string) => void;
  openGame: (game: ArchivedGame) => boolean;
};

function blank(partial: Partial<LabTab> = {}): LabTab {
  return {
    title: "Estudo",
    fen: START_FEN,
    draft: START_FEN,
    pgn: "",
    sans: [],
    ucis: [],
    cursor: 0,
    marks: null,
    hidden: false,
    ...partial,
    id: partial.id ?? crypto.randomUUID(),
  };
}

const first = blank();

export const useLab = create<Lab>((set, get) => ({
  tabs: [first],
  activeId: first.id,
  note: "",
  setNote: (note) => set({ note }),
  patch: (id, partial) =>
    set((s) => ({ tabs: s.tabs.map((tab) => (tab.id === id ? { ...tab, ...partial } : tab)) })),
  activate: (id) =>
    set((s) => ({
      activeId: id,
      tabs: s.tabs.map((tab) => (tab.id === id ? { ...tab, hidden: false } : tab)),
    })),
  hide: (id) =>
    set((s) => {
      const tabs = s.tabs.map((tab) => (tab.id === id ? { ...tab, hidden: true } : tab));
      const visible = tabs.find((tab) => !tab.hidden);
      return { tabs, activeId: s.activeId === id ? (visible?.id ?? id) : s.activeId };
    }),
  close: (id) =>
    set((s) => {
      let tabs = s.tabs.filter((tab) => tab.id !== id);
      if (!tabs.length) tabs = [blank()];
      const activeId = tabs.some((tab) => tab.id === s.activeId) ? s.activeId : tabs.find((tab) => !tab.hidden)?.id ?? tabs[0]!.id;
      return { tabs, activeId };
    }),
  openGame: (game) => {
    const state = get();
    const existing = state.tabs.find((tab) => tab.pgn && tab.pgn === game.pgn);
    if (existing) {
      get().activate(existing.id);
      set({ note: "" });
      return true;
    }
    const meaningful = state.tabs.some((tab) => tab.sans.length || tab.pgn || tab.fen !== START_FEN);
    const base = meaningful ? state.tabs : [];
    if (base.length >= 8) {
      set({ note: "Há 8 tabuleiros abertos. Feche um para abrir outro." });
      return false;
    }
    const tab = blank({
      title: `${game.white} – ${game.black}`.slice(0, 32),
      fen: game.startFen,
      draft: game.startFen,
      pgn: game.pgn,
      sans: game.sans,
      ucis: game.ucis,
      cursor: game.ucis.length,
      marks: game.marks ?? null,
    });
    set({ tabs: [...base, tab], activeId: tab.id, note: "" });
    return true;
  },
}));

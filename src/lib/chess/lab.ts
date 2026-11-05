import { create } from "zustand";
import { START_FEN, type Mark } from "@/lib/chess/logic";
import type { ArchivedGame } from "@/lib/chess/store";

export type GroupColor = "brass" | "felt" | "blood" | "good";

export type LabGroup = {
  id: string;
  name: string;
  color: GroupColor;
  collapsed: boolean;
};

export type LabSection = "estudo" | "aberturas" | "finais";

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
  groupId: string | null;
  section: LabSection;
};

type Lab = {
  tabs: LabTab[];
  groups: LabGroup[];
  activeId: string;
  note: string;
  focus: boolean;
  setNote: (note: string) => void;
  setFocus: (focus: boolean) => void;
  patch: (id: string, partial: Partial<LabTab>) => void;
  activate: (id: string) => void;
  close: (id: string) => void;
  addBoard: () => boolean;
  reorder: (tabId: string, beforeId: string) => void;
  rename: (tabId: string, title: string) => void;
  createGroup: (tabId: string) => void;
  joinGroup: (tabId: string, groupId: string) => void;
  pair: (tabId: string, otherId: string) => void;
  ungroup: (tabId: string) => void;
  toggleGroup: (groupId: string) => void;
  renameGroup: (groupId: string, name: string) => void;
  paintGroup: (groupId: string, color: GroupColor) => void;
  dissolveGroup: (groupId: string) => void;
  closeGroup: (groupId: string) => void;
  openGame: (game: ArchivedGame) => boolean;
};

const COLORS: GroupColor[] = ["brass", "felt", "blood", "good"];
const MAX_TABS = 8;

function blank(partial: Partial<LabTab> = {}): LabTab {
  return {
    title: "Novo",
    fen: START_FEN,
    draft: START_FEN,
    pgn: "",
    sans: [],
    ucis: [],
    cursor: 0,
    marks: null,
    hidden: false,
    groupId: null,
    section: "estudo",
    ...partial,
    id: partial.id ?? crypto.randomUUID(),
  };
}

function prune(groups: LabGroup[], tabs: LabTab[]) {
  const used = new Set(tabs.map((tab) => tab.groupId).filter(Boolean));
  return groups.filter((group) => used.has(group.id));
}

function placeInGroup(tabs: LabTab[], tabId: string, groupId: string | null): LabTab[] {
  const tab = tabs.find((item) => item.id === tabId);
  if (!tab) return tabs;
  const rest = tabs.filter((item) => item.id !== tabId);
  const next = { ...tab, groupId };
  if (!groupId) return [...rest, next];
  let last = -1;
  rest.forEach((item, index) => {
    if (item.groupId === groupId) last = index;
  });
  if (last < 0) return [...rest, next];
  const copy = [...rest];
  copy.splice(last + 1, 0, next);
  return copy;
}

const first = blank({ title: "Estudo" });

export const useLab = create<Lab>((set, get) => ({
  tabs: [first],
  groups: [],
  activeId: first.id,
  note: "",
  focus: false,
  setNote: (note) => set({ note }),
  setFocus: (focus) => set({ focus }),
  patch: (id, partial) =>
    set((s) => ({ tabs: s.tabs.map((tab) => (tab.id === id ? { ...tab, ...partial } : tab)) })),
  activate: (id) => set({ activeId: id }),
  close: (id) =>
    set((s) => {
      let tabs = s.tabs.filter((tab) => tab.id !== id);
      if (!tabs.length) tabs = [blank({ title: "Estudo" })];
      const activeId = tabs.some((tab) => tab.id === s.activeId) ? s.activeId : tabs[0]!.id;
      return { tabs, groups: prune(s.groups, tabs), activeId };
    }),
  addBoard: () => {
    const state = get();
    if (state.tabs.length >= MAX_TABS) {
      set({ note: "Há 8 tabuleiros abertos. Feche um para abrir outro." });
      return false;
    }
    const tab = blank({ title: `Tabuleiro ${state.tabs.length + 1}` });
    set({ tabs: [...state.tabs, tab], activeId: tab.id, note: "" });
    return true;
  },
  reorder: (tabId, beforeId) =>
    set((s) => {
      if (tabId === beforeId) return s;
      const moving = s.tabs.find((tab) => tab.id === tabId);
      const target = s.tabs.find((tab) => tab.id === beforeId);
      if (!moving || !target) return s;
      const rest = s.tabs.filter((tab) => tab.id !== tabId);
      const index = rest.findIndex((tab) => tab.id === beforeId);
      const next = { ...moving, groupId: moving.groupId === target.groupId ? moving.groupId : null };
      const tabs = [...rest];
      tabs.splice(Math.max(0, index), 0, next);
      return { tabs, groups: prune(s.groups, tabs) };
    }),
  rename: (tabId, title) =>
    set((s) => ({
      tabs: s.tabs.map((tab) => (tab.id === tabId ? { ...tab, title: title.trim().slice(0, 32) || tab.title } : tab)),
    })),
  createGroup: (tabId) =>
    set((s) => {
      const color = COLORS[s.groups.length % COLORS.length]!;
      const group: LabGroup = { id: crypto.randomUUID(), name: "Grupo", color, collapsed: false };
      return { groups: [...s.groups, group], tabs: placeInGroup(s.tabs, tabId, group.id) };
    }),
  joinGroup: (tabId, groupId) =>
    set((s) => ({
      tabs: placeInGroup(s.tabs, tabId, groupId),
      groups: s.groups.map((group) => (group.id === groupId ? { ...group, collapsed: false } : group)),
    })),
  pair: (tabId, otherId) => {
    if (tabId === otherId) return;
    const state = get();
    const other = state.tabs.find((tab) => tab.id === otherId);
    if (!other) return;
    if (other.groupId) {
      get().joinGroup(tabId, other.groupId);
      return;
    }
    const color = COLORS[state.groups.length % COLORS.length]!;
    const group: LabGroup = { id: crypto.randomUUID(), name: "Grupo", color, collapsed: false };
    const withOther = placeInGroup(state.tabs, otherId, group.id);
    set({ groups: [...state.groups, group], tabs: placeInGroup(withOther, tabId, group.id) });
  },
  ungroup: (tabId) =>
    set((s) => {
      const tabs = placeInGroup(s.tabs, tabId, null);
      return { tabs, groups: prune(s.groups, tabs) };
    }),
  toggleGroup: (groupId) =>
    set((s) => ({
      groups: s.groups.map((group) => (group.id === groupId ? { ...group, collapsed: !group.collapsed } : group)),
    })),
  renameGroup: (groupId, name) =>
    set((s) => ({
      groups: s.groups.map((group) => (group.id === groupId ? { ...group, name: name.slice(0, 24) || "Grupo" } : group)),
    })),
  paintGroup: (groupId, color) =>
    set((s) => ({ groups: s.groups.map((group) => (group.id === groupId ? { ...group, color } : group)) })),
  dissolveGroup: (groupId) =>
    set((s) => {
      const tabs = s.tabs.map((tab) => (tab.groupId === groupId ? { ...tab, groupId: null } : tab));
      return { tabs, groups: s.groups.filter((group) => group.id !== groupId) };
    }),
  closeGroup: (groupId) =>
    set((s) => {
      let tabs = s.tabs.filter((tab) => tab.groupId !== groupId);
      if (!tabs.length) tabs = [blank({ title: "Estudo" })];
      const activeId = tabs.some((tab) => tab.id === s.activeId) ? s.activeId : tabs[0]!.id;
      return { tabs, groups: s.groups.filter((group) => group.id !== groupId), activeId };
    }),
  openGame: (game) => {
    const state = get();
    const existing = state.tabs.find((tab) => tab.pgn && tab.pgn === game.pgn);
    if (existing) {
      set({ activeId: existing.id, note: "" });
      return true;
    }
    const meaningful = state.tabs.some((tab) => tab.sans.length || tab.pgn || tab.fen !== START_FEN);
    const base = meaningful ? state.tabs : [];
    if (base.length >= MAX_TABS) {
      set({ note: "Há 8 tabuleiros abertos. Feche um para abrir outro." });
      return false;
    }
    const tab = blank({
      title: `${game.white} – ${game.black}`.slice(0, 28),
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

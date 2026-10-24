import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Mark } from "@/lib/chess/logic";
import { useEffect, useState } from "react";

export type Friend = { address: string; name: string; online: boolean; checkedAt?: number };

export type ArchivedGame = {
  id: string;
  date: string;
  white: string;
  black: string;
  result: string;
  reason: string;
  pgn: string;
  startFen: string;
  sans: string[];
  ucis: string[];
  variant960: boolean;
  tc: string;
  marks?: Mark[];
  /** 2 = estrela para o melhor lance e !!! só para sacrifício que vira a partida. */
  markVersion?: number;
  durationMs?: number;
  botName?: string;
  human?: "white" | "black" | "both";
  ratingBefore?: number;
  ratingAfter?: number;
};

export type RatingPoint = { at: string; rating: number };

export type PuzzleAttempt = {
  puzzleId: string;
  fen: string;
  line: string[];
  themes: string[];
  rating: number;
  ok: boolean;
  at: string;
  played: string[];
  wrong?: string;
};

export type DrillSave = {
  openings: { eco: string; family: string; name: string; moves: string }[];
  endgames: string[];
  elo: number;
  color: "white" | "black";
};

type Vault = {
  name: string;
  peerId: string;
  rating: number;
  sound: boolean;
  service: boolean;
  friends: Friend[];
  games: ArchivedGame[];
  ratingLog: RatingPoint[];
  attempts: PuzzleAttempt[];
  drill: DrillSave | null;
  setName: (name: string) => void;
  ensureId: () => string;
  setRating: (rating: number) => void;
  setSound: (sound: boolean) => void;
  setService: (service: boolean) => void;
  addFriend: (friend: Friend) => void;
  removeFriend: (address: string) => void;
  markFriend: (address: string, online: boolean) => void;
  archive: (game: ArchivedGame) => void;
  setMarks: (id: string, marks: Mark[]) => void;
  removeGame: (id: string) => void;
  logAttempt: (attempt: PuzzleAttempt) => void;
  saveDrill: (drill: DrillSave) => void;
};

export function displayName(raw: string | undefined, fallback = "Jogador"): string {
  const name = (raw ?? "").trim();
  if (!name || /https?:|localhost|127\.0\.0\.1|\bamigos\b|:\d{2,5}/i.test(name)) return fallback;
  return name.slice(0, 32);
}

export function formatWhen(iso: string | undefined): string {
  if (!iso) return "Sem informação";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Sem informação";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function makeId(): string {
  return `p${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

const memory = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

export const useVault = create<Vault>()(
  persist(
    (set, get) => ({
      name: "Jogador",
      peerId: "",
      rating: 1200,
      sound: true,
      service: false,
      friends: [],
      games: [],
      ratingLog: [],
      attempts: [],
      drill: null,
      setName: (name) => set({ name: displayName(name) }),
      ensureId: () => {
        const id = get().peerId || makeId();
        if (!get().peerId) set({ peerId: id });
        return id;
      },
      setRating: (rating) =>
        set((s) => {
          const next = Math.max(100, Math.min(3600, Math.round(rating) || s.rating));
          if (next === s.rating) return s;
          return {
            rating: next,
            ratingLog: [...s.ratingLog, { at: new Date().toISOString(), rating: next }].slice(-400),
          };
        }),
      setSound: (sound) => set({ sound }),
      setService: (service) => set({ service }),
      addFriend: (friend) =>
        set((s) => {
          if (s.friends.some((f) => f.address === friend.address) || friend.address === s.peerId) return s;
          return { friends: [...s.friends, friend].slice(0, 80) };
        }),
      removeFriend: (address) => set((s) => ({ friends: s.friends.filter((f) => f.address !== address) })),
      markFriend: (address, online) =>
        set((s) => ({
          friends: s.friends.map((f) =>
            f.address === address ? { ...f, online, checkedAt: Date.now() } : f,
          ),
        })),
      archive: (game) => set((s) => ({ games: [game, ...s.games.filter((g) => g.id !== game.id)].slice(0, 80) })),
      setMarks: (id, marks) =>
        set((s) => ({ games: s.games.map((g) => (g.id === id ? { ...g, marks, markVersion: 2 } : g)) })),
      removeGame: (id) => set((s) => ({ games: s.games.filter((g) => g.id !== id) })),
      logAttempt: (attempt) => set((s) => ({ attempts: [attempt, ...s.attempts].slice(0, 80) })),
      saveDrill: (drill) => set({ drill }),
    }),
    {
      name: "soberano-vault",
      storage: createJSONStorage(() => (typeof window === "undefined" ? memory : localStorage)),
      partialize: (s) => ({
        name: s.name,
        peerId: s.peerId,
        rating: s.rating,
        sound: s.sound,
        service: s.service,
        friends: s.friends,
        games: s.games,
        ratingLog: s.ratingLog,
        attempts: s.attempts,
        drill: s.drill,
      }),
    },
  ),
);

export function useHydrated(): boolean {
  const [ready, setReady] = useState(() => useVault.persist.hasHydrated());
  useEffect(() => {
    if (useVault.persist.hasHydrated()) setReady(true);
    return useVault.persist.onFinishHydration(() => setReady(true));
  }, []);
  return ready;
}

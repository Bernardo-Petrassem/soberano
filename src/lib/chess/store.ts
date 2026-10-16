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
};

type Vault = {
  name: string;
  peerId: string;
  rating: number;
  sound: boolean;
  service: boolean;
  friends: Friend[];
  games: ArchivedGame[];
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
};

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
      setName: (name) => set({ name: name.slice(0, 32) || "Jogador" }),
      ensureId: () => {
        const id = get().peerId || makeId();
        if (!get().peerId) set({ peerId: id });
        return id;
      },
      setRating: (rating) => set({ rating: Math.max(400, Math.min(2800, Math.round(rating))) }),
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
        set((s) => ({ games: s.games.map((g) => (g.id === id ? { ...g, marks } : g)) })),
      removeGame: (id) => set((s) => ({ games: s.games.filter((g) => g.id !== id) })),
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

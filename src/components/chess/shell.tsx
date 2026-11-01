import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { displayName, useHydrated, useVault } from "@/lib/chess/store";

const LINKS = [
  { to: "/jogar", label: "Jogar" },
  { to: "/analise", label: "Análise" },
  { to: "/treino", label: "Treino" },
  { to: "/problemas", label: "Problemas" },
  { to: "/historico", label: "Histórico" },
  { to: "/amigos", label: "Amigos" },
  { to: "/biblioteca", label: "Biblioteca" },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const hydrated = useHydrated();
  const name = useVault((s) => s.name);
  const setName = useVault((s) => s.setName);
  useEffect(() => {
    if (!hydrated) return;
    const clean = displayName(name);
    if (clean !== name) setName(clean);
  }, [hydrated, name, setName]);
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Link to="/" className="shrink-0 font-display text-lg tracking-tight text-ink">
            Soberano
          </Link>
          <nav className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto">
            {LINKS.map((link) => (
              <Link key={link.to} to={link.to} className="nav-link">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}

export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-panel p-4 ${className}`}>{children}</section>;
}

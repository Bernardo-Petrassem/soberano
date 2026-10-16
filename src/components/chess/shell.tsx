import { Link } from "@tanstack/react-router";
import { Crown } from "lucide-react";

const LINKS = [
  { to: "/", label: "Início" },
  { to: "/jogar", label: "Jogar" },
  { to: "/analise", label: "Análise" },
  { to: "/treino", label: "Treino" },
  { to: "/problemas", label: "Problemas" },
  { to: "/historico", label: "Histórico" },
  { to: "/amigos", label: "Amigos" },
  { to: "/biblioteca", label: "Biblioteca" },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink text-cream">
      <header className="sticky top-0 z-30 border-b border-line bg-ink/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
          <Link to="/" className="flex shrink-0 items-center gap-2 font-display text-xl tracking-tight text-brass">
            <Crown className="size-5" aria-hidden="true" />
            Soberano
          </Link>
          <nav className="flex flex-wrap gap-1">
            {LINKS.slice(1).map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="nav-link"
              >
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
  return <section className={`rounded-2xl border border-line bg-panel p-4 ${className}`}>{children}</section>;
}

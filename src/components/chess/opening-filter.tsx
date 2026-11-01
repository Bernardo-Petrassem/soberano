import type { OpeningFilterValue } from "@/lib/chess/corpus";

export const OPENING_FAMILIES = ["Flanco", "Semiabertas", "Abertas", "Fechadas", "Indianas"];

export function OpeningFilterForm({
  draft,
  active,
  onDraft,
  onApply,
  onClear,
}: {
  draft: OpeningFilterValue;
  active: boolean;
  onDraft: (next: OpeningFilterValue) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        onApply();
      }}
    >
      <p className="text-sm text-muted">Filtro</p>
      <label className="block text-sm">
        Tipo
        <select className="field mt-1" value={draft.family} onChange={(e) => onDraft({ ...draft, family: e.target.value })}>
          <option value="">Todos</option>
          {OPENING_FAMILIES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Lances na abertura
        <input
          className="field mt-1"
          placeholder="Nf3 d5"
          value={draft.moves}
          onChange={(e) => onDraft({ ...draft, moves: e.target.value })}
        />
      </label>
      <label className="block text-sm">
        Primeiro lance
        <input
          className="field mt-1"
          placeholder="e4"
          value={draft.first}
          onChange={(e) => onDraft({ ...draft, first: e.target.value })}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn">
          Aplicar
        </button>
        <button type="button" className="btn" onClick={onClear}>
          Limpar
        </button>
      </div>
      {active && <p className="text-xs text-brass">Filtro aplicado.</p>}
    </form>
  );
}

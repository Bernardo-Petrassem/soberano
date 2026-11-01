import { useEffect, useState } from "react";
import { useLab, type GroupColor, type LabGroup, type LabTab } from "@/lib/chess/lab";

const COLORS: GroupColor[] = ["brass", "felt", "blood", "good"];

type Menu =
  | { kind: "tab"; id: string; x: number; y: number }
  | { kind: "group"; id: string; x: number; y: number };

function chunks(tabs: LabTab[], groups: LabGroup[]) {
  const out: ({ kind: "tab"; tab: LabTab } | { kind: "group"; group: LabGroup; tabs: LabTab[] })[] = [];
  const seen = new Set<string>();
  for (const tab of tabs) {
    if (!tab.groupId) {
      out.push({ kind: "tab", tab });
      continue;
    }
    if (seen.has(tab.groupId)) continue;
    seen.add(tab.groupId);
    const group = groups.find((item) => item.id === tab.groupId);
    if (!group) {
      out.push({ kind: "tab", tab });
      continue;
    }
    out.push({ kind: "group", group, tabs: tabs.filter((item) => item.groupId === group.id) });
  }
  return out;
}

function TabButton({ tab, active }: { tab: LabTab; active: boolean }) {
  const activate = useLab((s) => s.activate);
  const close = useLab((s) => s.close);
  const pair = useLab((s) => s.pair);
  return (
    <div
      className={active ? "tab is-active" : "tab"}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/tab", tab.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/tab");
        if (id) pair(id, tab.id);
      }}
    >
      <button type="button" className="tab-label" onClick={() => activate(tab.id)}>
        {tab.title}
      </button>
      <button type="button" className="tab-x" aria-label={`Fechar ${tab.title}`} onClick={() => close(tab.id)}>
        ×
      </button>
    </div>
  );
}

export function TabStrip() {
  const tabs = useLab((s) => s.tabs);
  const groups = useLab((s) => s.groups);
  const activeId = useLab((s) => s.activeId);
  const stripHidden = useLab((s) => s.stripHidden);
  const setStripHidden = useLab((s) => s.setStripHidden);
  const addBoard = useLab((s) => s.addBoard);
  const createGroup = useLab((s) => s.createGroup);
  const joinGroup = useLab((s) => s.joinGroup);
  const ungroup = useLab((s) => s.ungroup);
  const toggleGroup = useLab((s) => s.toggleGroup);
  const renameGroup = useLab((s) => s.renameGroup);
  const paintGroup = useLab((s) => s.paintGroup);
  const dissolveGroup = useLab((s) => s.dissolveGroup);
  const closeGroup = useLab((s) => s.closeGroup);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);

  const open = menu?.kind === "group" ? groups.find((group) => group.id === menu.id) : null;

  return (
    <div>
      <div className="tab-bar">
      <button
        type="button"
        className="tab-eye"
        aria-pressed={!stripHidden}
        aria-label={stripHidden ? "Mostrar abas" : "Ocultar abas"}
        onClick={() => setStripHidden(!stripHidden)}
      />
      {!stripHidden && (
        <div className="tab-strip" onDragOver={(e) => e.preventDefault()}>
          {chunks(tabs, groups).map((chunk) =>
            chunk.kind === "tab" ? (
              <div
                key={chunk.tab.id}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenu({ kind: "tab", id: chunk.tab.id, x: e.clientX, y: e.clientY });
                }}
              >
                <TabButton tab={chunk.tab} active={chunk.tab.id === activeId} />
              </div>
            ) : (
              <div
                key={chunk.group.id}
                className={`tab-group is-${chunk.group.color}${chunk.group.collapsed ? " is-collapsed" : ""}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/tab");
                  if (id) joinGroup(id, chunk.group.id);
                }}
              >
                <button
                  type="button"
                  className="tab-group-label"
                  aria-expanded={!chunk.group.collapsed}
                  onClick={() => toggleGroup(chunk.group.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setDraft(chunk.group.name);
                    setMenu({ kind: "group", id: chunk.group.id, x: e.clientX, y: e.clientY });
                  }}
                >
                  <span className={`tab-dot is-${chunk.group.color}`} />
                  {chunk.group.name}
                  {chunk.group.collapsed && <span className="tab-count">{chunk.tabs.length}</span>}
                </button>
                {!chunk.group.collapsed &&
                  chunk.tabs.map((tab) => (
                    <div
                      key={tab.id}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setMenu({ kind: "tab", id: tab.id, x: e.clientX, y: e.clientY });
                      }}
                    >
                      <TabButton tab={tab} active={tab.id === activeId} />
                    </div>
                  ))}
              </div>
            ),
          )}
          <button type="button" className="tab-add" aria-label="Novo tabuleiro" onClick={() => addBoard()}>
            +
          </button>
        </div>
      )}
      </div>
      {menu && (
        <div className="tab-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          {menu.kind === "tab" ? (
            <>
              <button type="button" className="tab-menu-item" onClick={() => { createGroup(menu.id); setMenu(null); }}>
                Novo grupo
              </button>
              {groups.map((group) => (
                <button key={group.id} type="button" className="tab-menu-item" onClick={() => { joinGroup(menu.id, group.id); setMenu(null); }}>
                  Adicionar a {group.name}
                </button>
              ))}
              <button type="button" className="tab-menu-item" onClick={() => { ungroup(menu.id); setMenu(null); }}>
                Tirar do grupo
              </button>
            </>
          ) : (
            open && (
              <>
                <label className="block text-sm text-muted">
                  Nome
                  <input className="field mt-1" value={draft} onChange={(e) => { setDraft(e.target.value); renameGroup(open.id, e.target.value); }} />
                </label>
                <div className="mt-2 flex gap-2">
                  {COLORS.map((color) => (
                    <button key={color} type="button" className={`tab-dot is-${color} tab-swatch`} aria-label={color} onClick={() => paintGroup(open.id, color)} />
                  ))}
                </div>
                <button type="button" className="tab-menu-item mt-2" onClick={() => { dissolveGroup(open.id); setMenu(null); }}>
                  Desagrupar
                </button>
                <button type="button" className="tab-menu-item" onClick={() => { closeGroup(open.id); setMenu(null); }}>
                  Fechar grupo
                </button>
              </>
            )
          )}
        </div>
      )}
      {!stripHidden && (
        <p className="mt-2 text-xs text-muted">Botão direito numa aba para a agrupar. Clique no nome do grupo para o recolher. Arraste uma aba para outra para as juntar.</p>
      )}
    </div>
  );
}

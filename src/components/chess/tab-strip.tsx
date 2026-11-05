import { useEffect, useState, type ReactNode } from "react";
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

function TabButton({ tab, active, renaming, onRename }: { tab: LabTab; active: boolean; renaming: boolean; onRename: (id: string | null) => void }) {
  const activate = useLab((s) => s.activate);
  const close = useLab((s) => s.close);
  const reorder = useLab((s) => s.reorder);
  const rename = useLab((s) => s.rename);
  const [value, setValue] = useState(tab.title);
  useEffect(() => setValue(tab.title), [tab.title]);
  return (
    <div
      className={active ? "tab is-active" : "tab"}
      draggable={!renaming}
      onDragStart={(e) => e.dataTransfer.setData("text/tab", tab.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = e.dataTransfer.getData("text/tab");
        if (id) reorder(id, tab.id);
      }}
    >
      {renaming ? (
        <input
          className="tab-label w-28 bg-transparent"
          autoFocus
          aria-label="Nome da aba"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            rename(tab.id, value);
            onRename(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setValue(tab.title);
              onRename(null);
            }
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <button type="button" className="tab-label" onClick={() => activate(tab.id)} onDoubleClick={() => onRename(tab.id)}>
          {tab.title}
        </button>
      )}
      <button type="button" className="tab-x" aria-label={`Fechar ${tab.title}`} onClick={() => close(tab.id)}>
        ×
      </button>
    </div>
  );
}

export function TabStrip({ menu }: { menu?: ReactNode }) {
  const tabs = useLab((s) => s.tabs);
  const groups = useLab((s) => s.groups);
  const activeId = useLab((s) => s.activeId);
  const focus = useLab((s) => s.focus);
  const addBoard = useLab((s) => s.addBoard);
  const createGroup = useLab((s) => s.createGroup);
  const joinGroup = useLab((s) => s.joinGroup);
  const ungroup = useLab((s) => s.ungroup);
  const toggleGroup = useLab((s) => s.toggleGroup);
  const renameGroup = useLab((s) => s.renameGroup);
  const paintGroup = useLab((s) => s.paintGroup);
  const dissolveGroup = useLab((s) => s.dissolveGroup);
  const closeGroup = useLab((s) => s.closeGroup);
  const [menuPos, setMenuPos] = useState<Menu | null>(null);
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);

  useEffect(() => {
    if (!menuPos) return;
    const close = () => setMenuPos(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuPos]);

  const open = menuPos?.kind === "group" ? groups.find((group) => group.id === menuPos.id) : null;

  if (focus) return <div>{menu}</div>;

  return (
    <div>
      <div className="tab-bar">
        {menu}
        <div className="tab-strip" onDragOver={(e) => e.preventDefault()}>
          {chunks(tabs, groups).map((chunk) =>
            chunk.kind === "tab" ? (
              <div
                key={chunk.tab.id}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenuPos({ kind: "tab", id: chunk.tab.id, x: e.clientX, y: e.clientY });
                }}
              >
                <TabButton tab={chunk.tab} active={chunk.tab.id === activeId} renaming={renaming === chunk.tab.id} onRename={setRenaming} />
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
                    setMenuPos({ kind: "group", id: chunk.group.id, x: e.clientX, y: e.clientY });
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
                        setMenuPos({ kind: "tab", id: tab.id, x: e.clientX, y: e.clientY });
                      }}
                    >
                      <TabButton tab={tab} active={tab.id === activeId} renaming={renaming === tab.id} onRename={setRenaming} />
                    </div>
                  ))}
              </div>
            ),
          )}
          <button type="button" className="tab-add" aria-label="Novo tabuleiro" onClick={() => addBoard()}>
            +
          </button>
        </div>
      </div>
      {menuPos && (
        <div className="tab-menu" style={{ left: menuPos.x, top: menuPos.y }} onClick={(e) => e.stopPropagation()}>
          {menuPos.kind === "tab" ? (
            <>
              <button type="button" className="tab-menu-item" onClick={() => { setRenaming(menuPos.id); setMenuPos(null); }}>
                Renomear
              </button>
              <button type="button" className="tab-menu-item" onClick={() => { createGroup(menuPos.id); setMenuPos(null); }}>
                Novo grupo
              </button>
              {groups.map((group) => (
                <button key={group.id} type="button" className="tab-menu-item" onClick={() => { joinGroup(menuPos.id, group.id); setMenuPos(null); }}>
                  Adicionar a {group.name}
                </button>
              ))}
              <button type="button" className="tab-menu-item" onClick={() => { ungroup(menuPos.id); setMenuPos(null); }}>
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
                <button type="button" className="tab-menu-item mt-2" onClick={() => { dissolveGroup(open.id); setMenuPos(null); }}>
                  Desagrupar
                </button>
                <button type="button" className="tab-menu-item" onClick={() => { closeGroup(open.id); setMenuPos(null); }}>
                  Fechar grupo
                </button>
              </>
            )
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-muted">Arraste com o botão esquerdo para mudar a ordem. Duplo clique, ou o botão direito, nomeia a aba. O botão direito também agrupa.</p>
    </div>
  );
}

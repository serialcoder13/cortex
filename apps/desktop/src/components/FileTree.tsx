import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSettingsStore } from "@cortex/store";
import { storage, type DocumentMeta } from "../lib/storage";
import { useTabStore } from "../stores/tabs";
import facebrainSvg from "../assets/facebrain.svg";
import type { ActivityView } from "./ActivityBar";

// ---------------------------------------------------------------------------
// Mini Calendar Widget
// ---------------------------------------------------------------------------

const MINI_DAY_NAMES = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Monday-based first day: 0=Monday, 6=Sunday */
function firstDayOfWeekMon(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function isoWeekNumber(year: number, month: number, day: number): number {
  const date = new Date(year, month, day);
  const tmp = new Date(date.valueOf());
  tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
  const week1 = new Date(tmp.getFullYear(), 0, 4);
  return (
    1 + Math.round(((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  );
}

function dailyNotePath(year: number, month: number, day: number): string {
  return `dates/${year}-${pad2(month + 1)}/${pad2(day)}.md`;
}

function MiniCalendar({ existingPaths }: { existingPaths: Set<string> }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const openTab = useTabStore((s) => s.openTab);

  const goToPrevMonth = useCallback(() => {
    setMonth((m) => {
      if (m === 0) { setYear((y) => y - 1); return 11; }
      return m - 1;
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setMonth((m) => {
      if (m === 11) { setYear((y) => y + 1); return 0; }
      return m + 1;
    });
  }, []);

  const handleDayClick = useCallback(
    async (day: number) => {
      const path = dailyNotePath(year, month, day);
      if (existingPaths.has(path)) {
        openTab(path);
        return;
      }
      const isToday =
        year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
      try {
        if (isToday) {
          const createdPath = await storage.createDailyNote();
          openTab(createdPath);
        } else {
          const title = `${MONTH_NAMES[month]} ${day}, ${year}`;
          const content = `---\ntitle: "${title}"\ndoc_type: daily\ncreated: ${year}-${pad2(month + 1)}-${pad2(day)}T00:00:00Z\n---\n\n# ${title}\n\n`;
          await storage.writeDocument(path, content);
          openTab(path);
        }
      } catch (err) {
        console.error("Failed to create daily note:", err);
      }
    },
    [year, month, existingPaths, openTab],
  );

  const totalDays = daysInMonth(year, month);
  const startDay = firstDayOfWeekMon(year, month);

  // Build rows with week numbers
  const rows: { weekNum: number; cells: (number | null)[] }[] = [];
  let dayCounter = 1;
  let currentRow: (number | null)[] = [];

  // Leading empty cells
  for (let i = 0; i < startDay; i++) currentRow.push(null);
  for (let i = startDay; i < 7; i++) {
    currentRow.push(dayCounter++);
  }
  rows.push({ weekNum: isoWeekNumber(year, month, 1), cells: currentRow });

  while (dayCounter <= totalDays) {
    currentRow = [];
    const weekStartDay = dayCounter;
    for (let i = 0; i < 7 && dayCounter <= totalDays; i++) {
      currentRow.push(dayCounter++);
    }
    while (currentRow.length < 7) currentRow.push(null);
    rows.push({ weekNum: isoWeekNumber(year, month, weekStartDay), cells: currentRow });
  }

  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const hasNote = (day: number) =>
    existingPaths.has(dailyNotePath(year, month, day));

  return (
    <div className="px-3 py-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {MONTH_NAMES[month]} {year}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goToPrevMonth}
            className="w-6 h-6 flex items-center justify-center rounded hover:opacity-80"
            style={{ color: "var(--text-tertiary)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={goToNextMonth}
            className="w-6 h-6 flex items-center justify-center rounded hover:opacity-80"
            style={{ color: "var(--text-tertiary)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 6 15 12 9 18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid gap-0" style={{ gridTemplateColumns: "28px repeat(7, 1fr)" }}>
        <span />
        {MINI_DAY_NAMES.map((d) => (
          <span key={d} className="text-center text-xs py-1" style={{ color: "var(--text-muted)" }}>
            {d}
          </span>
        ))}
      </div>

      {/* Rows */}
      {rows.map((row) => (
        <div
          key={`w-${row.weekNum}`}
          className="grid gap-0"
          style={{ gridTemplateColumns: "28px repeat(7, 1fr)" }}
        >
          <span className="text-[10px] flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
            W{row.weekNum}
          </span>
          {row.cells.map((day, ci) => (
            <div key={`${row.weekNum}-${ci}`} className="flex items-center justify-center py-0.5">
              {day !== null ? (
                <button
                  type="button"
                  onClick={() => handleDayClick(day)}
                  className="relative w-7 h-7 flex items-center justify-center rounded-full text-xs transition-colors"
                  style={{
                    backgroundColor: isToday(day) ? "var(--accent)" : "transparent",
                    color: isToday(day) ? "#fff" : "var(--text-secondary)",
                  }}
                >
                  {day}
                  {hasNote(day) && !isToday(day) && (
                    <span
                      className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: "var(--accent)" }}
                    />
                  )}
                </button>
              ) : (
                <span className="w-7 h-7" />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tree Node Types
// ---------------------------------------------------------------------------

interface TreeFolder {
  name: string;
  path: string;
  children: TreeNode[];
}

interface TreeFile {
  name: string;
  path: string;
  doc: DocumentMeta;
}

type TreeNode = TreeFolder | TreeFile;

function isFolder(node: TreeNode): node is TreeFolder {
  return "children" in node;
}

function buildTree(docs: DocumentMeta[]): TreeNode[] {
  const root: TreeFolder = { name: "", path: "", children: [] };

  // Known section names for ordering
  const sectionOrder: Record<string, number> = {
    dates: 0,
    docs: 1,
    templates: 2,
  };

  for (const doc of docs) {
    const parts = doc.path.split("/");
    let current = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i] ?? "";
      let folder = current.children.find(
        (c): c is TreeFolder => isFolder(c) && c.name === part,
      );
      if (!folder) {
        folder = { name: part, path: parts.slice(0, i + 1).join("/"), children: [] };
        current.children.push(folder);
      }
      current = folder;
    }

    const filename = parts[parts.length - 1] ?? "";
    current.children.push({ name: filename, path: doc.path, doc });
  }

  // Sort top level by section order, then alphabetical
  root.children.sort((a, b) => {
    const oa = sectionOrder[a.name] ?? 99;
    const ob = sectionOrder[b.name] ?? 99;
    if (oa !== ob) return oa - ob;
    return a.name.localeCompare(b.name);
  });

  return root.children;
}

/** Rename known top-level folders for display. */
function displayFolderName(name: string, depth: number): string {
  if (depth === 0) {
    if (name === "dates") return "Daily Journal";
    if (name === "docs") return "Documents";
    if (name === "templates") return "Templates";
  }
  return name;
}

/** Filter tree to only show docs (exclude dates/ for documents view). */
function filterDocsOnly(nodes: TreeNode[]): TreeNode[] {
  return nodes.filter((n) => n.name !== "dates");
}

/** Collect all file paths in a tree recursively. */
function collectFilePaths(nodes: TreeNode[]): string[] {
  const paths: string[] = [];
  for (const n of nodes) {
    if (isFolder(n)) {
      paths.push(...collectFilePaths(n.children));
    } else {
      paths.push(n.path);
    }
  }
  return paths;
}

// ---------------------------------------------------------------------------
// Tree Item Component
// ---------------------------------------------------------------------------

/** Inline rename input shown in the tree. */
function InlineInput({
  defaultValue,
  onCommit,
  onCancel,
  depth,
}: {
  defaultValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  depth: number;
}) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    // Small timeout so the input is mounted before focusing.
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const commit = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    const trimmed = inputRef.current?.value.trim() ?? "";
    if (trimmed && trimmed !== defaultValue) {
      onCommit(trimmed);
    } else {
      onCancel();
    }
  }, [defaultValue, onCommit, onCancel]);

  const cancel = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCancel();
  }, [onCancel]);

  return (
    <div
      className="flex items-center py-0.5 pr-1"
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { e.preventDefault(); cancel(); }
        }}
        className="flex-1 text-xs px-1 py-0.5 rounded outline-none"
        style={{
          backgroundColor: "var(--bg-tertiary)",
          color: "var(--text-primary)",
          border: "1px solid var(--accent)",
        }}
      />
    </div>
  );
}

interface TreeItemProps {
  node: TreeNode;
  depth: number;
  activePath: string | null;
  expandedPaths: Set<string>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (path: string, title: string) => void;
  onDeleteFile?: (path: string) => void;
  onDeleteFolder?: (path: string, children: TreeNode[]) => void;
  onCreateSubfolder?: (parentPath: string) => void;
  onMoveFile?: (filePath: string, targetFolderPath: string) => void;
  onRenameFile?: (oldPath: string, newName: string) => void;
  onRenameFolder?: (oldFolderPath: string, newName: string) => void;
  /** Whether this is the top-level "docs" folder (no delete allowed). */
  isTopLevel?: boolean;
}

function TreeItem({
  node,
  depth,
  activePath,
  expandedPaths,
  onToggleFolder,
  onSelectFile,
  onDeleteFile,
  onDeleteFolder,
  onCreateSubfolder,
  onMoveFile,
  onRenameFile,
  onRenameFolder,
  isTopLevel,
}: TreeItemProps) {
  const [dragOver, setDragOver] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const dragCounterRef = useRef(0);

  if (isFolder(node)) {
    const expanded = expandedPaths.has(node.path);

    // Folder rename inline input
    if (renaming && !isTopLevel) {
      return (
        <InlineInput
          defaultValue={node.name}
          depth={depth}
          onCommit={(newName) => {
            setRenaming(false);
            onRenameFolder?.(node.path, newName);
          }}
          onCancel={() => setRenaming(false)}
        />
      );
    }

    return (
      <div>
        <div
          className="group flex items-center w-full py-0.5 pr-1 text-xs rounded transition-colors"
          style={{
            paddingLeft: `${depth * 16 + 8}px`,
            color: "var(--text-secondary)",
            backgroundColor: dragOver ? "var(--accent-muted)" : "transparent",
          }}
          onMouseEnter={(e) => {
            if (!dragOver) e.currentTarget.style.backgroundColor = "var(--bg-hover)";
          }}
          onMouseLeave={(e) => {
            if (!dragOver) e.currentTarget.style.backgroundColor = "transparent";
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            dragCounterRef.current++;
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDragLeave={() => {
            dragCounterRef.current--;
            if (dragCounterRef.current <= 0) {
              dragCounterRef.current = 0;
              setDragOver(false);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            dragCounterRef.current = 0;
            setDragOver(false);
            const filePath = e.dataTransfer.getData("text/x-cortex-path");
            if (filePath && onMoveFile) {
              onMoveFile(filePath, node.path);
            }
          }}
        >
          <button
            type="button"
            onClick={() => onToggleFolder(node.path)}
            onDoubleClick={(e) => {
              if (!isTopLevel) {
                e.stopPropagation();
                setRenaming(true);
              }
            }}
            className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className={`flex-shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
            >
              <polyline points="9 6 15 12 9 18" />
            </svg>
            <span className="truncate font-medium">
              {displayFolderName(node.name, depth)}
            </span>
          </button>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* New subfolder button */}
            {onCreateSubfolder && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateSubfolder(node.path);
                }}
                className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded cursor-pointer"
                style={{ color: "var(--text-muted)" }}
                title="New folder"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  <line x1="12" y1="11" x2="12" y2="17" />
                  <line x1="9" y1="14" x2="15" y2="14" />
                </svg>
              </button>
            )}
            {/* Rename folder button (not on top-level docs) */}
            {onRenameFolder && !isTopLevel && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenaming(true);
                }}
                className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded cursor-pointer"
                style={{ color: "var(--text-muted)" }}
                title="Rename folder"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
              </button>
            )}
            {/* Delete folder button (not on top-level docs) */}
            {onDeleteFolder && !isTopLevel && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFolder(node.path, node.children);
                }}
                className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded cursor-pointer"
                style={{ color: "var(--text-muted)" }}
                title="Delete folder"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </button>
            )}
          </div>
        </div>
        {expanded && (
          <div>
            {node.children
              .sort((a, b) => {
                const aF = isFolder(a) ? 0 : 1;
                const bF = isFolder(b) ? 0 : 1;
                if (aF !== bF) return aF - bF;
                return a.name.localeCompare(b.name);
              })
              .map((child) => (
                <TreeItem
                  key={child.path}
                  node={child}
                  depth={depth + 1}
                  activePath={activePath}
                  expandedPaths={expandedPaths}
                  onToggleFolder={onToggleFolder}
                  onSelectFile={onSelectFile}
                  onDeleteFile={onDeleteFile}
                  onDeleteFolder={onDeleteFolder}
                  onCreateSubfolder={onCreateSubfolder}
                  onMoveFile={onMoveFile}
                  onRenameFile={onRenameFile}
                  onRenameFolder={onRenameFolder}
                />
              ))}
          </div>
        )}
      </div>
    );
  }

  // File node
  const isActive = activePath === node.path;
  const displayName = node.name.replace(/\.md$/, "");

  if (renaming) {
    return (
      <InlineInput
        defaultValue={displayName}
        depth={depth}
        onCommit={(newName) => {
          setRenaming(false);
          onRenameFile?.(node.path, newName);
        }}
        onCancel={() => setRenaming(false)}
      />
    );
  }

  return (
    <div
      className="group flex items-center w-full py-0.5 pr-1 text-xs rounded transition-colors"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/x-cortex-path", node.path);
        e.dataTransfer.effectAllowed = "move";
      }}
      style={{
        paddingLeft: `${depth * 16 + 8}px`,
        backgroundColor: isActive ? "var(--accent-muted)" : "transparent",
        color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <button
        type="button"
        draggable={false}
        onClick={() => onSelectFile(node.path, node.doc.title || displayName)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setRenaming(true);
        }}
        className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="flex-shrink-0"
          style={{ color: "var(--text-muted)" }}
        >
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <span className="truncate">{displayName}</span>
      </button>
      {onDeleteFile && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDeleteFile(node.path);
          }}
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          style={{ color: "var(--text-muted)" }}
          title="Delete note"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bottom bar (shared between both panels)
// ---------------------------------------------------------------------------

function VaultBottomBar() {
  const vaultPath = useSettingsStore((s) => s.vaultPath);

  return (
    <>
      <div style={{ borderTop: "1px solid var(--border-primary)" }} />
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ color: "var(--text-secondary)" }}
      >
        <img src={facebrainSvg} alt="" className="w-6 h-6 rounded-md" />
        <span className="text-xs font-medium flex-1 truncate">{vaultPath?.split("/").pop() ?? "Vault"}</span>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sidebar shell
// ---------------------------------------------------------------------------

function SidebarShell({ children }: { children: React.ReactNode }) {
  return (
    <aside
      className="w-60 flex flex-col flex-shrink-0 overflow-hidden"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderRight: "1px solid var(--border-primary)",
      }}
    >
      {children}
      <VaultBottomBar />
    </aside>
  );
}

// ---------------------------------------------------------------------------
// FileTree Component (accepts view to switch layout)
// ---------------------------------------------------------------------------

export function FileTree({ view = "calendar" }: { view?: ActivityView }) {
  const [docs, setDocs] = useState<DocumentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    new Set(["dates", "docs", "templates"]),
  );

  const openTab = useTabStore((s) => s.openTab);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const tabs = useTabStore((s) => s.tabs);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activePath = activeTab?.path ?? null;

  // Existing paths for calendar dots
  const existingPaths = useMemo(() => new Set(docs.map((d) => d.path)), [docs]);

  const refreshDocs = useCallback(async () => {
    try {
      const allDocs = await storage.listDocuments();
      setDocs(allDocs);
    } catch (err) {
      console.error("Failed to list documents:", err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const allDocs = await storage.listDocuments();
        if (!cancelled) setDocs(allDocs);
      } catch (err) {
        console.error("Failed to list documents:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Refresh when documents change (e.g. after rename).
  useEffect(() => {
    const handler = () => refreshDocs();
    globalThis.addEventListener("cortex:docs-changed", handler);
    return () => globalThis.removeEventListener("cortex:docs-changed", handler);
  }, [refreshDocs]);

  const tree = useMemo(() => buildTree(docs), [docs]);

  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return tree;
    const q = searchQuery.toLowerCase();

    function filterNode(node: TreeNode): TreeNode | null {
      if (isFolder(node)) {
        const filtered = node.children.map(filterNode).filter(Boolean) as TreeNode[];
        if (filtered.length > 0) return { ...node, children: filtered };
        return null;
      }
      if (
        node.name.toLowerCase().includes(q) ||
        node.doc.title.toLowerCase().includes(q)
      ) {
        return node;
      }
      return null;
    }

    return tree.map(filterNode).filter(Boolean) as TreeNode[];
  }, [tree, searchQuery]);

  const handleToggleFolder = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleSelectFile = useCallback(
    (path: string, title: string) => {
      openTab(path, title);
    },
    [openTab],
  );

  const handleCreateNote = useCallback(async () => {
    const id = Date.now();
    const path = `docs/untitled-${id}.md`;
    const content = `---\ntitle: "Untitled"\ncreated: ${new Date().toISOString()}\n---\n\n`;
    try {
      await storage.writeDocument(path, content);
      await refreshDocs();
      openTab(path, "Untitled");
    } catch (err) {
      console.error("Failed to create note:", err);
    }
  }, [refreshDocs, openTab]);

  // State for inline "new folder" input.
  const [newFolderParent, setNewFolderParent] = useState<string | null>(null);

  const handleStartCreateFolder = useCallback((parentPath?: string) => {
    const base = parentPath ?? "docs";
    setNewFolderParent(base);
    // Expand the parent so the input is visible.
    setExpandedPaths((prev) => new Set([...prev, base]));
  }, []);

  const handleCommitCreateFolder = useCallback(async (name: string) => {
    if (!newFolderParent) return;
    const folderName = name.trim().replaceAll(/[^\w\s-]/g, "").replaceAll(/^\s+|\s+$/g, "");
    if (!folderName) { setNewFolderParent(null); return; }
    const folderPath = `${newFolderParent}/${folderName}`;
    // Create an initial untitled note inside the folder so the folder appears in the listing.
    const id = Date.now();
    const path = `${folderPath}/untitled-${id}.md`;
    const content = `---\ntitle: "Untitled"\ncreated: ${new Date().toISOString()}\n---\n\n`;
    try {
      await storage.writeDocument(path, content);
      await refreshDocs();
      setExpandedPaths((prev) => new Set([...prev, folderPath]));
    } catch (err) {
      console.error("Failed to create folder:", err);
    }
    setNewFolderParent(null);
  }, [newFolderParent, refreshDocs]);

  const handleRenameFile = useCallback(async (oldPath: string, newName: string) => {
    const slug = newName.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-+|-+$/g, "");
    if (!slug) return;
    const parts = oldPath.split("/");
    const dir = parts.slice(0, -1).join("/");
    const newPath = dir ? `${dir}/${slug}.md` : `${slug}.md`;
    if (newPath === oldPath) return;
    try {
      const content = await storage.readDocument(oldPath);
      await storage.writeDocument(newPath, content);
      await storage.deleteDocument(oldPath);
      const tab = useTabStore.getState().tabs.find((t) => t.path === oldPath);
      if (tab) {
        useTabStore.getState().updateTabPath(tab.id, newPath);
        useTabStore.getState().updateTabTitle(tab.id, newName);
      }
      await refreshDocs();
    } catch (err) {
      console.error("Failed to rename file:", err);
    }
  }, [refreshDocs]);

  const handleRenameFolder = useCallback(async (oldFolderPath: string, newName: string) => {
    const cleanName = newName.trim().replaceAll(/[^\w\s-]/g, "").replaceAll(/^\s+|\s+$/g, "");
    if (!cleanName) return;
    const parentDir = oldFolderPath.split("/").slice(0, -1).join("/");
    const newFolderPath = parentDir ? `${parentDir}/${cleanName}` : cleanName;
    if (newFolderPath === oldFolderPath) return;
    try {
      // Move all files from old folder to new folder.
      const allDocs = await storage.listDocuments();
      const folderDocs = allDocs.filter((d) => d.path.startsWith(oldFolderPath + "/"));
      for (const doc of folderDocs) {
        const relativePath = doc.path.slice(oldFolderPath.length);
        const newPath = newFolderPath + relativePath;
        const content = await storage.readDocument(doc.path);
        await storage.writeDocument(newPath, content);
        await storage.deleteDocument(doc.path);
        // Update open tab paths.
        const tab = useTabStore.getState().tabs.find((t) => t.path === doc.path);
        if (tab) useTabStore.getState().updateTabPath(tab.id, newPath);
      }
      // Update expanded paths.
      setExpandedPaths((prev) => {
        const next = new Set<string>();
        for (const p of prev) {
          if (p === oldFolderPath) next.add(newFolderPath);
          else if (p.startsWith(oldFolderPath + "/")) next.add(newFolderPath + p.slice(oldFolderPath.length));
          else next.add(p);
        }
        return next;
      });
      await refreshDocs();
    } catch (err) {
      console.error("Failed to rename folder:", err);
    }
  }, [refreshDocs]);

  const handleDeleteFile = useCallback(async (path: string) => {
    if (!globalThis.confirm(`Delete "${path.split("/").pop()}"?`)) return;
    try {
      await storage.deleteDocument(path);
      const tab = useTabStore.getState().tabs.find((t) => t.path === path);
      if (tab) useTabStore.getState().closeTab(tab.id);
      await refreshDocs();
    } catch (err) {
      console.error("Failed to delete file:", err);
    }
  }, [refreshDocs]);

  const handleDeleteFolder = useCallback(async (folderPath: string, children: TreeNode[]) => {
    const paths = collectFilePaths(children);
    const displayName = folderPath.split("/").pop() ?? folderPath;
    const confirmed = await new Promise<boolean>((resolve) => {
      resolve(globalThis.confirm(`Delete folder "${displayName}" and ${paths.length} file(s)?`));
    });
    if (!confirmed) return;
    try {
      for (const p of paths) {
        await storage.deleteDocument(p);
        const tab = useTabStore.getState().tabs.find((t) => t.path === p);
        if (tab) useTabStore.getState().closeTab(tab.id);
      }
      await refreshDocs();
    } catch (err) {
      console.error("Failed to delete folder:", err);
    }
  }, [refreshDocs]);

  const handleMoveFile = useCallback(async (filePath: string, targetFolderPath: string) => {
    const fileName = filePath.split("/").pop();
    if (!fileName) return;
    const newPath = `${targetFolderPath}/${fileName}`;
    if (newPath === filePath) return;
    try {
      const content = await storage.readDocument(filePath);
      await storage.writeDocument(newPath, content);
      await storage.deleteDocument(filePath);
      // Update the tab path if this file is open.
      const tab = useTabStore.getState().tabs.find((t) => t.path === filePath);
      if (tab) useTabStore.getState().updateTabPath(tab.id, newPath);
      await refreshDocs();
    } catch (err) {
      console.error("Failed to move file:", err);
    }
  }, [refreshDocs]);

  // ---- Calendar view: calendar at top, no file browser ----
  if (view === "calendar") {
    return (
      <SidebarShell>
        <MiniCalendar existingPaths={existingPaths} />
        <div style={{ borderTop: "1px solid var(--border-primary)" }} />
        <div className="flex-1" />
      </SidebarShell>
    );
  }

  // ---- Documents view: search + toolbar + file tree ----
  return (
    <SidebarShell>
      {/* Search + action buttons */}
      <div className="px-2 pt-2 pb-1 flex items-center gap-1">
        <div className="relative flex-1">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--text-muted)" }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full py-1 pl-7 pr-2 text-xs rounded outline-none"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-primary)",
            }}
          />
        </div>
        {/* New note */}
        <button
          type="button"
          onClick={handleCreateNote}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded transition-colors"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.backgroundColor = "var(--bg-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
          title="New note"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
        </button>
        {/* New folder */}
        <button
          type="button"
          onClick={() => handleStartCreateFolder()}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded transition-colors"
          style={{ color: "var(--text-muted)" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.backgroundColor = "var(--bg-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
          title="New folder"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading ? (
          <div className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
            Loading...
          </div>
        ) : filteredTree.length === 0 && !newFolderParent ? (
          <div className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
            {searchQuery ? "No matching files" : "No documents yet"}
          </div>
        ) : (
          <>
            {filterDocsOnly(filteredTree).map((node) => (
              <TreeItem
                key={node.path || node.name}
                node={node}
                depth={0}
                activePath={activePath}
                expandedPaths={expandedPaths}
                onToggleFolder={handleToggleFolder}
                onSelectFile={handleSelectFile}
                onDeleteFile={handleDeleteFile}
                onDeleteFolder={handleDeleteFolder}
                onCreateSubfolder={handleStartCreateFolder}
                onMoveFile={handleMoveFile}
                onRenameFile={handleRenameFile}
                onRenameFolder={handleRenameFolder}
                isTopLevel={node.name === "docs"}
              />
            ))}
            {/* Inline input for new folder */}
            {newFolderParent && (
              <InlineInput
                defaultValue=""
                depth={newFolderParent === "docs" ? 1 : 2}
                onCommit={handleCommitCreateFolder}
                onCancel={() => setNewFolderParent(null)}
              />
            )}
          </>
        )}
      </div>
    </SidebarShell>
  );
}

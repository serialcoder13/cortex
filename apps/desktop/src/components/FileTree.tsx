import { useState, useEffect, useCallback, useMemo } from "react";
import { storage, type DocumentMeta } from "../lib/storage";
import { useTabStore } from "../stores/tabs";
import facebrainSvg from "../assets/facebrain.svg";

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
    <div className="px-2 py-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5 px-1">
        <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
          {MONTH_NAMES[month]} {year}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={goToPrevMonth}
            className="w-5 h-5 flex items-center justify-center rounded hover:opacity-80"
            style={{ color: "var(--text-tertiary)" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={goToNextMonth}
            className="w-5 h-5 flex items-center justify-center rounded hover:opacity-80"
            style={{ color: "var(--text-tertiary)" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 6 15 12 9 18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Day-of-week headers */}
      <div className="grid gap-0" style={{ gridTemplateColumns: "24px repeat(7, 1fr)" }}>
        <span />
        {MINI_DAY_NAMES.map((d) => (
          <span key={d} className="text-center text-[10px] py-0.5" style={{ color: "var(--text-muted)" }}>
            {d}
          </span>
        ))}
      </div>

      {/* Rows */}
      {rows.map((row) => (
        <div
          key={`w-${row.weekNum}`}
          className="grid gap-0"
          style={{ gridTemplateColumns: "24px repeat(7, 1fr)" }}
        >
          <span className="text-[9px] flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
            W{row.weekNum}
          </span>
          {row.cells.map((day, ci) => (
            <div key={`${row.weekNum}-${ci}`} className="flex items-center justify-center">
              {day !== null ? (
                <button
                  type="button"
                  onClick={() => handleDayClick(day)}
                  className="relative w-5 h-5 flex items-center justify-center rounded-full text-[10px] transition-colors"
                  style={{
                    backgroundColor: isToday(day) ? "var(--accent)" : "transparent",
                    color: isToday(day) ? "#fff" : "var(--text-secondary)",
                  }}
                >
                  {day}
                  {hasNote(day) && !isToday(day) && (
                    <span
                      className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                      style={{ backgroundColor: "var(--accent)" }}
                    />
                  )}
                </button>
              ) : (
                <span className="w-5 h-5" />
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
    if (name === "templates") return "Templates";
  }
  return name;
}

// ---------------------------------------------------------------------------
// Tree Item Component
// ---------------------------------------------------------------------------

function TreeItem({
  node,
  depth,
  activePath,
  expandedPaths,
  onToggleFolder,
  onSelectFile,
}: {
  node: TreeNode;
  depth: number;
  activePath: string | null;
  expandedPaths: Set<string>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (path: string, title: string) => void;
}) {
  if (isFolder(node)) {
    const expanded = expandedPaths.has(node.path);
    return (
      <div>
        <button
          type="button"
          onClick={() => onToggleFolder(node.path)}
          className="flex items-center gap-1 w-full text-left py-0.5 pr-2 text-xs rounded transition-colors"
          style={{
            paddingLeft: `${depth * 16 + 8}px`,
            color: "var(--text-secondary)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--bg-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <svg
            width="12"
            height="12"
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
        {expanded && (
          <div>
            {node.children
              .sort((a, b) => {
                // Folders first, then files
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

  return (
    <button
      type="button"
      onClick={() => onSelectFile(node.path, node.doc.title || displayName)}
      className="flex items-center gap-1 w-full text-left py-0.5 pr-2 text-xs rounded transition-colors"
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
      <svg
        width="12"
        height="12"
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
  );
}

// ---------------------------------------------------------------------------
// FileTree Component
// ---------------------------------------------------------------------------

export function FileTree() {
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

  return (
    <aside
      className="w-60 flex flex-col flex-shrink-0 overflow-hidden"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderRight: "1px solid var(--border-primary)",
      }}
    >
      {/* Search input */}
      <div className="px-2 pt-2 pb-1">
        <div className="relative">
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
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading ? (
          <div className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
            Loading...
          </div>
        ) : filteredTree.length === 0 ? (
          <div className="px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
            {searchQuery ? "No matching files" : "No documents yet"}
          </div>
        ) : (
          filteredTree.map((node) => (
            <TreeItem
              key={node.path || node.name}
              node={node}
              depth={0}
              activePath={activePath}
              expandedPaths={expandedPaths}
              onToggleFolder={handleToggleFolder}
              onSelectFile={handleSelectFile}
            />
          ))
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: "1px solid var(--border-primary)" }} />

      {/* Mini Calendar */}
      <MiniCalendar existingPaths={existingPaths} />

      {/* Divider */}
      <div style={{ borderTop: "1px solid var(--border-primary)" }} />

      {/* Bottom bar */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ color: "var(--text-secondary)" }}
      >
        <img src={facebrainSvg} alt="" className="w-4 h-4 opacity-70" />
        <span className="text-xs font-medium flex-1 truncate">Second Brain</span>
        <button
          type="button"
          className="w-5 h-5 flex items-center justify-center rounded hover:opacity-80"
          style={{ color: "var(--text-muted)" }}
          title="Help"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>
        <button
          type="button"
          className="w-5 h-5 flex items-center justify-center rounded hover:opacity-80"
          style={{ color: "var(--text-muted)" }}
          title="Settings"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
    </aside>
  );
}

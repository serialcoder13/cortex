import { useTabStore } from "../stores/tabs";
import { storage } from "../lib/storage";
import { useCallback } from "react";

export function TabBar() {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const closeTab = useTabStore((s) => s.closeTab);
  const pinTab = useTabStore((s) => s.pinTab);
  const openTab = useTabStore((s) => s.openTab);

  const handleNewNote = useCallback(async () => {
    const id = Date.now();
    const path = `docs/untitled-${id}.md`;
    const content = `---\ntitle: "Untitled"\ncreated: ${new Date().toISOString()}\n---\n\n`;
    try {
      await storage.writeDocument(path, content);
      openTab(path, "Untitled");
      globalThis.dispatchEvent(new CustomEvent("cortex:docs-changed"));
    } catch (err) {
      console.error("Failed to create note:", err);
    }
  }, [openTab]);

  return (
    <div
      className="h-9 flex items-end flex-shrink-0 overflow-x-auto"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border-primary)",
      }}
    >
      {/* Tabs */}
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            className="group relative flex items-center h-full px-3 gap-2 text-xs cursor-pointer select-none min-w-0 max-w-[180px] flex-shrink-0"
            style={{
              backgroundColor: isActive ? "var(--bg-primary)" : "transparent",
              color: isActive ? "var(--text-primary)" : "var(--text-tertiary)",
              borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
            }}
            onClick={() => setActiveTab(tab.id)}
            onDoubleClick={() => pinTab(tab.id)}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.backgroundColor = "var(--bg-hover)";
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <span
              className="truncate"
              style={{ fontStyle: tab.preview ? "italic" : "normal" }}
            >
              {tab.title}
            </span>

            {/* Dirty indicator (red dot) or close button */}
            {tab.dirty ? (
              <span
                className="flex-shrink-0 w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: "var(--danger)" }}
                title="Unsaved changes"
              />
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: "var(--text-muted)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--text-primary)";
                  e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-muted)";
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
                title="Close tab"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        );
      })}

      {/* New tab button */}
      <button
        type="button"
        onClick={handleNewNote}
        className="flex-shrink-0 w-8 h-full flex items-center justify-center transition-colors"
        style={{ color: "var(--text-muted)" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--text-primary)";
          e.currentTarget.style.backgroundColor = "var(--bg-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--text-muted)";
          e.currentTarget.style.backgroundColor = "transparent";
        }}
        title="New tab"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}

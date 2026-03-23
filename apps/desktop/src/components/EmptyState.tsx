import { useEffect, useCallback } from "react";
import { storage } from "../lib/storage";
import { useTabStore } from "../stores/tabs";

export function EmptyState() {
  const openTab = useTabStore((s) => s.openTab);
  const closeTab = useTabStore((s) => s.closeTab);
  const activeTabId = useTabStore((s) => s.activeTabId);

  const handleNewNote = useCallback(async () => {
    try {
      const timestamp = Date.now();
      const path = `docs/untitled-${timestamp}.md`;
      const content = `---\ntitle: "Untitled"\ndoc_type: note\ncreated: ${new Date().toISOString()}\n---\n\n`;
      await storage.writeDocument(path, content);
      openTab(path, "Untitled");
    } catch (err) {
      console.error("Failed to create document:", err);
    }
  }, [openTab]);

  const handleGoToFile = useCallback(() => {
    // For now, open a new tab (future: implement file picker modal)
    // This is a placeholder for Cmd+O functionality
  }, []);

  const handleClose = useCallback(() => {
    if (activeTabId) {
      closeTab(activeTabId);
    }
  }, [activeTabId, closeTab]);

  // Register keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "n") {
        e.preventDefault();
        handleNewNote();
      }
      if (mod && e.key === "o") {
        e.preventDefault();
        handleGoToFile();
      }
    }
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  }, [handleNewNote, handleGoToFile]);

  return (
    <div
      className="flex-1 flex items-center justify-center h-full"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div className="flex flex-col items-start gap-3">
        <button
          type="button"
          onClick={handleNewNote}
          className="flex items-center gap-3 text-sm transition-opacity hover:opacity-80"
          style={{ color: "var(--accent)" }}
        >
          <span>Create new note</span>
          <kbd
            className="text-xs px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              color: "var(--text-tertiary)",
              border: "1px solid var(--border-primary)",
            }}
          >
            {navigator.platform?.includes("Mac") ? "\u2318" : "Ctrl+"}N
          </kbd>
        </button>

        <button
          type="button"
          onClick={handleGoToFile}
          className="flex items-center gap-3 text-sm transition-opacity hover:opacity-80"
          style={{ color: "var(--accent)" }}
        >
          <span>Go to file</span>
          <kbd
            className="text-xs px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              color: "var(--text-tertiary)",
              border: "1px solid var(--border-primary)",
            }}
          >
            {navigator.platform?.includes("Mac") ? "\u2318" : "Ctrl+"}O
          </kbd>
        </button>

        <button
          type="button"
          onClick={handleClose}
          className="text-sm transition-opacity hover:opacity-80"
          style={{ color: "var(--accent)" }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

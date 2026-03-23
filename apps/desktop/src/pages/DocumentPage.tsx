import { useRef, useCallback, useMemo, useState, useEffect } from "react";
import {
  CortexEditor,
  type CortexEditorRef,
  type EditorDocument,
  blocksToMarkdown,
  markdownToBlocks,
  parseFrontmatter,
  stringifyFrontmatter,
  createDocument,
  getPlainText,
  getBlockDefinition,
} from "@cortex/editor";
import { useDocument } from "../lib/hooks/useDocument";
import { useTabStore } from "../stores/tabs";

type SaveState = "idle" | "saving" | "saved";

/** Map internal block type IDs to human-readable labels for the status bar. */
function blockTypeLabel(type: string): string {
  const def = getBlockDefinition(type as any);
  return def?.label ?? type;
}

export function DocumentPage({ path }: Readonly<{ path: string }>) {
  const docPath = path;
  const editorRef = useRef<CortexEditorRef>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const updateTabTitle = useTabStore((s) => s.updateTabTitle);
  const activeTabId = useTabStore((s) => s.activeTabId);

  const { content, loading, saving, save, saveNow } = useDocument(docPath);

  // ---- Save state tracking ----
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const saveStateTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Sync the hook's `saving` boolean into our richer save state.
  useEffect(() => {
    if (saving) {
      setSaveState("saving");
    }
  }, [saving]);

  // When saving finishes (saving goes false while we were in "saving"), move to "saved".
  const prevSavingRef = useRef(saving);
  useEffect(() => {
    if (prevSavingRef.current && !saving) {
      setSaveState("saved");
      // After 2 seconds, reset to idle only if no new changes came in.
      clearTimeout(saveStateTimerRef.current);
      saveStateTimerRef.current = setTimeout(() => {
        setSaveState((cur) => (cur === "saved" ? "idle" : cur));
      }, 2000);
    }
    prevSavingRef.current = saving;
  }, [saving]);

  useEffect(() => {
    return () => clearTimeout(saveStateTimerRef.current);
  }, []);

  // ---- Title state ----
  const [title, setTitle] = useState("");

  // Derive initial title from content.
  useEffect(() => {
    if (!content) return;
    const { frontmatter, body } = parseFrontmatter(content);
    let derivedTitle = "";
    if (frontmatter.title) {
      derivedTitle = String(frontmatter.title);
    } else {
      // Try to extract from first H1 line.
      const match = /^#\s+(.+)$/m.exec(body);
      if (match) {
        derivedTitle = match[1] ?? "";
      } else if (docPath) {
        // Fallback: filename without extension.
        const filename = docPath.split("/").pop() ?? "";
        derivedTitle = filename.replace(/\.md$/, "");
      }
    }
    setTitle(derivedTitle);
    // Update the tab title as well.
    if (activeTabId && derivedTitle) {
      updateTabTitle(activeTabId, derivedTitle);
    }
  }, [content, docPath, activeTabId, updateTabTitle]);

  // ---- Word / char count ----
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [currentBlockType, setCurrentBlockType] = useState("paragraph");

  const updateCounts = useCallback((doc: EditorDocument) => {
    let words = 0;
    let chars = 0;
    for (const block of doc.blocks) {
      const text = getPlainText(block.content);
      chars += text.length;
      const trimmed = text.trim();
      if (trimmed.length > 0) {
        words += trimmed.split(/\s+/).length;
      }
    }
    setWordCount(words);
    setCharCount(chars);
    // Update current block type from the last block (approximation;
    // ideally we'd track the focused block, but this is good enough).
    const lastBlock = doc.blocks.at(-1);
    if (lastBlock) {
      setCurrentBlockType(lastBlock.type);
    }
  }, []);

  // Convert markdown content to editor document.
  const initialDoc = useMemo((): EditorDocument | undefined => {
    if (!content) return undefined;
    const { body } = parseFrontmatter(content);
    const blocks = markdownToBlocks(body);
    const doc = blocks.length > 0 ? { blocks, version: 0 } : createDocument();
    // Compute initial counts.
    let w = 0;
    let c = 0;
    for (const block of doc.blocks) {
      const text = getPlainText(block.content);
      c += text.length;
      const trimmed = text.trim();
      if (trimmed.length > 0) w += trimmed.split(/\s+/).length;
    }
    // Use a microtask so we don't set state during render.
    Promise.resolve().then(() => {
      setWordCount(w);
      setCharCount(c);
    });
    return doc;
  }, [content]);

  // ---- Build markdown from doc for saving ----
  const buildMarkdown = useCallback(
    (doc: EditorDocument) => {
      const markdown = blocksToMarkdown(doc.blocks);
      const frontmatter = content ? parseFrontmatter(content).frontmatter : {};
      return stringifyFrontmatter(
        { ...frontmatter, title, modified: new Date().toISOString() },
        markdown,
      );
    },
    [content, title],
  );

  const handleChange = useCallback(
    (doc: EditorDocument) => {
      if (!docPath) return;
      // Mark as unsaved.
      clearTimeout(saveStateTimerRef.current);
      setSaveState("idle");
      updateCounts(doc);
      save(buildMarkdown(doc));
    },
    [docPath, save, buildMarkdown, updateCounts],
  );

  const handleIdle = useCallback(
    (doc: EditorDocument) => {
      if (!docPath || !content) return;
      saveNow(buildMarkdown(doc));
    },
    [docPath, content, saveNow, buildMarkdown],
  );

  const handleBlur = useCallback(
    (doc: EditorDocument) => {
      if (!docPath || !content) return;
      saveNow(buildMarkdown(doc));
    },
    [docPath, content, saveNow, buildMarkdown],
  );

  // ---- Title change ----
  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTitle(e.target.value);
      // Mark as unsaved so the indicator updates.
      clearTimeout(saveStateTimerRef.current);
      setSaveState("idle");
      // Update tab title.
      if (activeTabId) {
        updateTabTitle(activeTabId, e.target.value || "Untitled");
      }
    },
    [activeTabId, updateTabTitle],
  );

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        editorRef.current?.focus();
      }
    },
    [],
  );

  // ---- Breadcrumbs ----
  const breadcrumbs = useMemo(() => {
    if (!docPath) return [];
    return docPath.split("/").filter(Boolean);
  }, [docPath]);

  // ---- Save indicator rendering ----
  const saveIndicator = useMemo(() => {
    switch (saveState) {
      case "saving":
        return (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--warning)" }} />
            <span>Saving...</span>
          </span>
        );
      case "saved":
        return (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--success)" }} />
            <span>Saved</span>
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-500" />
            <span>Unsaved</span>
          </span>
        );
    }
  }, [saveState]);

  // ---- Loading ----
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center" style={{ color: "var(--text-muted)" }}>
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header area */}
      <div className="mx-auto w-full max-w-3xl px-6 pt-6">
        {/* Editable title */}
        <input
          ref={titleInputRef}
          type="text"
          value={title}
          onChange={handleTitleChange}
          onKeyDown={handleTitleKeyDown}
          placeholder="Untitled"
          className="text-3xl font-bold bg-transparent border-none outline-none w-full"
          style={{ color: "var(--text-primary)" }}
        />

        {/* Breadcrumbs */}
        <nav className="mt-1 mb-4 flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {breadcrumbs.map((segment, i) => (
            <span key={`${segment}-${i}`} className="flex items-center gap-1">
              {i > 0 && <span style={{ color: "var(--border-secondary)" }}>&gt;</span>}
              <span>{segment}</span>
            </span>
          ))}
        </nav>
      </div>

      {/* Editor area — fills remaining space */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 pb-6">
          <CortexEditor
            ref={editorRef}
            initialDocument={initialDoc}
            onChange={handleChange}
            onIdle={handleIdle}
            onBlur={handleBlur}
            idleDebounceMs={60000}
            placeholder="Type '/' for commands..."
            className="min-h-[60vh]"
          />
        </div>
      </div>

      {/* Status bar — sticky at bottom */}
      <div
        className="px-4 py-1.5 text-xs"
        style={{
          borderTop: "1px solid var(--border-primary)",
          backgroundColor: "var(--bg-primary)",
          color: "var(--text-muted)",
        }}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          {/* Left: word & char count */}
          <span>
            {wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"} &middot;{" "}
            {charCount.toLocaleString()} {charCount === 1 ? "char" : "chars"}
          </span>

          {/* Center: save indicator */}
          <span>{saveIndicator}</span>

          {/* Right: current block type */}
          <span>{blockTypeLabel(currentBlockType)}</span>
        </div>
      </div>
    </div>
  );
}

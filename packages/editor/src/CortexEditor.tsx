// ============================================================
// CortexEditor — the main editor component.
// Wires together: document model, input handling, selection,
// history (undo/redo), block rendering, auto-save hooks,
// slash command menu, floating toolbar, and drag handles.
// ============================================================

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type {
  Block,
  BlockType,
  EditorDocument,
  Mark,
  MarkType,
  Selection as EditorSelection,
  TextSpan,
} from "./core/types";
import { createBlock, getPlainText, getTextLength } from "./core/types";
import { createDocument, findBlock, insertBlockAfter, updateBlock } from "./core/document";
import { handleKeyDown, handleBeforeInput } from "./core/input";
import { readSelection, writeSelection } from "./core/selection";
import { handleCopy, handleCut, handlePaste } from "./core/clipboard";
import { History } from "./core/history";
import { BlockRenderer } from "./blocks/BlockRenderer";
import type { ApplyResult } from "./core/operations";
import { setBlockTypeOp, moveBlockOp, toggleMark as toggleMarkOp, replaceContent } from "./core/operations";
import { SlashCommandMenu } from "./features/slash-command";
import { FloatingToolbar } from "./features/toolbar";

// ---- Public API Types ----

export interface CortexEditorProps {
  /** Initial content as markdown string or document object */
  initialDocument?: EditorDocument;
  /** Called on every document change */
  onChange?: (doc: EditorDocument) => void;
  /** Called after idleDebounceMs of no changes */
  onIdle?: (doc: EditorDocument) => void;
  /** Called when the editor loses focus */
  onBlur?: (doc: EditorDocument) => void;
  /** Idle debounce in ms (default: 60000 = 1 minute) */
  idleDebounceMs?: number;
  /** Placeholder shown when empty */
  placeholder?: string;
  /** Read-only mode */
  readOnly?: boolean;
  /** CSS class for the outer container */
  className?: string;
}

export interface CortexEditorRef {
  focus: () => void;
  getDocument: () => EditorDocument;
  setDocument: (doc: EditorDocument) => void;
  insertBlock: (type: BlockType, afterBlockId?: string) => void;
}

// ---- Slash Command State ----

interface SlashCommandState {
  active: boolean;
  blockId: string;
  filter: string;
  position: { x: number; y: number };
}

// ---- Floating Toolbar State ----

interface ToolbarState {
  active: boolean;
  position: { x: number; y: number };
  activeMarks: MarkType[];
}

// ---- Drag State ----

interface DragState {
  draggingBlockId: string | null;
  dropTargetIndex: number | null;
}

// ---- Helpers ----

/** Get marks active at a given offset within a block */
function getActiveMarksAtPosition(doc: EditorDocument, blockId: string, offset: number): MarkType[] {
  const block = findBlock(doc, blockId);
  if (!block) return [];
  let pos = 0;
  for (const span of block.content) {
    const end = pos + span.text.length;
    if (offset > pos && offset <= end) {
      return (span.marks ?? []).map(m => m.type);
    }
    pos = end;
  }
  return [];
}

/** Get the bounding rect of the caret (collapsed selection) */
function getCaretRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  // For collapsed selections, getBoundingClientRect returns empty
  if (rect.width === 0 && rect.height === 0) {
    // Insert a temporary span to measure
    const span = document.createElement("span");
    span.textContent = "\u200b";
    range.insertNode(span);
    const spanRect = span.getBoundingClientRect();
    span.remove();
    // Restore selection
    sel.removeAllRanges();
    sel.addRange(range);
    return spanRect;
  }
  return rect;
}

// ---- Drag Handle & Add Button SVGs ----

function DragHandleIcon() {
  return (
    <svg width="14" height="20" viewBox="0 0 14 20" fill="currentColor">
      <circle cx="4" cy="4" r="1.5" />
      <circle cx="10" cy="4" r="1.5" />
      <circle cx="4" cy="10" r="1.5" />
      <circle cx="10" cy="10" r="1.5" />
      <circle cx="4" cy="16" r="1.5" />
      <circle cx="10" cy="16" r="1.5" />
    </svg>
  );
}

function AddBlockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="8" y1="3" x2="8" y2="13" />
      <line x1="3" y1="8" x2="13" y2="8" />
    </svg>
  );
}

// ---- Drag Handle Overlay (rendered outside contentEditable) ----

function DragHandleOverlay({
  blockId,
  editorRef,
  onDragStart,
  onDragEnd,
}: Readonly<{
  blockId: string;
  editorRef: React.RefObject<HTMLDivElement | null>;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
}>) {
  const [pos, setPos] = useState<{ top: number } | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const blockEl = editor.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement | null;
    if (!blockEl) return;

    const updatePos = () => {
      const editorRect = editor.parentElement?.getBoundingClientRect();
      const blockRect = blockEl.getBoundingClientRect();
      if (editorRect) {
        setPos({ top: blockRect.top - editorRect.top + 4 });
      }
    };

    updatePos();

    const onEnter = () => setVisible(true);
    const onLeave = () => setVisible(false);

    blockEl.addEventListener("mouseenter", onEnter);
    blockEl.addEventListener("mouseleave", onLeave);

    // Update position on scroll/resize
    const observer = new ResizeObserver(updatePos);
    observer.observe(blockEl);

    return () => {
      blockEl.removeEventListener("mouseenter", onEnter);
      blockEl.removeEventListener("mouseleave", onLeave);
      observer.disconnect();
    };
  }, [blockId, editorRef]);

  if (!pos) return null;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, blockId)}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      style={{
        position: "absolute",
        left: -32,
        top: pos.top,
        display: "flex",
        width: 24,
        height: 24,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 4,
        color: "var(--text-muted)",
        cursor: "grab",
        opacity: visible ? 1 : 0,
        transition: "opacity 150ms",
        zIndex: 10,
      }}
      aria-label="Drag to reorder"
    >
      <DragHandleIcon />
    </div>
  );
}

// ---- Component ----

export const CortexEditor = forwardRef<CortexEditorRef, CortexEditorProps>(
  function CortexEditor(
    {
      initialDocument,
      onChange,
      onIdle,
      onBlur,
      idleDebounceMs = 60_000,
      placeholder = "Press '/' for commands, or just start typing...",
      readOnly = false,
      className,
    },
    ref,
  ) {
    // ---- State ----
    const rootRef = useRef<HTMLDivElement>(null);
    const [doc, setDoc] = useState<EditorDocument>(
      () => initialDocument ?? createDocument(),
    );
    const [selection, setSelection] = useState<EditorSelection | null>(null);
    const historyRef = useRef(new History());
    const isComposing = useRef(false);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const docRef = useRef(doc);
    docRef.current = doc;

    // Slash command state
    const [slashCommand, setSlashCommand] = useState<SlashCommandState>({
      active: false,
      blockId: "",
      filter: "",
      position: { x: 0, y: 0 },
    });

    // Floating toolbar state
    const [toolbar, setToolbar] = useState<ToolbarState>({
      active: false,
      position: { x: 0, y: 0 },
      activeMarks: [],
    });

    // Drag state
    const [dragState, setDragState] = useState<DragState>({
      draggingBlockId: null,
      dropTargetIndex: null,
    });

    // Ref to track selection for toolbar/slash command interactions
    const selectionRef = useRef(selection);
    selectionRef.current = selection;

    // ---- Idle timer ----
    const resetIdleTimer = useCallback(() => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (onIdle) {
        idleTimerRef.current = setTimeout(() => {
          onIdle(docRef.current);
        }, idleDebounceMs);
      }
    }, [onIdle, idleDebounceMs]);

    // ---- Apply a result (doc + ops + selection) ----
    const apply = useCallback(
      (result: ApplyResult, recordHistory = true) => {
        if (!result.doc || result.doc === docRef.current) return;

        if (recordHistory && result.ops.length > 0) {
          historyRef.current.push(result.ops, selectionRef.current, result.selection);
        }

        setDoc(result.doc);
        docRef.current = result.doc;

        if (result.selection) {
          setSelection(result.selection);
          selectionRef.current = result.selection;
        }

        onChange?.(result.doc);
        resetIdleTimer();
      },
      [onChange, resetIdleTimer],
    );

    useEffect(() => {
      return () => {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      };
    }, []);

    // ---- Sync selection to DOM after render ----
    // This runs synchronously after React commits to the DOM.
    // No rAF needed — the DOM is already updated at this point.
    // Using rAF would create a race with user-initiated selection changes.
    useEffect(() => {
      if (!rootRef.current || !selection) return;
      isWritingSelection.current = true;
      writeSelection(rootRef.current, selection);
      isWritingSelection.current = false;
    }, [selection, doc.version]);

    // ---- Slash Command Helpers ----

    /** Check if slash command should be active and update state */
    const updateSlashCommandState = useCallback(
      (currentDoc: EditorDocument, sel: EditorSelection | null) => {
        if (!sel) {
          if (slashCommand.active) {
            setSlashCommand(prev => ({ ...prev, active: false }));
          }
          return;
        }

        // Only for collapsed selection
        if (sel.anchor.blockId !== sel.focus.blockId || sel.anchor.offset !== sel.focus.offset) {
          if (slashCommand.active) {
            setSlashCommand(prev => ({ ...prev, active: false }));
          }
          return;
        }

        const block = findBlock(currentDoc, sel.focus.blockId);
        if (!block) {
          if (slashCommand.active) {
            setSlashCommand(prev => ({ ...prev, active: false }));
          }
          return;
        }

        const text = getPlainText(block.content);

        // Check if text starts with "/"
        if (text.startsWith("/")) {
          const filter = text.slice(1); // Everything after "/"
          const caretRect = getCaretRect();
          if (caretRect) {
            setSlashCommand({
              active: true,
              blockId: sel.focus.blockId,
              filter,
              position: { x: caretRect.left, y: caretRect.bottom + 4 },
            });
          }
        } else if (slashCommand.active) {
          setSlashCommand(prev => ({ ...prev, active: false }));
        }
      },
      [slashCommand.active],
    );

    /** Handle slash command item selection */
    const handleSlashSelect = useCallback(
      (type: BlockType) => {
        const blockId = slashCommand.blockId;
        const block = findBlock(docRef.current, blockId);
        if (!block) return;

        // Clear the "/" text from the block
        const text = getPlainText(block.content);
        let currentDoc = docRef.current;

        if (text.length > 0) {
          const clearResult = replaceContent(currentDoc, blockId, []);
          currentDoc = clearResult.doc;
          // Record as part of the same operation batch
          if (clearResult.ops.length > 0) {
            historyRef.current.push(clearResult.ops, selectionRef.current, clearResult.selection);
          }
        }

        // Set the block type
        const result = setBlockTypeOp(currentDoc, blockId, type);
        if (result.doc !== currentDoc) {
          setDoc(result.doc);
          docRef.current = result.doc;

          if (result.ops.length > 0) {
            historyRef.current.push(result.ops, selectionRef.current, result.selection);
          }

          // Set selection to beginning of the block
          const newSel: EditorSelection = {
            anchor: { blockId, offset: 0 },
            focus: { blockId, offset: 0 },
          };
          setSelection(newSel);

          onChange?.(result.doc);
          resetIdleTimer();
        }

        // Close the menu
        setSlashCommand({ active: false, blockId: "", filter: "", position: { x: 0, y: 0 } });
      },
      [slashCommand.blockId, onChange, resetIdleTimer],
    );

    /** Close slash command menu */
    const handleSlashClose = useCallback(() => {
      setSlashCommand({ active: false, blockId: "", filter: "", position: { x: 0, y: 0 } });
    }, []);

    // ---- Floating Toolbar Helpers ----

    /** Update toolbar state based on current selection */
    const updateToolbarState = useCallback(
      (currentDoc: EditorDocument, sel: EditorSelection | null) => {
        if (!sel) {
          if (toolbar.active) {
            setToolbar(prev => ({ ...prev, active: false }));
          }
          return;
        }

        // Check if selection is non-collapsed
        const isCollapsed =
          sel.anchor.blockId === sel.focus.blockId &&
          sel.anchor.offset === sel.focus.offset;

        if (isCollapsed) {
          if (toolbar.active) {
            setToolbar(prev => ({ ...prev, active: false }));
          }
          return;
        }

        // Get the selection rect from the browser
        const domSel = window.getSelection();
        if (!domSel || domSel.rangeCount === 0) {
          if (toolbar.active) {
            setToolbar(prev => ({ ...prev, active: false }));
          }
          return;
        }

        const range = domSel.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        if (rect.width === 0 && rect.height === 0) {
          if (toolbar.active) {
            setToolbar(prev => ({ ...prev, active: false }));
          }
          return;
        }

        // Get active marks at the focus position
        const marks = getActiveMarksAtPosition(currentDoc, sel.focus.blockId, sel.focus.offset);

        setToolbar({
          active: true,
          position: {
            x: rect.left + rect.width / 2,
            y: rect.top - 10,
          },
          activeMarks: marks,
        });
      },
      [toolbar.active],
    );

    /** Handle mark toggle from toolbar */
    const handleToolbarToggleMark = useCallback(
      (mark: Mark) => {
        const sel = selectionRef.current;
        if (!sel) return;

        // For same-block selections
        if (sel.anchor.blockId === sel.focus.blockId) {
          const from = Math.min(sel.anchor.offset, sel.focus.offset);
          const to = Math.max(sel.anchor.offset, sel.focus.offset);
          const result = toggleMarkOp(docRef.current, sel.anchor.blockId, from, to, mark);
          if (result.doc !== docRef.current) {
            apply(result);
          }
        }

        // Update toolbar marks after toggling
        requestAnimationFrame(() => {
          const currentSel = selectionRef.current;
          if (currentSel) {
            const marks = getActiveMarksAtPosition(
              docRef.current,
              currentSel.focus.blockId,
              currentSel.focus.offset,
            );
            setToolbar(prev => ({
              ...prev,
              activeMarks: marks,
            }));
          }
        });
      },
      [apply],
    );

    /** Close floating toolbar */
    const handleToolbarClose = useCallback(() => {
      setToolbar({ active: false, position: { x: 0, y: 0 }, activeMarks: [] });
    }, []);

    // ---- Drag Handle Callbacks ----

    const handleDragStart = useCallback(
      (e: React.DragEvent, blockId: string) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", blockId);
        setDragState({ draggingBlockId: blockId, dropTargetIndex: null });
      },
      [],
    );

    const handleDragOver = useCallback(
      (e: React.DragEvent, blockIndex: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragState(prev => ({ ...prev, dropTargetIndex: blockIndex }));
      },
      [],
    );

    const handleDragLeave = useCallback(() => {
      setDragState(prev => ({ ...prev, dropTargetIndex: null }));
    }, []);

    const handleDrop = useCallback(
      (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault();
        const blockId = e.dataTransfer.getData("text/plain");
        if (!blockId) return;

        const result = moveBlockOp(docRef.current, blockId, targetIndex);
        if (result.doc !== docRef.current) {
          apply(result);
        }

        setDragState({ draggingBlockId: null, dropTargetIndex: null });
      },
      [apply],
    );

    const handleDragEnd = useCallback(() => {
      setDragState({ draggingBlockId: null, dropTargetIndex: null });
    }, []);

    // ---- Event Handlers ----

    // Guard flag to prevent selectionchange → writeSelection → selectionchange loop
    const isWritingSelection = useRef(false);

    const handleSelectionChange = useCallback(() => {
      if (isComposing.current || !rootRef.current || isWritingSelection.current) return;

      const domSel = window.getSelection();
      if (!domSel || !rootRef.current.contains(domSel.anchorNode)) return;

      const sel = readSelection(rootRef.current, docRef.current);
      if (sel) {
        // Skip update if selection hasn't changed (prevents loops)
        const prev = selectionRef.current;
        if (
          prev &&
          prev.anchor.blockId === sel.anchor.blockId &&
          prev.anchor.offset === sel.anchor.offset &&
          prev.focus.blockId === sel.focus.blockId &&
          prev.focus.offset === sel.focus.offset
        ) {
          return;
        }

        setSelection(sel);
        selectionRef.current = sel;

        // Update slash command and toolbar states
        requestAnimationFrame(() => {
          updateSlashCommandState(docRef.current, sel);
          updateToolbarState(docRef.current, sel);
        });
      }
    }, [updateSlashCommandState, updateToolbarState]);

    useEffect(() => {
      document.addEventListener("selectionchange", handleSelectionChange);
      return () => document.removeEventListener("selectionchange", handleSelectionChange);
    }, [handleSelectionChange]);

    const onKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (readOnly || isComposing.current) return;

        // If slash command is active, let it handle Arrow/Enter/Escape
        if (slashCommand.active) {
          if (
            e.key === "ArrowDown" ||
            e.key === "ArrowUp" ||
            e.key === "Enter" ||
            e.key === "Escape"
          ) {
            // These are handled by the SlashCommandMenu's document-level keydown listener
            return;
          }
        }

        // Escape closes toolbar
        if (toolbar.active && e.key === "Escape") {
          e.preventDefault();
          handleToolbarClose();
          return;
        }

        const currentDoc = docRef.current;

        // Undo: Cmd+Z
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "z") {
          e.preventDefault();
          const result = historyRef.current.undo(currentDoc);
          if (result) {
            setDoc(result.doc);
            docRef.current = result.doc;
            if (result.selection) {
              setSelection(result.selection);
              selectionRef.current = result.selection;
            }
            onChange?.(result.doc);
          }
          return;
        }

        // Redo: Cmd+Shift+Z or Cmd+Y
        if (
          ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "z") ||
          ((e.metaKey || e.ctrlKey) && e.key === "y")
        ) {
          e.preventDefault();
          const result = historyRef.current.redo(currentDoc);
          if (result) {
            setDoc(result.doc);
            docRef.current = result.doc;
            if (result.selection) {
              setSelection(result.selection);
              selectionRef.current = result.selection;
            }
            onChange?.(result.doc);
          }
          return;
        }

        const sel = selectionRef.current;
        if (!sel) return;

        const { result, handled } = handleKeyDown({ doc: currentDoc, selection: sel }, e.nativeEvent);
        if (handled && result.doc) {
          apply(result);
        }
      },
      [readOnly, apply, onChange, slashCommand.active, toolbar.active, handleToolbarClose],
    );

    // ---- Native beforeinput listener ----
    // React 19's onBeforeInput is a polyfilled event that does NOT reliably
    // map to the native `beforeinput` event. We must use a native listener
    // to intercept and preventDefault on text input.
    useEffect(() => {
      const root = rootRef.current;
      if (!root || readOnly) return;

      const onNativeBeforeInput = (e: Event) => {
        if (isComposing.current) return;
        const sel = selectionRef.current;
        if (!sel) return;

        const inputEvent = e as InputEvent;
        const { result, handled } = handleBeforeInput(
          { doc: docRef.current, selection: sel },
          inputEvent,
        );
        if (handled && result.doc) {
          apply(result);

          // After applying, check for slash command trigger
          requestAnimationFrame(() => {
            const currentSel = selectionRef.current;
            if (currentSel) {
              updateSlashCommandState(docRef.current, currentSel);
            }
          });
        }
      };

      root.addEventListener("beforeinput", onNativeBeforeInput);
      return () => root.removeEventListener("beforeinput", onNativeBeforeInput);
    }, [readOnly, apply, updateSlashCommandState]);

    const onCompositionStart = useCallback(() => {
      isComposing.current = true;
    }, []);

    const onCompositionEnd = useCallback(
      (e: React.CompositionEvent) => {
        isComposing.current = false;

        // After IME composition ends, the browser has already inserted text
        // We need to read it from the DOM and sync back to our model
        if (!rootRef.current || !selection) return;

        const composedText = e.data;
        if (!composedText) return;

        // Read what the DOM now looks like for this block
        const blockEl = rootRef.current.querySelector(
          `[data-block-id="${selection.focus.blockId}"]`,
        );
        if (!blockEl) return;

        const contentEl = blockEl.querySelector("[data-content]") ?? blockEl;
        const domText = contentEl.textContent ?? "";

        // Replace the block's content with what the DOM has
        const block = findBlock(doc, selection.focus.blockId);
        if (!block) return;

        const currentText = getPlainText(block.content);
        if (domText !== currentText) {
          const newContent: TextSpan[] = domText ? [{ text: domText }] : [];
          const newDoc = updateBlock(doc, selection.focus.blockId, (b) => ({
            ...b,
            content: newContent,
          }));
          setDoc({ ...newDoc, version: newDoc.version + 1 });
          docRef.current = newDoc;
          onChange?.(newDoc);
          resetIdleTimer();
        }
      },
      [doc, selection, onChange, resetIdleTimer],
    );

    const onCopy = useCallback(
      (e: React.ClipboardEvent) => {
        const sel = selectionRef.current;
        if (!sel) return;
        handleCopy(docRef.current, sel, e.nativeEvent);
      },
      [],
    );

    const onCut = useCallback(
      (e: React.ClipboardEvent) => {
        const sel = selectionRef.current;
        if (readOnly || !sel) return;
        const result = handleCut(docRef.current, sel, e.nativeEvent);
        if (result) apply(result);
      },
      [readOnly, apply],
    );

    const onPaste = useCallback(
      (e: React.ClipboardEvent) => {
        const sel = selectionRef.current;
        if (readOnly || !sel) return;
        const result = handlePaste(docRef.current, sel, e.nativeEvent);
        if (result) apply(result);
      },
      [readOnly, apply],
    );

    const onEditorBlur = useCallback(() => {
      onBlur?.(docRef.current);
    }, [onBlur]);

    // ---- Checkbox toggle ----
    const onToggleTodo = useCallback(
      (blockId: string) => {
        const newDoc = updateBlock(doc, blockId, (b) => ({
          ...b,
          props: { ...b.props, checked: !b.props.checked },
        }));
        setDoc({ ...newDoc, version: newDoc.version + 1 });
        docRef.current = newDoc;
        onChange?.(newDoc);
      },
      [doc, onChange],
    );

    // ---- Toggle collapse ----
    const onToggleCollapse = useCallback(
      (blockId: string) => {
        const newDoc = updateBlock(doc, blockId, (b) => ({
          ...b,
          props: { ...b.props, collapsed: !b.props.collapsed },
        }));
        setDoc({ ...newDoc, version: newDoc.version + 1 });
        docRef.current = newDoc;
        onChange?.(newDoc);
      },
      [doc, onChange],
    );

    // ---- Add block via + button ----
    const onAddBlock = useCallback(
      (afterBlockId: string) => {
        const block = createBlock("paragraph");
        const newDoc = insertBlockAfter(doc, afterBlockId, block);
        setDoc(newDoc);
        docRef.current = newDoc;
        setSelection({
          anchor: { blockId: block.id, offset: 0 },
          focus: { blockId: block.id, offset: 0 },
        });
        onChange?.(newDoc);
        // Focus editor after React re-renders
        requestAnimationFrame(() => rootRef.current?.focus());
      },
      [doc, onChange],
    );

    // ---- Click on editor background → focus last block ----
    const onRootClick = useCallback(
      (e: React.MouseEvent) => {
        if (e.target !== rootRef.current) return;
        const lastBlock = doc.blocks.at(-1);
        if (!lastBlock) return;
        const offset = getTextLength(lastBlock.content);
        setSelection({
          anchor: { blockId: lastBlock.id, offset },
          focus: { blockId: lastBlock.id, offset },
        });
        rootRef.current?.focus();
      },
      [doc],
    );

    // ---- Number list items ----
    const numberedBlocks = computeListNumbers(doc.blocks);

    // ---- Imperative handle ----
    useImperativeHandle(
      ref,
      () => ({
        focus: () => rootRef.current?.focus(),
        getDocument: () => docRef.current,
        setDocument: (newDoc: EditorDocument) => {
          setDoc(newDoc);
          docRef.current = newDoc;
          historyRef.current.clear();
        },
        insertBlock: (type: BlockType, afterBlockId?: string) => {
          const block = createBlock(type);
          const afterId = afterBlockId ?? doc.blocks.at(-1)?.id ?? null;
          const newDoc = insertBlockAfter(doc, afterId, block);
          setDoc(newDoc);
          docRef.current = newDoc;
          setSelection({
            anchor: { blockId: block.id, offset: 0 },
            focus: { blockId: block.id, offset: 0 },
          });
        },
      }),
      [doc],
    );

    // ---- Check if document is empty (for placeholder) ----
    const firstBlock = doc.blocks[0];
    const isEmpty =
      doc.blocks.length === 1 &&
      firstBlock?.type === "paragraph" &&
      getPlainText(firstBlock.content) === "";

    // Toggle data-empty on the editor root for CSS-based placeholder.
    // Using useEffect + DOM attribute so the placeholder hides instantly
    // on browser input, not waiting for React re-render.
    const placeholderRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      const root = rootRef.current;
      if (!root || readOnly) return;

      const update = () => {
        const textContent = root.textContent?.replace(/\u200B/g, "").trim() ?? "";
        const show = textContent.length === 0;
        if (placeholderRef.current) {
          placeholderRef.current.style.display = show ? "" : "none";
        }
      };

      update(); // Initial check

      root.addEventListener("input", update);
      return () => root.removeEventListener("input", update);
    }, [readOnly, doc.blocks.length]);

    // ---- Render ----
    return (
      <div className={`cx-editor-container ${className ?? ""}`} style={{ position: "relative" }}>
        {/* The contentEditable editor area */}
        <div
          ref={rootRef}
          className="cx-editor"
          style={{ position: "relative", minHeight: 200, outline: "none" }}
          contentEditable={!readOnly}
          suppressContentEditableWarning
          tabIndex={0}
          role="textbox"
          aria-multiline="true"
          aria-placeholder={placeholder}
          onKeyDown={onKeyDown}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          onCopy={onCopy}
          onCut={onCut}
          onPaste={onPaste}
          onBlur={onEditorBlur}
          onClick={onRootClick}
          spellCheck
        >
          {doc.blocks.map((block, blockIndex) => (
            <div
              key={block.id}
              data-block-id={block.id}
              className="cx-block-wrapper"
              style={{
                position: "relative",
                padding: "4px 0",
                opacity: dragState.draggingBlockId === block.id ? 0.5 : 1,
              }}
              onDragOver={(e) => handleDragOver(e, blockIndex)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, blockIndex)}
            >
              {/* Drop indicators and drag handles are rendered outside contentEditable */}

              <BlockRenderer
                block={
                  block.type === "numberedList"
                    ? { ...block, props: { ...block.props, number: numberedBlocks.get(block.id) ?? 1 } }
                    : block
                }
                onToggleTodo={onToggleTodo}
                onToggleCollapse={onToggleCollapse}
              />
            </div>
          ))}
          {/* Drop indicators rendered outside contentEditable */}
        </div>

        {/* Placeholder — outside contentEditable, visibility toggled via DOM input event */}
        {!readOnly && (
          <div
            ref={placeholderRef}
            className="cx-placeholder"
            style={{ display: isEmpty ? "" : "none" }}
            aria-hidden="true"
          >
            {placeholder}
          </div>
        )}

        {/* Drag handles — rendered outside contentEditable to avoid breaking editing */}
        {!readOnly && doc.blocks.map((block) => (
          <DragHandleOverlay
            key={`handle-${block.id}`}
            blockId={block.id}
            editorRef={rootRef}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          />
        ))}

        {/* Slash Command Menu — rendered outside the contentEditable div */}
        {slashCommand.active && (
          <SlashCommandMenu
            position={slashCommand.position}
            filter={slashCommand.filter}
            onSelect={handleSlashSelect}
            onClose={handleSlashClose}
          />
        )}

        {/* Floating Toolbar — rendered outside the contentEditable div */}
        {toolbar.active && (
          <FloatingToolbar
            position={toolbar.position}
            activeMarks={toolbar.activeMarks}
            onToggleMark={handleToolbarToggleMark}
            onClose={handleToolbarClose}
          />
        )}
      </div>
    );
  },
);

// ---- Helpers ----

/** Compute sequential numbers for numbered list items */
function computeListNumbers(blocks: Block[]): Map<string, number> {
  const map = new Map<string, number>();
  let counter = 0;

  for (const block of blocks) {
    if (block.type === "numberedList") {
      counter++;
      map.set(block.id, counter);
    } else {
      counter = 0;
    }
  }

  return map;
}

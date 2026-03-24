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
          historyRef.current.push(result.ops, selection, result.selection);
        }

        setDoc(result.doc);
        docRef.current = result.doc;

        if (result.selection) {
          setSelection(result.selection);
        }

        onChange?.(result.doc);
        resetIdleTimer();
      },
      [onChange, selection, resetIdleTimer],
    );

    useEffect(() => {
      return () => {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      };
    }, []);

    // ---- Sync selection to DOM after render ----
    useEffect(() => {
      if (!rootRef.current || !selection) return;

      // Use requestAnimationFrame to ensure DOM is updated
      const frame = requestAnimationFrame(() => {
        if (rootRef.current && selection) {
          writeSelection(rootRef.current, selection);
        }
      });
      return () => cancelAnimationFrame(frame);
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

    const handleSelectionChange = useCallback(() => {
      if (isComposing.current || !rootRef.current) return;

      const domSel = window.getSelection();
      if (!domSel || !rootRef.current.contains(domSel.anchorNode)) return;

      const sel = readSelection(rootRef.current, doc);
      if (sel) {
        setSelection(sel);

        // Update slash command and toolbar states
        // Use a microtask to ensure DOM is settled
        requestAnimationFrame(() => {
          updateSlashCommandState(docRef.current, sel);
          updateToolbarState(docRef.current, sel);
        });
      }
    }, [doc, updateSlashCommandState, updateToolbarState]);

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

        // Undo: Cmd+Z
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "z") {
          e.preventDefault();
          const result = historyRef.current.undo(doc);
          if (result) {
            setDoc(result.doc);
            docRef.current = result.doc;
            if (result.selection) setSelection(result.selection);
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
          const result = historyRef.current.redo(doc);
          if (result) {
            setDoc(result.doc);
            docRef.current = result.doc;
            if (result.selection) setSelection(result.selection);
            onChange?.(result.doc);
          }
          return;
        }

        if (!selection) return;

        const { result, handled } = handleKeyDown({ doc, selection }, e.nativeEvent);
        if (handled && result.doc) {
          apply(result);
        }
      },
      [doc, selection, readOnly, apply, onChange, slashCommand.active, toolbar.active, handleToolbarClose],
    );

    const onBeforeInput = useCallback(
      (e: React.FormEvent) => {
        if (readOnly || isComposing.current || !selection) return;

        const inputEvent = e.nativeEvent as InputEvent;
        const { result, handled } = handleBeforeInput({ doc, selection }, inputEvent);
        if (handled && result.doc) {
          apply(result);

          // After applying, check for slash command trigger
          // We schedule this to run after the state update
          requestAnimationFrame(() => {
            const currentSel = selectionRef.current;
            if (currentSel) {
              updateSlashCommandState(docRef.current, currentSel);
            }
          });
        }
      },
      [doc, selection, readOnly, apply, updateSlashCommandState],
    );

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
        if (!selection) return;
        handleCopy(doc, selection, e.nativeEvent);
      },
      [doc, selection],
    );

    const onCut = useCallback(
      (e: React.ClipboardEvent) => {
        if (readOnly || !selection) return;
        const result = handleCut(doc, selection, e.nativeEvent);
        if (result) apply(result);
      },
      [doc, selection, readOnly, apply],
    );

    const onPaste = useCallback(
      (e: React.ClipboardEvent) => {
        if (readOnly || !selection) return;
        const result = handlePaste(doc, selection, e.nativeEvent);
        if (result) apply(result);
      },
      [doc, selection, readOnly, apply],
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

    // ---- Check if document is empty ----
    const firstBlock = doc.blocks[0];
    const isEmpty =
      doc.blocks.length === 1 &&
      firstBlock?.type === "paragraph" &&
      getPlainText(firstBlock.content) === "";

    // ---- Render ----
    return (
      <div className={`cx-editor-container cx-relative ${className ?? ""}`}>
        {/* The contentEditable editor area */}
        <div
          ref={rootRef}
          className="cx-editor cx-relative cx-min-h-[200px] cx-outline-none"
          contentEditable={!readOnly}
          suppressContentEditableWarning
          tabIndex={0}
          role="textbox"
          aria-multiline="true"
          aria-placeholder={placeholder}
          onKeyDown={onKeyDown}
          onBeforeInput={onBeforeInput}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          onCopy={onCopy}
          onCut={onCut}
          onPaste={onPaste}
          onBlur={onEditorBlur}
          onClick={onRootClick}
          spellCheck
        >
          {isEmpty && !readOnly && (
            <div
              className="cx-pointer-events-none cx-absolute cx-left-0 cx-top-0 cx-select-none cx-text-base"
              style={{ color: "var(--text-muted)" }}
              aria-hidden="true"
            >
              {placeholder}
            </div>
          )}
          {doc.blocks.map((block, blockIndex) => (
            <div
              key={block.id}
              data-block-id={block.id}
              className={`cx-block-wrapper cx-group cx-relative cx-py-1 ${
                dragState.draggingBlockId === block.id ? "cx-opacity-50" : ""
              }`}
              onDragOver={(e) => handleDragOver(e, blockIndex)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, blockIndex)}
            >
              {/* Drop indicator line */}
              {dragState.dropTargetIndex === blockIndex && dragState.draggingBlockId !== block.id && (
                <div
                  className="cx-pointer-events-none cx-absolute cx-left-0 cx-right-0 cx-top-0 cx-h-0.5"
                  style={{ backgroundColor: "var(--accent)" }}
                  aria-hidden="true"
                />
              )}

              {/* Add button + Drag handle */}
              {!readOnly && (
                <div
                  className="cx-absolute cx--left-14 cx-top-0.5 cx-flex cx-items-center cx-gap-0.5 cx-opacity-0 cx-transition-opacity group-hover:cx-opacity-100"
                  contentEditable={false}
                  suppressContentEditableWarning
                >
                  <button
                    type="button"
                    className="cx-flex cx-h-6 cx-w-6 cx-items-center cx-justify-center cx-rounded cx-transition-colors"
                    style={{ color: "var(--text-muted)" }}
                    onClick={() => onAddBlock(block.id)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                      e.currentTarget.style.color = "var(--text-secondary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.color = "var(--text-muted)";
                    }}
                    aria-label="Add block below"
                  >
                    <AddBlockIcon />
                  </button>
                  <div
                    draggable
                    role="button"
                    tabIndex={-1}
                    onDragStart={(e) => handleDragStart(e, block.id)}
                    onDragEnd={handleDragEnd}
                    className="cx-flex cx-h-6 cx-w-6 cx-cursor-grab cx-items-center cx-justify-center cx-rounded cx-transition-colors active:cx-cursor-grabbing"
                    style={{ color: "var(--text-muted)" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                      e.currentTarget.style.color = "var(--text-secondary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.color = "var(--text-muted)";
                    }}
                    aria-label="Drag to reorder"
                  >
                    <DragHandleIcon />
                  </div>
                </div>
              )}

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
          {/* Drop indicator at the end */}
          {dragState.dropTargetIndex === doc.blocks.length && dragState.draggingBlockId !== null && (
            <div
              className="cx-pointer-events-none cx-h-0.5"
              style={{ backgroundColor: "var(--accent)" }}
              aria-hidden="true"
            />
          )}
        </div>

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

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
import { createBlock, getPlainText, getTextLength, generateId } from "./core/types";
import { createDocument, findBlock, insertBlockAfter, updateBlock } from "./core/document";
import { handleKeyDown, handleBeforeInput } from "./core/input";
import { readSelection, writeSelection } from "./core/selection";
import { handleCopy, handleCut, handlePaste } from "./core/clipboard";
import { History } from "./core/history";
import { BlockRenderer } from "./blocks/BlockRenderer";
import type { ApplyResult } from "./core/operations";
import { setBlockTypeOp, moveBlockOp, toggleMark as toggleMarkOp, replaceContent, insertText as insertTextOp, deleteText as deleteTextOp, deleteBlockOp } from "./core/operations";
import { SlashCommandMenu } from "./features/slash-command";
import { EmojiPicker } from "./features/emoji-picker";
import { FloatingToolbar, isToolbarLinkInputActive } from "./features/toolbar";
import { blocksToMarkdown } from "./markdown/serialize";
import { FindReplaceBar, findInDocument, type FindMatch } from "./features/find-replace";
import { BlockMenu } from "./features/block-menu";
import { GripVertical, Plus, Trash2, Copy, ArrowUpDown, Type as TypeIcon, Heading1, Heading2, Heading3, List, ListOrdered, CheckSquare, Code, Quote, Lightbulb } from "lucide-react";

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
  /** Debug mode — shows event log and live markdown output below the editor */
  debugMode?: boolean;
  /** CSS class for the outer container */
  className?: string;
  /**
   * Called when a user selects an image file for upload.
   * Should return a Promise resolving to the URL where the image was uploaded.
   * If not provided, the image is embedded as a base64 data URL.
   */
  onImageUpload?: (file: File) => Promise<string>;
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

// ---- Emoji Picker State ----

interface EmojiPickerState {
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

// ---- Drag Handle & Add Button Icons (Lucide) ----

// ---- Drag Handle (single handle that tracks hovered block) ----

function DragHandle({
  editorRef,
  onDragStart,
  onAddBlock,
  onOpenMenu,
}: Readonly<{
  editorRef: React.RefObject<HTMLDivElement | null>;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onAddBlock: (afterBlockId: string) => void;
  onOpenMenu: (blockId: string, position: { x: number; y: number }) => void;
}>) {
  // Track the current block being hovered (null = not hovering any block)
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  // Track the animated top position (persists even when hiding)
  const [top, setTop] = useState(0);
  const [visible, setVisible] = useState(false);
  const handleRef = useRef<HTMLDivElement>(null);
  const isOverHandle = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const container = editor.parentElement;
    if (!container) return;

    const onMouseMove = (e: MouseEvent) => {
      clearTimeout(hideTimer.current);

      if (handleRef.current?.contains(e.target as Node)) return;

      const blockEls = editor.querySelectorAll("[data-block-id]");

      for (const blockEl of blockEls) {
        const rect = (blockEl as HTMLElement).getBoundingClientRect();
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          const containerRect = container.getBoundingClientRect();
          const newTop = rect.top - containerRect.top + 4;
          const blockId = blockEl.getAttribute("data-block-id")!;
          setActiveBlockId(blockId);
          setTop(newTop);
          setVisible(true);
          return;
        }
      }
      // Mouse is between blocks or outside — keep handle at last position but start fade
      if (!isOverHandle.current) {
        hideTimer.current = setTimeout(() => {
          if (!isOverHandle.current) setVisible(false);
        }, 200);
      }
    };

    const onMouseLeave = (e: MouseEvent) => {
      if (handleRef.current?.contains(e.relatedTarget as Node)) return;
      if (isOverHandle.current) return;
      hideTimer.current = setTimeout(() => {
        if (!isOverHandle.current) setVisible(false);
      }, 200);
    };

    // Hide handle when the active block is removed from the DOM
    const observer = new MutationObserver(() => {
      if (activeBlockId && !editor.querySelector(`[data-block-id="${activeBlockId}"]`)) {
        setActiveBlockId(null);
        setVisible(false);
      }
    });
    observer.observe(editor, { childList: true, subtree: true });

    document.addEventListener("mousemove", onMouseMove);
    container.addEventListener("mouseleave", onMouseLeave);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      container.removeEventListener("mouseleave", onMouseLeave);
      observer.disconnect();
      clearTimeout(hideTimer.current);
    };
  }, [editorRef, activeBlockId]);

  const btnStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 22,
    height: 22,
    borderRadius: 4,
    border: "none",
    background: "none",
    color: "var(--text-muted, #999)",
    cursor: "pointer",
    padding: 0,
    transition: "background-color 100ms, color 100ms",
  };

  return (
    <div
      ref={handleRef}
      onMouseEnter={() => {
        isOverHandle.current = true;
        clearTimeout(hideTimer.current);
      }}
      onMouseLeave={() => {
        isOverHandle.current = false;
        hideTimer.current = setTimeout(() => setVisible(false), 200);
      }}
      style={{
        position: "absolute",
        left: -56,
        top,
        display: "flex",
        alignItems: "center",
        gap: 2,
        zIndex: 10,
        opacity: visible ? 1 : 0,
        transition: "top 500ms ease-out, opacity 500ms ease",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      {/* Plus button — add block after */}
      <button
        type="button"
        style={btnStyle}
        title="Add block below"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => { if (activeBlockId) onAddBlock(activeBlockId); }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--bg-hover, #f0f0f0)";
          e.currentTarget.style.color = "var(--text-primary, #1a1a1a)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "var(--text-muted, #999)";
        }}
      >
        <Plus size={14} />
      </button>

      {/* Grip handle — drag to reorder, click to open menu */}
      <div
        draggable
        onDragStart={(e) => {
          if (!activeBlockId) return;
          const editor = editorRef.current;
          if (editor) {
            const blockEl = editor.querySelector(`[data-block-id="${activeBlockId}"]`);
            if (blockEl) {
              const rect = blockEl.getBoundingClientRect();
              e.dataTransfer.setDragImage(blockEl, e.clientX - rect.left, e.clientY - rect.top);
            }
          }
          onDragStart(e, activeBlockId);
        }}
        onClick={(e) => {
          if (activeBlockId) {
            onOpenMenu(activeBlockId, { x: e.clientX, y: e.clientY });
          }
        }}
        style={{
          ...btnStyle,
          cursor: "grab",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--bg-hover, #f0f0f0)";
          e.currentTarget.style.color = "var(--text-primary, #1a1a1a)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "var(--text-muted, #999)";
        }}
        aria-label="Drag to reorder or click for options"
      >
        <GripVertical size={14} />
      </div>
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
      debugMode = false,
      className,
      onImageUpload,
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

    // Emoji picker state
    const [emojiPicker, setEmojiPicker] = useState<EmojiPickerState>({
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

    // Find & Replace state
    const [findReplace, setFindReplace] = useState<{ open: boolean; showReplace: boolean }>({
      open: false,
      showReplace: false,
    });

    // Block context menu state
    const [blockMenu, setBlockMenu] = useState<{
      open: boolean;
      blockId: string;
      position: { x: number; y: number };
    }>({ open: false, blockId: "", position: { x: 0, y: 0 } });

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
        const offset = sel.focus.offset;

        // Find "/" before the cursor: look backward from cursor for the last "/"
        // The slash must be preceded by a space, newline, or be at position 0
        const textBeforeCursor = text.slice(0, offset);
        const slashIdx = textBeforeCursor.lastIndexOf("/");

        if (slashIdx !== -1 && (slashIdx === 0 || text[slashIdx - 1] === " ")) {
          const filter = textBeforeCursor.slice(slashIdx + 1);
          // Close if filter is too long (user probably isn't looking for a command)
          if (filter.length <= 20) {
            const caretRect = getCaretRect();
            if (caretRect) {
              setSlashCommand({
                active: true,
                blockId: sel.focus.blockId,
                filter,
                position: { x: caretRect.left, y: caretRect.bottom + 4 },
              });
              return;
            }
          }
        }

        if (slashCommand.active) {
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

        const text = getPlainText(block.content);
        let currentDoc = docRef.current;

        // Find where the "/" trigger is in the text
        const sel = selectionRef.current;
        const cursorOffset = sel?.focus.blockId === blockId ? sel.focus.offset : text.length;
        const textBeforeCursor = text.slice(0, cursorOffset);
        const slashIdx = textBeforeCursor.lastIndexOf("/");
        const slashEnd = cursorOffset; // cursor is after the filter text

        if (slashIdx === 0 && slashEnd === text.length) {
          // "/" is the entire block content → clear and convert type
          const clearResult = replaceContent(currentDoc, blockId, []);
          currentDoc = clearResult.doc;
          const result = setBlockTypeOp(currentDoc, blockId, type);
          apply(result);
          // Explicitly set cursor to start of the converted block
          const newSel: EditorSelection = {
            anchor: { blockId, offset: 0 },
            focus: { blockId, offset: 0 },
          };
          setSelection(newSel);
          selectionRef.current = newSel;
        } else if (slashIdx >= 0) {
          // "/" is in the middle of text → remove the "/filter" and insert new block after
          const delResult = deleteTextOp(currentDoc, blockId, slashIdx, slashEnd - slashIdx);
          currentDoc = delResult.doc;
          // Insert a new block of the selected type after this one
          const newBlock = createBlock(type);
          currentDoc = insertBlockAfter(currentDoc, blockId, newBlock);
          setDoc(currentDoc);
          docRef.current = currentDoc;
          const newSel: EditorSelection = {
            anchor: { blockId: newBlock.id, offset: 0 },
            focus: { blockId: newBlock.id, offset: 0 },
          };
          setSelection(newSel);
          selectionRef.current = newSel;
          onChange?.(currentDoc);
          resetIdleTimer();
        }

        // Close the menu
        setSlashCommand({ active: false, blockId: "", filter: "", position: { x: 0, y: 0 } });
      },
      [slashCommand.blockId, onChange, resetIdleTimer, apply],
    );

    /** Close slash command menu */
    const handleSlashClose = useCallback(() => {
      setSlashCommand({ active: false, blockId: "", filter: "", position: { x: 0, y: 0 } });
    }, []);

    // ---- Emoji Picker Helpers ----

    /** Check if emoji picker should be active (triggered by `:`) */
    const updateEmojiPickerState = useCallback(
      (currentDoc: EditorDocument, sel: EditorSelection | null) => {
        if (!sel || slashCommand.active) {
          if (emojiPicker.active) setEmojiPicker(prev => ({ ...prev, active: false }));
          return;
        }
        if (sel.anchor.blockId !== sel.focus.blockId || sel.anchor.offset !== sel.focus.offset) {
          if (emojiPicker.active) setEmojiPicker(prev => ({ ...prev, active: false }));
          return;
        }
        const block = findBlock(currentDoc, sel.focus.blockId);
        if (!block) { if (emojiPicker.active) setEmojiPicker(prev => ({ ...prev, active: false })); return; }

        const text = getPlainText(block.content);
        const offset = sel.focus.offset;
        const textBeforeCursor = text.slice(0, offset);

        // Find ":" before cursor — must be preceded by space or at position 0
        const colonIdx = textBeforeCursor.lastIndexOf(":");
        if (colonIdx !== -1 && (colonIdx === 0 || /\s/.test(text[colonIdx - 1]))) {
          const filter = textBeforeCursor.slice(colonIdx + 1);
          // No spaces in filter (emoji names don't have spaces), max 30 chars
          if (filter.length <= 30 && !/\s/.test(filter)) {
            const caretRect = getCaretRect();
            if (caretRect) {
              setEmojiPicker({
                active: true,
                blockId: sel.focus.blockId,
                filter,
                position: { x: caretRect.left, y: caretRect.bottom + 4 },
              });
              return;
            }
          }
        }
        if (emojiPicker.active) setEmojiPicker(prev => ({ ...prev, active: false }));
      },
      [emojiPicker.active, slashCommand.active],
    );

    /** Handle emoji selection — replace `:filter` with the emoji character */
    const handleEmojiSelect = useCallback(
      (emoji: string) => {
        const blockId = emojiPicker.blockId;
        const block = findBlock(docRef.current, blockId);
        if (!block) return;

        const text = getPlainText(block.content);
        const sel = selectionRef.current;
        const cursorOffset = sel?.focus.blockId === blockId ? sel.focus.offset : text.length;
        const textBeforeCursor = text.slice(0, cursorOffset);
        const colonIdx = textBeforeCursor.lastIndexOf(":");

        if (colonIdx >= 0) {
          // Delete `:filter` and insert the emoji character
          let currentDoc = docRef.current;
          const delResult = deleteTextOp(currentDoc, blockId, colonIdx, cursorOffset - colonIdx);
          currentDoc = delResult.doc;
          const insResult = insertTextOp(currentDoc, blockId, colonIdx, emoji);
          currentDoc = insResult.doc;
          setDoc(currentDoc);
          docRef.current = currentDoc;
          const newSel: EditorSelection = {
            anchor: { blockId, offset: colonIdx + emoji.length },
            focus: { blockId, offset: colonIdx + emoji.length },
          };
          setSelection(newSel);
          selectionRef.current = newSel;
          onChange?.(currentDoc);
          resetIdleTimer();
        }

        setEmojiPicker({ active: false, blockId: "", filter: "", position: { x: 0, y: 0 } });
      },
      [emojiPicker.blockId, onChange, resetIdleTimer],
    );

    /** Close emoji picker */
    const handleEmojiClose = useCallback(() => {
      setEmojiPicker({ active: false, blockId: "", filter: "", position: { x: 0, y: 0 } });
    }, []);

    // ---- Floating Toolbar Helpers ----

    /** Update toolbar state based on current selection */
    const updateToolbarState = useCallback(
      (currentDoc: EditorDocument, sel: EditorSelection | null) => {
        // Don't close the toolbar while the link URL input is showing
        if (isToolbarLinkInputActive) return;

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

      // Skip if selection is inside a nested contentEditable (e.g., table cell)
      const anchorEl = domSel.anchorNode instanceof HTMLElement
        ? domSel.anchorNode
        : domSel.anchorNode?.parentElement;
      if (anchorEl?.closest?.("[contenteditable='false']")) return;

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

        // Update slash command, emoji picker, and toolbar states
        requestAnimationFrame(() => {
          updateSlashCommandState(docRef.current, sel);
          updateEmojiPickerState(docRef.current, sel);
          updateToolbarState(docRef.current, sel);
        });
      }
    }, [updateSlashCommandState, updateEmojiPickerState, updateToolbarState]);

    useEffect(() => {
      document.addEventListener("selectionchange", handleSelectionChange);
      return () => document.removeEventListener("selectionchange", handleSelectionChange);
    }, [handleSelectionChange]);

    const onKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (readOnly || isComposing.current) return;

        // If slash command is active, let the SlashCommandMenu handle these keys
        if (slashCommand.active) {
          if (
            e.key === "ArrowDown" ||
            e.key === "ArrowUp" ||
            e.key === "Enter" ||
            e.key === "Escape"
          ) {
            e.preventDefault();
            e.stopPropagation(); // Prevent any further handling
            // Don't handle Enter/etc here — the slash menu's capture-phase listener handles it
            return;
          }
        }

        // If emoji picker is active, let it handle navigation keys
        if (emojiPicker.active) {
          if (
            e.key === "ArrowDown" ||
            e.key === "ArrowUp" ||
            e.key === "Enter" ||
            e.key === "Escape" ||
            e.key === "Tab"
          ) {
            e.preventDefault();
            e.stopPropagation();
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

        // Find: Cmd+F
        if ((e.metaKey || e.ctrlKey) && e.key === "f") {
          e.preventDefault();
          setFindReplace({ open: true, showReplace: false });
          return;
        }

        // Find & Replace: Cmd+H
        if ((e.metaKey || e.ctrlKey) && e.key === "h") {
          e.preventDefault();
          setFindReplace({ open: true, showReplace: true });
          return;
        }

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

        // Delete entire block: Shift+Backspace or Cmd+Shift+Delete
        if (e.shiftKey && (e.key === "Backspace" || e.key === "Delete")) {
          e.preventDefault();
          const currentSel = selectionRef.current;
          if (currentSel && currentDoc.blocks.length > 1) {
            const delResult = deleteBlockOp(currentDoc, currentSel.focus.blockId);
            if (delResult.doc !== currentDoc) {
              apply(delResult);
            }
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
      [readOnly, apply, onChange, slashCommand.active, emojiPicker.active, toolbar.active, handleToolbarClose],
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

        // Skip if the event target is inside a nested contentEditable={false} subtree
        // (e.g., table cells have their own contentEditable and handle input themselves)
        const target = e.target as HTMLElement;
        if (target !== root && target.closest?.("[contenteditable='false']")) return;

        const sel = selectionRef.current;
        if (!sel) return;

        const inputEvent = e as InputEvent;
        const { result, handled } = handleBeforeInput(
          { doc: docRef.current, selection: sel },
          inputEvent,
        );
        if (handled && result.doc) {
          apply(result);

          // After applying, check for slash command and emoji picker triggers
          requestAnimationFrame(() => {
            const currentSel = selectionRef.current;
            if (currentSel) {
              updateSlashCommandState(docRef.current, currentSel);
              updateEmojiPickerState(docRef.current, currentSel);
            }
          });
        }
      };

      root.addEventListener("beforeinput", onNativeBeforeInput);
      return () => root.removeEventListener("beforeinput", onNativeBeforeInput);
    }, [readOnly, apply, updateSlashCommandState, updateEmojiPickerState]);

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
    }, [readOnly, doc]);

    // ---- Listen for table cell updates ----
    useEffect(() => {
      const handleTableUpdate = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        const newDoc = updateBlock(docRef.current, detail.blockId, (b) => {
          const props = { ...b.props, tableData: detail.tableData };
          // Persist all table metadata fields
          for (const key of ["cellMeta", "columnAlignments", "columnWidths", "merges", "showBorders", "compact", "colorTemplate"]) {
            if (detail[key] !== undefined) (props as any)[key] = detail[key];
          }
          return { ...b, props };
        });
        setDoc(newDoc);
        docRef.current = newDoc;
        onChange?.(newDoc);
      };
      globalThis.addEventListener("cortex-table-update", handleTableUpdate);
      return () => globalThis.removeEventListener("cortex-table-update", handleTableUpdate);
    }, [onChange]);

    // ---- Listen for image upload events ----
    useEffect(() => {
      const handleImageUpload = async (e: Event) => {
        const { blockId, dataUrl, fileName, file } = (e as CustomEvent).detail;

        let src: string;
        if (onImageUpload && file) {
          try {
            src = await onImageUpload(file);
          } catch {
            src = dataUrl;
          }
        } else {
          src = dataUrl;
        }

        const newDoc = updateBlock(docRef.current, blockId, (b) => ({
          ...b,
          props: { ...b.props, src, alt: fileName ?? "" },
        }));
        setDoc(newDoc);
        docRef.current = newDoc;
        onChange?.(newDoc);
      };
      globalThis.addEventListener("cortex-image-upload", handleImageUpload);
      return () => globalThis.removeEventListener("cortex-image-upload", handleImageUpload);
    }, [onChange, onImageUpload]);

    // ---- Render ----
    return (
      <div
        className={`cx-editor-container ${className ?? ""}`}
        style={{ position: "relative" }}
        onDragOver={(e) => {
          if (!dragState.draggingBlockId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          // Find the closest block based on mouse Y position
          const editorEl = rootRef.current;
          if (!editorEl) return;
          const blockEls = editorEl.querySelectorAll("[data-block-id]");
          let targetIdx = doc.blocks.length - 1;
          for (let i = 0; i < blockEls.length; i++) {
            const rect = blockEls[i].getBoundingClientRect();
            if (e.clientY < rect.top + rect.height / 2) {
              targetIdx = i;
              break;
            }
          }
          setDragState(prev => ({ ...prev, dropTargetIndex: targetIdx }));
        }}
        onDrop={(e) => {
          if (!dragState.draggingBlockId) return;
          e.preventDefault();
          const targetIndex = dragState.dropTargetIndex ?? 0;
          const result = moveBlockOp(docRef.current, dragState.draggingBlockId, targetIndex);
          if (result.doc !== docRef.current) {
            apply(result);
          }
          setDragState({ draggingBlockId: null, dropTargetIndex: null });
        }}
        onDragEnd={() => setDragState({ draggingBlockId: null, dropTargetIndex: null })}
      >
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
          {doc.blocks.map((block, blockIndex) => {
            // Reduce spacing between consecutive list items of the same type
            const listTypes = ["bulletList", "numberedList", "todo"];
            const isListItem = listTypes.includes(block.type);
            const prevBlock = blockIndex > 0 ? doc.blocks[blockIndex - 1] : null;
            const isContinuation = isListItem && prevBlock?.type === block.type;
            return (
            <div
              key={block.id}
              data-block-id={block.id}
              className="cx-block-wrapper"
              style={{
                position: "relative",
                padding: isContinuation ? "1px 0" : "4px 0",
                opacity: dragState.draggingBlockId === block.id ? 0.5 : 1,
              }}
            >
              {/* Drop indicator line */}
              {dragState.dropTargetIndex === blockIndex && dragState.draggingBlockId !== block.id && (
                <div
                  contentEditable={false}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 2,
                    backgroundColor: "var(--accent, #2563eb)",
                    borderRadius: 1,
                    pointerEvents: "none",
                    zIndex: 5,
                  }}
                />
              )}

              <BlockRenderer
                block={
                  block.type === "numberedList"
                    ? (() => {
                        const info = numberedBlocks.get(block.id);
                        return {
                          ...block,
                          props: {
                            ...block.props,
                            number: info?.number ?? 1,
                            numberStyle: info?.numberStyle ?? block.props.numberStyle ?? "decimal",
                          },
                        };
                      })()
                    : block
                }
                readOnly={readOnly}
                onToggleTodo={onToggleTodo}
                onToggleCollapse={onToggleCollapse}
              />
            </div>
            );
          })}
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

        {/* Drag handle — plus button + grip (click for menu, drag to reorder) */}
        {!readOnly && (
          <DragHandle
            editorRef={rootRef}
            onDragStart={handleDragStart}
            onAddBlock={(afterBlockId) => {
              const block = createBlock("paragraph");
              const newDoc = insertBlockAfter(docRef.current, afterBlockId, block);
              setDoc(newDoc);
              docRef.current = newDoc;
              setSelection({ anchor: { blockId: block.id, offset: 0 }, focus: { blockId: block.id, offset: 0 } });
              selectionRef.current = { anchor: { blockId: block.id, offset: 0 }, focus: { blockId: block.id, offset: 0 } };
              onChange?.(newDoc);
              requestAnimationFrame(() => rootRef.current?.focus());
            }}
            onOpenMenu={(blockId, position) => {
              setBlockMenu({ open: true, blockId, position });
            }}
          />
        )}

        {/* Block context menu */}
        {blockMenu.open && (
          <BlockMenu
            position={blockMenu.position}
            blockId={blockMenu.blockId}
            blockType={(findBlock(docRef.current, blockMenu.blockId)?.type ?? "paragraph") as any}
            onClose={() => setBlockMenu({ open: false, blockId: "", position: { x: 0, y: 0 } })}
            onDelete={(id) => {
              if (docRef.current.blocks.length > 1) {
                const result = deleteBlockOp(docRef.current, id);
                if (result.doc !== docRef.current) apply(result);
              }
              setBlockMenu({ open: false, blockId: "", position: { x: 0, y: 0 } });
            }}
            onDuplicate={(id) => {
              const block = findBlock(docRef.current, id);
              if (block) {
                const dup = { ...block, id: generateId(), children: [...block.children] };
                const newDoc = insertBlockAfter(docRef.current, id, dup);
                setDoc(newDoc);
                docRef.current = newDoc;
                onChange?.(newDoc);
              }
              setBlockMenu({ open: false, blockId: "", position: { x: 0, y: 0 } });
            }}
            onTurnInto={(id, newType) => {
              const result = setBlockTypeOp(docRef.current, id, newType);
              if (result.doc !== docRef.current) apply(result);
              setBlockMenu({ open: false, blockId: "", position: { x: 0, y: 0 } });
            }}
            onMoveUp={(id) => {
              const idx = docRef.current.blocks.findIndex(b => b.id === id);
              if (idx > 0) {
                const result = moveBlockOp(docRef.current, id, idx - 1);
                if (result.doc !== docRef.current) apply(result);
              }
              setBlockMenu({ open: false, blockId: "", position: { x: 0, y: 0 } });
            }}
            onMoveDown={(id) => {
              const idx = docRef.current.blocks.findIndex(b => b.id === id);
              if (idx < docRef.current.blocks.length - 1) {
                const result = moveBlockOp(docRef.current, id, idx + 2);
                if (result.doc !== docRef.current) apply(result);
              }
              setBlockMenu({ open: false, blockId: "", position: { x: 0, y: 0 } });
            }}
            // ---- Table-specific props ----
            tableState={(() => {
              const blk = findBlock(docRef.current, blockMenu.blockId);
              if (blk?.type !== "table") return undefined;
              return {
                showBorders: (blk.props.showBorders as boolean) ?? true,
                compact: (blk.props.compact as boolean) ?? false,
              };
            })()}
            onToggleBorders={(id) => {
              const blk = findBlock(docRef.current, id);
              if (!blk) return;
              const next = !((blk.props.showBorders as boolean) ?? true);
              globalThis.dispatchEvent(
                new CustomEvent("cortex-table-update", {
                  detail: { blockId: id, tableData: blk.props.tableData, showBorders: next },
                }),
              );
            }}
            onToggleCompact={(id) => {
              const blk = findBlock(docRef.current, id);
              if (!blk) return;
              const next = !((blk.props.compact as boolean) ?? false);
              globalThis.dispatchEvent(
                new CustomEvent("cortex-table-update", {
                  detail: { blockId: id, tableData: blk.props.tableData, compact: next },
                }),
              );
            }}
            onApplyColorTemplate={(id, template) => {
              const blk = findBlock(docRef.current, id);
              if (!blk) return;
              const tableData = blk.props.tableData as string[][] | undefined;
              const rows = tableData?.length ?? 0;
              const cols = tableData?.[0]?.length ?? 0;
              const cellMeta = template.apply(rows, cols);
              // Store template name so row/col changes can reapply the pattern
              const colorTemplate = template.name === "Default" ? "" : template.name;
              globalThis.dispatchEvent(
                new CustomEvent("cortex-table-update", {
                  detail: { blockId: id, tableData: tableData, cellMeta, colorTemplate },
                }),
              );
            }}
            // ---- List-specific props ----
            listState={(() => {
              const blk = findBlock(docRef.current, blockMenu.blockId);
              if (!blk || (blk.type !== "bulletList" && blk.type !== "numberedList")) return undefined;
              return {
                listStyle: blk.props.listStyle as any,
                numberStyle: blk.props.numberStyle as any,
                startFrom: (blk.props.startFrom as number) ?? 1,
              };
            })()}
            onChangeListStyle={(id, style) => {
              const newDoc = updateBlock(docRef.current, id, (b) => ({
                ...b,
                props: { ...b.props, listStyle: style },
              }));
              setDoc(newDoc);
              docRef.current = newDoc;
              onChange?.(newDoc);
            }}
            onChangeNumberStyle={(id, style) => {
              // Apply numberStyle to the first block in this numbered list run
              const runLeaderId = findListRunLeader(docRef.current.blocks, id);
              const newDoc = updateBlock(docRef.current, runLeaderId, (b) => ({
                ...b,
                props: { ...b.props, numberStyle: style },
              }));
              setDoc(newDoc);
              docRef.current = newDoc;
              onChange?.(newDoc);
            }}
            onChangeStartFrom={(id, startFrom) => {
              // Apply startFrom to the first block in this numbered list run
              const runLeaderId = findListRunLeader(docRef.current.blocks, id);
              const newDoc = updateBlock(docRef.current, runLeaderId, (b) => ({
                ...b,
                props: { ...b.props, startFrom },
              }));
              setDoc(newDoc);
              docRef.current = newDoc;
              onChange?.(newDoc);
            }}
          />
        )}

        {/* Slash Command Menu — rendered outside the contentEditable div */}
        {slashCommand.active && (
          <SlashCommandMenu
            position={slashCommand.position}
            filter={slashCommand.filter}
            onSelect={handleSlashSelect}
            onClose={handleSlashClose}
          />
        )}

        {/* Emoji Picker — triggered by ":" */}
        {emojiPicker.active && (
          <EmojiPicker
            position={emojiPicker.position}
            filter={emojiPicker.filter}
            onSelect={handleEmojiSelect}
            onClose={handleEmojiClose}
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

        {/* Find & Replace bar */}
        {findReplace.open && (
          <FindReplaceBar
            doc={doc}
            showReplace={findReplace.showReplace}
            onHighlight={() => {/* Highlighting is now CSS-based inside FindReplaceBar */}}
            onNavigate={() => {
              // Navigation/scrolling is handled by CSS highlights inside FindReplaceBar.
              // We intentionally do NOT set the editor selection here so the
              // find input keeps focus and the user can keep typing.
            }}
            onReplace={(match, replacement) => {
              const del = deleteTextOp(docRef.current, match.blockId, match.offset, match.length);
              const ins = insertTextOp(del.doc, match.blockId, match.offset, replacement);
              apply(ins);
            }}
            onReplaceAll={(matches, replacement) => {
              // Process in reverse order to maintain offsets
              let currentDoc = docRef.current;
              const sorted = [...matches].sort((a, b) =>
                a.blockIndex !== b.blockIndex
                  ? b.blockIndex - a.blockIndex
                  : b.offset - a.offset
              );
              for (const m of sorted) {
                const del = deleteTextOp(currentDoc, m.blockId, m.offset, m.length);
                const ins = insertTextOp(del.doc, m.blockId, m.offset, replacement);
                currentDoc = ins.doc;
              }
              setDoc(currentDoc);
              docRef.current = currentDoc;
              onChange?.(currentDoc);
            }}
            onClose={() => setFindReplace({ open: false, showReplace: false })}
          />
        )}

        {/* Debug panel — shows live markdown output, document JSON, and event log */}
        {debugMode && (
          <DebugPanel doc={doc} selection={selection} />
        )}
      </div>
    );
  },
);

// ---- Helpers ----

/** Debug panel — shows live markdown, document model, and selection state */
function DebugPanel({ doc, selection }: { doc: EditorDocument; selection: EditorSelection | null }) {
  const [tab, setTab] = useState<"markdown" | "json" | "selection">("markdown");

  const markdown = blocksToMarkdown(doc.blocks);

  const tabs = [
    { id: "markdown" as const, label: "Markdown" },
    { id: "json" as const, label: "Document JSON" },
    { id: "selection" as const, label: "Selection" },
  ];

  return (
    <div
      style={{
        marginTop: 16,
        border: "1px solid var(--border-primary, #e5e5e5)",
        borderRadius: 8,
        overflow: "hidden",
        fontSize: 12,
        fontFamily: "'SF Mono', 'Fira Code', Menlo, Consolas, monospace",
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          gap: 0,
          borderBottom: "1px solid var(--border-primary, #e5e5e5)",
          backgroundColor: "var(--bg-secondary, #f5f5f5)",
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              padding: "6px 12px",
              border: "none",
              background: tab === t.id ? "var(--bg-primary, #fff)" : "transparent",
              color: tab === t.id ? "var(--text-primary, #1a1a1a)" : "var(--text-muted, #999)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 11,
              fontWeight: tab === t.id ? 600 : 400,
              borderBottom: tab === t.id ? "2px solid var(--accent, #2563eb)" : "2px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span
          style={{
            padding: "6px 12px",
            color: "var(--text-muted, #999)",
            fontSize: 10,
          }}
        >
          {doc.blocks.length} blocks &middot; v{doc.version}
        </span>
      </div>
      {/* Content */}
      <pre
        style={{
          margin: 0,
          padding: 12,
          maxHeight: 240,
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          backgroundColor: "var(--bg-primary, #fff)",
          color: "var(--text-secondary, #4a4a4a)",
          lineHeight: 1.5,
        }}
      >
        {tab === "markdown" && (markdown || "(empty document)")}
        {tab === "json" && JSON.stringify(doc, null, 2)}
        {tab === "selection" && (selection
          ? JSON.stringify(selection, null, 2)
          : "(no selection)"
        )}
      </pre>
    </div>
  );
}

/** Find the first block ID in a consecutive numberedList run containing the given block */
function findListRunLeader(blocks: Block[], blockId: string): string {
  const idx = blocks.findIndex((b) => b.id === blockId);
  if (idx < 0) return blockId;
  let leader = idx;
  for (let i = idx - 1; i >= 0; i--) {
    if (blocks[i].type === "numberedList") leader = i;
    else break;
  }
  return blocks[leader].id;
}

/** Info computed for each numbered list item in a run */
interface ListNumberInfo {
  number: number;
  numberStyle: string;
  startFrom: number;
}

/** Compute sequential numbers + shared style for numbered list items */
function computeListNumbers(blocks: Block[]): Map<string, ListNumberInfo> {
  const map = new Map<string, ListNumberInfo>();
  let counter = 0;
  let inRun = false;
  let runStyle = "decimal";
  let runStart = 1;

  for (const block of blocks) {
    if (block.type === "numberedList") {
      if (!inRun) {
        // Start of a new run — take style and startFrom from the first item
        runStart = (block.props.startFrom as number) ?? 1;
        runStyle = (block.props.numberStyle as string) ?? "decimal";
        counter = runStart - 1;
        inRun = true;
      }
      counter++;
      map.set(block.id, { number: counter, numberStyle: runStyle, startFrom: runStart });
    } else {
      counter = 0;
      inRun = false;
    }
  }

  return map;
}

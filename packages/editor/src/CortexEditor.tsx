// ============================================================
// CortexEditor — the main editor component.
// Wires together: document model, input handling, selection,
// history (undo/redo), block rendering, and auto-save hooks.
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

// ---- Component ----

export const CortexEditor = forwardRef<CortexEditorRef, CortexEditorProps>(
  function CortexEditor(
    {
      initialDocument,
      onChange,
      onIdle,
      onBlur,
      idleDebounceMs = 60_000,
      placeholder = "Type '/' for commands...",
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
      [onChange, selection],
    );

    // ---- Idle timer ----
    const resetIdleTimer = useCallback(() => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (onIdle) {
        idleTimerRef.current = setTimeout(() => {
          onIdle(docRef.current);
        }, idleDebounceMs);
      }
    }, [onIdle, idleDebounceMs]);

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

    // ---- Event Handlers ----

    const handleSelectionChange = useCallback(() => {
      if (isComposing.current || !rootRef.current) return;

      const domSel = window.getSelection();
      if (!domSel || !rootRef.current.contains(domSel.anchorNode)) return;

      const sel = readSelection(rootRef.current, doc);
      if (sel) {
        setSelection(sel);
      }
    }, [doc]);

    useEffect(() => {
      document.addEventListener("selectionchange", handleSelectionChange);
      return () => document.removeEventListener("selectionchange", handleSelectionChange);
    }, [handleSelectionChange]);

    const onKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (readOnly || isComposing.current) return;

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
      [doc, selection, readOnly, apply, onChange],
    );

    const onBeforeInput = useCallback(
      (e: React.FormEvent) => {
        if (readOnly || isComposing.current || !selection) return;

        const inputEvent = e.nativeEvent as InputEvent;
        const { result, handled } = handleBeforeInput({ doc, selection }, inputEvent);
        if (handled && result.doc) {
          apply(result);
        }
      },
      [doc, selection, readOnly, apply],
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

    // ---- Todo toggle ----
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
      <div
        ref={rootRef}
        className={`cx-editor cx-relative cx-min-h-[200px] cx-outline-none ${className ?? ""}`}
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
            className="cx-pointer-events-none cx-absolute cx-left-0 cx-top-0 cx-select-none cx-text-neutral-600"
            aria-hidden="true"
          >
            {placeholder}
          </div>
        )}
        {doc.blocks.map((block) => (
          <div
            key={block.id}
            data-block-id={block.id}
            className="cx-block-wrapper cx-relative cx-py-0.5"
          >
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

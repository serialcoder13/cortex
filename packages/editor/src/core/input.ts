// ============================================================
// Input handling — processes keyboard events, beforeinput
// events, and IME composition events. Translates user input
// into document operations.
// ============================================================

import type { Block, EditorDocument, Mark, Selection, BlockType } from "./types";
import { isCollapsed, getTextLength, getPlainText } from "./types";
import { findBlock, findBlockIndex, splitContent, mergeAdjacentSpans } from "./document";
import {
  insertText,
  deleteText,
  splitBlock,
  mergeBlock,
  toggleMark,
  setBlockTypeOp,
  insertBlockOp,
  type ApplyResult,
} from "./operations";
import { getOrderedSelection } from "./selection";

export interface InputContext {
  doc: EditorDocument;
  selection: Selection;
}

export interface InputResult {
  result: ApplyResult;
  handled: boolean;
}

const NOOP: InputResult = { result: { doc: null as any, ops: [], selection: null }, handled: false };

// ---- Keyboard shortcut handling (keydown) ----

export function handleKeyDown(
  ctx: InputContext,
  e: KeyboardEvent,
): InputResult {
  const { doc, selection } = ctx;
  const mod = e.metaKey || e.ctrlKey;

  // ---- Formatting shortcuts ----
  if (mod && !e.shiftKey) {
    const markMap: Record<string, Mark> = {
      b: { type: "bold" },
      i: { type: "italic" },
      u: { type: "underline" },
    };
    const mark = markMap[e.key.toLowerCase()];
    if (mark && !isCollapsed(selection)) {
      e.preventDefault();
      const { start, end } = getOrderedSelection(doc, selection);
      if (start.blockId === end.blockId) {
        const result = toggleMark(doc, start.blockId, start.offset, end.offset, mark);
        return { result: { ...result, selection }, handled: true };
      }
      return { result: { doc, ops: [], selection }, handled: true };
    }

    // Strikethrough: Cmd+Shift+S handled below
  }

  if (mod && e.shiftKey && e.key.toLowerCase() === "s") {
    e.preventDefault();
    if (!isCollapsed(selection)) {
      const { start, end } = getOrderedSelection(doc, selection);
      if (start.blockId === end.blockId) {
        const result = toggleMark(doc, start.blockId, start.offset, end.offset, { type: "strikethrough" });
        return { result: { ...result, selection }, handled: true };
      }
    }
    return { result: { doc, ops: [], selection }, handled: true };
  }

  // Inline code: Cmd+E
  if (mod && e.key.toLowerCase() === "e") {
    e.preventDefault();
    if (!isCollapsed(selection)) {
      const { start, end } = getOrderedSelection(doc, selection);
      if (start.blockId === end.blockId) {
        const result = toggleMark(doc, start.blockId, start.offset, end.offset, { type: "code" });
        return { result: { ...result, selection }, handled: true };
      }
    }
    return { result: { doc, ops: [], selection }, handled: true };
  }

  // ---- Enter key ----
  if (e.key === "Enter") {
    e.preventDefault();

    const block = findBlock(doc, selection.focus.blockId);
    if (!block) return NOOP;

    // Code blocks: Enter inserts a newline within the block (not a split)
    // Two consecutive enters at the end (trailing \n) exits the code block
    if (block.type === "codeBlock") {
      const text = getPlainText(block.content);
      const offset = selection.focus.offset;

      // If the text ends with \n and cursor is at the end, exit code block
      // by removing the trailing newline and creating a new paragraph
      if (text.endsWith("\n") && offset === text.length && !e.shiftKey) {
        // Remove trailing newline
        const trimResult = deleteText(doc, block.id, text.length - 1, 1);
        // Insert new paragraph after
        const newResult = insertBlockOp(trimResult.doc, block.id, "paragraph");
        return {
          result: {
            doc: newResult.doc,
            ops: [...trimResult.ops, ...newResult.ops],
            selection: newResult.selection,
          },
          handled: true,
        };
      }

      // Otherwise, insert a newline character
      const result = insertText(doc, selection.focus.blockId, offset, "\n");
      return { result, handled: true };
    }

    // If selection is in an empty list/todo/quote block, convert to paragraph
    if (!e.shiftKey) {
      const text = getPlainText(block.content);
      const convertableTypes: BlockType[] = ["bulletList", "numberedList", "todo", "quote"];
      if (text === "" && convertableTypes.includes(block.type)) {
        const result = setBlockTypeOp(doc, block.id, "paragraph");
        return { result: { ...result, selection: { anchor: selection.focus, focus: selection.focus } }, handled: true };
      }
    }

    // Delete selected text first, then split
    let currentDoc = doc;
    let currentSel = selection;

    if (!isCollapsed(selection)) {
      const delResult = deleteSelectedText(doc, selection);
      currentDoc = delResult.doc;
      currentSel = delResult.selection ?? selection;
    }

    const result = splitBlock(currentDoc, currentSel.focus.blockId, currentSel.focus.offset);
    return { result, handled: true };
  }

  // ---- Backspace ----
  if (e.key === "Backspace") {
    e.preventDefault();

    // Delete selection if expanded
    if (!isCollapsed(selection)) {
      const result = deleteSelectedText(doc, selection);
      return { result, handled: true };
    }

    const block = findBlock(doc, selection.focus.blockId);
    if (!block) return NOOP;

    if (selection.focus.offset === 0) {
      // At the start of a block — merge backward or convert type
      const result = mergeBlock(doc, selection.focus.blockId, "backward");
      return { result, handled: true };
    }

    // Delete one character backward
    const result = deleteText(doc, selection.focus.blockId, selection.focus.offset - 1, 1);
    return { result, handled: true };
  }

  // ---- Delete ----
  if (e.key === "Delete") {
    e.preventDefault();

    if (!isCollapsed(selection)) {
      const result = deleteSelectedText(doc, selection);
      return { result, handled: true };
    }

    const block = findBlock(doc, selection.focus.blockId);
    if (!block) return NOOP;

    const textLen = getTextLength(block.content);
    if (selection.focus.offset >= textLen) {
      // At the end — merge forward
      const result = mergeBlock(doc, selection.focus.blockId, "forward");
      return { result, handled: true };
    }

    const result = deleteText(doc, selection.focus.blockId, selection.focus.offset, 1);
    return { result, handled: true };
  }

  // ---- Tab ----
  if (e.key === "Tab") {
    e.preventDefault();
    // Insert two spaces (simple indent behavior)
    const result = insertText(doc, selection.focus.blockId, selection.focus.offset, "  ");
    return { result, handled: true };
  }

  // Not handled — let beforeinput take care of text input
  return NOOP;
}

// ---- beforeinput event handling ----

export function handleBeforeInput(
  ctx: InputContext,
  e: InputEvent,
): InputResult {
  const { doc, selection } = ctx;

  switch (e.inputType) {
    case "insertText":
    case "insertReplacementText": {
      const text = e.data;
      if (!text) return NOOP;

      e.preventDefault();

      // Delete selection first if expanded
      let currentDoc = doc;
      let currentSel = selection;
      if (!isCollapsed(selection)) {
        const delResult = deleteSelectedText(doc, selection);
        currentDoc = delResult.doc;
        currentSel = delResult.selection ?? selection;
      }

      const result = insertText(currentDoc, currentSel.focus.blockId, currentSel.focus.offset, text);

      // Check for markdown shortcuts after inserting
      const shortcut = checkMarkdownShortcuts(result.doc, currentSel.focus.blockId);
      if (shortcut) {
        return { result: shortcut, handled: true };
      }

      return { result, handled: true };
    }

    case "insertParagraph": {
      // Handled by keydown Enter
      return NOOP;
    }

    case "deleteContentBackward": {
      // Handled by keydown Backspace
      return NOOP;
    }

    case "deleteContentForward": {
      // Handled by keydown Delete
      return NOOP;
    }

    case "insertFromPaste": {
      // Handled by clipboard.ts paste handler
      return NOOP;
    }

    default:
      return NOOP;
  }
}

// ---- Markdown shortcuts ----
// Triggered after text insertion to auto-convert patterns like "## " or "- "

function checkMarkdownShortcuts(
  doc: EditorDocument,
  blockId: string,
): ApplyResult | null {
  const block = findBlock(doc, blockId);
  if (!block || block.type !== "paragraph") return null;

  const text = getPlainText(block.content);

  // Heading shortcuts: "# ", "## ", "### "
  const headingMatch = text.match(/^(#{1,3})\s$/);
  if (headingMatch) {
    const level = headingMatch[1]!.length;
    const type = `heading${level}` as BlockType;
    return {
      ...setBlockTypeOp(doc, blockId, type),
      ...clearBlockText(doc, blockId, type),
    };
  }

  // Bullet list: "- " or "* "
  if (text === "- " || text === "* ") {
    return clearBlockText(doc, blockId, "bulletList");
  }

  // Numbered list: "1. "
  if (text === "1. ") {
    return clearBlockText(doc, blockId, "numberedList");
  }

  // Todo: "[] " or "[ ] "
  if (text === "[] " || text === "[ ] ") {
    return clearBlockText(doc, blockId, "todo", { checked: false });
  }

  // Checked todo: "[x] "
  if (text === "[x] " || text === "[X] ") {
    return clearBlockText(doc, blockId, "todo", { checked: true });
  }

  // Quote: "> "
  if (text === "> ") {
    return clearBlockText(doc, blockId, "quote");
  }

  // Divider: "---" or "***"
  if (text === "---" || text === "***" || text === "---\n") {
    const dividerResult = setBlockTypeOp(doc, blockId, "divider");
    // Clear the text and insert a new paragraph after
    let newDoc = dividerResult.doc;
    newDoc = {
      ...newDoc,
      blocks: newDoc.blocks.map((b) =>
        b.id === blockId ? { ...b, content: [] } : b,
      ),
    };
    const insertResult = insertBlockOp(newDoc, blockId, "paragraph");
    return {
      doc: insertResult.doc,
      ops: [...dividerResult.ops, ...insertResult.ops],
      selection: insertResult.selection,
    };
  }

  // Code block: "```"
  if (text === "```" || text === "``` ") {
    return clearBlockText(doc, blockId, "codeBlock");
  }

  return null;
}

/** Helper: convert block type and clear its text */
function clearBlockText(
  doc: EditorDocument,
  blockId: string,
  newType: BlockType,
  props: Record<string, any> = {},
): ApplyResult {
  const typeResult = setBlockTypeOp(doc, blockId, newType, props);
  const newDoc = {
    ...typeResult.doc,
    blocks: typeResult.doc.blocks.map((b) =>
      b.id === blockId ? { ...b, content: [] } : b,
    ),
  };
  return {
    doc: newDoc,
    ops: typeResult.ops,
    selection: { anchor: { blockId, offset: 0 }, focus: { blockId, offset: 0 } },
  };
}

// ---- Multi-block selection deletion ----

function deleteSelectedText(doc: EditorDocument, sel: Selection): ApplyResult {
  const { start, end } = getOrderedSelection(doc, sel);

  if (start.blockId === end.blockId) {
    // Same block — just delete the range
    return deleteText(doc, start.blockId, start.offset, end.offset - start.offset);
  }

  // Multi-block deletion:
  // 1. Keep text before start.offset in start block
  // 2. Keep text after end.offset in end block
  // 3. Delete all blocks between start and end
  // 4. Merge remaining content into start block

  const startIdx = findBlockIndex(doc, start.blockId);
  const endIdx = findBlockIndex(doc, end.blockId);
  if (startIdx === -1 || endIdx === -1) return { doc, ops: [], selection: null };

  const startBlock = doc.blocks[startIdx];
  const endBlock = doc.blocks[endIdx];
  if (!startBlock || !endBlock) return { doc, ops: [], selection: null };

  // Get the parts to keep
  const [keepBefore] = splitContent(startBlock.content, start.offset);
  const [, keepAfter] = splitContent(endBlock.content, end.offset);

  // Merge the kept parts
  const mergedContent = mergeAdjacentSpans([...keepBefore, ...keepAfter]);

  // Build new block list
  const blocks: Block[] = [];
  for (let i = 0; i < doc.blocks.length; i++) {
    if (i === startIdx) {
      blocks.push({ ...startBlock, content: mergedContent });
    } else if (i > startIdx && i <= endIdx) {
      // Skip — these blocks are deleted
    } else {
      blocks.push(doc.blocks[i]);
    }
  }

  const newDoc: EditorDocument = { blocks, version: doc.version + 1 };
  const selection: Selection = {
    anchor: { blockId: start.blockId, offset: start.offset },
    focus: { blockId: start.blockId, offset: start.offset },
  };

  return { doc: newDoc, ops: [], selection };
}

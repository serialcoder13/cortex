// ============================================================
// Clipboard — handles copy, cut, and paste operations.
// Copies as both HTML (for rich paste) and plain text.
// Parses pasted content into blocks.
// ============================================================

import type { Block, EditorDocument, Selection, TextSpan, BlockType } from "./types";
import { createBlock, generateId, getPlainText, isCollapsed } from "./types";
import { findBlock, findBlockIndex, splitContent, mergeAdjacentSpans } from "./document";
import { getOrderedSelection } from "./selection";
import type { ApplyResult } from "./operations";
import { insertText, deleteText } from "./operations";
import { markdownToBlocks } from "../markdown/deserialize";

/** Handle copy event — serialize selected content to clipboard */
export function handleCopy(
  doc: EditorDocument,
  selection: Selection,
  e: ClipboardEvent,
): void {
  if (isCollapsed(selection)) return;
  e.preventDefault();

  const { text, html } = serializeSelection(doc, selection);
  e.clipboardData?.setData("text/plain", text);
  e.clipboardData?.setData("text/html", html);
}

/** Handle cut event — copy then delete */
export function handleCut(
  doc: EditorDocument,
  selection: Selection,
  e: ClipboardEvent,
): ApplyResult | null {
  if (isCollapsed(selection)) return null;

  // Copy first
  handleCopy(doc, selection, e);

  // Then delete the selection
  return deleteSelection(doc, selection);
}

/** Handle paste event — parse clipboard and insert */
export function handlePaste(
  doc: EditorDocument,
  selection: Selection,
  e: ClipboardEvent,
): ApplyResult | null {
  e.preventDefault();

  const html = e.clipboardData?.getData("text/html");
  const text = e.clipboardData?.getData("text/plain") ?? "";

  if (!text && !html) return null;

  // Delete selection first if expanded
  let currentDoc = doc;
  let currentSel = selection;
  if (!isCollapsed(selection)) {
    const delResult = deleteSelection(doc, selection);
    if (delResult) {
      currentDoc = delResult.doc;
      currentSel = delResult.selection ?? selection;
    }
  }

  // Smart markdown detection: if the pasted text looks like markdown,
  // use the full markdown parser to preserve inline formatting.
  if (looksLikeMarkdown(text)) {
    return pasteMarkdownBlocks(currentDoc, currentSel, text);
  }

  // Plain text fallback — split by newlines to create multiple blocks
  const lines = text.split("\n");

  if (lines.length === 1) {
    // Single line — insert into current block
    return insertText(currentDoc, currentSel.focus.blockId, currentSel.focus.offset, lines[0]!);
  }

  // Multi-line paste: insert first line into current block,
  // then create new blocks for subsequent lines
  let result = insertText(currentDoc, currentSel.focus.blockId, currentSel.focus.offset, lines[0]!);
  let workingDoc = result.doc;
  let lastBlockId = currentSel.focus.blockId;
  const allOps = [...result.ops];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    const blockType = detectBlockType(line);
    const cleanText = cleanLinePrefix(line, blockType);

    const newBlock = createBlock(blockType, cleanText);
    const blocks = [...workingDoc.blocks];
    const idx = blocks.findIndex((b) => b.id === lastBlockId);
    blocks.splice(idx + 1, 0, newBlock);
    workingDoc = { blocks, version: workingDoc.version + 1 };
    lastBlockId = newBlock.id;
  }

  const lastBlock = findBlock(workingDoc, lastBlockId);
  const offset = lastBlock ? getPlainText(lastBlock.content).length : 0;

  return {
    doc: workingDoc,
    ops: allOps,
    selection: {
      anchor: { blockId: lastBlockId, offset },
      focus: { blockId: lastBlockId, offset },
    },
  };
}

// ---- Helpers ----

/** Detect whether pasted text contains markdown formatting patterns */
export function looksLikeMarkdown(text: string): boolean {
  // Headings: # Heading
  if (/^#{1,6}\s/m.test(text)) return true;
  // Code fences: ```
  if (/^```/m.test(text)) return true;
  // Unordered lists: - item or * item
  if (/^[-*]\s/m.test(text)) return true;
  // Ordered lists: 1. item
  if (/^\d+\.\s/m.test(text)) return true;
  // Bold: **text**
  if (/\*\*.+?\*\*/.test(text)) return true;
  // Italic: *text* (but not bold)
  if (/(?<!\*)\*(?!\*).+?(?<!\*)\*(?!\*)/.test(text)) return true;
  // Links: [text](url)
  if (/\[.+?\]\(.+?\)/.test(text)) return true;
  // Images: ![alt](url)
  if (/!\[.*?\]\(.+?\)/.test(text)) return true;

  return false;
}

/** Paste text as parsed markdown blocks, inserted after the current block */
function pasteMarkdownBlocks(
  doc: EditorDocument,
  sel: Selection,
  text: string,
): ApplyResult {
  const parsedBlocks = markdownToBlocks(text);

  if (parsedBlocks.length === 0) {
    return { doc, ops: [], selection: null };
  }

  const currentIdx = findBlockIndex(doc, sel.focus.blockId);
  if (currentIdx === -1) return { doc, ops: [], selection: null };

  const blocks = [...doc.blocks];
  // Insert all parsed blocks after the current block
  blocks.splice(currentIdx + 1, 0, ...parsedBlocks);

  const lastParsed = parsedBlocks.at(-1)!;
  const offset = getPlainText(lastParsed.content).length;

  return {
    doc: { blocks, version: doc.version + 1 },
    ops: [],
    selection: {
      anchor: { blockId: lastParsed.id, offset },
      focus: { blockId: lastParsed.id, offset },
    },
  };
}

/** Serialize a selection to plain text and HTML */
function serializeSelection(
  doc: EditorDocument,
  sel: Selection,
): { text: string; html: string } {
  const { start, end } = getOrderedSelection(doc, sel);
  const startIdx = findBlockIndex(doc, start.blockId);
  const endIdx = findBlockIndex(doc, end.blockId);

  if (startIdx === -1 || endIdx === -1) return { text: "", html: "" };

  const textParts: string[] = [];
  const htmlParts: string[] = [];

  for (let i = startIdx; i <= endIdx; i++) {
    const block = doc.blocks[i]!;
    let content = block.content;

    if (i === startIdx && i === endIdx) {
      // Single block — extract the range
      const [, afterStart] = splitContent(content, start.offset);
      const [selected] = splitContent(afterStart, end.offset - start.offset);
      content = selected;
    } else if (i === startIdx) {
      const [, afterStart] = splitContent(content, start.offset);
      content = afterStart;
    } else if (i === endIdx) {
      const [beforeEnd] = splitContent(content, end.offset);
      content = beforeEnd;
    }

    const plainText = getPlainText(content);
    textParts.push(plainText);
    htmlParts.push(`<p>${escapeHtml(plainText)}</p>`);
  }

  return {
    text: textParts.join("\n"),
    html: htmlParts.join(""),
  };
}

/** Delete the current selection */
function deleteSelection(doc: EditorDocument, sel: Selection): ApplyResult {
  const { start, end } = getOrderedSelection(doc, sel);

  if (start.blockId === end.blockId) {
    return deleteText(doc, start.blockId, start.offset, end.offset - start.offset);
  }

  // Multi-block deletion
  const startIdx = findBlockIndex(doc, start.blockId);
  const endIdx = findBlockIndex(doc, end.blockId);
  if (startIdx === -1 || endIdx === -1) return { doc, ops: [], selection: null };

  const startBlock = doc.blocks[startIdx];
  const endBlock = doc.blocks[endIdx];
  if (!startBlock || !endBlock) return { doc, ops: [], selection: null };

  const [keepBefore] = splitContent(startBlock.content, start.offset);
  const [, keepAfter] = splitContent(endBlock.content, end.offset);
  const mergedContent = mergeAdjacentSpans([...keepBefore, ...keepAfter]);

  const blocks: Block[] = [];
  for (let i = 0; i < doc.blocks.length; i++) {
    if (i === startIdx) {
      blocks.push({ ...startBlock, content: mergedContent });
    } else if (i > startIdx && i <= endIdx) {
      continue;
    } else {
      blocks.push(doc.blocks[i]!);
    }
  }

  return {
    doc: { blocks, version: doc.version + 1 },
    ops: [],
    selection: {
      anchor: { blockId: start.blockId, offset: start.offset },
      focus: { blockId: start.blockId, offset: start.offset },
    },
  };
}

/** Detect block type from a line of pasted text */
function detectBlockType(line: string): BlockType {
  if (/^#{1,3}\s/.exec(line)) return `heading${line.match(/^(#+)/)![1]!.length}` as BlockType;
  if (/^[-*]\s/.exec(line)) return "paragraph";
  if (/^\d+\.\s/.exec(line)) return "paragraph";
  if (/^\[[ x]\]\s/i.exec(line)) return "todo";
  if (/^>\s/.exec(line)) return "quote";
  if (/^---$|^\*\*\*$/.exec(line)) return "divider";
  return "paragraph";
}

/** Remove the markdown prefix from a line */
function cleanLinePrefix(line: string, type: BlockType): string {
  switch (type) {
    case "heading1": return line.replace(/^#\s/, "");
    case "heading2": return line.replace(/^##\s/, "");
    case "heading3": return line.replace(/^###\s/, "");
    case "todo": return line.replace(/^\[[ x]\]\s/i, "");
    case "quote": return line.replace(/^>\s/, "");
    case "divider": return "";
    default: return line;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

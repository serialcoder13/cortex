// ============================================================
// Document model — immutable operations on the block tree.
// The document is the single source of truth. Never mutate
// directly; always produce a new document via these helpers.
// ============================================================

import type { Block, BlockProps, BlockType, EditorDocument, Mark, TextSpan } from "./types";
import { generateId, getPlainText, getTextLength } from "./types";

/** Create an empty document */
export function createDocument(blocks?: Block[]): EditorDocument {
  return {
    blocks: blocks ?? [{ id: generateId(), type: "paragraph", content: [], children: [], props: {} }],
    version: 0,
  };
}

/** Bump the version number */
export function nextVersion(doc: EditorDocument): EditorDocument {
  return { ...doc, version: doc.version + 1 };
}

// ---- Block lookup ----

/** Find a block by ID (flat search — top-level only for now) */
export function findBlock(doc: EditorDocument, blockId: string): Block | undefined {
  return doc.blocks.find((b) => b.id === blockId);
}

/** Find the index of a block by ID */
export function findBlockIndex(doc: EditorDocument, blockId: string): number {
  return doc.blocks.findIndex((b) => b.id === blockId);
}

/** Get the block before the given block */
export function getPreviousBlock(doc: EditorDocument, blockId: string): Block | undefined {
  const idx = findBlockIndex(doc, blockId);
  return idx > 0 ? doc.blocks[idx - 1] : undefined;
}

/** Get the block after the given block */
export function getNextBlock(doc: EditorDocument, blockId: string): Block | undefined {
  const idx = findBlockIndex(doc, blockId);
  return idx >= 0 && idx < doc.blocks.length - 1 ? doc.blocks[idx + 1] : undefined;
}

// ---- Text operations ----

/** Split text spans at an offset, returning [before, after] */
export function splitContent(content: TextSpan[], offset: number): [TextSpan[], TextSpan[]] {
  const before: TextSpan[] = [];
  const after: TextSpan[] = [];
  let pos = 0;

  for (const span of content) {
    const spanEnd = pos + span.text.length;

    if (spanEnd <= offset) {
      // Entirely before the split point
      before.push(span);
    } else if (pos >= offset) {
      // Entirely after the split point
      after.push(span);
    } else {
      // This span is split
      const splitAt = offset - pos;
      if (splitAt > 0) {
        before.push({ text: span.text.slice(0, splitAt), marks: span.marks ? [...span.marks] : undefined });
      }
      if (splitAt < span.text.length) {
        after.push({ text: span.text.slice(splitAt), marks: span.marks ? [...span.marks] : undefined });
      }
    }

    pos = spanEnd;
  }

  return [before, after];
}

/** Insert text into content spans at a given offset */
export function insertTextInContent(content: TextSpan[], offset: number, text: string): TextSpan[] {
  if (content.length === 0) {
    return [{ text }];
  }

  const result: TextSpan[] = [];
  let pos = 0;
  let inserted = false;

  for (const span of content) {
    const spanEnd = pos + span.text.length;

    if (!inserted && offset >= pos && offset <= spanEnd) {
      const splitAt = offset - pos;
      const newText = span.text.slice(0, splitAt) + text + span.text.slice(splitAt);
      result.push({ text: newText, marks: span.marks ? [...span.marks] : undefined });
      inserted = true;
    } else {
      result.push(span);
    }

    pos = spanEnd;
  }

  // If offset is at the very end and we haven't inserted
  if (!inserted) {
    const lastSpan = result[result.length - 1];
    if (lastSpan) {
      result[result.length - 1] = {
        text: lastSpan.text + text,
        marks: lastSpan.marks ? [...lastSpan.marks] : undefined,
      };
    } else {
      result.push({ text });
    }
  }

  return result;
}

/** Delete text from content spans at a given offset+length */
export function deleteTextInContent(content: TextSpan[], offset: number, length: number): TextSpan[] {
  const [before] = splitContent(content, offset);
  const [, after] = splitContent(content, offset + length);
  return mergeAdjacentSpans([...before, ...after]);
}

/** Get the substring of text deleted (for undo) */
export function getDeletedText(content: TextSpan[], offset: number, length: number): string {
  const plainText = getPlainText(content);
  return plainText.slice(offset, offset + length);
}

/** Merge adjacent spans with identical marks */
export function mergeAdjacentSpans(content: TextSpan[]): TextSpan[] {
  if (content.length <= 1) return content;

  const result: TextSpan[] = [content[0]!];
  for (let i = 1; i < content.length; i++) {
    const prev = result[result.length - 1]!;
    const curr = content[i]!;

    if (marksEqual(prev.marks, curr.marks)) {
      result[result.length - 1] = { text: prev.text + curr.text, marks: prev.marks };
    } else {
      result.push(curr);
    }
  }

  // Filter out empty spans
  return result.filter((s) => s.text.length > 0);
}

/** Compare two mark arrays for equality */
export function marksEqual(a: Mark[] | undefined, b: Mark[] | undefined): boolean {
  const ma = a ?? [];
  const mb = b ?? [];
  if (ma.length !== mb.length) return false;
  for (let i = 0; i < ma.length; i++) {
    if (ma[i]!.type !== mb[i]!.type) return false;
  }
  return true;
}

// ---- Block-level operations ----

/** Replace a block in the document by ID */
export function updateBlock(doc: EditorDocument, blockId: string, updater: (b: Block) => Block): EditorDocument {
  return nextVersion({
    ...doc,
    blocks: doc.blocks.map((b) => (b.id === blockId ? updater(b) : b)),
  });
}

/** Insert a block after another block (or at the start if afterId is null) */
export function insertBlockAfter(doc: EditorDocument, afterBlockId: string | null, block: Block): EditorDocument {
  const blocks = [...doc.blocks];
  if (afterBlockId === null) {
    blocks.unshift(block);
  } else {
    const idx = blocks.findIndex((b) => b.id === afterBlockId);
    if (idx === -1) {
      blocks.push(block);
    } else {
      blocks.splice(idx + 1, 0, block);
    }
  }
  return nextVersion({ ...doc, blocks });
}

/** Remove a block by ID */
export function removeBlock(doc: EditorDocument, blockId: string): EditorDocument {
  return nextVersion({
    ...doc,
    blocks: doc.blocks.filter((b) => b.id !== blockId),
  });
}

/** Move a block from one index to another */
export function moveBlock(doc: EditorDocument, fromIndex: number, toIndex: number): EditorDocument {
  const blocks = [...doc.blocks];
  const [block] = blocks.splice(fromIndex, 1);
  if (!block) return doc;
  blocks.splice(toIndex > fromIndex ? toIndex - 1 : toIndex, 0, block);
  return nextVersion({ ...doc, blocks });
}

/** Change a block's type */
export function setBlockType(doc: EditorDocument, blockId: string, newType: BlockType, newProps?: BlockProps): EditorDocument {
  return updateBlock(doc, blockId, (b) => ({
    ...b,
    type: newType,
    props: newProps ?? b.props,
  }));
}

// ---- Mark operations ----

/** Toggle a mark on a range within a block's content */
export function toggleMarkInContent(content: TextSpan[], from: number, to: number, mark: Mark): TextSpan[] {
  if (from === to) return content;

  // Check if the entire range already has this mark
  const hasMarkEverywhere = rangeHasMark(content, from, to, mark.type);

  const result: TextSpan[] = [];
  let pos = 0;

  for (const span of content) {
    const spanEnd = pos + span.text.length;

    // No overlap with the range
    if (spanEnd <= from || pos >= to) {
      result.push(span);
      pos = spanEnd;
      continue;
    }

    // Compute the overlap
    const overlapStart = Math.max(pos, from);
    const overlapEnd = Math.min(spanEnd, to);

    // Part before overlap
    if (pos < overlapStart) {
      result.push({
        text: span.text.slice(0, overlapStart - pos),
        marks: span.marks ? [...span.marks] : undefined,
      });
    }

    // The overlapping part — add or remove the mark
    const overlapText = span.text.slice(overlapStart - pos, overlapEnd - pos);
    const existingMarks = span.marks ?? [];
    let newMarks: Mark[];

    if (hasMarkEverywhere) {
      // Remove the mark
      newMarks = existingMarks.filter((m) => m.type !== mark.type);
    } else {
      // Add the mark (if not already present)
      if (existingMarks.some((m) => m.type === mark.type)) {
        newMarks = [...existingMarks];
      } else {
        newMarks = [...existingMarks, mark];
      }
    }

    result.push({
      text: overlapText,
      marks: newMarks.length > 0 ? newMarks : undefined,
    });

    // Part after overlap
    if (spanEnd > overlapEnd) {
      result.push({
        text: span.text.slice(overlapEnd - pos),
        marks: span.marks ? [...span.marks] : undefined,
      });
    }

    pos = spanEnd;
  }

  return mergeAdjacentSpans(result);
}

/** Check if every character in a range has a specific mark */
function rangeHasMark(content: TextSpan[], from: number, to: number, markType: string): boolean {
  let pos = 0;
  for (const span of content) {
    const spanEnd = pos + span.text.length;
    const overlapStart = Math.max(pos, from);
    const overlapEnd = Math.min(spanEnd, to);

    if (overlapStart < overlapEnd) {
      const hasMark = (span.marks ?? []).some((m) => m.type === markType);
      if (!hasMark) return false;
    }

    pos = spanEnd;
  }
  return true;
}

/** Get the marks active at a specific offset */
export function getMarksAtOffset(content: TextSpan[], offset: number): Mark[] {
  let pos = 0;
  for (const span of content) {
    const spanEnd = pos + span.text.length;
    if (offset >= pos && offset < spanEnd) {
      return span.marks ?? [];
    }
    // If offset is at the end of a span, use that span's marks
    if (offset === spanEnd && offset === getTextLength(content)) {
      return span.marks ?? [];
    }
    pos = spanEnd;
  }
  return [];
}

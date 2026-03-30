// ============================================================
// Operations — the only way to mutate the document.
// Each function produces a new document and records operations
// for undo/redo. Never mutate the document directly.
// ============================================================

import type { Block, BlockProps, BlockType, Direction, EditorDocument, Mark, Operation, Selection, TextSpan } from "./types";
import { createBlock, generateId, getTextLength } from "./types";
import {
  deleteTextInContent,
  findBlock,
  findBlockIndex,
  getDeletedText,
  insertBlockAfter,
  insertTextInContent,
  moveBlock as moveBlockInDoc,
  nextVersion,
  removeBlock,
  setBlockType as setBlockTypeInDoc,
  splitContent,
  toggleMarkInContent,
  updateBlock,
  mergeAdjacentSpans,
} from "./document";

export interface ApplyResult {
  doc: EditorDocument;
  ops: Operation[];
  selection: Selection | null;
}

// ---- Text Operations ----

/** Insert text at a position within a block */
export function insertText(
  doc: EditorDocument,
  blockId: string,
  offset: number,
  text: string,
): ApplyResult {
  const newDoc = updateBlock(doc, blockId, (b) => ({
    ...b,
    content: insertTextInContent(b.content, offset, text),
  }));

  const op: Operation = { type: "insertText", blockId, offset, text };
  const selection: Selection = {
    anchor: { blockId, offset: offset + text.length },
    focus: { blockId, offset: offset + text.length },
  };

  return { doc: newDoc, ops: [op], selection };
}

/** Delete text at a position within a block */
export function deleteText(
  doc: EditorDocument,
  blockId: string,
  offset: number,
  length: number,
): ApplyResult {
  const block = findBlock(doc, blockId);
  if (!block) return { doc, ops: [], selection: null };

  const deleted = getDeletedText(block.content, offset, length);
  const newDoc = updateBlock(doc, blockId, (b) => ({
    ...b,
    content: deleteTextInContent(b.content, offset, length),
  }));

  const op: Operation = { type: "deleteText", blockId, offset, length, deleted };
  const selection: Selection = {
    anchor: { blockId, offset },
    focus: { blockId, offset },
  };

  return { doc: newDoc, ops: [op], selection };
}

// ---- Block Structural Operations ----

/** Split a block at the given offset (Enter key behavior) */
export function splitBlock(
  doc: EditorDocument,
  blockId: string,
  offset: number,
): ApplyResult {
  const block = findBlock(doc, blockId);
  if (!block) return { doc, ops: [], selection: null };

  const [before, after] = splitContent(block.content, offset);
  const newBlockId = generateId();

  // Determine the type of the new block
  // Headings split into a paragraph below
  const newBlockType: BlockType =
    block.type.startsWith("heading") ? "paragraph" : block.type;

  // For todo blocks, the new block starts unchecked
  const newProps: BlockProps =
    block.type === "todo" ? { ...block.props, checked: false } : { ...block.props };

  let newDoc = updateBlock(doc, blockId, (b) => ({
    ...b,
    content: before,
  }));

  const newBlock: Block = {
    id: newBlockId,
    type: newBlockType,
    content: after,
    children: [],
    props: newProps,
  };

  newDoc = insertBlockAfter(newDoc, blockId, newBlock);

  const op: Operation = { type: "splitBlock", blockId, offset, newBlockId };
  const selection: Selection = {
    anchor: { blockId: newBlockId, offset: 0 },
    focus: { blockId: newBlockId, offset: 0 },
  };

  return { doc: newDoc, ops: [op], selection };
}

/** Merge a block with its neighbor (Backspace at start / Delete at end) */
export function mergeBlock(
  doc: EditorDocument,
  blockId: string,
  direction: Direction,
): ApplyResult {
  const idx = findBlockIndex(doc, blockId);
  if (idx === -1) return { doc, ops: [], selection: null };

  const block = doc.blocks[idx]!;

  if (direction === "backward") {
    // Merge with previous block
    if (idx === 0) {
      // If it's a non-paragraph block, convert to paragraph instead
      if (block.type !== "paragraph") {
        return setBlockTypeOp(doc, blockId, "paragraph");
      }
      return { doc, ops: [], selection: null };
    }

    const prevBlock = doc.blocks[idx - 1]!;

    // If previous block is a divider or image, just delete it
    if (prevBlock.type === "divider" || prevBlock.type === "image") {
      return deleteBlockOp(doc, prevBlock.id);
    }

    const mergeOffset = getTextLength(prevBlock.content);
    const mergedContent = mergeAdjacentSpans([...prevBlock.content, ...block.content]);

    let newDoc = updateBlock(doc, prevBlock.id, (b) => ({
      ...b,
      content: mergedContent,
    }));
    newDoc = removeBlock(newDoc, blockId);

    const op: Operation = {
      type: "mergeBlock",
      blockId,
      direction,
      mergedContent: block.content,
      mergedChildren: block.children,
    };

    const selection: Selection = {
      anchor: { blockId: prevBlock.id, offset: mergeOffset },
      focus: { blockId: prevBlock.id, offset: mergeOffset },
    };

    return { doc: newDoc, ops: [op], selection };
  } else {
    // Merge with next block (Delete at end)
    if (idx >= doc.blocks.length - 1) return { doc, ops: [], selection: null };

    const nextBlock = doc.blocks[idx + 1]!;

    // If next block is a divider or image, just delete it
    if (nextBlock.type === "divider" || nextBlock.type === "image") {
      return deleteBlockOp(doc, nextBlock.id);
    }

    const mergeOffset = getTextLength(block.content);
    const mergedContent = mergeAdjacentSpans([...block.content, ...nextBlock.content]);

    let newDoc = updateBlock(doc, blockId, (b) => ({
      ...b,
      content: mergedContent,
    }));
    newDoc = removeBlock(newDoc, nextBlock.id);

    const op: Operation = {
      type: "mergeBlock",
      blockId: nextBlock.id,
      direction,
      mergedContent: nextBlock.content,
      mergedChildren: nextBlock.children,
    };

    const selection: Selection = {
      anchor: { blockId, offset: mergeOffset },
      focus: { blockId, offset: mergeOffset },
    };

    return { doc: newDoc, ops: [op], selection };
  }
}

/** Insert a new block after another */
export function insertBlockOp(
  doc: EditorDocument,
  afterBlockId: string | null,
  blockType: BlockType,
  text: string = "",
  props: BlockProps = {},
): ApplyResult {
  const block = createBlock(blockType, text, props);
  const newDoc = insertBlockAfter(doc, afterBlockId, block);

  const op: Operation = { type: "insertBlock", afterBlockId, block };
  const selection: Selection = {
    anchor: { blockId: block.id, offset: 0 },
    focus: { blockId: block.id, offset: 0 },
  };

  return { doc: newDoc, ops: [op], selection };
}

/** Delete a block */
export function deleteBlockOp(doc: EditorDocument, blockId: string): ApplyResult {
  const idx = findBlockIndex(doc, blockId);
  const block = findBlock(doc, blockId);
  if (idx === -1 || !block) return { doc, ops: [], selection: null };

  let newDoc = removeBlock(doc, blockId);

  // Ensure at least one block remains
  if (newDoc.blocks.length === 0) {
    const emptyBlock = createBlock("paragraph");
    newDoc = { ...newDoc, blocks: [emptyBlock] };
  }

  const op: Operation = { type: "deleteBlock", blockId, block, index: idx };

  // Place cursor in the previous block, or the first block
  const targetIdx = Math.min(idx, newDoc.blocks.length - 1);
  const targetBlock = newDoc.blocks[Math.max(0, targetIdx - (idx > 0 ? 1 : 0))]!;
  const offset = getTextLength(targetBlock.content);

  const selection: Selection = {
    anchor: { blockId: targetBlock.id, offset },
    focus: { blockId: targetBlock.id, offset },
  };

  return { doc: newDoc, ops: [op], selection };
}

/** Move a block from one position to another */
export function moveBlockOp(
  doc: EditorDocument,
  blockId: string,
  toIndex: number,
): ApplyResult {
  const fromIndex = findBlockIndex(doc, blockId);
  if (fromIndex === -1 || fromIndex === toIndex) return { doc, ops: [], selection: null };

  const newDoc = moveBlockInDoc(doc, fromIndex, toIndex);
  const op: Operation = { type: "moveBlock", blockId, fromIndex, toIndex };

  return { doc: newDoc, ops: [op], selection: null };
}

/** Change a block's type */
export function setBlockTypeOp(
  doc: EditorDocument,
  blockId: string,
  newType: BlockType,
  newProps?: BlockProps,
): ApplyResult {
  const block = findBlock(doc, blockId);
  if (!block) return { doc, ops: [], selection: null };

  const oldType = block.type;
  const oldProps = { ...block.props };
  const resolvedProps = newProps ?? {};

  const newDoc = setBlockTypeInDoc(doc, blockId, newType, resolvedProps);
  const op: Operation = {
    type: "setBlockType",
    blockId,
    oldType,
    newType,
    oldProps,
    newProps: resolvedProps,
  };

  return { doc: newDoc, ops: [op], selection: null };
}

const LIST_TYPES = new Set(["bulletList", "numberedList"]);

/**
 * Indent a list block — make it a child of the previous sibling.
 * Works at any nesting depth.
 */
export function indentListItem(doc: EditorDocument, blockId: string): ApplyResult {
  // Try top-level first
  const topIdx = findBlockIndex(doc, blockId);
  if (topIdx >= 0) {
    if (topIdx === 0) return { doc, ops: [], selection: null };
    const block = doc.blocks[topIdx];
    const prevBlock = doc.blocks[topIdx - 1];
    if (!LIST_TYPES.has(block.type) || !LIST_TYPES.has(prevBlock.type)) {
      return { doc, ops: [], selection: null };
    }
    const newBlocks = [...doc.blocks];
    newBlocks.splice(topIdx, 1);
    newBlocks[topIdx - 1] = {
      ...prevBlock,
      children: [...prevBlock.children, { ...block }],
    };
    return { doc: nextVersion({ ...doc, blocks: newBlocks }), ops: [], selection: null };
  }

  // Block is nested — find it in children and indent within that context
  const newBlocks = indentInChildren(doc.blocks, blockId);
  if (newBlocks === doc.blocks) return { doc, ops: [], selection: null };
  return { doc: nextVersion({ ...doc, blocks: newBlocks }), ops: [], selection: null };
}

/** Recursively find and indent a block within children arrays */
function indentInChildren(blocks: Block[], blockId: string): Block[] {
  for (let i = 0; i < blocks.length; i++) {
    const parent = blocks[i];
    const childIdx = parent.children.findIndex((c) => c.id === blockId);
    if (childIdx > 0) {
      // Found it — indent within this parent's children
      const child = parent.children[childIdx];
      const prevChild = parent.children[childIdx - 1];
      if (!LIST_TYPES.has(child.type) || !LIST_TYPES.has(prevChild.type)) return blocks;
      const newChildren = [...parent.children];
      newChildren.splice(childIdx, 1);
      newChildren[childIdx - 1] = {
        ...prevChild,
        children: [...prevChild.children, { ...child }],
      };
      const result = [...blocks];
      result[i] = { ...parent, children: newChildren };
      return result;
    }
    // Recurse into children
    if (parent.children.length > 0) {
      const newChildren = indentInChildren(parent.children, blockId);
      if (newChildren !== parent.children) {
        const result = [...blocks];
        result[i] = { ...parent, children: newChildren };
        return result;
      }
    }
  }
  return blocks;
}

/**
 * Outdent a list block — move a child block back to the top level
 * after its parent. Also handles top-level list items converting to paragraph.
 */
export function outdentListItem(doc: EditorDocument, blockId: string): ApplyResult {
  // First check if blockId is a top-level block
  const topIdx = findBlockIndex(doc, blockId);
  if (topIdx >= 0) {
    // Top-level list item — convert to paragraph
    const block = doc.blocks[topIdx];
    const listTypes = ["bulletList", "numberedList"];
    if (!listTypes.includes(block.type)) return { doc, ops: [], selection: null };
    return setBlockTypeOp(doc, blockId, "paragraph");
  }

  // Block is nested inside a parent — find it
  for (let i = 0; i < doc.blocks.length; i++) {
    const parent = doc.blocks[i];
    const childIdx = parent.children.findIndex((c) => c.id === blockId);
    if (childIdx >= 0) {
      const child = parent.children[childIdx];
      // Remove from parent's children
      const newChildren = [...parent.children];
      newChildren.splice(childIdx, 1);

      // Any children after this one in the same parent stay with the child
      // (they become children of the outdented block)
      const trailingChildren = newChildren.splice(childIdx);
      const outdentedBlock = {
        ...child,
        children: [...child.children, ...trailingChildren],
      };

      const updatedParent = { ...parent, children: newChildren };

      const newBlocks = [...doc.blocks];
      newBlocks[i] = updatedParent;
      // Insert the outdented block right after the parent
      newBlocks.splice(i + 1, 0, outdentedBlock);

      const newDoc = nextVersion({ ...doc, blocks: newBlocks });
      return { doc: newDoc, ops: [], selection: null };
    }

    // Check deeper nesting (children of children)
    for (let j = 0; j < parent.children.length; j++) {
      const grandparent = parent.children[j];
      const gcIdx = grandparent.children.findIndex((c) => c.id === blockId);
      if (gcIdx >= 0) {
        const child = grandparent.children[gcIdx];
        const newGcChildren = [...grandparent.children];
        newGcChildren.splice(gcIdx, 1);
        const trailingGcChildren = newGcChildren.splice(gcIdx);
        const outdentedBlock = {
          ...child,
          children: [...child.children, ...trailingGcChildren],
        };

        const updatedGrandparent = { ...grandparent, children: newGcChildren };
        const newParentChildren = [...parent.children];
        newParentChildren[j] = updatedGrandparent;
        // Insert after the grandparent in parent's children
        newParentChildren.splice(j + 1, 0, outdentedBlock);

        const newBlocks = [...doc.blocks];
        newBlocks[i] = { ...parent, children: newParentChildren };

        const newDoc = nextVersion({ ...doc, blocks: newBlocks });
        return { doc: newDoc, ops: [], selection: null };
      }
    }
  }

  return { doc, ops: [], selection: null };
}

/** Toggle a mark on a selection range */
export function toggleMark(
  doc: EditorDocument,
  blockId: string,
  from: number,
  to: number,
  mark: Mark,
): ApplyResult {
  const newDoc = updateBlock(doc, blockId, (b) => ({
    ...b,
    content: toggleMarkInContent(b.content, from, to, mark),
  }));

  const op: Operation = { type: "toggleMark", blockId, from, to, mark };
  return { doc: newDoc, ops: [op], selection: null };
}

/** Replace the entire content of a block */
export function replaceContent(
  doc: EditorDocument,
  blockId: string,
  newContent: TextSpan[],
): ApplyResult {
  const block = findBlock(doc, blockId);
  if (!block) return { doc, ops: [], selection: null };

  const oldContent = block.content;
  const newDoc = updateBlock(doc, blockId, (b) => ({
    ...b,
    content: newContent,
  }));

  const op: Operation = { type: "replaceContent", blockId, oldContent, newContent };
  return { doc: newDoc, ops: [op], selection: null };
}

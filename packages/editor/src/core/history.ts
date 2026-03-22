// ============================================================
// Undo/redo history — operation-based, not snapshot-based.
// Groups rapid typing into single undo steps via time-based
// batching (300ms window).
// ============================================================

import type { EditorDocument, Operation, Selection, Transaction } from "./types";
import {
  insertTextInContent,
  deleteTextInContent,
  splitContent,
  updateBlock,
  insertBlockAfter,
  removeBlock,
  moveBlock as moveBlockInDoc,
  mergeAdjacentSpans,
  toggleMarkInContent,
} from "./document";
import { findBlock, findBlockIndex, nextVersion } from "./document";
import { getTextLength } from "./types";

const BATCH_WINDOW_MS = 300;
const MAX_HISTORY_SIZE = 200;

export class History {
  private undoStack: Transaction[] = [];
  private redoStack: Transaction[] = [];

  /** Record a transaction (batch of operations) */
  push(ops: Operation[], selectionBefore: Selection | null, selectionAfter: Selection | null): void {
    const now = Date.now();
    const last = this.undoStack[this.undoStack.length - 1];

    // Try to merge with the last transaction if it was a recent text insert/delete
    if (last && now - last.timestamp < BATCH_WINDOW_MS && canMerge(last, ops)) {
      last.operations.push(...ops);
      last.selectionAfter = selectionAfter;
      last.timestamp = now;
    } else {
      this.undoStack.push({
        operations: [...ops],
        selectionBefore,
        selectionAfter,
        timestamp: now,
      });

      // Trim history if too large
      if (this.undoStack.length > MAX_HISTORY_SIZE) {
        this.undoStack.shift();
      }
    }

    // Clear redo stack on new edit
    this.redoStack = [];
  }

  /** Undo the last transaction, returning the reversed document and selection */
  undo(doc: EditorDocument): { doc: EditorDocument; selection: Selection | null } | null {
    const tx = this.undoStack.pop();
    if (!tx) return null;

    // Apply operations in reverse
    let newDoc = doc;
    for (let i = tx.operations.length - 1; i >= 0; i--) {
      newDoc = reverseOperation(newDoc, tx.operations[i]!);
    }

    this.redoStack.push(tx);
    return { doc: newDoc, selection: tx.selectionBefore };
  }

  /** Redo the last undone transaction */
  redo(doc: EditorDocument): { doc: EditorDocument; selection: Selection | null } | null {
    const tx = this.redoStack.pop();
    if (!tx) return null;

    // Re-apply operations in order
    let newDoc = doc;
    for (const op of tx.operations) {
      newDoc = applyOperation(newDoc, op);
    }

    this.undoStack.push(tx);
    return { doc: newDoc, selection: tx.selectionAfter };
  }

  /** Check if undo is available */
  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Check if redo is available */
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Clear all history */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}

/** Check if ops can be merged into the previous transaction (consecutive typing) */
function canMerge(last: Transaction, ops: Operation[]): boolean {
  if (ops.length !== 1) return false;
  const op = ops[0]!;
  const lastOp = last.operations[last.operations.length - 1];
  if (!lastOp) return false;

  // Merge consecutive single-char inserts in the same block
  if (op.type === "insertText" && lastOp.type === "insertText") {
    return (
      op.blockId === lastOp.blockId &&
      op.text.length === 1 &&
      op.offset === lastOp.offset + lastOp.text.length &&
      !/\s/.test(op.text) // Don't merge across word boundaries
    );
  }

  // Merge consecutive single-char deletes in the same block
  if (op.type === "deleteText" && lastOp.type === "deleteText") {
    return (
      op.blockId === lastOp.blockId &&
      op.length === 1 &&
      (op.offset === lastOp.offset || op.offset === lastOp.offset - 1)
    );
  }

  return false;
}

/** Apply an operation forward to a document */
function applyOperation(doc: EditorDocument, op: Operation): EditorDocument {
  switch (op.type) {
    case "insertText":
      return nextVersion(
        updateBlock(doc, op.blockId, (b) => ({
          ...b,
          content: insertTextInContent(b.content, op.offset, op.text),
        })),
      );

    case "deleteText":
      return nextVersion(
        updateBlock(doc, op.blockId, (b) => ({
          ...b,
          content: deleteTextInContent(b.content, op.offset, op.length),
        })),
      );

    case "splitBlock": {
      const block = findBlock(doc, op.blockId);
      if (!block) return doc;
      const [before, after] = splitContent(block.content, op.offset);
      let newDoc = updateBlock(doc, op.blockId, (b) => ({ ...b, content: before }));
      const newBlock = { id: op.newBlockId, type: block.type as any, content: after, children: [] as any[], props: {} };
      return nextVersion(insertBlockAfter(newDoc, op.blockId, newBlock));
    }

    case "mergeBlock": {
      if (op.direction === "backward") {
        const idx = findBlockIndex(doc, op.blockId);
        if (idx <= 0) return doc;
        const prevBlock = doc.blocks[idx - 1]!;
        const block = doc.blocks[idx]!;
        const merged = mergeAdjacentSpans([...prevBlock.content, ...block.content]);
        let newDoc = updateBlock(doc, prevBlock.id, (b) => ({ ...b, content: merged }));
        return nextVersion(removeBlock(newDoc, op.blockId));
      } else {
        const idx = findBlockIndex(doc, op.blockId);
        if (idx === -1 || idx >= doc.blocks.length) return doc;
        const block = doc.blocks[idx]!;
        const prevBlock = doc.blocks[idx - 1];
        if (!prevBlock) return doc;
        const merged = mergeAdjacentSpans([...prevBlock.content, ...block.content]);
        let newDoc = updateBlock(doc, prevBlock.id, (b) => ({ ...b, content: merged }));
        return nextVersion(removeBlock(newDoc, op.blockId));
      }
    }

    case "insertBlock":
      return nextVersion(insertBlockAfter(doc, op.afterBlockId, op.block));

    case "deleteBlock":
      return nextVersion(removeBlock(doc, op.blockId));

    case "moveBlock":
      return nextVersion(moveBlockInDoc(doc, op.fromIndex, op.toIndex));

    case "setBlockType":
      return nextVersion(
        updateBlock(doc, op.blockId, (b) => ({ ...b, type: op.newType, props: op.newProps })),
      );

    case "setBlockProps":
      return nextVersion(
        updateBlock(doc, op.blockId, (b) => ({ ...b, props: op.newProps })),
      );

    case "toggleMark":
      return nextVersion(
        updateBlock(doc, op.blockId, (b) => ({
          ...b,
          content: toggleMarkInContent(b.content, op.from, op.to, op.mark),
        })),
      );

    case "replaceContent":
      return nextVersion(
        updateBlock(doc, op.blockId, (b) => ({ ...b, content: op.newContent })),
      );
  }
}

/** Reverse an operation (for undo) */
function reverseOperation(doc: EditorDocument, op: Operation): EditorDocument {
  switch (op.type) {
    case "insertText":
      // Reverse: delete the inserted text
      return nextVersion(
        updateBlock(doc, op.blockId, (b) => ({
          ...b,
          content: deleteTextInContent(b.content, op.offset, op.text.length),
        })),
      );

    case "deleteText":
      // Reverse: re-insert the deleted text
      return nextVersion(
        updateBlock(doc, op.blockId, (b) => ({
          ...b,
          content: insertTextInContent(b.content, op.offset, op.deleted),
        })),
      );

    case "splitBlock": {
      // Reverse: merge the two blocks back together
      const block = findBlock(doc, op.blockId);
      const newBlock = findBlock(doc, op.newBlockId);
      if (!block || !newBlock) return doc;
      const merged = mergeAdjacentSpans([...block.content, ...newBlock.content]);
      let newDoc = updateBlock(doc, op.blockId, (b) => ({ ...b, content: merged }));
      return nextVersion(removeBlock(newDoc, op.newBlockId));
    }

    case "mergeBlock": {
      // Reverse: split the merged block back into two
      if (op.direction === "backward") {
        const idx = findBlockIndex(doc, op.blockId);
        // Find the block that absorbed the content (the previous block)
        // The merged block was removed, so we need to re-insert it
        // Actually, the blockId refers to the block that was merged INTO the previous one
        // We need to find the block that now has the merged content
        const prevIdx = idx === -1 ? doc.blocks.length - 1 : idx - 1;
        if (prevIdx < 0) return doc;
        const prevBlock = doc.blocks[prevIdx]!;
        const prevTextLen = getTextLength(prevBlock.content) - getTextLength(op.mergedContent);
        const [before, after] = splitContent(prevBlock.content, prevTextLen);
        let newDoc = updateBlock(doc, prevBlock.id, (b) => ({ ...b, content: before }));
        const restoredBlock = { id: op.blockId, type: "paragraph" as any, content: after, children: op.mergedChildren, props: {} };
        return nextVersion(insertBlockAfter(newDoc, prevBlock.id, restoredBlock));
      }
      return doc; // Forward merge undo is complex; simplified here
    }

    case "insertBlock":
      return nextVersion(removeBlock(doc, op.block.id));

    case "deleteBlock": {
      const blocks = [...doc.blocks];
      blocks.splice(op.index, 0, op.block);
      return nextVersion({ ...doc, blocks });
    }

    case "moveBlock":
      return nextVersion(moveBlockInDoc(doc, op.toIndex, op.fromIndex));

    case "setBlockType":
      return nextVersion(
        updateBlock(doc, op.blockId, (b) => ({ ...b, type: op.oldType, props: op.oldProps })),
      );

    case "setBlockProps":
      return nextVersion(
        updateBlock(doc, op.blockId, (b) => ({ ...b, props: op.oldProps })),
      );

    case "toggleMark":
      // Toggle is its own inverse
      return nextVersion(
        updateBlock(doc, op.blockId, (b) => ({
          ...b,
          content: toggleMarkInContent(b.content, op.from, op.to, op.mark),
        })),
      );

    case "replaceContent":
      return nextVersion(
        updateBlock(doc, op.blockId, (b) => ({ ...b, content: op.oldContent })),
      );
  }
}

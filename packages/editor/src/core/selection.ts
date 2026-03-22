// ============================================================
// Selection management — bridges browser Selection API with
// our document model positions. The document model uses
// { blockId, offset } pairs; the DOM uses Node + offset.
// ============================================================

import type { EditorDocument, Position, Selection } from "./types";
import { getTextLength } from "./types";
import { findBlockIndex } from "./document";

const BLOCK_ATTR = "data-block-id";

/** Read the current browser selection and convert to model coordinates */
export function readSelection(root: HTMLElement, doc: EditorDocument): Selection | null {
  const domSel = window.getSelection();
  if (!domSel || domSel.rangeCount === 0) return null;

  const anchor = domToModel(root, domSel.anchorNode, domSel.anchorOffset);
  const focus = domToModel(root, domSel.focusNode, domSel.focusOffset);

  if (!anchor || !focus) return null;

  return { anchor, focus };
}

/** Write a model selection back to the DOM */
export function writeSelection(root: HTMLElement, sel: Selection): void {
  const domSel = window.getSelection();
  if (!domSel) return;

  const anchorResult = modelToDom(root, sel.anchor);
  const focusResult = modelToDom(root, sel.focus);

  if (!anchorResult || !focusResult) return;

  try {
    const range = document.createRange();
    range.setStart(anchorResult.node, anchorResult.offset);
    range.setEnd(focusResult.node, focusResult.offset);

    domSel.removeAllRanges();

    if (
      sel.anchor.blockId === sel.focus.blockId &&
      sel.anchor.offset === sel.focus.offset
    ) {
      // Collapsed — just set the range
      domSel.addRange(range);
    } else if (
      sel.anchor.blockId === sel.focus.blockId
        ? sel.anchor.offset <= sel.focus.offset
        : findBlockIndex(
            { blocks: [], version: 0 },
            sel.anchor.blockId,
          ) <= findBlockIndex({ blocks: [], version: 0 }, sel.focus.blockId)
    ) {
      // Forward selection
      domSel.addRange(range);
    } else {
      // Backward selection — use setBaseAndExtent
      domSel.setBaseAndExtent(
        anchorResult.node,
        anchorResult.offset,
        focusResult.node,
        focusResult.offset,
      );
    }
  } catch {
    // Selection API can throw in edge cases; silently ignore
  }
}

/** Convert a DOM position (node + offset) to a model Position */
function domToModel(
  root: HTMLElement,
  node: Node | null,
  domOffset: number,
): Position | null {
  if (!node) return null;

  // Walk up to find the block element
  const blockEl = findBlockElement(root, node);
  if (!blockEl) return null;

  const blockId = blockEl.getAttribute(BLOCK_ATTR);
  if (!blockId) return null;

  // Find the content container within the block
  const contentEl = blockEl.querySelector("[data-content]") ?? blockEl;

  // Calculate the text offset by walking through text nodes
  const offset = getTextOffset(contentEl, node, domOffset);

  return { blockId, offset };
}

/** Convert a model Position to a DOM position (node + offset) */
function modelToDom(
  root: HTMLElement,
  pos: Position,
): { node: Node; offset: number } | null {
  const blockEl = root.querySelector(`[${BLOCK_ATTR}="${pos.blockId}"]`);
  if (!blockEl) return null;

  const contentEl = blockEl.querySelector("[data-content]") ?? blockEl;

  // Walk through text nodes to find the one containing our offset
  return findDomPosition(contentEl, pos.offset);
}

/** Walk up the DOM tree to find the block element */
function findBlockElement(root: HTMLElement, node: Node): HTMLElement | null {
  let current: Node | null = node;
  while (current && current !== root) {
    if (current instanceof HTMLElement && current.hasAttribute(BLOCK_ATTR)) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

/** Calculate the text offset from the start of an element to a given DOM position */
function getTextOffset(container: Node, targetNode: Node, targetOffset: number): number {
  let offset = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);

  let textNode = walker.nextNode();
  while (textNode) {
    if (textNode === targetNode) {
      return offset + targetOffset;
    }
    offset += textNode.textContent?.length ?? 0;
    textNode = walker.nextNode();
  }

  // If the target is the container itself or an element node
  if (targetNode === container || container.contains(targetNode)) {
    // targetOffset refers to child index
    if (targetNode.nodeType === Node.ELEMENT_NODE) {
      let count = 0;
      const walker2 = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      let node = walker2.nextNode();
      let childIdx = 0;

      // Count text up to the target child index
      for (const child of targetNode.childNodes) {
        if (childIdx >= targetOffset) break;
        if (child.nodeType === Node.TEXT_NODE) {
          count += child.textContent?.length ?? 0;
        } else {
          const tw = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
          let tn = tw.nextNode();
          while (tn) {
            count += tn.textContent?.length ?? 0;
            tn = tw.nextNode();
          }
        }
        childIdx++;
      }
      return count;
    }
    return offset;
  }

  return offset;
}

/** Find the DOM text node and offset for a given text offset within an element */
function findDomPosition(
  container: Node,
  targetOffset: number,
): { node: Node; offset: number } | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let current = 0;

  let textNode = walker.nextNode();
  while (textNode) {
    const len = textNode.textContent?.length ?? 0;
    if (current + len >= targetOffset) {
      return { node: textNode, offset: targetOffset - current };
    }
    current += len;
    textNode = walker.nextNode();
  }

  // If no text nodes exist, position at the container
  if (targetOffset === 0) {
    return { node: container, offset: 0 };
  }

  // Past the end — position at end of last text node
  const lastNode = getLastTextNode(container);
  if (lastNode) {
    return { node: lastNode, offset: lastNode.textContent?.length ?? 0 };
  }

  return { node: container, offset: 0 };
}

/** Get the last text node in a subtree */
function getLastTextNode(node: Node): Text | null {
  if (node.nodeType === Node.TEXT_NODE) return node as Text;
  for (let i = node.childNodes.length - 1; i >= 0; i--) {
    const found = getLastTextNode(node.childNodes[i]!);
    if (found) return found;
  }
  return null;
}

// ---- Selection helpers ----

/** Get the ordered selection (start always before end) */
export function getOrderedSelection(
  doc: EditorDocument,
  sel: Selection,
): { start: Position; end: Position } {
  const anchorIdx = findBlockIndex(doc, sel.anchor.blockId);
  const focusIdx = findBlockIndex(doc, sel.focus.blockId);

  if (anchorIdx < focusIdx || (anchorIdx === focusIdx && sel.anchor.offset <= sel.focus.offset)) {
    return { start: sel.anchor, end: sel.focus };
  }
  return { start: sel.focus, end: sel.anchor };
}

/** Clamp a selection so all positions are valid */
export function clampSelection(doc: EditorDocument, sel: Selection): Selection {
  return {
    anchor: clampPosition(doc, sel.anchor),
    focus: clampPosition(doc, sel.focus),
  };
}

function clampPosition(doc: EditorDocument, pos: Position): Position {
  const block = doc.blocks.find((b) => b.id === pos.blockId);
  if (!block) {
    // Block was deleted — move to first block
    const first = doc.blocks[0];
    if (!first) return pos;
    return { blockId: first.id, offset: 0 };
  }
  const maxOffset = getTextLength(block.content);
  return {
    blockId: pos.blockId,
    offset: Math.min(pos.offset, maxOffset),
  };
}

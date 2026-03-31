// ============================================================
// Core type definitions for the Cortex block editor engine.
// These types form the canonical document model — all editing
// operations, rendering, and serialization work with these.
// ============================================================

/** All supported block types */
export type BlockType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "heading5"
  | "heading6"
  | "list"
  | "todo"
  | "codeBlock"
  | "quote"
  | "callout"
  | "toggle"
  | "image"
  | "embed"
  | "divider"
  | "table"
  | "toc"
  | "customComponent";

/** Inline formatting marks */
export type MarkType =
  | "bold"
  | "italic"
  | "underline"
  | "strikethrough"
  | "code"
  | "link"
  | "superscript"
  | "subscript"
  | "color"
  | "highlight";

/** A mark applied to inline text */
export interface Mark {
  type: MarkType;
  attrs?: Record<string, string>; // e.g. { href: "..." } for links
}

/**
 * A span of text with formatting.
 * Consecutive spans with different marks form rich text.
 * Example: "Hello **world**" → [{ text: "Hello " }, { text: "world", marks: [{ type: "bold" }] }]
 */
export interface TextSpan {
  text: string;
  marks?: Mark[];
}

/** A single item within a list block */
export interface ListItem {
  id: string;
  content: TextSpan[];
  indent: number; // 0 = top-level, 1+ = nested
  /** Per-item kind override — when items at the same indent have different kinds */
  kind?: "bullet" | "number";
}

/** Style for a specific indent level in a list */
export interface ListLevelStyle {
  kind: "bullet" | "number";
  bulletStyle?: string; // disc, circle, square, dash, arrow, star, checkmark
  numberStyle?: string; // decimal, alpha-lower, alpha-upper, roman-lower, roman-upper
  startFrom?: number;
  /** Marker size: "small" | "medium" | "large" — defaults to "medium" */
  size?: string;
  /** Marker color as CSS value — defaults to theme muted text */
  color?: string;
}

/** Properties specific to certain block types */
export interface BlockProps {
  checked?: boolean;
  language?: string;
  // image
  src?: string;
  alt?: string;
  caption?: string;
  // image crop (position of visible area within the full image)
  cropX?: number;
  cropY?: number;
  cropW?: number;
  cropH?: number;
  // embed
  url?: string;
  // callout
  emoji?: string;
  color?: string;
  // toggle
  collapsed?: boolean;
  // table
  rows?: number;
  cols?: number;
  tableData?: string[][]; // 2D array of cell contents
  tableHeader?: boolean; // first row is header
  // table of contents
  tocLevels?: number; // max heading depth: 1-6 (default 3 = h1-h3)
  // custom component
  componentName?: string;
  componentProps?: Record<string, unknown>;
  // generic extension point
  [key: string]: unknown;
}

/**
 * A block is the fundamental unit of the editor.
 * Each block has a unique ID, a type, inline content (text spans),
 * optional children (for nesting: lists, toggles), and type-specific props.
 */
export interface Block {
  id: string;
  type: BlockType;
  content: TextSpan[];
  children: Block[];
  props: BlockProps;
}

/** The root document model */
export interface EditorDocument {
  blocks: Block[];
  version: number; // Incremented on every change
}

/** A position within the document: which block, which offset in its text */
export interface Position {
  blockId: string;
  offset: number;
}

/** A selection range within the document */
export interface Selection {
  anchor: Position; // Where the selection started
  focus: Position; // Where the selection ended (cursor is here)
}

/** Whether the selection is collapsed (cursor) or expanded (range) */
export function isCollapsed(sel: Selection): boolean {
  return sel.anchor.blockId === sel.focus.blockId && sel.anchor.offset === sel.focus.offset;
}

/** Direction for merge operations */
export type Direction = "forward" | "backward";

/** An operation that can be applied to the document */
export type Operation =
  | { type: "insertText"; blockId: string; offset: number; text: string }
  | { type: "deleteText"; blockId: string; offset: number; length: number; deleted: string }
  | { type: "splitBlock"; blockId: string; offset: number; newBlockId: string }
  | { type: "mergeBlock"; blockId: string; direction: Direction; mergedContent: TextSpan[]; mergedChildren: Block[] }
  | { type: "insertBlock"; afterBlockId: string | null; block: Block }
  | { type: "deleteBlock"; blockId: string; block: Block; index: number }
  | { type: "moveBlock"; blockId: string; fromIndex: number; toIndex: number }
  | { type: "setBlockType"; blockId: string; oldType: BlockType; newType: BlockType; oldProps: BlockProps; newProps: BlockProps }
  | { type: "setBlockProps"; blockId: string; oldProps: BlockProps; newProps: BlockProps }
  | { type: "toggleMark"; blockId: string; from: number; to: number; mark: Mark }
  | { type: "replaceContent"; blockId: string; oldContent: TextSpan[]; newContent: TextSpan[] };

/** A batch of operations that form a single undo step */
export interface Transaction {
  operations: Operation[];
  selectionBefore: Selection | null;
  selectionAfter: Selection | null;
  timestamp: number;
}

// ---- Helpers ----

/** Get the plain text length of a block's content */
export function getTextLength(content: TextSpan[]): number {
  let len = 0;
  for (const span of content) {
    len += span.text.length;
  }
  return len;
}

/** Get plain text from content spans */
export function getPlainText(content: TextSpan[]): string {
  let text = "";
  for (const span of content) {
    text += span.text;
  }
  return text;
}

/** Create a new block with defaults */
export function createBlock(type: BlockType, text: string = "", props: BlockProps = {}): Block {
  return {
    id: generateId(),
    type,
    content: text ? [{ text }] : [],
    children: [],
    props,
  };
}

/** Generate a unique block ID */
export function generateId(): string {
  return crypto.randomUUID();
}

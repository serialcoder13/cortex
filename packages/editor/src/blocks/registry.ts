// ============================================================
// Block registry — maps block types to their renderers and
// metadata (label, icon, shortcut for slash commands).
// ============================================================

import type { BlockType } from "../core/types";

export interface BlockDefinition {
  type: BlockType;
  label: string;
  description: string;
  shortcut?: string; // Markdown shortcut hint
  keywords: string[]; // For slash command search
  hasContent: boolean; // Whether the block has editable text
}

export const blockDefinitions: BlockDefinition[] = [
  { type: "paragraph", label: "Text", description: "Plain text block", shortcut: undefined, keywords: ["text", "paragraph", "plain"], hasContent: true },
  { type: "heading1", label: "Heading 1", description: "Large heading", shortcut: "#", keywords: ["heading", "h1", "title"], hasContent: true },
  { type: "heading2", label: "Heading 2", description: "Medium heading", shortcut: "##", keywords: ["heading", "h2", "subtitle"], hasContent: true },
  { type: "heading3", label: "Heading 3", description: "Small heading", shortcut: "###", keywords: ["heading", "h3"], hasContent: true },
  { type: "bulletList", label: "Bullet List", description: "Unordered list item", shortcut: "-", keywords: ["bullet", "list", "unordered", "ul"], hasContent: true },
  { type: "numberedList", label: "Numbered List", description: "Ordered list item", shortcut: "1.", keywords: ["numbered", "list", "ordered", "ol"], hasContent: true },
  { type: "todo", label: "To-do", description: "Checkbox item", shortcut: "[]", keywords: ["todo", "checkbox", "task", "check"], hasContent: true },
  { type: "codeBlock", label: "Code", description: "Code block", shortcut: "```", keywords: ["code", "pre", "snippet"], hasContent: true },
  { type: "quote", label: "Quote", description: "Block quote", shortcut: ">", keywords: ["quote", "blockquote", "citation"], hasContent: true },
  { type: "callout", label: "Callout", description: "Highlighted callout box", shortcut: undefined, keywords: ["callout", "info", "warning", "note", "tip"], hasContent: true },
  { type: "toggle", label: "Toggle", description: "Collapsible content", shortcut: undefined, keywords: ["toggle", "collapse", "accordion", "dropdown"], hasContent: true },
  { type: "divider", label: "Divider", description: "Horizontal line", shortcut: "---", keywords: ["divider", "line", "separator", "hr"], hasContent: false },
  { type: "image", label: "Image", description: "Upload or embed an image", shortcut: undefined, keywords: ["image", "photo", "picture", "img"], hasContent: false },
  { type: "embed", label: "Embed", description: "Embed a URL", shortcut: undefined, keywords: ["embed", "iframe", "video", "url"], hasContent: false },
  { type: "table", label: "Table", description: "Simple table", shortcut: undefined, keywords: ["table", "grid", "spreadsheet"], hasContent: false },
];

export function getBlockDefinition(type: BlockType): BlockDefinition | undefined {
  return blockDefinitions.find((d) => d.type === type);
}

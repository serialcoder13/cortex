// Main editor component
export { CortexEditor } from "./CortexEditor";
export type { CortexEditorProps, CortexEditorRef } from "./CortexEditor";

// Public types
export type {
  BlockType,
  MarkType,
  Mark,
  TextSpan,
  BlockProps,
  Block,
  EditorDocument,
  Position,
  Selection,
} from "./core/types";

// Document helpers (for consumers who need to build documents programmatically)
export { createBlock, generateId, getPlainText, getTextLength } from "./core/types";
export { createDocument } from "./core/document";

// Block registry (for consumers who want to know available block types)
export { blockDefinitions, getBlockDefinition } from "./blocks/registry";
export type { BlockDefinition } from "./blocks/registry";

// Slash command menu (for consumers who want to render it themselves)
export { SlashCommandMenu } from "./features/slash-command";

// Floating toolbar
export { FloatingToolbar } from "./features/toolbar";

// Markdown serialization
export { blocksToMarkdown, markdownToBlocks } from "./markdown";
export { parseFrontmatter, stringifyFrontmatter } from "./markdown";
export type { Frontmatter } from "./markdown";

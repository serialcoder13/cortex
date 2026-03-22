// ============================================================
// Markdown serialization/deserialization for the Cortex editor.
// Converts between the Block document model and markdown strings
// with optional YAML frontmatter.
// ============================================================

// Frontmatter
export { parseFrontmatter, stringifyFrontmatter } from "./frontmatter";
export type { Frontmatter } from "./frontmatter";

// Serialization: Block[] → markdown string
export { blocksToMarkdown } from "./serialize";

// Deserialization: markdown string → Block[]
export { markdownToBlocks } from "./deserialize";
export { parseInlineMarks } from "./deserialize";

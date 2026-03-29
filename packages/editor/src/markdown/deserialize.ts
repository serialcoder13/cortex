// ============================================================
// Markdown deserializer: converts markdown string → Block[].
// Line-by-line parser with inline mark detection.
// ============================================================

import type { Block, TextSpan, Mark, BlockType, BlockProps } from "../core/types";
import { generateId } from "../core/types";
import { detectCustomComponentMarker, isCustomComponentEndMarker, deserializeCustomComponent } from "../blocks/component-registry";
import { emojiMap } from "./emoji";

/** Extract reference link definitions: [ref]: url "title" (excludes footnote ^refs) */
function extractRefLinks(lines: string[]): Map<string, string> {
  const refs = new Map<string, string>();
  for (const line of lines) {
    const m = line.match(/^\[([^\]]+)\]:\s+(.+?)(?:\s+"[^"]*")?\s*$/);
    if (m && !m[1].startsWith("^")) refs.set(m[1].toLowerCase(), m[2]);
  }
  return refs;
}

/** Module-level ref links map, set during parsing */
let _refLinks: Map<string, string> = new Map();

/**
 * Convert a markdown string (without frontmatter) into an array of Blocks.
 */
export function markdownToBlocks(markdown: string): Block[] {
  const lines = markdown.split("\n");
  _refLinks = extractRefLinks(lines);
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // --- Code block (fenced) ---
    if (line.trimStart().startsWith("```")) {
      const langHint = line.trimStart().slice(3).trim();
      if (langHint === "mermaid") {
        const result = parseMermaidBlock(lines, i);
        blocks.push(result.block);
        i = result.nextIndex;
        continue;
      }
      const result = parseCodeBlock(lines, i);
      blocks.push(result.block);
      i = result.nextIndex;
      continue;
    }

    // --- Code block (indented: 4+ spaces or tab) ---
    if (/^(    |\t)/.test(line)) {
      const codeLines: string[] = [];
      let j = i;
      while (j < lines.length && (/^(    |\t)/.test(lines[j]) || lines[j].trim() === "")) {
        // Remove 4-space or tab prefix
        codeLines.push(lines[j].replace(/^(    |\t)/, ""));
        j++;
      }
      // Trim trailing empty lines
      while (codeLines.length > 0 && codeLines[codeLines.length - 1].trim() === "") codeLines.pop();
      if (codeLines.length > 0) {
        blocks.push(makeBlock("codeBlock", [{ text: codeLines.join("\n") }], {}));
        i = j;
        continue;
      }
    }

    // --- Table with optional metadata comment ---
    // Detect <!-- cortex-table:{json} --> followed by a table
    const tableMeta = parseTableMetaComment(line);
    if (tableMeta !== null) {
      // Next non-empty line should be the table
      let nextLine = i + 1;
      while (nextLine < lines.length && lines[nextLine].trim() === "") nextLine++;
      if (nextLine < lines.length && lines[nextLine].trimStart().startsWith("|")) {
        const result = parseTable(lines, nextLine, tableMeta);
        blocks.push(result.block);
        i = result.nextIndex;
        continue;
      }
    }

    // --- Table: lines starting with | ---
    if (line.trimStart().startsWith("|")) {
      const result = parseTable(lines, i);
      blocks.push(result.block);
      i = result.nextIndex;
      continue;
    }

    // --- Custom component (<!-- cortex:name --> ... <!-- /cortex:name -->) ---
    const componentName = detectCustomComponentMarker(line);
    if (componentName) {
      const contentLines: string[] = [];
      i++;
      while (i < lines.length && !isCustomComponentEndMarker(lines[i], componentName)) {
        contentLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip end marker
      const props = deserializeCustomComponent(componentName, contentLines.join("\n"));
      blocks.push(makeBlock("customComponent", [], props));
      continue;
    }

    // --- Setext headings: text followed by === or --- on next line ---
    if (i + 1 < lines.length && line.trim().length > 0) {
      const nextLine = lines[i + 1].trim();
      if (/^={3,}$/.test(nextLine)) {
        blocks.push(makeBlock("heading1", parseInlineMarks(line.trim())));
        i += 2; // skip both lines
        continue;
      }
      if (/^-{3,}$/.test(nextLine) && !line.trim().startsWith(">") && !line.trim().startsWith("-") && !line.trim().startsWith("*") && !line.trim().startsWith("#")) {
        blocks.push(makeBlock("heading2", parseInlineMarks(line.trim())));
        i += 2;
        continue;
      }
    }

    // --- Divider ---
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim()) && line.trim().length >= 3) {
      blocks.push(makeBlock("divider", [], {}));
      i++;
      continue;
    }

    // --- Image: ![alt](src) ---
    const imageMatch = line.match(/^!\[([^\]]*)\]\(([^)]*)\)\s*$/);
    if (imageMatch) {
      blocks.push(
        makeBlock("image", [], {
          alt: imageMatch[1],
          src: imageMatch[2],
        }),
      );
      i++;
      continue;
    }

    // --- Headings (h1-h6) ---
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingTypes: Record<number, BlockType> = {
        1: "heading1", 2: "heading2", 3: "heading3",
        4: "heading4", 5: "heading5", 6: "heading6",
      };
      const headingType = headingTypes[level] ?? "heading6";
      blocks.push(makeBlock(headingType, parseInlineMarks(headingMatch[2])));
      i++;
      continue;
    }

    // --- Todo: - [ ] or - [x] ---
    const todoMatch = line.match(/^-\s+\[([ xX])\]\s+(.*)/);
    if (todoMatch) {
      const checked = todoMatch[1].toLowerCase() === "x";
      blocks.push(
        makeBlock("todo", parseInlineMarks(todoMatch[2]), { checked }),
      );
      i++;
      continue;
    }

    // --- Bullet list: - or * (with nested child support) ---
    const bulletMatch = line.match(/^[-*+]\s+(.*)/);
    if (bulletMatch) {
      const block = makeBlock("bulletList", parseInlineMarks(bulletMatch[1]));
      i++;
      // Collect indented child lines (2+ spaces or tab)
      const childLines: string[] = [];
      while (i < lines.length && /^(\s{2,}|\t)/.test(lines[i]) && lines[i].trim() !== "") {
        childLines.push(lines[i].replace(/^(\s{2,}|\t)/, ""));
        i++;
      }
      if (childLines.length > 0) {
        block.children = markdownToBlocks(childLines.join("\n"));
      }
      blocks.push(block);
      continue;
    }

    // --- Numbered list: 1. or any digit. (with nested child support) ---
    const numberedMatch = line.match(/^\d+\.\s+(.*)/);
    if (numberedMatch) {
      const block = makeBlock("numberedList", parseInlineMarks(numberedMatch[1]));
      i++;
      const childLines: string[] = [];
      while (i < lines.length && /^(\s{2,}|\t)/.test(lines[i]) && lines[i].trim() !== "") {
        childLines.push(lines[i].replace(/^(\s{2,}|\t)/, ""));
        i++;
      }
      if (childLines.length > 0) {
        block.children = markdownToBlocks(childLines.join("\n"));
      }
      blocks.push(block);
      continue;
    }

    // --- Callout: > [!callout emoji] ---
    const calloutMatch = line.match(/^>\s+\[!callout\s*(.*?)\]\s*$/);
    if (calloutMatch) {
      const emoji = calloutMatch[1].trim() || undefined;
      // Gather subsequent `> ` lines as the callout body
      const bodyLines: string[] = [];
      let j = i + 1;
      while (j < lines.length && lines[j].startsWith("> ")) {
        bodyLines.push(lines[j].slice(2));
        j++;
      }
      const bodyText = bodyLines.join("\n");
      blocks.push(
        makeBlock("callout", parseInlineMarks(bodyText), { emoji }),
      );
      i = j;
      continue;
    }

    // --- Quote: > (with nested blockquote support) ---
    const quoteMatch = line.match(/^>\s?(.*)/);
    if (quoteMatch) {
      // Collect all consecutive > lines, stripping one level of >
      const innerLines: string[] = [quoteMatch[1]];
      let j = i + 1;
      while (j < lines.length) {
        const nextQuoteMatch = lines[j].match(/^>\s?(.*)/);
        if (nextQuoteMatch) {
          innerLines.push(nextQuoteMatch[1]);
          j++;
        } else {
          break;
        }
      }
      // Check if the inner content itself contains blockquotes (nested)
      const hasNestedQuotes = innerLines.some((l) => l.startsWith(">"));
      if (hasNestedQuotes) {
        // Recursively parse inner content to get children blocks
        const innerMarkdown = innerLines.join("\n");
        const children = markdownToBlocks(innerMarkdown);
        // The first child's content becomes the quote's own content,
        // remaining children become the quote's children array
        const first = children[0];
        const quoteBlock = makeBlock(
          "quote",
          first?.content ?? [],
          {},
        );
        quoteBlock.children = children.slice(1);
        blocks.push(quoteBlock);
      } else {
        const quoteText = innerLines.join("\n");
        blocks.push(makeBlock("quote", parseInlineMarks(quoteText)));
      }
      i = j;
      continue;
    }

    // --- HTML details/toggle ---
    if (line.trim() === "<details>") {
      const result = parseToggle(lines, i);
      blocks.push(result.block);
      i = result.nextIndex;
      continue;
    }

    // --- Embed: [embed](url) ---
    const embedMatch = line.match(/^\[embed\]\(([^)]*)\)\s*$/);
    if (embedMatch) {
      blocks.push(makeBlock("embed", [], { url: embedMatch[1] }));
      i++;
      continue;
    }

    // --- Empty line: skip ---
    if (line.trim() === "") {
      i++;
      continue;
    }

    // --- Reference link definition: [ref]: url — skip (already extracted in pre-pass) ---
    if (/^\[([^\]]+)\]:\s+/.test(line.trim())) {
      i++;
      continue;
    }

    // --- Default: paragraph ---
    // Collect consecutive non-empty, non-special lines into a single paragraph
    const paraLines: string[] = [line];
    let j = i + 1;
    while (j < lines.length) {
      const nextLine = lines[j];
      if (
        nextLine.trim() === "" ||
        nextLine.match(/^#{1,3}\s/) ||
        nextLine.match(/^[-*]\s/) ||
        nextLine.match(/^\d+\.\s/) ||
        nextLine.match(/^>\s/) ||
        nextLine.trimStart().startsWith("```") ||
        /^(-{3,}|\*{3,})$/.test(nextLine.trim()) ||
        nextLine.match(/^!\[/) ||
        nextLine.match(/^\[embed\]/) ||
        nextLine.trim() === "<details>" ||
        nextLine.trimStart().startsWith("|")
      ) {
        break;
      }
      paraLines.push(nextLine);
      j++;
    }

    const paraText = paraLines.join("\n");
    blocks.push(makeBlock("paragraph", parseInlineMarks(paraText)));
    i = j;
  }

  return blocks;
}

// ---- Mermaid block parsing ----

function parseMermaidBlock(
  lines: string[],
  startIndex: number,
): { block: Block; nextIndex: number } {
  const codeLines: string[] = [];
  let i = startIndex + 1; // Skip opening ```mermaid
  while (i < lines.length) {
    if (lines[i].trimStart().startsWith("```")) {
      i++; // Skip closing ```
      break;
    }
    codeLines.push(lines[i]);
    i++;
  }

  return {
    block: makeBlock("mermaid", [], { mermaidCode: codeLines.join("\n") }),
    nextIndex: i,
  };
}

// ---- Table parsing ----

/**
 * Parse a `<!-- cortex-table:{json} -->` comment. Returns the parsed metadata
 * object, or null if the line is not a table meta comment.
 */
function parseTableMetaComment(line: string): Record<string, unknown> | null {
  const match = line.trim().match(/^<!--\s*cortex-table:(.*?)\s*-->$/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function parseTable(
  lines: string[],
  startIndex: number,
  meta?: Record<string, unknown>,
): { block: Block; nextIndex: number } {
  const tableLines: string[] = [];
  let i = startIndex;
  while (i < lines.length && lines[i].trimStart().startsWith("|")) {
    tableLines.push(lines[i]);
    i++;
  }

  // Parse rows, extracting alignment from the separator line
  const tableData: string[][] = [];
  let columnAlignments: string[] | undefined;
  for (const tl of tableLines) {
    const trimmed = tl.trim();
    // Check for separator lines like | --- | :---: | ---: |
    if (/^\|[\s\-:|]+\|$/.test(trimmed)) {
      // Extract alignment info
      const separatorCells = trimmed
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim());
      columnAlignments = separatorCells.map((cell) => {
        const left = cell.startsWith(":");
        const right = cell.endsWith(":");
        if (left && right) return "center";
        if (right) return "right";
        return "left";
      });
      continue;
    }
    // Split cells: remove leading/trailing |, split by |, trim each cell
    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
    tableData.push(cells);
  }

  const props: Record<string, unknown> = { tableData };
  if (columnAlignments && columnAlignments.some((a) => a !== "left")) {
    props.columnAlignments = columnAlignments;
  }

  // Merge table metadata from cortex-table comment
  if (meta) {
    for (const key of ["cellMeta", "showBorders", "compact", "colorTemplate"]) {
      if (meta[key] !== undefined) props[key] = meta[key];
    }
  }

  return {
    block: makeBlock("table", [], props),
    nextIndex: i,
  };
}

// ---- Code block parsing ----

function parseCodeBlock(
  lines: string[],
  startIndex: number,
): { block: Block; nextIndex: number } {
  const openingLine = lines[startIndex].trimStart();
  const language = openingLine.slice(3).trim(); // After ```

  const codeLines: string[] = [];
  let i = startIndex + 1;
  while (i < lines.length) {
    if (lines[i].trimStart().startsWith("```")) {
      i++; // Skip closing ```
      break;
    }
    codeLines.push(lines[i]);
    i++;
  }

  const codeText = codeLines.join("\n");
  const props: BlockProps = {};
  if (language) {
    props.language = language;
  }

  return {
    block: makeBlock("codeBlock", [{ text: codeText }], props),
    nextIndex: i,
  };
}

// ---- Toggle parsing ----

function parseToggle(
  lines: string[],
  startIndex: number,
): { block: Block; nextIndex: number } {
  let i = startIndex + 1; // Skip <details>
  let summaryText = "";

  // Look for <summary>...</summary>
  if (i < lines.length) {
    const summaryMatch = lines[i].match(/<summary>(.*?)<\/summary>/);
    if (summaryMatch) {
      summaryText = summaryMatch[1];
      i++;
    }
  }

  // Collect lines until </details>
  const innerLines: string[] = [];
  while (i < lines.length) {
    if (lines[i].trim() === "</details>") {
      i++; // Skip </details>
      break;
    }
    innerLines.push(lines[i]);
    i++;
  }

  // Parse inner content as child blocks
  const innerMarkdown = innerLines.join("\n").trim();
  const children = innerMarkdown ? markdownToBlocks(innerMarkdown) : [];

  const block: Block = {
    id: generateId(),
    type: "toggle",
    content: parseInlineMarks(summaryText),
    children,
    props: {},
  };

  return { block, nextIndex: i };
}

// ---- Inline mark parsing ----

/**
 * Token types produced by the inline tokenizer.
 */
interface InlineToken {
  type: "text" | "bold" | "italic" | "bolditalic" | "strikethrough" | "code" | "underline" | "link";
  text: string;
  href?: string;
}

/**
 * Parse a markdown string for inline formatting marks and return TextSpan[].
 *
 * Detects: ***bold+italic***, **bold**, *italic*, ~~strikethrough~~,
 * `code`, <u>underline</u>, [text](href)
 */
export function parseInlineMarks(text: string): TextSpan[] {
  if (!text) {
    return [];
  }

  const tokens = tokenizeInline(text);
  return tokens.map(tokenToSpan);
}

/**
 * Tokenize inline markdown into a flat list of tokens.
 * Uses a single-pass scan with a priority order for patterns.
 */
function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let i = 0;
  let buffer = "";

  function flushBuffer(): void {
    if (buffer) {
      tokens.push({ type: "text", text: buffer });
      buffer = "";
    }
  }

  while (i < text.length) {
    // --- Inline code: `...` ---
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        flushBuffer();
        tokens.push({ type: "code", text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // --- Bold+Italic: ***...*** ---
    if (text.slice(i, i + 3) === "***") {
      const end = text.indexOf("***", i + 3);
      if (end !== -1) {
        flushBuffer();
        tokens.push({ type: "bolditalic", text: text.slice(i + 3, end) });
        i = end + 3;
        continue;
      }
    }

    // --- Bold: **...** ---
    if (text.slice(i, i + 2) === "**") {
      const end = text.indexOf("**", i + 2);
      if (end !== -1) {
        flushBuffer();
        tokens.push({ type: "bold", text: text.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }

    // --- Bold+Italic: ___...___ ---
    if (text.slice(i, i + 3) === "___") {
      const end = text.indexOf("___", i + 3);
      if (end !== -1) {
        flushBuffer();
        tokens.push({ type: "bolditalic", text: text.slice(i + 3, end) });
        i = end + 3;
        continue;
      }
    }

    // --- Bold: __...__ ---
    if (text.slice(i, i + 2) === "__") {
      const end = text.indexOf("__", i + 2);
      if (end !== -1) {
        flushBuffer();
        tokens.push({ type: "bold", text: text.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }

    // --- Strikethrough: ~~...~~ ---
    if (text.slice(i, i + 2) === "~~") {
      const end = text.indexOf("~~", i + 2);
      if (end !== -1) {
        flushBuffer();
        tokens.push({ type: "strikethrough", text: text.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }

    // --- Italic: *...* (single, not followed by another *) ---
    if (text[i] === "*" && text[i + 1] !== "*") {
      const end = findSingleAsteriskClose(text, i + 1);
      if (end !== -1) {
        flushBuffer();
        tokens.push({ type: "italic", text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // --- Italic: _..._ (single underscore, not followed by another _) ---
    if (text[i] === "_" && text[i + 1] !== "_") {
      // Find closing single underscore
      let end = -1;
      for (let j = i + 1; j < text.length; j++) {
        if (text[j] === "_" && text[j + 1] !== "_" && (j === i + 1 || text[j - 1] !== "_")) {
          end = j;
          break;
        }
      }
      if (end !== -1) {
        flushBuffer();
        tokens.push({ type: "italic", text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // --- Underline: <u>...</u> ---
    if (text.slice(i, i + 3) === "<u>") {
      const end = text.indexOf("</u>", i + 3);
      if (end !== -1) {
        flushBuffer();
        tokens.push({ type: "underline", text: text.slice(i + 3, end) });
        i = end + 4; // "</u>".length === 4
        continue;
      }
    }

    // --- Link: [text](href) ---
    if (text[i] === "[") {
      const result = parseLink(text, i);
      if (result) {
        flushBuffer();
        tokens.push({
          type: "link",
          text: result.text,
          href: result.href,
        });
        i = result.end;
        continue;
      }
    }

    // --- Emoji shortcode: :name: ---
    if (text[i] === ":") {
      const closeColon = text.indexOf(":", i + 1);
      if (closeColon !== -1 && closeColon - i < 40) {
        const code = text.slice(i + 1, closeColon);
        const emoji = emojiMap[code];
        if (emoji) {
          flushBuffer();
          tokens.push({ type: "text", text: emoji });
          i = closeColon + 1;
          continue;
        }
      }
    }

    // --- Autolink: bare URLs (https://... or http://...) ---
    if (text.slice(i, i + 8) === "https://" || text.slice(i, i + 7) === "http://") {
      const urlMatch = text.slice(i).match(/^(https?:\/\/[^\s<>)\]]+)/);
      if (urlMatch) {
        flushBuffer();
        const url = urlMatch[1];
        tokens.push({ type: "link", text: url, href: url });
        i += url.length;
        continue;
      }
    }

    // --- Plain text ---
    buffer += text[i];
    i++;
  }

  flushBuffer();
  return tokens;
}

/**
 * Find the closing single `*` that is not part of `**`.
 */
function findSingleAsteriskClose(text: string, start: number): number {
  for (let i = start; i < text.length; i++) {
    if (text[i] === "*" && text[i + 1] !== "*" && (i === start || text[i - 1] !== "*")) {
      return i;
    }
  }
  return -1;
}

/**
 * Try to parse a markdown link starting at position `start`.
 * Returns null if not a valid link.
 */
function parseLink(
  text: string,
  start: number,
): { text: string; href: string; end: number } | null {
  // Expect [text](href) or [text][ref] or [text][]
  const closeBracket = text.indexOf("]", start + 1);
  if (closeBracket === -1) return null;

  const linkText = text.slice(start + 1, closeBracket);

  // Inline link: [text](href "optional title")
  if (text[closeBracket + 1] === "(") {
    const closeParen = text.indexOf(")", closeBracket + 2);
    if (closeParen === -1) return null;
    // Strip optional title: href may be `url "title"`
    let href = text.slice(closeBracket + 2, closeParen).trim();
    const titleMatch = href.match(/^(\S+)\s+"[^"]*"$/);
    if (titleMatch) href = titleMatch[1];
    return { text: linkText, href, end: closeParen + 1 };
  }

  // Reference link: [text][ref] or [text][]
  if (text[closeBracket + 1] === "[") {
    const closeRef = text.indexOf("]", closeBracket + 2);
    if (closeRef === -1) return null;
    const refId = text.slice(closeBracket + 2, closeRef).toLowerCase() || linkText.toLowerCase();
    const href = _refLinks.get(refId);
    if (href) return { text: linkText, href, end: closeRef + 1 };
  }

  // Shortcut reference link: [text] where text matches a ref
  const shortcutHref = _refLinks.get(linkText.toLowerCase());
  if (shortcutHref) {
    return { text: linkText, href: shortcutHref, end: closeBracket + 1 };
  }

  return null;
}

/**
 * Convert an InlineToken to a TextSpan.
 */
function tokenToSpan(token: InlineToken): TextSpan {
  switch (token.type) {
    case "text":
      return { text: token.text };
    case "bold":
      return { text: token.text, marks: [{ type: "bold" }] };
    case "italic":
      return { text: token.text, marks: [{ type: "italic" }] };
    case "bolditalic":
      return {
        text: token.text,
        marks: [{ type: "bold" }, { type: "italic" }],
      };
    case "strikethrough":
      return { text: token.text, marks: [{ type: "strikethrough" }] };
    case "code":
      return { text: token.text, marks: [{ type: "code" }] };
    case "underline":
      return { text: token.text, marks: [{ type: "underline" }] };
    case "link":
      return {
        text: token.text,
        marks: [{ type: "link", attrs: { href: token.href || "" } }],
      };
  }
}

// ---- Helpers ----

/**
 * Create a Block with a generated ID.
 */
function makeBlock(
  type: BlockType,
  content: TextSpan[],
  props: BlockProps = {},
): Block {
  return {
    id: generateId(),
    type,
    content,
    children: [],
    props,
  };
}

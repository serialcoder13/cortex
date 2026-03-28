// ============================================================
// Markdown deserializer: converts markdown string → Block[].
// Line-by-line parser with inline mark detection.
// ============================================================

import type { Block, TextSpan, Mark, BlockType, BlockProps } from "../core/types";
import { generateId } from "../core/types";
import { detectCustomComponentMarker, isCustomComponentEndMarker, deserializeCustomComponent } from "../blocks/component-registry";

/**
 * Convert a markdown string (without frontmatter) into an array of Blocks.
 */
export function markdownToBlocks(markdown: string): Block[] {
  const lines = markdown.split("\n");
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

    // --- Divider ---
    if (/^(-{3,}|\*{3,})$/.test(line.trim()) && line.trim().length >= 3) {
      // Make sure it's not just a `---` that could be frontmatter (handled elsewhere)
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

    // --- Headings ---
    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3;
      const headingType: BlockType =
        level === 1 ? "heading1" : level === 2 ? "heading2" : "heading3";
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

    // --- Bullet list: - or * ---
    const bulletMatch = line.match(/^[-*]\s+(.*)/);
    if (bulletMatch) {
      blocks.push(makeBlock("bulletList", parseInlineMarks(bulletMatch[1])));
      i++;
      continue;
    }

    // --- Numbered list: 1. or any digit. ---
    const numberedMatch = line.match(/^\d+\.\s+(.*)/);
    if (numberedMatch) {
      blocks.push(
        makeBlock("numberedList", parseInlineMarks(numberedMatch[1])),
      );
      i++;
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

    // --- Quote: > ---
    const quoteMatch = line.match(/^>\s?(.*)/);
    if (quoteMatch) {
      const quoteLines: string[] = [quoteMatch[1]];
      let j = i + 1;
      while (j < lines.length) {
        const nextQuoteMatch = lines[j].match(/^>\s?(.*)/);
        if (nextQuoteMatch) {
          quoteLines.push(nextQuoteMatch[1]);
          j++;
        } else {
          break;
        }
      }
      const quoteText = quoteLines.join("\n");
      blocks.push(makeBlock("quote", parseInlineMarks(quoteText)));
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

function parseTable(
  lines: string[],
  startIndex: number,
): { block: Block; nextIndex: number } {
  const tableLines: string[] = [];
  let i = startIndex;
  while (i < lines.length && lines[i].trimStart().startsWith("|")) {
    tableLines.push(lines[i]);
    i++;
  }

  // Parse rows, skipping the separator line (| --- | --- |)
  const tableData: string[][] = [];
  for (const tl of tableLines) {
    const trimmed = tl.trim();
    // Skip separator lines like | --- | --- |
    if (/^\|[\s\-:|]+\|$/.test(trimmed)) {
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

  return {
    block: makeBlock("table", [], { tableData }),
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
  // Expect [text](href)
  const closeBracket = text.indexOf("]", start + 1);
  if (closeBracket === -1) return null;

  // Must be immediately followed by (
  if (text[closeBracket + 1] !== "(") return null;

  const closeParen = text.indexOf(")", closeBracket + 2);
  if (closeParen === -1) return null;

  return {
    text: text.slice(start + 1, closeBracket),
    href: text.slice(closeBracket + 2, closeParen),
    end: closeParen + 1,
  };
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

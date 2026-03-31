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
    const m = line.match(/^\[([^\]]+)\]:\s+(\S+)(?:\s+"[^"]*")?(?:\s+'[^']*')?\s*$/);
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

    // --- Table of Contents: <!-- cortex-toc:N --> ---
    const tocMatch = line.trim().match(/^<!--\s*cortex-toc:(\d+)\s*-->$/);
    if (tocMatch) {
      blocks.push(makeBlock("toc", [], { tocLevels: parseInt(tocMatch[1]) }));
      i++;
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

    // --- Image(s): ![alt](src) or ![alt](src "title") or ![alt][ref] ---
    // Optionally followed by {width=N height=N cropX=N cropY=N cropW=N cropH=N}
    // Supports multiple images on the same line (rendered side-by-side)
    if (line.includes("![")) {
      // Parse trailing {key=value ...} attributes if present
      const parseImageAttrs = (after: string): Record<string, number> => {
        const attrs: Record<string, number> = {};
        const attrMatch = /\{([^}]+)\}/.exec(after);
        if (attrMatch) {
          for (const part of attrMatch[1].split(/\s+/)) {
            const [k, v] = part.split("=");
            if (k && v && !Number.isNaN(Number(v))) attrs[k] = Number(v);
          }
        }
        return attrs;
      };

      const imgRegex = /!\[([^\]]*)\]\(([^)]*)\)|!\[([^\]]*)\]\[([^\]]*)\]/g;
      let match: RegExpExecArray | null;
      const images: Block[] = [];
      while ((match = imgRegex.exec(line)) !== null) {
        if (match[1] !== undefined && match[2] !== undefined) {
          // Inline image: ![alt](src "title")
          let src = match[2].trim();
          const titleM = src.match(/^(\S+)\s+"[^"]*"$/);
          if (titleM) src = titleM[1];
          // Parse attributes from text after the image syntax
          const afterImg = line.slice(match.index + match[0].length);
          const attrs = parseImageAttrs(afterImg);
          images.push(makeBlock("image", [], { alt: match[1], src, ...attrs }));
        } else if (match[3] !== undefined) {
          // Reference image: ![alt][ref]
          const alt = match[3];
          const refId = (match[4] || alt).toLowerCase();
          const src = _refLinks.get(refId);
          if (src) {
            const afterImg = line.slice(match.index + match[0].length);
            const attrs = parseImageAttrs(afterImg);
            images.push(makeBlock("image", [], { alt, src, ...attrs }));
          }
        }
      }
      if (images.length > 0) {
        // Mark consecutive images for side-by-side rendering
        if (images.length > 1) {
          images.forEach((img) => { img.props.inline = true; });
        }
        blocks.push(...images);
        i++;
        continue;
      }
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

    // --- List with optional metadata comment: <!-- cortex-list:{json} --> ---
    const listMeta = parseListMetaComment(line);
    if (listMeta !== null) {
      let nextLine = i + 1;
      while (nextLine < lines.length && lines[nextLine].trim() === "") nextLine++;
      const listResult = parseListRun(lines, nextLine, listMeta);
      if (listResult) {
        blocks.push(listResult.block);
        i = listResult.nextIndex;
        continue;
      }
    }

    // --- List: bullet (- / * / +) or numbered (1.) items collected into a single list block ---
    {
      const listResult = parseListRun(lines, i);
      if (listResult) {
        blocks.push(listResult.block);
        i = listResult.nextIndex;
        continue;
      }
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
  type: "text" | "bold" | "italic" | "bolditalic" | "strikethrough" | "code"
    | "underline" | "link" | "superscript" | "subscript" | "inserted" | "marked";
  text: string;
  href?: string;
}

/** Typographic replacement map */
const TYPOGRAPHIC_REPLACEMENTS: [RegExp, string][] = [
  [/\(c\)/gi, "\u00A9"],     // ©
  [/\(r\)/gi, "\u00AE"],     // ®
  [/\(tm\)/gi, "\u2122"],    // ™
  [/\(p\)/gi, "\u00A7"],     // § (pilcrow/paragraph)
  [/\+-/g, "\u00B1"],        // ±
  [/\.\.\./g, "\u2026"],     // …
  [/---/g, "\u2014"],        // — em dash
  [/--/g, "\u2013"],         // – en dash
  [/!!!!+/g, "!!!"],         // collapse excessive punctuation
  [/\?\?\?\?+/g, "???"],
  [/,,/g, ","],
];

/** Emoticon shortcut map */
const EMOTICON_MAP: Record<string, string> = {
  ":-)": "\u{1F642}",   // 🙂
  ":)": "\u{1F642}",    // 🙂
  ":-(": "\u{1F641}",   // 🙁
  ":(": "\u{1F641}",    // 🙁
  "8-)": "\u{1F60E}",   // 😎
  ";)": "\u{1F609}",    // 😉
  ":D": "\u{1F603}",    // 😃
  ":-D": "\u{1F603}",   // 😃
  ":P": "\u{1F61B}",    // 😛
  ":-P": "\u{1F61B}",   // 😛
  ":O": "\u{1F62E}",    // 😮
  ":-O": "\u{1F62E}",   // 😮
  ":'(": "\u{1F622}",   // 😢
  ":/": "\u{1F615}",    // 😕
  ":-/": "\u{1F615}",   // 😕
  ":|": "\u{1F610}",    // 😐
  ":-|": "\u{1F610}",   // 😐
  ":-*": "\u{1F618}",   // 😘
  "<3": "\u{2764}\uFE0F", // ❤️
  "B-)": "\u{1F60E}",   // 😎
  "o_O": "\u{1F928}",   // 🤨
  "O_o": "\u{1F928}",
  ":*": "\u{1F618}",    // 😘
  "XD": "\u{1F606}",    // 😆
  ">:(": "\u{1F620}",   // 😠
};

/** Apply typographic replacements and emoticons to text */
function applyTypography(text: string): string {
  let result = text;
  // Smartypants: convert straight quotes to curly
  result = result.replace(/"([^"]*?)"/g, "\u201C$1\u201D"); // "text" → "text"
  result = result.replace(/'([^']*?)'/g, "\u2018$1\u2019"); // 'text' → 'text'
  // Typographic replacements
  for (const [pattern, replacement] of TYPOGRAPHIC_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  // Emoticons (replace only when surrounded by spaces or at start/end)
  // Sort by length descending so longer emoticons match first (e.g. ":-)" before ":)")
  const sortedEmoticons = Object.entries(EMOTICON_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [emoticon, emoji] of sortedEmoticons) {
    const escaped = emoticon.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`(?<=^|\\s)${escaped}(?=\\s|$)`, "g"), emoji);
  }
  return result;
}

/**
 * Parse a markdown string for inline formatting marks and return TextSpan[].
 * Supports recursive nesting: bold can contain links, etc.
 */
export function parseInlineMarks(text: string): TextSpan[] {
  if (!text) return [];
  const tokens = tokenizeInline(text);
  return tokensToSpans(tokens);
}

/**
 * Convert tokens to spans, recursively parsing inner content of
 * bold/italic/strikethrough tokens for nested marks (like links).
 */
function tokensToSpans(tokens: InlineToken[]): TextSpan[] {
  const spans: TextSpan[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case "text":
        spans.push({ text: applyTypography(token.text) });
        break;
      case "code":
        spans.push({ text: token.text, marks: [{ type: "code" }] });
        break;
      case "link":
        spans.push({ text: token.text, marks: [{ type: "link", attrs: { href: token.href || "" } }] });
        break;
      case "superscript":
        spans.push({ text: token.text, marks: [{ type: "superscript" }] });
        break;
      case "subscript":
        spans.push({ text: token.text, marks: [{ type: "subscript" }] });
        break;
      case "inserted":
        spans.push({ text: token.text, marks: [{ type: "underline" }] }); // render as underline
        break;
      case "marked":
        spans.push({ text: token.text, marks: [{ type: "highlight", attrs: { color: "#fff3bf" } }] });
        break;
      case "bold":
      case "italic":
      case "bolditalic":
      case "strikethrough":
      case "underline": {
        // Recursively parse inner content for nested marks (e.g. bold containing a link)
        const innerTokens = tokenizeInline(token.text);
        const innerSpans = tokensToSpans(innerTokens);
        // Determine which marks to add
        const outerMarks: Mark[] = [];
        if (token.type === "bold") outerMarks.push({ type: "bold" });
        else if (token.type === "italic") outerMarks.push({ type: "italic" });
        else if (token.type === "bolditalic") { outerMarks.push({ type: "bold" }); outerMarks.push({ type: "italic" }); }
        else if (token.type === "strikethrough") outerMarks.push({ type: "strikethrough" });
        else if (token.type === "underline") outerMarks.push({ type: "underline" });
        // Merge outer marks into each inner span
        for (const span of innerSpans) {
          spans.push({
            text: span.text,
            marks: [...outerMarks, ...(span.marks ?? [])],
          });
        }
        break;
      }
    }
  }
  return spans;
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
    // --- Backslash escape: \X → literal X for markdown-special characters ---
    if (text[i] === "\\" && i + 1 < text.length && "\\`*_{}[]()#+-.!~|>".includes(text[i + 1])) {
      buffer += text[i + 1];
      i += 2;
      continue;
    }

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

    // --- Inserted: ++...++ ---
    if (text.slice(i, i + 2) === "++") {
      const end = text.indexOf("++", i + 2);
      if (end !== -1) {
        flushBuffer();
        tokens.push({ type: "inserted", text: text.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }

    // --- Marked: ==...== ---
    if (text.slice(i, i + 2) === "==") {
      const end = text.indexOf("==", i + 2);
      if (end !== -1) {
        flushBuffer();
        tokens.push({ type: "marked", text: text.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }

    // --- Superscript: ^...^ ---
    if (text[i] === "^") {
      const end = text.indexOf("^", i + 1);
      if (end !== -1 && end - i < 30 && !text.slice(i + 1, end).includes(" ")) {
        flushBuffer();
        tokens.push({ type: "superscript", text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // --- Subscript: ~...~ (single tilde, not ~~) ---
    if (text[i] === "~" && text[i + 1] !== "~") {
      const end = text.indexOf("~", i + 1);
      if (end !== -1 && end - i < 30 && !text.slice(i + 1, end).includes(" ")) {
        flushBuffer();
        tokens.push({ type: "subscript", text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // --- HTML tags: <sup>, <sub>, <ins>, <mark> ---
    if (text.slice(i, i + 5) === "<sup>") {
      const end = text.indexOf("</sup>", i + 5);
      if (end !== -1) { flushBuffer(); tokens.push({ type: "superscript", text: text.slice(i + 5, end) }); i = end + 6; continue; }
    }
    if (text.slice(i, i + 5) === "<sub>") {
      const end = text.indexOf("</sub>", i + 5);
      if (end !== -1) { flushBuffer(); tokens.push({ type: "subscript", text: text.slice(i + 5, end) }); i = end + 6; continue; }
    }
    if (text.slice(i, i + 5) === "<ins>") {
      const end = text.indexOf("</ins>", i + 5);
      if (end !== -1) { flushBuffer(); tokens.push({ type: "inserted", text: text.slice(i + 5, end) }); i = end + 6; continue; }
    }
    if (text.slice(i, i + 6) === "<mark>") {
      const end = text.indexOf("</mark>", i + 6);
      if (end !== -1) { flushBuffer(); tokens.push({ type: "marked", text: text.slice(i + 6, end) }); i = end + 7; continue; }
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

// tokenToSpan removed — replaced by tokensToSpans with recursive nesting

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

// ---- List parser: collects consecutive bullet/numbered lines into a single list block ----

interface ListParseResult {
  block: Block;
  nextIndex: number;
}

/** Parse a `<!-- cortex-list:{json} -->` comment. Returns parsed meta or null. */
function parseListMetaComment(line: string): Record<string, unknown> | null {
  const match = line.trim().match(/^<!--\s*cortex-list:(.*?)\s*-->$/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/**
 * Try to parse a run of list items starting at line index `start`.
 * Handles mixed bullet/numbered items and indented (nested) items.
 * Returns null if the line at `start` is not a list item.
 */
function parseListRun(lines: string[], start: number, meta?: Record<string, unknown> | null): ListParseResult | null {
  const items: Array<{ id: string; content: TextSpan[]; indent: number; kind?: "bullet" | "number" }> = [];
  const kindByLevel = new Map<number, "bullet" | "number">();
  const numberStyleByLevel = new Map<number, string>();
  let i = start;

  while (i < lines.length) {
    const line = lines[i];

    // Determine indent level (2 spaces or 1 tab = 1 level)
    const indentMatch = line.match(/^((?:  |\t)*)/);
    const rawIndent = indentMatch ? indentMatch[1] : "";
    const indent = rawIndent.replace(/\t/g, "  ").length / 2;

    // Strip leading whitespace for pattern matching
    const stripped = line.slice(rawIndent.length);

    // Skip backslash-escaped markers (e.g. \* , \- , \1.)
    if (stripped.startsWith("\\")) break;

    // Bullet item: - , * , +
    const bulletMatch = stripped.match(/^[-*+]\s+(.*)/);
    if (bulletMatch) {
      if (!kindByLevel.has(indent)) kindByLevel.set(indent, "bullet");
      items.push({
        id: generateId(),
        content: parseInlineMarks(bulletMatch[1]),
        indent,
        kind: "bullet",
      });
      i++;
      continue;
    }

    // Numbered item: 1. 2. etc (decimal)
    const numberedMatch = stripped.match(/^(\d+)\.\s+(.*)/);
    if (numberedMatch) {
      if (!kindByLevel.has(indent)) kindByLevel.set(indent, "number");
      if (!numberStyleByLevel.has(indent)) numberStyleByLevel.set(indent, "decimal");
      items.push({
        id: generateId(),
        content: parseInlineMarks(numberedMatch[2]),
        indent,
        kind: "number",
      });
      i++;
      continue;
    }

    // Alpha-upper: A) B) etc
    const alphaUpperMatch = stripped.match(/^([A-Z])\)\s+(.*)/);
    if (alphaUpperMatch) {
      if (!kindByLevel.has(indent)) kindByLevel.set(indent, "number");
      if (!numberStyleByLevel.has(indent)) numberStyleByLevel.set(indent, "alpha-upper");
      items.push({
        id: generateId(),
        content: parseInlineMarks(alphaUpperMatch[2]),
        indent,
        kind: "number",
      });
      i++;
      continue;
    }

    // Alpha-lower: a) b) etc
    const alphaLowerMatch = stripped.match(/^([a-z])\)\s+(.*)/);
    if (alphaLowerMatch) {
      if (!kindByLevel.has(indent)) kindByLevel.set(indent, "number");
      if (!numberStyleByLevel.has(indent)) numberStyleByLevel.set(indent, "alpha-lower");
      items.push({
        id: generateId(),
        content: parseInlineMarks(alphaLowerMatch[2]),
        indent,
        kind: "number",
      });
      i++;
      continue;
    }

    // Roman-upper: I) II) III) etc
    const romanUpperMatch = stripped.match(/^([IVXLCDM]+)\)\s+(.*)/);
    if (romanUpperMatch) {
      if (!kindByLevel.has(indent)) kindByLevel.set(indent, "number");
      if (!numberStyleByLevel.has(indent)) numberStyleByLevel.set(indent, "roman-upper");
      items.push({
        id: generateId(),
        content: parseInlineMarks(romanUpperMatch[2]),
        indent,
        kind: "number",
      });
      i++;
      continue;
    }

    // Roman-lower: i) ii) iii) etc
    const romanLowerMatch = stripped.match(/^([ivxlcdm]+)\)\s+(.*)/);
    if (romanLowerMatch) {
      if (!kindByLevel.has(indent)) kindByLevel.set(indent, "number");
      if (!numberStyleByLevel.has(indent)) numberStyleByLevel.set(indent, "roman-lower");
      items.push({
        id: generateId(),
        content: parseInlineMarks(romanLowerMatch[2]),
        indent,
        kind: "number",
      });
      i++;
      continue;
    }

    // Not a list line — stop
    break;
  }

  if (items.length === 0) return null;

  // Build levelStyles array from collected kinds
  const maxIndent = Math.max(...items.map((it) => it.indent));
  const levelStyles: Array<Record<string, unknown>> = [];
  for (let lvl = 0; lvl <= maxIndent; lvl++) {
    const kind = kindByLevel.get(lvl) ?? "bullet";
    const numberStyle = numberStyleByLevel.get(lvl);
    const base: Record<string, unknown> = kind === "number" ? { kind, numberStyle } : { kind };
    levelStyles.push(base);
  }

  // Merge saved metadata (colors, sizes, bulletStyle, etc.) from cortex-list comment
  if (meta) {
    const savedStyles = meta.levelStyles as Array<Record<string, unknown>> | undefined;
    if (savedStyles) {
      for (let lvl = 0; lvl < savedStyles.length; lvl++) {
        const saved = savedStyles[lvl];
        if (!saved) continue;
        if (lvl < levelStyles.length) {
          // Merge saved properties over detected ones (saved has priority for visual props)
          for (const key of Object.keys(saved)) {
            if (key !== "kind") {
              levelStyles[lvl][key] = saved[key];
            }
          }
        } else {
          levelStyles.push(saved);
        }
      }
    }

    // Restore per-item kind overrides
    const itemKinds = meta.itemKinds as Record<string, string> | undefined;
    if (itemKinds) {
      for (const [idxStr, kind] of Object.entries(itemKinds)) {
        const idx = Number(idxStr);
        if (idx < items.length && (kind === "bullet" || kind === "number")) {
          items[idx].kind = kind;
        }
      }
    }
  }

  const block = makeBlock("list", [], {
    listItems: items,
    levelStyles,
  });

  return { block, nextIndex: i };
}

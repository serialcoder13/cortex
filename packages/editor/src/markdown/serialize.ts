// ============================================================
// Markdown serializer: converts Block[] → markdown string.
// Handles all block types and inline marks (bold, italic, etc.)
// ============================================================

import type { Block, TextSpan, Mark } from "../core/types";

/**
 * Convert an array of blocks to a markdown string.
 */
export function blocksToMarkdown(blocks: Block[]): string {
  const parts: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const serialized = serializeBlock(block, i, blocks);
    parts.push(serialized);
  }

  // Join and clean up excessive newlines
  return parts.join("").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/**
 * Serialize a single block to its markdown representation.
 */
function serializeBlock(block: Block, index: number, siblings: Block[]): string {
  const text = serializeSpans(block.content);

  switch (block.type) {
    case "paragraph":
      return text + "\n\n";

    case "heading1":
      return `# ${text}\n\n`;

    case "heading2":
      return `## ${text}\n\n`;

    case "heading3":
      return `### ${text}\n\n`;

    case "bulletList":
      return serializeListItem(`- ${text}`, block);

    case "numberedList": {
      const number = computeNumber(index, siblings);
      return serializeListItem(`${number}. ${text}`, block);
    }

    case "todo": {
      const checkbox = block.props.checked ? "[x]" : "[ ]";
      return serializeListItem(`- ${checkbox} ${text}`, block);
    }

    case "codeBlock": {
      const language = block.props.language || "";
      return `\`\`\`${language}\n${getPlainText(block.content)}\n\`\`\`\n\n`;
    }

    case "quote":
      return serializeQuote(text, block);

    case "callout": {
      const emoji = block.props.emoji || "";
      const label = emoji ? `!callout ${emoji}` : "!callout";
      const quotedBody = text
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
      return `> [${label}]\n${quotedBody}\n\n`;
    }

    case "toggle": {
      const childrenMd =
        block.children.length > 0
          ? "\n" + blocksToMarkdown(block.children).trimEnd() + "\n"
          : "\n";
      return `<details>\n<summary>${text}</summary>\n${childrenMd}</details>\n\n`;
    }

    case "divider":
      return "---\n\n";

    case "image": {
      const alt = block.props.alt || "";
      const src = block.props.src || "";
      return `![${alt}](${src})\n\n`;
    }

    case "embed": {
      const url = block.props.url || "";
      return `[embed](${url})\n\n`;
    }

    case "table":
      // Tables are complex; for now output as plain text
      return text + "\n\n";

    default:
      return text + "\n\n";
  }
}

/**
 * Serialize a list item, including any nested children.
 * For lists, consecutive items are joined without blank lines between them,
 * and the trailing double-newline is only added after the last item in a run.
 */
function serializeListItem(line: string, block: Block): string {
  let result = line + "\n";

  // Serialize children indented by 2 spaces (for nested lists)
  if (block.children.length > 0) {
    const childMd = blocksToMarkdown(block.children).trimEnd();
    const indented = childMd
      .split("\n")
      .map((l) => (l.trim() === "" ? "" : "  " + l))
      .join("\n");
    result += indented + "\n";
  }

  return result;
}

/**
 * Serialize a quote block, prefixing each line with `> `.
 */
function serializeQuote(text: string, block: Block): string {
  const lines = text.split("\n").map((line) => `> ${line}`);
  let result = lines.join("\n") + "\n";

  if (block.children.length > 0) {
    const childMd = blocksToMarkdown(block.children).trimEnd();
    const quoted = childMd
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
    result += quoted + "\n";
  }

  return result + "\n";
}

/**
 * Compute sequential numbering for numbered list items.
 * Counts consecutive numberedList blocks preceding this one.
 */
function computeNumber(index: number, siblings: Block[]): number {
  let number = 1;
  for (let i = index - 1; i >= 0; i--) {
    if (siblings[i].type === "numberedList") {
      number++;
    } else {
      break;
    }
  }
  return number;
}

/**
 * Convert TextSpan[] to a markdown-formatted string with inline marks.
 */
function serializeSpans(spans: TextSpan[]): string {
  if (!spans || spans.length === 0) {
    return "";
  }

  return spans.map(serializeSpan).join("");
}

/**
 * Serialize a single TextSpan with its marks applied.
 */
function serializeSpan(span: TextSpan): string {
  const marks = span.marks || [];
  let text = span.text;

  if (marks.length === 0 || text === "") {
    return text;
  }

  // Check which marks are present
  const isBold = marks.some((m) => m.type === "bold");
  const isItalic = marks.some((m) => m.type === "italic");
  const isStrikethrough = marks.some((m) => m.type === "strikethrough");
  const isCode = marks.some((m) => m.type === "code");
  const isUnderline = marks.some((m) => m.type === "underline");
  const linkMark = marks.find((m) => m.type === "link");

  // Code mark takes precedence — don't nest other marks inside inline code
  if (isCode) {
    text = `\`${text}\``;
  } else {
    // Apply bold+italic combination as ***text***
    if (isBold && isItalic) {
      text = `***${text}***`;
    } else if (isBold) {
      text = `**${text}**`;
    } else if (isItalic) {
      text = `*${text}*`;
    }

    if (isStrikethrough) {
      text = `~~${text}~~`;
    }

    if (isUnderline) {
      text = `<u>${text}</u>`;
    }
  }

  if (linkMark) {
    const href = linkMark.attrs?.href || "";
    text = `[${text}](${href})`;
  }

  return text;
}

/**
 * Get plain text from content spans (no marks applied).
 * Used for code blocks where content should not have inline formatting.
 */
function getPlainText(content: TextSpan[]): string {
  return content.map((span) => span.text).join("");
}

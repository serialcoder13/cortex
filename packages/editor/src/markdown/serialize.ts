// ============================================================
// Markdown serializer: converts Block[] → markdown string.
// Handles all block types and inline marks (bold, italic, etc.)
// ============================================================

import type { Block, TextSpan, Mark } from "../core/types";
import { serializeCustomComponent } from "../blocks/component-registry";

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

    case "heading4":
      return `#### ${text}\n\n`;

    case "heading5":
      return `##### ${text}\n\n`;

    case "heading6":
      return `###### ${text}\n\n`;

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

    case "table": {
      const tableData: string[][] | undefined = block.props.tableData;
      if (tableData && tableData.length > 0) {
        const aligns: string[] = (block.props.columnAlignments as string[]) ?? [];
        const headerRow = tableData[0];
        const headerLine = "| " + headerRow.join(" | ") + " |";
        const separatorLine = "| " + headerRow.map((_h, i) => {
          const a = aligns[i];
          if (a === "center") return ":---:";
          if (a === "right") return "---:";
          return "---";
        }).join(" | ") + " |";
        const bodyLines = tableData.slice(1).map(
          (row) => "| " + row.join(" | ") + " |",
        );
        const tableLines = [headerLine, separatorLine, ...bodyLines].join("\n");

        // Serialize table metadata (colors, borders, compact, template) as HTML comment
        const meta = serializeTableMeta(block);
        if (meta) {
          return `<!-- cortex-table:${meta} -->\n${tableLines}\n\n`;
        }
        return tableLines + "\n\n";
      }
      return text + "\n\n";
    }

    case "mermaid": {
      const code = block.props.mermaidCode || "";
      return `\`\`\`mermaid\n${code}\n\`\`\`\n\n`;
    }

    case "customComponent": {
      return serializeCustomComponent(block.props) + "\n\n";
    }

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
  // Find the start of this numbered list run
  let runStart = index;
  for (let i = index - 1; i >= 0; i--) {
    if (siblings[i].type === "numberedList") {
      runStart = i;
    } else {
      break;
    }
  }
  // Use startFrom from the first block in the run, default to 1
  const base = ((siblings[runStart].props.startFrom as number) ?? 1);
  return base + (index - runStart);
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

  // Superscript / subscript (HTML tags, supported by many markdown renderers)
  const isSuperscript = marks.some((m) => m.type === "superscript");
  const isSubscript = marks.some((m) => m.type === "subscript");
  if (isSuperscript) text = `<sup>${text}</sup>`;
  if (isSubscript) text = `<sub>${text}</sub>`;

  // Color and highlight (using span tags with style, compatible with HTML-in-markdown)
  const colorMark = marks.find((m) => m.type === "color");
  const highlightMark = marks.find((m) => m.type === "highlight");
  if (highlightMark && highlightMark.attrs?.color && highlightMark.attrs.color !== "transparent") {
    text = `<mark style="background-color:${highlightMark.attrs.color}">${text}</mark>`;
  }
  if (colorMark && colorMark.attrs?.color && colorMark.attrs.color !== "inherit") {
    text = `<span style="color:${colorMark.attrs.color}">${text}</span>`;
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

/**
 * Serialize table metadata (cellMeta, showBorders, compact, colorTemplate)
 * as a JSON string for embedding in an HTML comment.
 * Returns null if there's no metadata worth persisting.
 */
function serializeTableMeta(block: Block): string | null {
  const meta: Record<string, unknown> = {};

  const cellMeta = block.props.cellMeta;
  if (cellMeta && typeof cellMeta === "object" && Object.keys(cellMeta).length > 0) {
    meta.cellMeta = cellMeta;
  }

  if (block.props.showBorders === false) {
    meta.showBorders = false;
  }

  if (block.props.compact === true) {
    meta.compact = true;
  }

  if (block.props.colorTemplate && block.props.colorTemplate !== "") {
    meta.colorTemplate = block.props.colorTemplate;
  }

  if (Object.keys(meta).length === 0) return null;
  return JSON.stringify(meta);
}

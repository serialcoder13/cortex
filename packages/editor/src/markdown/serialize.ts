// ============================================================
// Markdown serializer: converts Block[] → markdown string.
// Handles all block types and inline marks (bold, italic, etc.)
// ============================================================

import type { Block, TextSpan, Mark } from "../core/types";
import { serializeCustomComponent } from "../blocks/component-registry";
import { formatNumber } from "../blocks/ListBlock";

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

    case "list":
      return serializeListMeta(block) + serializeListBlock(block) + "\n";

    case "todo": {
      const checkbox = block.props.checked ? "[x]" : "[ ]";
      return `- ${checkbox} ${text}\n`;
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
      // Build attribute string for width/height and crop data
      const attrs: string[] = [];
      const w = Number(block.props.width); const h = Number(block.props.height);
      if (w) attrs.push(`width=${w}`);
      if (h) attrs.push(`height=${h}`);
      if (Number(block.props.cropX)) attrs.push(`cropX=${Number(block.props.cropX)}`);
      if (Number(block.props.cropY)) attrs.push(`cropY=${Number(block.props.cropY)}`);
      if (Number(block.props.cropW)) attrs.push(`cropW=${Number(block.props.cropW)}`);
      if (Number(block.props.cropH)) attrs.push(`cropH=${Number(block.props.cropH)}`);
      const attrStr = attrs.length ? `{${attrs.join(" ")}}` : "";
      return `![${alt}](${src})${attrStr}\n\n`;
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

    case "toc": {
      const levels = block.props.tocLevels ?? 3;
      return `<!-- cortex-toc:${levels} -->\n\n`;
    }

    case "customComponent": {
      return serializeCustomComponent(block.props) + "\n\n";
    }

    default:
      return text + "\n\n";
  }
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

/**
 * Serialize a list block (type="list") to markdown.
 * Each item becomes a line with appropriate indent and prefix.
 */
/**
 * Serialize list metadata (levelStyles with non-default values, per-item kinds)
 * as a JSON HTML comment. Returns empty string if nothing worth persisting.
 */
function serializeListMeta(block: Block): string {
  const levelStyles = (block.props.levelStyles ?? []) as Array<Record<string, unknown>>;
  const items = (block.props.listItems ?? []) as Array<{ kind?: string }>;
  const meta: Record<string, unknown> = {};

  // Check if any levelStyle has non-default values worth persisting
  // Default values that don't need saving: kind (always inferred from markdown),
  // numberStyle "decimal" (default), bulletStyle undefined, size/color undefined
  const hasCustomStyles = levelStyles.some((s) =>
    s.bulletStyle ||
    (s.numberStyle && s.numberStyle !== "decimal") ||
    s.size ||
    s.color ||
    s.startFrom,
  );
  if (hasCustomStyles) {
    meta.levelStyles = levelStyles;
  }

  // Check if any items have per-item kind overrides
  const hasItemKinds = items.some((it) => it.kind);
  if (hasItemKinds) {
    // Store as a sparse array: index → kind (only for items that have overrides)
    const itemKinds: Record<number, string> = {};
    items.forEach((it, idx) => {
      if (it.kind) itemKinds[idx] = it.kind;
    });
    meta.itemKinds = itemKinds;
  }

  if (Object.keys(meta).length === 0) return "";
  return `<!-- cortex-list:${JSON.stringify(meta)} -->\n`;
}

function serializeListBlock(block: Block): string {
  const items = (block.props.listItems ?? []) as Array<{
    content: Array<{ text: string; marks?: any[] }>;
    indent: number;
    kind?: "bullet" | "number";
  }>;
  const levelStyles = (block.props.levelStyles ?? []) as Array<{
    kind: string;
    numberStyle?: string;
    startFrom?: number;
  }>;

  // Track counters per indent level for numbering
  const counters: Record<number, number> = {};
  const lastKindAtLevel: Record<number, string> = {};
  const lines: string[] = [];

  for (const item of items) {
    const lvl = item.indent;
    const style = levelStyles[lvl];
    // Item-level kind overrides level style
    const kind = item.kind ?? style?.kind ?? "bullet";
    const indent = "  ".repeat(lvl);
    const text = item.content.map((s) => s.text).join("");

    // Reset deeper counters when indent decreases
    for (const key of Object.keys(counters)) {
      if (Number(key) > lvl) {
        delete counters[Number(key)];
        delete lastKindAtLevel[Number(key)];
      }
    }

    // Reset counter when kind switches at the same level
    if (lastKindAtLevel[lvl] && lastKindAtLevel[lvl] !== kind) {
      delete counters[lvl];
    }
    lastKindAtLevel[lvl] = kind;

    if (kind === "number") {
      counters[lvl] = (counters[lvl] ?? ((style?.startFrom ?? 1) - 1)) + 1;
      const numStyle = style?.numberStyle ?? "decimal";
      const formatted = formatNumber(counters[lvl], numStyle);
      const suffix = numStyle === "decimal" ? "." : ")";
      lines.push(`${indent}${formatted}${suffix} ${text}`);
    } else {
      lines.push(`${indent}- ${text}`);
    }
  }

  return lines.join("\n") + "\n";
}

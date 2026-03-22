// ============================================================
// YAML frontmatter parsing and stringification.
// Handles the --- delimited metadata block at the top of
// markdown files. Pure string parsing — no yaml library needed.
// ============================================================

export interface Frontmatter {
  title?: string;
  tags?: string[];
  type?: string; // "note", "journal", "todo", etc.
  created?: string; // ISO 8601
  modified?: string; // ISO 8601
}

/**
 * Parse a markdown string that may begin with YAML frontmatter.
 * Frontmatter is delimited by `---` on its own line at the very start.
 *
 * Example input:
 * ```
 * ---
 * title: My Note
 * tags: [work, meeting]
 * type: note
 * created: 2025-01-15T10:30:00Z
 * ---
 * # Hello world
 * ```
 */
export function parseFrontmatter(markdown: string): {
  frontmatter: Frontmatter;
  body: string;
} {
  const trimmed = markdown.trimStart();

  // Must start with `---` followed by a newline (or end of string)
  if (!trimmed.startsWith("---")) {
    return { frontmatter: {}, body: markdown };
  }

  // Find the closing `---`
  const afterOpening = trimmed.indexOf("\n");
  if (afterOpening === -1) {
    return { frontmatter: {}, body: markdown };
  }

  const rest = trimmed.slice(afterOpening + 1);
  const closingIndex = rest.indexOf("\n---");
  if (closingIndex === -1) {
    return { frontmatter: {}, body: markdown };
  }

  const yamlBlock = rest.slice(0, closingIndex);
  // Body starts after the closing `---` and its trailing newline
  const afterClosing = rest.slice(closingIndex + 4); // "\n---".length === 4
  const body = afterClosing.startsWith("\n")
    ? afterClosing.slice(1)
    : afterClosing;

  const frontmatter = parseYamlBlock(yamlBlock);
  return { frontmatter, body };
}

/**
 * Parse a simple YAML block (key: value lines) into a Frontmatter object.
 * Supports:
 *   - Simple string values: `title: My Note`
 *   - Bracket arrays: `tags: [work, meeting]`
 *   - Quoted strings: `title: "My Note"`
 */
function parseYamlBlock(yaml: string): Frontmatter {
  const result: Frontmatter = {};
  const lines = yaml.split("\n");

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const colonIndex = trimmedLine.indexOf(":");
    if (colonIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, colonIndex).trim();
    const rawValue = trimmedLine.slice(colonIndex + 1).trim();

    switch (key) {
      case "title":
        result.title = unquote(rawValue);
        break;
      case "tags":
        result.tags = parseBracketArray(rawValue);
        break;
      case "type":
        result.type = unquote(rawValue);
        break;
      case "created":
        result.created = unquote(rawValue);
        break;
      case "modified":
        result.modified = unquote(rawValue);
        break;
      // Ignore unknown keys
    }
  }

  return result;
}

/**
 * Remove surrounding quotes from a string value.
 * Handles both single and double quotes.
 */
function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Parse a bracket-delimited, comma-separated array.
 * Input: `[work, meeting, "important"]` → `["work", "meeting", "important"]`
 */
function parseBracketArray(value: string): string[] {
  let inner = value.trim();
  if (inner.startsWith("[") && inner.endsWith("]")) {
    inner = inner.slice(1, -1);
  }

  if (!inner.trim()) {
    return [];
  }

  return inner.split(",").map((item) => unquote(item.trim()));
}

/**
 * Stringify a Frontmatter object and body into a complete markdown string
 * with YAML frontmatter delimiters.
 *
 * Only includes keys that are defined (non-undefined).
 * If the frontmatter object is empty, returns just the body.
 */
export function stringifyFrontmatter(
  frontmatter: Frontmatter,
  body: string,
): string {
  const lines: string[] = [];

  if (frontmatter.title !== undefined) {
    lines.push(`title: ${formatValue(frontmatter.title)}`);
  }
  if (frontmatter.tags !== undefined && frontmatter.tags.length > 0) {
    const tagList = frontmatter.tags.map((t) => formatValue(t)).join(", ");
    lines.push(`tags: [${tagList}]`);
  }
  if (frontmatter.type !== undefined) {
    lines.push(`type: ${formatValue(frontmatter.type)}`);
  }
  if (frontmatter.created !== undefined) {
    lines.push(`created: ${frontmatter.created}`);
  }
  if (frontmatter.modified !== undefined) {
    lines.push(`modified: ${frontmatter.modified}`);
  }

  // If no frontmatter fields, return just the body
  if (lines.length === 0) {
    return body;
  }

  return `---\n${lines.join("\n")}\n---\n${body}`;
}

/**
 * Format a string value for YAML output.
 * Wraps in quotes if the value contains special characters.
 */
function formatValue(value: string): string {
  // Quote if the value contains characters that could be ambiguous in YAML
  if (/[:#\[\]{},|>&*!?'"]/.test(value) || value.includes("\n")) {
    // Use double quotes, escaping internal double quotes
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

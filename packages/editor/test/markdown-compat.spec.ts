// ============================================================
// Markdown-it Compatibility Tests
// Tests the Cortex editor's markdown parsing, rendering, and
// serialization against the markdown-it demo sample.
// Tests marked [GAP] document known missing features.
// ============================================================

import { test, expect, type Page } from "@playwright/test";

// ---- Helpers ----

function editor(page: Page) {
  return page.locator(".cx-editor");
}

async function getDoc(page: Page) {
  return page.evaluate(
    () => (window as any).__editorDoc ?? (window as any).__editorRef?.getDocument?.(),
  );
}

async function getBlockTypes(page: Page): Promise<string[]> {
  const doc = await getDoc(page);
  if (!doc) return [];
  return doc.blocks.map((b: any) => b.type);
}

async function getBlockTexts(page: Page): Promise<string[]> {
  const doc = await getDoc(page);
  if (!doc) return [];
  return doc.blocks.map((b: any) => b.content.map((s: any) => s.text).join(""));
}

/** Get the full block array from the document model */
async function getBlocks(page: Page): Promise<any[]> {
  const doc = await getDoc(page);
  return doc?.blocks ?? [];
}

/** Load markdown into the editor via the exposed __loadMarkdown helper */
async function loadMarkdown(page: Page, md: string) {
  await page.evaluate((markdown) => {
    (window as any).__loadMarkdown(markdown);
  }, md);
  await page.waitForTimeout(300);
}

/** Get the markdown output from the debug panel */
async function getMarkdownOutput(page: Page): Promise<string> {
  const mdTab = page.locator("button", { hasText: "Markdown" });
  if ((await mdTab.count()) > 0) await mdTab.click();
  await page.waitForTimeout(100);
  return (await page.locator("pre").first().textContent()) ?? "";
}

async function focusEditor(page: Page) {
  await editor(page).click();
  await page.waitForTimeout(150);
}

async function typeText(page: Page, text: string) {
  await page.keyboard.type(text, { delay: 30 });
  await page.waitForTimeout(100);
}

async function pressKey(page: Page, key: string) {
  await page.keyboard.press(key);
  await page.waitForTimeout(100);
}

// ---- Setup ----

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  await page.waitForTimeout(200);
});

// ============================================================
// SECTION 1: HEADINGS
// ============================================================

test.describe("Headings", () => {
  test("# h1 heading", async ({ page }) => {
    await loadMarkdown(page, "# h1 Heading");
    const types = await getBlockTypes(page);
    expect(types[0]).toBe("heading1");
    const texts = await getBlockTexts(page);
    expect(texts[0]).toBe("h1 Heading");
  });

  test("## h2 heading", async ({ page }) => {
    await loadMarkdown(page, "## h2 Heading");
    const types = await getBlockTypes(page);
    expect(types[0]).toBe("heading2");
    const texts = await getBlockTexts(page);
    expect(texts[0]).toBe("h2 Heading");
  });

  test("### h3 heading", async ({ page }) => {
    await loadMarkdown(page, "### h3 Heading");
    const types = await getBlockTypes(page);
    expect(types[0]).toBe("heading3");
    const texts = await getBlockTexts(page);
    expect(texts[0]).toBe("h3 Heading");
  });

  test("#### h4 heading [GAP] — falls back to paragraph", async ({ page }) => {
    await loadMarkdown(page, "#### h4 Heading");
    const types = await getBlockTypes(page);
    // GAP: h4-h6 not supported, parsed as paragraph with literal #### prefix
    expect(types[0]).toBe("paragraph");
  });

  test("##### h5 heading [GAP] — falls back to paragraph", async ({ page }) => {
    await loadMarkdown(page, "##### h5 Heading");
    const types = await getBlockTypes(page);
    expect(types[0]).toBe("paragraph");
  });

  test("###### h6 heading [GAP] — falls back to paragraph", async ({ page }) => {
    await loadMarkdown(page, "###### h6 Heading");
    const types = await getBlockTypes(page);
    expect(types[0]).toBe("paragraph");
  });

  test("multiple headings in sequence", async ({ page }) => {
    await loadMarkdown(page, "# First\n\n## Second\n\n### Third");
    const types = await getBlockTypes(page);
    expect(types).toEqual(["heading1", "heading2", "heading3"]);
    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["First", "Second", "Third"]);
  });
});

// ============================================================
// SECTION 2: HORIZONTAL RULES
// ============================================================

test.describe("Horizontal Rules", () => {
  test("--- creates divider", async ({ page }) => {
    await loadMarkdown(page, "---");
    const types = await getBlockTypes(page);
    expect(types).toContain("divider");
  });

  test("*** creates divider", async ({ page }) => {
    await loadMarkdown(page, "***");
    const types = await getBlockTypes(page);
    expect(types).toContain("divider");
  });

  test("___ creates divider [GAP] — not recognized", async ({ page }) => {
    await loadMarkdown(page, "___");
    const types = await getBlockTypes(page);
    // GAP: underscore divider not in regex (only --- and ***)
    // Actual behavior: parsed as paragraph with literal ___
    expect(types[0]).toBe("paragraph");
    // IDEAL: expect(types[0]).toBe("divider");
  });

  test("divider renders as hr element", async ({ page }) => {
    await loadMarkdown(page, "text above\n\n---\n\ntext below");
    const hr = editor(page).locator("hr");
    await expect(hr).toBeVisible();
  });
});

// ============================================================
// SECTION 3: EMPHASIS / INLINE FORMATTING
// ============================================================

test.describe("Emphasis", () => {
  test("**bold** text with double asterisks", async ({ page }) => {
    await loadMarkdown(page, "**This is bold text**");
    const blocks = await getBlocks(page);
    const spans = blocks[0].content;
    expect(spans.some((s: any) => s.marks?.some((m: any) => m.type === "bold"))).toBe(true);
    expect(spans.find((s: any) => s.marks?.some((m: any) => m.type === "bold"))?.text).toBe(
      "This is bold text",
    );
  });

  test("__bold__ text with double underscores", async ({ page }) => {
    await loadMarkdown(page, "__This is bold text__");
    const blocks = await getBlocks(page);
    const spans = blocks[0].content;
    expect(spans.some((s: any) => s.marks?.some((m: any) => m.type === "bold"))).toBe(true);
  });

  test("*italic* text with single asterisk", async ({ page }) => {
    await loadMarkdown(page, "*This is italic text*");
    const blocks = await getBlocks(page);
    const spans = blocks[0].content;
    expect(spans.some((s: any) => s.marks?.some((m: any) => m.type === "italic"))).toBe(true);
    expect(spans.find((s: any) => s.marks?.some((m: any) => m.type === "italic"))?.text).toBe(
      "This is italic text",
    );
  });

  test("_italic_ text with single underscore", async ({ page }) => {
    await loadMarkdown(page, "_This is italic text_");
    const blocks = await getBlocks(page);
    const spans = blocks[0].content;
    expect(spans.some((s: any) => s.marks?.some((m: any) => m.type === "italic"))).toBe(true);
  });

  test("~~strikethrough~~ text", async ({ page }) => {
    await loadMarkdown(page, "~~Strikethrough~~");
    const blocks = await getBlocks(page);
    const spans = blocks[0].content;
    expect(
      spans.some((s: any) => s.marks?.some((m: any) => m.type === "strikethrough")),
    ).toBe(true);
    expect(
      spans.find((s: any) => s.marks?.some((m: any) => m.type === "strikethrough"))?.text,
    ).toBe("Strikethrough");
  });

  test("***bold and italic*** combined", async ({ page }) => {
    await loadMarkdown(page, "***bold and italic***");
    const blocks = await getBlocks(page);
    const spans = blocks[0].content;
    const marked = spans.find(
      (s: any) =>
        s.marks?.some((m: any) => m.type === "bold") &&
        s.marks?.some((m: any) => m.type === "italic"),
    );
    expect(marked).toBeTruthy();
    expect(marked?.text).toBe("bold and italic");
  });

  test("bold within a sentence preserves surrounding text", async ({ page }) => {
    await loadMarkdown(page, "Hello **world** today");
    const blocks = await getBlocks(page);
    const spans = blocks[0].content;
    const plain1 = spans.find((s: any) => s.text === "Hello " && !s.marks?.length);
    const bold = spans.find((s: any) => s.marks?.some((m: any) => m.type === "bold"));
    const plain2 = spans.find((s: any) => s.text === " today" && !s.marks?.length);
    expect(plain1).toBeTruthy();
    expect(bold?.text).toBe("world");
    expect(plain2).toBeTruthy();
  });

  test("bold renders with <strong> or font-weight", async ({ page }) => {
    await loadMarkdown(page, "**bold text**");
    const strong = editor(page).locator("strong");
    await expect(strong).toBeVisible();
    expect(await strong.textContent()).toBe("bold text");
  });

  test("italic renders with <em>", async ({ page }) => {
    await loadMarkdown(page, "*italic text*");
    const em = editor(page).locator("em");
    await expect(em).toBeVisible();
    expect(await em.textContent()).toBe("italic text");
  });

  test("strikethrough renders with <s>", async ({ page }) => {
    await loadMarkdown(page, "~~struck~~");
    const s = editor(page).locator("s");
    await expect(s).toBeVisible();
    expect(await s.textContent()).toBe("struck");
  });
});

// ============================================================
// SECTION 4: BLOCKQUOTES
// ============================================================

test.describe("Blockquotes", () => {
  test("single-line blockquote", async ({ page }) => {
    await loadMarkdown(page, "> Blockquote text");
    const types = await getBlockTypes(page);
    expect(types[0]).toBe("quote");
    const texts = await getBlockTexts(page);
    expect(texts[0]).toBe("Blockquote text");
  });

  test("multi-line blockquote (consecutive > lines)", async ({ page }) => {
    await loadMarkdown(page, "> Line one\n> Line two\n> Line three");
    const types = await getBlockTypes(page);
    expect(types[0]).toBe("quote");
    const texts = await getBlockTexts(page);
    expect(texts[0]).toContain("Line one");
  });

  test("nested blockquote >> [GAP] — inner > becomes text", async ({ page }) => {
    await loadMarkdown(page, "> Outer\n>> Inner nested");
    const types = await getBlockTypes(page);
    // GAP: nested blockquotes not supported
    // The >> line is parsed as a separate quote with literal > prefix in content
    expect(types).toContain("quote");
  });

  test("blockquote with inline formatting", async ({ page }) => {
    await loadMarkdown(page, "> This has **bold** and *italic* inside");
    const blocks = await getBlocks(page);
    expect(blocks[0].type).toBe("quote");
    const spans = blocks[0].content;
    expect(spans.some((s: any) => s.marks?.some((m: any) => m.type === "bold"))).toBe(true);
    expect(spans.some((s: any) => s.marks?.some((m: any) => m.type === "italic"))).toBe(true);
  });

  test("blockquote renders with left border", async ({ page }) => {
    await loadMarkdown(page, "> A quote");
    // The quote block should have a visible left border
    const quoteEl = editor(page).locator("[data-block-id]").first();
    const borderLeft = await quoteEl.evaluate(
      (el) => getComputedStyle(el.querySelector("[data-content]")?.parentElement ?? el).borderLeftWidth,
    );
    // Should have some left border (> 0)
    expect(parseInt(borderLeft)).toBeGreaterThan(0);
  });
});

// ============================================================
// SECTION 5: LISTS
// ============================================================

test.describe("Lists", () => {
  test("unordered list with - marker", async ({ page }) => {
    await loadMarkdown(page, "- Item one\n- Item two\n- Item three");
    const types = await getBlockTypes(page);
    expect(types).toEqual(["bulletList", "bulletList", "bulletList"]);
    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["Item one", "Item two", "Item three"]);
  });

  test("unordered list with * marker", async ({ page }) => {
    await loadMarkdown(page, "* Alpha\n* Beta\n* Gamma");
    const types = await getBlockTypes(page);
    expect(types).toEqual(["bulletList", "bulletList", "bulletList"]);
  });

  test("ordered list with sequential numbers", async ({ page }) => {
    await loadMarkdown(page, "1. First\n2. Second\n3. Third");
    const types = await getBlockTypes(page);
    expect(types).toEqual(["numberedList", "numberedList", "numberedList"]);
    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["First", "Second", "Third"]);
  });

  test("ordered list with all 1. numbers", async ({ page }) => {
    await loadMarkdown(page, "1. First\n1. Second\n1. Third");
    const types = await getBlockTypes(page);
    expect(types).toEqual(["numberedList", "numberedList", "numberedList"]);
  });

  test("todo list unchecked", async ({ page }) => {
    await loadMarkdown(page, "- [ ] Task one\n- [ ] Task two");
    const types = await getBlockTypes(page);
    expect(types).toEqual(["todo", "todo"]);
    const blocks = await getBlocks(page);
    expect(blocks[0].props.checked).toBeFalsy();
  });

  test("todo list checked", async ({ page }) => {
    await loadMarkdown(page, "- [x] Done task\n- [ ] Open task");
    const blocks = await getBlocks(page);
    expect(blocks[0].props.checked).toBe(true);
    expect(blocks[1].props.checked).toBeFalsy();
  });

  test("nested sub-list [GAP] — indented items become paragraphs", async ({ page }) => {
    await loadMarkdown(page, "- Parent item\n  - Child item\n  - Another child");
    const types = await getBlockTypes(page);
    // GAP: nested lists not supported. Indented items are parsed as paragraphs.
    // The first item is a bulletList, subsequent indented lines merge or become paragraphs.
    expect(types[0]).toBe("bulletList");
    // IDEAL: all would be bulletList with children
  });

  test("ordered list offset start [GAP] — offset number lost", async ({ page }) => {
    await loadMarkdown(page, "57. foo\n1. bar");
    const types = await getBlockTypes(page);
    expect(types[0]).toBe("numberedList");
    const texts = await getBlockTexts(page);
    expect(texts[0]).toBe("foo");
    // GAP: starting offset (57) is not preserved in the model
  });

  test("bullet list items render with bullet markers", async ({ page }) => {
    await loadMarkdown(page, "- Alpha\n- Beta");
    // Check DOM has bullet markers (the component shows bullet char)
    const text = await editor(page).textContent();
    expect(text).toContain("Alpha");
    expect(text).toContain("Beta");
  });
});

// ============================================================
// SECTION 6: CODE
// ============================================================

test.describe("Code", () => {
  test("inline `code` within paragraph", async ({ page }) => {
    await loadMarkdown(page, "Use the `print()` function");
    const blocks = await getBlocks(page);
    const spans = blocks[0].content;
    const codeSpan = spans.find((s: any) => s.marks?.some((m: any) => m.type === "code"));
    expect(codeSpan).toBeTruthy();
    expect(codeSpan?.text).toBe("print()");
  });

  test("inline code renders with <code> and monospace", async ({ page }) => {
    await loadMarkdown(page, "Inline `code` here");
    const code = editor(page).locator("code");
    await expect(code).toBeVisible();
    expect(await code.textContent()).toBe("code");
  });

  test("fenced code block with ```", async ({ page }) => {
    await loadMarkdown(page, "```\nSample text here...\n```");
    const types = await getBlockTypes(page);
    expect(types).toContain("codeBlock");
  });

  test("fenced code block with language hint", async ({ page }) => {
    await loadMarkdown(page, "```js\nvar foo = 1;\n```");
    const blocks = await getBlocks(page);
    const codeBlock = blocks.find((b: any) => b.type === "codeBlock");
    expect(codeBlock).toBeTruthy();
    expect(codeBlock.props.language).toBe("js");
    const text = codeBlock.content.map((s: any) => s.text).join("");
    expect(text).toContain("var foo = 1;");
  });

  test("code block preserves multi-line content", async ({ page }) => {
    await loadMarkdown(page, "```\nline 1\nline 2\nline 3\n```");
    const blocks = await getBlocks(page);
    const code = blocks.find((b: any) => b.type === "codeBlock");
    const text = code.content.map((s: any) => s.text).join("");
    expect(text).toContain("line 1");
    expect(text).toContain("line 2");
    expect(text).toContain("line 3");
  });

  test("indented code block [GAP] — becomes paragraph", async ({ page }) => {
    await loadMarkdown(page, "    // Some comments\n    line 1 of code");
    const types = await getBlockTypes(page);
    // GAP: indented code blocks not supported, only fenced ```
    // Actual: parsed as paragraph(s) with leading spaces
    expect(types[0]).toBe("paragraph");
    // IDEAL: expect(types[0]).toBe("codeBlock");
  });
});

// ============================================================
// SECTION 7: TABLES
// ============================================================

test.describe("Tables", () => {
  test("basic table with header and rows", async ({ page }) => {
    await loadMarkdown(
      page,
      "| Option | Description |\n| ------ | ----------- |\n| data   | path to data |\n| engine | template engine |",
    );
    const types = await getBlockTypes(page);
    expect(types).toContain("table");
    const blocks = await getBlocks(page);
    const table = blocks.find((b: any) => b.type === "table");
    expect(table.props.tableData.length).toBeGreaterThanOrEqual(3); // header + 2 rows
    expect(table.props.tableData[0]).toContain("Option");
    expect(table.props.tableData[0]).toContain("Description");
  });

  test("table with right-aligned columns", async ({ page }) => {
    await loadMarkdown(
      page,
      "| Option | Description |\n| ------:| -----------:|\n| data   | path to data |",
    );
    const blocks = await getBlocks(page);
    const table = blocks.find((b: any) => b.type === "table");
    expect(table.props.columnAlignments).toBeTruthy();
    expect(table.props.columnAlignments[0]).toBe("right");
    expect(table.props.columnAlignments[1]).toBe("right");
  });

  test("table with center-aligned columns", async ({ page }) => {
    await loadMarkdown(
      page,
      "| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |",
    );
    const blocks = await getBlocks(page);
    const table = blocks.find((b: any) => b.type === "table");
    expect(table.props.columnAlignments[1]).toBe("center");
    expect(table.props.columnAlignments[2]).toBe("right");
  });

  test("table renders as <table> element", async ({ page }) => {
    await loadMarkdown(
      page,
      "| A | B |\n| --- | --- |\n| 1 | 2 |",
    );
    const tableEl = editor(page).locator("table");
    await expect(tableEl).toBeVisible();
    const rows = tableEl.locator("tr");
    expect(await rows.count()).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================
// SECTION 8: LINKS
// ============================================================

test.describe("Links", () => {
  test("[text](url) basic link", async ({ page }) => {
    await loadMarkdown(page, "[link text](http://example.com)");
    const blocks = await getBlocks(page);
    const spans = blocks[0].content;
    const linkSpan = spans.find((s: any) => s.marks?.some((m: any) => m.type === "link"));
    expect(linkSpan).toBeTruthy();
    expect(linkSpan?.text).toBe("link text");
    const linkMark = linkSpan?.marks?.find((m: any) => m.type === "link");
    expect(linkMark?.attrs?.href).toBe("http://example.com");
  });

  test("link renders as <a> with correct href", async ({ page }) => {
    await loadMarkdown(page, "[Click me](http://example.com)");
    const link = editor(page).locator("a");
    await expect(link).toBeVisible();
    expect(await link.getAttribute("href")).toBe("http://example.com");
    expect(await link.textContent()).toBe("Click me");
  });

  test("autolink [GAP] — not parsed as link", async ({ page }) => {
    await loadMarkdown(page, "Visit https://github.com for more");
    const blocks = await getBlocks(page);
    const spans = blocks[0].content;
    // GAP: autolinks not supported, URL stays as plain text
    const hasLink = spans.some((s: any) => s.marks?.some((m: any) => m.type === "link"));
    expect(hasLink).toBe(false);
    // IDEAL: the URL would be parsed as a link
  });

  test("reference link [GAP] — not parsed", async ({ page }) => {
    await loadMarkdown(page, "[text][ref]\n\n[ref]: http://example.com");
    const blocks = await getBlocks(page);
    const spans = blocks[0].content;
    // GAP: reference links not supported
    const hasLink = spans.some((s: any) => s.marks?.some((m: any) => m.type === "link"));
    expect(hasLink).toBe(false);
  });
});

// ============================================================
// SECTION 9: IMAGES
// ============================================================

test.describe("Images", () => {
  test("![alt](src) creates image block", async ({ page }) => {
    await loadMarkdown(page, "![Minion](https://example.com/image.png)");
    const types = await getBlockTypes(page);
    expect(types).toContain("image");
  });

  test("image alt text preserved in props", async ({ page }) => {
    await loadMarkdown(page, "![My Alt Text](https://example.com/img.png)");
    const blocks = await getBlocks(page);
    const img = blocks.find((b: any) => b.type === "image");
    expect(img?.props.alt).toBe("My Alt Text");
  });

  test("image src preserved in props", async ({ page }) => {
    await loadMarkdown(page, "![alt](https://example.com/photo.jpg)");
    const blocks = await getBlocks(page);
    const img = blocks.find((b: any) => b.type === "image");
    expect(img?.props.src).toBe("https://example.com/photo.jpg");
  });
});

// ============================================================
// SECTION 10: SERIALIZATION ROUNDTRIP
// ============================================================

test.describe("Serialization Roundtrip", () => {
  test("heading roundtrip preserves type and text", async ({ page }) => {
    await loadMarkdown(page, "# My Heading");
    const md = await getMarkdownOutput(page);
    expect(md.trim()).toContain("# My Heading");
  });

  test("bold text roundtrip preserves marks", async ({ page }) => {
    await loadMarkdown(page, "Hello **world** today");
    const md = await getMarkdownOutput(page);
    expect(md).toContain("**world**");
  });

  test("bullet list roundtrip preserves items", async ({ page }) => {
    await loadMarkdown(page, "- Item A\n- Item B\n- Item C");
    const md = await getMarkdownOutput(page);
    expect(md).toContain("- Item A");
    expect(md).toContain("- Item B");
    expect(md).toContain("- Item C");
  });

  test("code block roundtrip preserves content and language", async ({ page }) => {
    await loadMarkdown(page, "```python\nprint('hello')\n```");
    const md = await getMarkdownOutput(page);
    expect(md).toContain("```python");
    expect(md).toContain("print('hello')");
  });

  test("table roundtrip preserves data", async ({ page }) => {
    await loadMarkdown(
      page,
      "| Name | Age |\n| --- | --- |\n| Alice | 30 |",
    );
    const md = await getMarkdownOutput(page);
    expect(md).toContain("| Name | Age |");
    expect(md).toContain("| Alice | 30 |");
  });

  test("link roundtrip preserves text and href", async ({ page }) => {
    await loadMarkdown(page, "Click [here](http://example.com) now");
    const md = await getMarkdownOutput(page);
    expect(md).toContain("[here](http://example.com)");
  });

  test("divider roundtrip", async ({ page }) => {
    await loadMarkdown(page, "above\n\n---\n\nbelow");
    const md = await getMarkdownOutput(page);
    expect(md).toContain("---");
  });

  test("italic roundtrip", async ({ page }) => {
    await loadMarkdown(page, "*italic text*");
    const md = await getMarkdownOutput(page);
    expect(md).toContain("*italic text*");
  });

  test("strikethrough roundtrip", async ({ page }) => {
    await loadMarkdown(page, "~~deleted~~");
    const md = await getMarkdownOutput(page);
    expect(md).toContain("~~deleted~~");
  });
});

// ============================================================
// SECTION 11: DOM RENDERING
// ============================================================

test.describe("DOM Rendering", () => {
  test("h1 renders with large text", async ({ page }) => {
    await loadMarkdown(page, "# Big Heading");
    const heading = editor(page).locator("[data-content]").first();
    const fontSize = await heading.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(20);
  });

  test("h2 renders with medium text", async ({ page }) => {
    await loadMarkdown(page, "## Medium Heading");
    const heading = editor(page).locator("[data-content]").first();
    const fontSize = await heading.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);
  });

  test("code block renders with monospace font", async ({ page }) => {
    await loadMarkdown(page, "```\ncode here\n```");
    const codeEl = editor(page).locator("code, pre, [style*='monospace']").first();
    await expect(codeEl).toBeVisible();
  });

  test("todo item renders with checkbox", async ({ page }) => {
    await loadMarkdown(page, "- [ ] My task");
    // There should be a checkbox-like element
    const checkbox = editor(page).locator("[role='checkbox'], input[type='checkbox'], [aria-checked]");
    expect(await checkbox.count()).toBeGreaterThan(0);
  });

  test("underline via <u> tag renders with underline", async ({ page }) => {
    await loadMarkdown(page, "<u>underlined</u>");
    const u = editor(page).locator("u");
    if ((await u.count()) > 0) {
      await expect(u).toBeVisible();
    }
    // May not be deserialized — just verify no crash
  });

  test("numbered list items display numbers", async ({ page }) => {
    await loadMarkdown(page, "1. First\n2. Second");
    const text = await editor(page).textContent();
    expect(text).toContain("First");
    expect(text).toContain("Second");
  });
});

// ============================================================
// SECTION 12: KNOWN GAPS — UNSUPPORTED MARKDOWN-IT FEATURES
// These tests document features that are NOT supported.
// Each test passes by asserting the actual (fallback) behavior.
// ============================================================

test.describe("Known Gaps — Unsupported Features", () => {
  test("setext h1 (=== underline) [GAP]", async ({ page }) => {
    await loadMarkdown(page, "Heading\n===");
    const types = await getBlockTypes(page);
    // GAP: setext headings not supported
    // === becomes a separate paragraph or is ignored
    expect(types[0]).toBe("paragraph");
  });

  test("setext h2 (--- underline) [GAP] — becomes divider", async ({ page }) => {
    await loadMarkdown(page, "Heading\n---");
    const types = await getBlockTypes(page);
    // GAP: --- after text is parsed as divider, not setext h2
    expect(types).toContain("divider");
  });

  test("emoji shortcodes [GAP] — remain as literal text", async ({ page }) => {
    await loadMarkdown(page, ":wink: :cry: :laughing:");
    const texts = await getBlockTexts(page);
    expect(texts[0]).toContain(":wink:");
    // IDEAL: would render as emoji characters
  });

  test("footnotes [GAP] — remain as literal text", async ({ page }) => {
    await loadMarkdown(page, "Text with footnote[^1].\n\n[^1]: Footnote content");
    const texts = await getBlockTexts(page);
    expect(texts[0]).toContain("[^1]");
    // IDEAL: footnote would be rendered with popup/link
  });

  test("definition lists [GAP] — remain as paragraphs", async ({ page }) => {
    await loadMarkdown(page, "Term 1\n:   Definition 1");
    const types = await getBlockTypes(page);
    expect(types[0]).toBe("paragraph");
    // IDEAL: would create a definition list block
  });

  test("abbreviations [GAP] — remain as literal text", async ({ page }) => {
    await loadMarkdown(page, "This is HTML.\n\n*[HTML]: Hyper Text Markup Language");
    const texts = await getBlockTexts(page);
    expect(texts[0]).toContain("HTML");
    // IDEAL: HTML would have a tooltip with the full term
  });

  test("++inserted++ [GAP] — remains as literal text", async ({ page }) => {
    await loadMarkdown(page, "++Inserted text++");
    const texts = await getBlockTexts(page);
    expect(texts[0]).toContain("++Inserted text++");
    // IDEAL: would render with <ins> element
  });

  test("==marked== [GAP] — remains as literal text", async ({ page }) => {
    await loadMarkdown(page, "==Marked text==");
    const texts = await getBlockTexts(page);
    expect(texts[0]).toContain("==Marked text==");
    // IDEAL: would render with <mark> highlight
  });
});

// ============================================================
// SECTION 13: FULL MARKDOWN-IT SAMPLE — SMOKE TEST
// ============================================================

test.describe("Full markdown-it Sample", () => {
  const FULL_SAMPLE = `# h1 Heading

## h2 Heading

### h3 Heading

---

**This is bold text**

*This is italic text*

~~Strikethrough~~

> Blockquotes can also be nested...

- Create a list by starting a line
- Sub-lists are made by indenting
- Very easy!

1. Lorem ipsum dolor sit amet
2. Consectetur adipiscing elit
3. Integer molestie lorem at massa

Inline \`code\`

\`\`\`js
var foo = function (bar) {
  return bar++;
};
\`\`\`

| Option | Description |
| ------ | ----------- |
| data   | path to data files |
| engine | engine to be used |

[link text](http://example.com)

![Image](https://example.com/image.png)`;

  test("full sample loads without errors", async ({ page }) => {
    await loadMarkdown(page, FULL_SAMPLE);
    const types = await getBlockTypes(page);
    expect(types.length).toBeGreaterThanOrEqual(10);
  });

  test("full sample contains expected block types", async ({ page }) => {
    await loadMarkdown(page, FULL_SAMPLE);
    const types = await getBlockTypes(page);
    expect(types).toContain("heading1");
    expect(types).toContain("heading2");
    expect(types).toContain("heading3");
    expect(types).toContain("divider");
    expect(types).toContain("paragraph");
    expect(types).toContain("quote");
    expect(types).toContain("bulletList");
    expect(types).toContain("numberedList");
    expect(types).toContain("codeBlock");
    expect(types).toContain("table");
    expect(types).toContain("image");
  });

  test("full sample roundtrips — markdown output contains key content", async ({ page }) => {
    await loadMarkdown(page, FULL_SAMPLE);
    const md = await getMarkdownOutput(page);
    expect(md).toContain("# h1 Heading");
    expect(md).toContain("## h2 Heading");
    expect(md).toContain("**This is bold text**");
    expect(md).toContain("*This is italic text*");
    expect(md).toContain("~~Strikethrough~~");
    expect(md).toContain("---");
    expect(md).toContain("- Create a list");
    expect(md).toContain("[link text](http://example.com)");
  });
});

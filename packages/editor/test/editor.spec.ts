import { test, expect, type Page } from "@playwright/test";

// ---- Helpers ----

/** Get the contentEditable editor element */
function editor(page: Page) {
  return page.locator(".cx-editor");
}

/** Get the document model from the app */
async function getDoc(page: Page) {
  return page.evaluate(() => {
    // Prefer onChange snapshot, fall back to ref
    return (window as any).__editorDoc ?? (window as any).__editorRef?.getDocument?.();
  });
}

/** Get plain text of all blocks */
async function getBlockTexts(page: Page): Promise<string[]> {
  const doc = await getDoc(page);
  if (!doc) return [];
  return doc.blocks.map((b: any) =>
    b.content.map((s: any) => s.text).join("")
  );
}

/** Get block types */
async function getBlockTypes(page: Page): Promise<string[]> {
  const doc = await getDoc(page);
  if (!doc) return [];
  return doc.blocks.map((b: any) => b.type);
}

/** Get number of blocks */
async function getBlockCount(page: Page): Promise<number> {
  const doc = await getDoc(page);
  return doc?.blocks?.length ?? 0;
}

/** Click into the editor to focus it */
async function focusEditor(page: Page) {
  await editor(page).click();
  // Small wait for focus/selection events to settle
  await page.waitForTimeout(100);
}

/** Type text and wait for model update */
async function typeText(page: Page, text: string) {
  await page.keyboard.type(text, { delay: 30 });
  await page.waitForTimeout(100);
}

/** Press a key and wait */
async function pressKey(page: Page, key: string) {
  await page.keyboard.press(key);
  await page.waitForTimeout(100);
}

// ---- Tests ----

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  // Give the editor time to initialize
  await page.waitForTimeout(200);
});

test.describe("Editor Rendering", () => {
  test("renders the editor with a contentEditable area", async ({ page }) => {
    const ed = editor(page);
    await expect(ed).toBeVisible();
    const isEditable = await ed.getAttribute("contenteditable");
    expect(isEditable).toBe("true");
  });

  test("shows placeholder when empty", async ({ page }) => {
    const placeholder = page.locator(".cx-placeholder");
    await expect(placeholder).toBeVisible();
    await expect(placeholder).toContainText("Type here to test");
  });

  test("initial document has one empty paragraph block", async ({ page }) => {
    const types = await getBlockTypes(page);
    expect(types).toEqual(["paragraph"]);
    const texts = await getBlockTexts(page);
    expect(texts).toEqual([""]);
  });
});

test.describe("Basic Typing", () => {
  test("typing text updates the model", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "Hello World");

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["Hello World"]);
  });

  test("typed text is visible in the DOM", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "Visible text");

    const domText = await editor(page).innerText();
    expect(domText.trim()).toContain("Visible text");
  });

  test("typing multiple words works correctly", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "one two three");

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["one two three"]);
  });

  test("typing after focusing maintains cursor position", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "abc");
    await typeText(page, "def");

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["abcdef"]);
  });

  test("placeholder hides after typing", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "x");

    const placeholder = page.locator(".cx-placeholder");
    await expect(placeholder).toBeHidden();
  });
});

test.describe("Enter Key (Split Block)", () => {
  test("Enter creates a new block", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "Line one");
    await pressKey(page, "Enter");

    const count = await getBlockCount(page);
    expect(count).toBe(2);
  });

  test("Enter splits text at cursor position", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "HelloWorld");
    // Move cursor back 5 characters (to between Hello and World)
    for (let i = 0; i < 5; i++) await pressKey(page, "ArrowLeft");
    await pressKey(page, "Enter");

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["Hello", "World"]);
  });

  test("typing on second line after Enter works", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "First");
    await pressKey(page, "Enter");
    await typeText(page, "Second");

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["First", "Second"]);
  });

  test("multiple Enter presses create multiple blocks", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "A");
    await pressKey(page, "Enter");
    await typeText(page, "B");
    await pressKey(page, "Enter");
    await typeText(page, "C");

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["A", "B", "C"]);
  });
});

test.describe("Backspace", () => {
  test("Backspace deletes the character before cursor", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "abc");
    await pressKey(page, "Backspace");

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["ab"]);
  });

  test("Backspace at start of second block merges with first", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "Hello");
    await pressKey(page, "Enter");
    await typeText(page, "World");
    // Move to start of second block
    await pressKey(page, "Home");
    await pressKey(page, "Backspace");

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["HelloWorld"]);
  });

  test("Backspace at start of first block does nothing", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "abc");
    await pressKey(page, "Home");
    await pressKey(page, "Backspace");

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["abc"]);
  });

  test("multiple Backspaces delete multiple characters", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "abcde");
    await pressKey(page, "Backspace");
    await pressKey(page, "Backspace");
    await pressKey(page, "Backspace");

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["ab"]);
  });
});

test.describe("Delete Key", () => {
  test("Delete removes the character after cursor", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "abc");
    await pressKey(page, "Home");
    await pressKey(page, "Delete");

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["bc"]);
  });

  test("Delete at end of block merges with next block", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "Hello");
    await pressKey(page, "Enter");
    await typeText(page, "World");
    // Go back to end of first block
    await pressKey(page, "ArrowUp");
    await pressKey(page, "End");
    await pressKey(page, "Delete");

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["HelloWorld"]);
  });
});

test.describe("Arrow Keys & Cursor Movement", () => {
  test("ArrowLeft moves cursor left", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "abc");
    await pressKey(page, "ArrowLeft");
    await typeText(page, "X");

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["abXc"]);
  });

  test("ArrowRight moves cursor right", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "abc");
    await pressKey(page, "Home");
    await pressKey(page, "ArrowRight");
    await typeText(page, "X");

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["aXbc"]);
  });

  test("Home moves cursor to start of line", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "abc");
    await pressKey(page, "Home");
    await typeText(page, "X");

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["Xabc"]);
  });

  test("End moves cursor to end of line", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "abc");
    await pressKey(page, "Home");
    await pressKey(page, "End");
    await typeText(page, "X");

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["abcX"]);
  });
});

test.describe("Text Selection & Deletion", () => {
  test("Select all and delete clears the editor", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "Hello World");
    await page.keyboard.press("Meta+a");
    await pressKey(page, "Backspace");

    const texts = await getBlockTexts(page);
    // Should have one empty block
    expect(texts.length).toBe(1);
    expect(texts[0]).toBe("");
  });

  test("Select all and type replaces content", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "old text");
    await page.keyboard.press("Meta+a");
    await typeText(page, "new text");

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["new text"]);
  });

  test("Shift+ArrowLeft selects text, then typing replaces it", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "abcde");
    // Select last 3 characters (small delay lets selectionchange + React settle)
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Shift+ArrowLeft");
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(100);
    await typeText(page, "X");

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["abX"]);
  });
});

test.describe("Markdown Shortcuts", () => {
  test("'# ' converts to heading1", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "# ");

    const types = await getBlockTypes(page);
    expect(types).toEqual(["heading1"]);
    // The shortcut text should be cleared
    const texts = await getBlockTexts(page);
    expect(texts).toEqual([""]);
  });

  test("'## ' converts to heading2", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "## ");

    const types = await getBlockTypes(page);
    expect(types).toEqual(["heading2"]);
  });

  test("'- ' converts to bullet list", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "- ");

    const types = await getBlockTypes(page);
    expect(types).toEqual(["bulletList"]);
  });

  test("'1. ' converts to numbered list", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "1. ");

    const types = await getBlockTypes(page);
    expect(types).toEqual(["numberedList"]);
  });

  test("'[] ' converts to todo", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "[] ");

    const types = await getBlockTypes(page);
    expect(types).toEqual(["todo"]);
  });

  test("'> ' converts to quote", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "> ");

    const types = await getBlockTypes(page);
    expect(types).toEqual(["quote"]);
  });

  test("typing content after heading shortcut works", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "# ");
    await typeText(page, "My Heading");

    const types = await getBlockTypes(page);
    expect(types).toEqual(["heading1"]);
    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["My Heading"]);
  });
});

test.describe("Formatting Shortcuts", () => {
  test("Cmd+B applies bold to selection", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "hello world");
    // Select "world" (small delay lets selectionchange + React settle)
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Shift+ArrowLeft");
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(100);
    await page.keyboard.press("Meta+b");

    const doc = await getDoc(page);
    const lastBlock = doc.blocks[0];
    // Should have at least 2 spans: "hello " (unmarked) + "world" (bold)
    expect(lastBlock.content.length).toBeGreaterThanOrEqual(2);
    const boldSpan = lastBlock.content.find(
      (s: any) => s.marks?.some((m: any) => m.type === "bold")
    );
    expect(boldSpan).toBeTruthy();
    expect(boldSpan.text).toBe("world");
  });

  test("Cmd+I applies italic to selection", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "hello world");
    for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.press("Meta+i");

    const doc = await getDoc(page);
    const italicSpan = doc.blocks[0].content.find(
      (s: any) => s.marks?.some((m: any) => m.type === "italic")
    );
    expect(italicSpan).toBeTruthy();
  });
});

test.describe("Undo/Redo", () => {
  test("Cmd+Z undoes the last action", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "hello");
    await page.waitForTimeout(400); // Let history batch close
    await typeText(page, " world");
    await page.waitForTimeout(400);

    await page.keyboard.press("Meta+z");
    await page.waitForTimeout(100);

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["hello"]);
  });

  test("Cmd+Shift+Z redoes after undo", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "hello");
    await page.waitForTimeout(400);
    await typeText(page, " world");
    await page.waitForTimeout(400);

    await page.keyboard.press("Meta+z");
    await page.waitForTimeout(100);
    await page.keyboard.press("Meta+Shift+z");
    await page.waitForTimeout(100);

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["hello world"]);
  });
});

test.describe("Slash Commands", () => {
  test("typing '/' shows the slash command menu", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/");

    // Wait for the slash command menu to appear (detected via requestAnimationFrame)
    await page.waitForTimeout(300);

    const menu = page.locator("[data-testid='slash-command-menu']");
    await expect(menu).toBeVisible({ timeout: 2000 });
  });
});

test.describe("Multi-block Editing", () => {
  test("creating and editing 3 blocks works end-to-end", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "Block 1");
    await pressKey(page, "Enter");
    await typeText(page, "Block 2");
    await pressKey(page, "Enter");
    await typeText(page, "Block 3");

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["Block 1", "Block 2", "Block 3"]);
    expect(await getBlockCount(page)).toBe(3);
  });

  test("editing in the middle of blocks works", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "AAA");
    await pressKey(page, "Enter");
    await typeText(page, "BBB");
    await pressKey(page, "Enter");
    await typeText(page, "CCC");

    // Go back to second block and edit
    await pressKey(page, "ArrowUp");
    await pressKey(page, "End");
    await typeText(page, "X");

    const texts = await getBlockTexts(page);
    expect(texts[1]).toBe("BBBX");
  });
});

test.describe("DOM-Model Consistency", () => {
  test("DOM text matches model text after typing", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "sync check");

    const modelTexts = await getBlockTexts(page);
    const domText = await editor(page).innerText();

    expect(domText.trim()).toContain(modelTexts[0]);
  });

  test("DOM text matches model after Enter + typing", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "line1");
    await pressKey(page, "Enter");
    await typeText(page, "line2");

    const modelTexts = await getBlockTexts(page);
    const domText = await editor(page).innerText();

    for (const text of modelTexts) {
      if (text) expect(domText).toContain(text);
    }
  });
});

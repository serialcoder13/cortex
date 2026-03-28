import { test, expect, type Page } from "@playwright/test";

function editor(page: Page) { return page.locator(".cx-editor"); }

async function getDoc(page: Page) {
  return page.evaluate(() =>
    (window as any).__editorDoc ?? (window as any).__editorRef?.getDocument?.()
  );
}

async function getBlockTexts(page: Page): Promise<string[]> {
  const doc = await getDoc(page);
  if (!doc) return [];
  return doc.blocks.map((b: any) => b.content.map((s: any) => s.text).join(""));
}

async function getBlockTypes(page: Page): Promise<string[]> {
  const doc = await getDoc(page);
  if (!doc) return [];
  return doc.blocks.map((b: any) => b.type);
}

async function getBlockCount(page: Page): Promise<number> {
  const doc = await getDoc(page);
  return doc?.blocks?.length ?? 0;
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

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  await page.waitForTimeout(200);
});

test.describe("Multi-block Navigation", () => {
  test("ArrowDown moves to the next block", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "Block A");
    await pressKey(page, "Enter");
    await typeText(page, "Block B");

    // Move to first block
    await pressKey(page, "ArrowUp");
    await pressKey(page, "End");
    await typeText(page, "X");

    const texts = await getBlockTexts(page);
    expect(texts[0]).toBe("Block AX");
  });

  test("ArrowUp moves to the previous block", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "Block A");
    await pressKey(page, "Enter");
    await typeText(page, "Block B");

    // We're at end of Block B; ArrowUp goes to Block A
    await pressKey(page, "ArrowUp");
    await pressKey(page, "Home");
    await typeText(page, "X");

    const texts = await getBlockTexts(page);
    expect(texts[0]).toContain("X");
  });
});

test.describe("Multi-block Selection", () => {
  test("Cmd+A selects all text across blocks", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "AAA");
    await pressKey(page, "Enter");
    await typeText(page, "BBB");
    await pressKey(page, "Enter");
    await typeText(page, "CCC");

    await page.keyboard.press("Meta+a");
    await page.waitForTimeout(100);
    await pressKey(page, "Backspace");
    await page.waitForTimeout(100);

    // Should have 1 empty block
    expect(await getBlockCount(page)).toBe(1);
    const texts = await getBlockTexts(page);
    expect(texts).toEqual([""]);
  });

  test("Cmd+A then type replaces all content", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "old1");
    await pressKey(page, "Enter");
    await typeText(page, "old2");

    await page.keyboard.press("Meta+a");
    await page.waitForTimeout(100);
    await typeText(page, "new content");

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["new content"]);
  });
});

test.describe("Block Type Conversions", () => {
  test("paragraph to heading via markdown shortcut", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "# ");
    const types = await getBlockTypes(page);
    expect(types).toEqual(["heading1"]);
  });

  test("heading back to paragraph via Backspace at start", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "# ");
    await typeText(page, "Title");

    const types1 = await getBlockTypes(page);
    expect(types1).toEqual(["heading1"]);

    // Move to start and backspace should convert to paragraph
    await pressKey(page, "Home");
    await pressKey(page, "Backspace");

    const types2 = await getBlockTypes(page);
    expect(types2).toEqual(["paragraph"]);

    // Content should be preserved
    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["Title"]);
  });

  test("bullet list to paragraph via Enter on empty", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "- ");
    await typeText(page, "Item");
    await pressKey(page, "Enter");
    // Empty bullet item — Enter should convert to paragraph
    await pressKey(page, "Enter");

    const types = await getBlockTypes(page);
    expect(types[types.length - 1]).toBe("paragraph");
  });

  test("numbered list to paragraph via Enter on empty", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "1. ");
    await typeText(page, "Item");
    await pressKey(page, "Enter");
    await pressKey(page, "Enter");

    const types = await getBlockTypes(page);
    expect(types[types.length - 1]).toBe("paragraph");
  });

  test("todo to paragraph via Enter on empty", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "[] ");
    await typeText(page, "Task");
    await pressKey(page, "Enter");
    await pressKey(page, "Enter");

    const types = await getBlockTypes(page);
    expect(types[types.length - 1]).toBe("paragraph");
  });
});

test.describe("Block Merging", () => {
  test("Backspace at start of block merges with previous", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "Hello");
    await pressKey(page, "Enter");
    await typeText(page, " World");

    await pressKey(page, "Home");
    await pressKey(page, "Backspace");

    expect(await getBlockCount(page)).toBe(1);
    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["Hello World"]);
  });

  test("Delete at end of block merges with next", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "Hello");
    await pressKey(page, "Enter");
    await typeText(page, " World");

    // Go to end of first block
    await pressKey(page, "ArrowUp");
    await pressKey(page, "End");
    await pressKey(page, "Delete");

    expect(await getBlockCount(page)).toBe(1);
    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["Hello World"]);
  });

  test("merging preserves text from both blocks", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "Start");
    await pressKey(page, "Enter");
    await typeText(page, "End");

    await pressKey(page, "Home");
    await pressKey(page, "Backspace");

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["StartEnd"]);
  });
});

test.describe("Splitting Blocks", () => {
  test("Enter at the beginning of text creates empty block above", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "Content");
    await pressKey(page, "Home");
    await pressKey(page, "Enter");

    expect(await getBlockCount(page)).toBe(2);
    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["", "Content"]);
  });

  test("Enter at the end of text creates empty block below", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "Content");
    await pressKey(page, "Enter");

    expect(await getBlockCount(page)).toBe(2);
    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["Content", ""]);
  });

  test("Enter in the middle splits text correctly", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "HelloWorld");
    // Move cursor between Hello and World
    for (let i = 0; i < 5; i++) await pressKey(page, "ArrowLeft");
    await pressKey(page, "Enter");

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["Hello", "World"]);
  });
});

test.describe("Tab Key", () => {
  test("Tab inserts spaces", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "hello");
    await pressKey(page, "Tab");
    await typeText(page, "world");

    const texts = await getBlockTexts(page);
    expect(texts[0]).toContain("hello");
    expect(texts[0]).toContain("world");
    expect(texts[0]!.length).toBeGreaterThan("helloworld".length); // has spaces
  });
});

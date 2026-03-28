import { test, expect, type Page } from "@playwright/test";

// ---- Helpers ----

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

test.describe("Heading Blocks", () => {
  test("H1 renders with large bold text", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "# ");
    await typeText(page, "Big Heading");

    const types = await getBlockTypes(page);
    expect(types).toEqual(["heading1"]);

    // Check the DOM has heading styling
    const content = editor(page).locator("[data-content]").first();
    const fontSize = await content.evaluate((el) => getComputedStyle(el).fontSize);
    const fontWeight = await content.evaluate((el) => getComputedStyle(el).fontWeight);
    expect(parseFloat(fontSize)).toBeGreaterThan(20); // 1.875rem = 30px
    expect(parseInt(fontWeight)).toBeGreaterThanOrEqual(700);
  });

  test("H2 renders with medium semibold text", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "## ");
    await typeText(page, "Medium Heading");

    const types = await getBlockTypes(page);
    expect(types).toEqual(["heading2"]);

    const content = editor(page).locator("[data-content]").first();
    const fontSize = await content.evaluate((el) => getComputedStyle(el).fontSize);
    expect(parseFloat(fontSize)).toBeGreaterThan(18); // 1.5rem = 24px
  });

  test("H3 renders with smaller semibold text", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "### ");
    await typeText(page, "Small Heading");

    const types = await getBlockTypes(page);
    expect(types).toEqual(["heading3"]);
  });

  test("Enter after heading creates a paragraph (not another heading)", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "# ");
    await typeText(page, "Title");
    await pressKey(page, "Enter");
    await typeText(page, "Body text");

    const types = await getBlockTypes(page);
    expect(types).toEqual(["heading1", "paragraph"]);
  });
});

test.describe("List Blocks", () => {
  test("bullet list via '- ' shortcut", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "- ");
    await typeText(page, "Item one");

    const types = await getBlockTypes(page);
    expect(types).toEqual(["bulletList"]);
    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["Item one"]);
  });

  test("numbered list via '1. ' shortcut", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "1. ");
    await typeText(page, "First item");

    const types = await getBlockTypes(page);
    expect(types).toEqual(["numberedList"]);
  });

  test("todo via '[] ' shortcut", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "[] ");
    await typeText(page, "My task");

    const types = await getBlockTypes(page);
    expect(types).toEqual(["todo"]);
  });

  test("Enter on bullet list creates another bullet", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "- ");
    await typeText(page, "Item 1");
    await pressKey(page, "Enter");
    await typeText(page, "Item 2");

    const types = await getBlockTypes(page);
    expect(types).toEqual(["bulletList", "bulletList"]);
    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["Item 1", "Item 2"]);
  });

  test("Enter on empty bullet converts to paragraph", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "- ");
    await typeText(page, "Item");
    await pressKey(page, "Enter");
    // Now on empty bullet, press Enter again
    await pressKey(page, "Enter");

    const types = await getBlockTypes(page);
    expect(types[0]).toBe("bulletList");
    expect(types[types.length - 1]).toBe("paragraph");
  });

  test("consecutive bullets render with tight spacing", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "- ");
    await typeText(page, "A");
    await pressKey(page, "Enter");
    await typeText(page, "B");
    await pressKey(page, "Enter");
    await typeText(page, "C");

    // Check that consecutive bullets have reduced padding
    const wrappers = editor(page).locator(".cx-block-wrapper");
    const secondPadding = await wrappers.nth(1).evaluate(
      (el) => getComputedStyle(el).paddingTop
    );
    expect(parseFloat(secondPadding)).toBeLessThanOrEqual(2); // 1px instead of 4px
  });
});

test.describe("Quote Block", () => {
  test("'> ' shortcut creates quote", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "> ");
    await typeText(page, "Famous words");

    const types = await getBlockTypes(page);
    expect(types).toEqual(["quote"]);
    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["Famous words"]);
  });
});

test.describe("Code Block", () => {
  test("'```' shortcut creates code block", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "```");
    await page.waitForTimeout(200);

    const types = await getBlockTypes(page);
    expect(types[0]).toBe("codeBlock");
  });
});

test.describe("Divider", () => {
  test("'---' creates divider and new paragraph", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "---");
    await page.waitForTimeout(200);

    const types = await getBlockTypes(page);
    expect(types).toContain("divider");
    // Should also create a paragraph after the divider
    expect(types[types.length - 1]).toBe("paragraph");
  });
});

test.describe("Block Deletion", () => {
  test("Shift+Backspace deletes the current block", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "Block 1");
    await pressKey(page, "Enter");
    await typeText(page, "Block 2");
    await pressKey(page, "Enter");
    await typeText(page, "Block 3");

    expect(await getBlockCount(page)).toBe(3);

    // Delete the current block (Block 3)
    await page.keyboard.press("Shift+Backspace");
    await page.waitForTimeout(100);

    expect(await getBlockCount(page)).toBe(2);
    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["Block 1", "Block 2"]);
  });

  test("Shift+Backspace doesn't delete the last remaining block", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "Only block");

    expect(await getBlockCount(page)).toBe(1);

    await page.keyboard.press("Shift+Backspace");
    await page.waitForTimeout(100);

    // Should still have 1 block
    expect(await getBlockCount(page)).toBe(1);
  });
});

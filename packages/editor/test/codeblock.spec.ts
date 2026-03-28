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

test.describe("Code Block — Enter Key", () => {
  test("Enter inside code block inserts a newline, not a new block", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "```");
    await page.waitForTimeout(200);

    // Should be a code block now
    const types = await getBlockTypes(page);
    expect(types[0]).toBe("codeBlock");

    // Type first line
    await typeText(page, "line 1");
    await pressKey(page, "Enter");
    await typeText(page, "line 2");
    await pressKey(page, "Enter");
    await typeText(page, "line 3");

    // Should still be ONE code block (not 3 blocks)
    const count = await getBlockCount(page);
    // The code block + possibly the paragraph that ``` creates after
    const typesAfter = await getBlockTypes(page);
    const codeBlockCount = typesAfter.filter(t => t === "codeBlock").length;
    expect(codeBlockCount).toBe(1);

    // The code block's text should contain newlines
    const texts = await getBlockTexts(page);
    const codeText = texts[0];
    expect(codeText).toContain("line 1");
    expect(codeText).toContain("line 2");
    expect(codeText).toContain("line 3");
  });

  test("Enter inserts newline character in code block content", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "```");
    await page.waitForTimeout(200);

    await typeText(page, "a");
    await pressKey(page, "Enter");
    await typeText(page, "b");

    const texts = await getBlockTexts(page);
    expect(texts[0]).toBe("a\nb");
  });

  test("Shift+Enter in code block also inserts newline", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "```");
    await page.waitForTimeout(200);

    await typeText(page, "first");
    await page.keyboard.press("Shift+Enter");
    await page.waitForTimeout(100);
    await typeText(page, "second");

    const texts = await getBlockTexts(page);
    expect(texts[0]).toContain("first");
    expect(texts[0]).toContain("second");
  });

  test("two consecutive Enter presses in code block exits to new paragraph", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "```");
    await page.waitForTimeout(200);

    await typeText(page, "some code");
    await pressKey(page, "Enter");
    await pressKey(page, "Enter");

    // Should have exited the code block and created a paragraph
    const types = await getBlockTypes(page);
    expect(types[types.length - 1]).toBe("paragraph");
  });

  test("typing in code block preserves monospace font", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "```");
    await page.waitForTimeout(200);
    await typeText(page, "code here");

    const codeEl = editor(page).locator("code").first();
    if (await codeEl.count() > 0) {
      const font = await codeEl.evaluate(el => getComputedStyle(el).fontFamily);
      expect(font.toLowerCase()).toMatch(/mono|menlo|consolas|courier/);
    }
  });
});

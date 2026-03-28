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

test.describe("Markdown Serialization (in debug panel)", () => {
  test("paragraph serializes as plain text", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "Just a paragraph");
    await page.waitForTimeout(200);

    const md = await page.locator("pre").textContent();
    expect(md?.trim()).toBe("Just a paragraph");
  });

  test("heading1 serializes with # prefix", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "# ");
    await typeText(page, "My Title");
    await page.waitForTimeout(200);

    const md = await page.locator("pre").textContent();
    expect(md?.trim()).toBe("# My Title");
  });

  test("heading2 serializes with ## prefix", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "## ");
    await typeText(page, "Subtitle");
    await page.waitForTimeout(200);

    const md = await page.locator("pre").textContent();
    expect(md?.trim()).toBe("## Subtitle");
  });

  test("bullet list serializes with - prefix", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "- ");
    await typeText(page, "Item 1");
    await pressKey(page, "Enter");
    await typeText(page, "Item 2");
    await page.waitForTimeout(200);

    const md = await page.locator("pre").textContent();
    expect(md).toContain("- Item 1");
    expect(md).toContain("- Item 2");
  });

  test("numbered list serializes with 1. prefix", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "1. ");
    await typeText(page, "First");
    await pressKey(page, "Enter");
    await typeText(page, "Second");
    await page.waitForTimeout(200);

    const md = await page.locator("pre").textContent();
    expect(md).toContain("1. First");
    expect(md).toContain("2. Second");
  });

  test("todo serializes with [ ] or [x] prefix", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "[] ");
    await typeText(page, "My task");
    await page.waitForTimeout(200);

    const md = await page.locator("pre").textContent();
    expect(md).toContain("[ ] My task");
  });

  test("quote serializes with > prefix", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "> ");
    await typeText(page, "Wise words");
    await page.waitForTimeout(200);

    const md = await page.locator("pre").textContent();
    expect(md).toContain("> Wise words");
  });

  test("divider serializes as ---", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "Above");
    await pressKey(page, "Enter");
    await typeText(page, "---");
    await page.waitForTimeout(200);

    const md = await page.locator("pre").textContent();
    expect(md).toContain("---");
  });

  test("bold text serializes with ** markers", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "hello world");
    // Select "world" and bold it
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Shift+ArrowLeft");
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(100);
    await page.keyboard.press("Meta+b");
    await page.waitForTimeout(300);

    const md = await page.locator("pre").textContent();
    expect(md).toContain("**world**");
  });

  test("italic text serializes with * markers", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "hello world");
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Shift+ArrowLeft");
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(100);
    await page.keyboard.press("Meta+i");
    await page.waitForTimeout(300);

    const md = await page.locator("pre").textContent();
    expect(md).toContain("*world*");
  });

  test("multiple blocks serialize with blank lines between", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "Paragraph 1");
    await pressKey(page, "Enter");
    await typeText(page, "Paragraph 2");
    await page.waitForTimeout(200);

    const md = await page.locator("pre").textContent();
    expect(md).toContain("Paragraph 1");
    expect(md).toContain("Paragraph 2");
  });
});

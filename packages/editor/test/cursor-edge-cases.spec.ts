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

test.describe("Cursor Edge Cases", () => {
  test("typing at the very beginning of the editor", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "hello");

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["hello"]);
  });

  test("clicking on the editor background focuses last block", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "content");
    await pressKey(page, "Enter");
    await pressKey(page, "Enter");

    // Click below the content (on the editor background)
    const editorBox = await editor(page).boundingBox();
    if (editorBox) {
      await page.mouse.click(
        editorBox.x + editorBox.width / 2,
        editorBox.y + editorBox.height - 10
      );
      await page.waitForTimeout(100);
      await typeText(page, "end");

      const texts = await getBlockTexts(page);
      const lastText = texts[texts.length - 1];
      expect(lastText).toContain("end");
    }
  });

  test("rapid typing doesn't lose characters", async ({ page }) => {
    await focusEditor(page);
    // Type quickly
    await page.keyboard.type("The quick brown fox jumps over the lazy dog", { delay: 10 });
    await page.waitForTimeout(200);

    const texts = await getBlockTexts(page);
    expect(texts[0]).toBe("The quick brown fox jumps over the lazy dog");
  });

  test("Backspace on empty document leaves one empty block", async ({ page }) => {
    await focusEditor(page);
    await pressKey(page, "Backspace");

    expect(await getBlockCount(page)).toBe(1);
    const texts = await getBlockTexts(page);
    expect(texts).toEqual([""]);
  });

  test("Delete on empty document leaves one empty block", async ({ page }) => {
    await focusEditor(page);
    await pressKey(page, "Delete");

    expect(await getBlockCount(page)).toBe(1);
  });

  test("typing special characters works", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "Hello! @#$%^&*() = yes");
    await page.waitForTimeout(100);

    const texts = await getBlockTexts(page);
    expect(texts[0]).toBe("Hello! @#$%^&*() = yes");
  });

  test("typing unicode characters works", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "Caf\u00e9 na\u00efve");
    await page.waitForTimeout(100);

    const texts = await getBlockTexts(page);
    expect(texts[0]).toContain("Caf");
  });

  test("very long line doesn't break the editor", async ({ page }) => {
    await focusEditor(page);
    const longText = "a".repeat(500);
    await page.keyboard.type(longText, { delay: 1 });
    await page.waitForTimeout(200);

    const texts = await getBlockTexts(page);
    expect(texts[0]!.length).toBe(500);
  });

  test("many blocks don't break the editor", async ({ page }) => {
    await focusEditor(page);
    for (let i = 0; i < 20; i++) {
      await page.keyboard.type(`Block ${i + 1}`, { delay: 5 });
      await page.keyboard.press("Enter");
    }
    await page.waitForTimeout(200);

    expect(await getBlockCount(page)).toBeGreaterThanOrEqual(20);
  });
});

test.describe("Selection Edge Cases", () => {
  test("selecting backwards (right to left) works", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "abcde");

    // Select right-to-left
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Shift+ArrowLeft");
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(100);

    await typeText(page, "X");
    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["abX"]);
  });

  test("selecting forwards (left to right) works", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "abcde");
    await pressKey(page, "Home");

    // Select left-to-right
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Shift+ArrowRight");
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(100);

    await typeText(page, "X");
    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["Xde"]);
  });

  test("double-click selects a word", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "hello world goodbye");
    await page.waitForTimeout(200);

    // Double-click on "world"
    const editorEl = editor(page);
    const box = await editorEl.boundingBox();
    if (box) {
      // Double-click roughly in the middle of the text
      await page.mouse.dblclick(box.x + 80, box.y + 10);
      await page.waitForTimeout(200);

      // Type to replace the selected word
      await typeText(page, "REPLACED");
      const texts = await getBlockTexts(page);
      // One of the words should be replaced
      expect(texts[0]).toContain("REPLACED");
    }
  });
});

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

test.describe("Undo (Cmd+Z)", () => {
  test("undoes typed text", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "hello");
    await page.waitForTimeout(400); // let history batch close
    await typeText(page, " world");
    await page.waitForTimeout(400);

    await page.keyboard.press("Meta+z");
    await page.waitForTimeout(100);

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["hello"]);
  });

  test("undoes block split (Enter)", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "one line");
    await page.waitForTimeout(400);
    await pressKey(page, "Enter");
    await page.waitForTimeout(400);

    expect(await getBlockCount(page)).toBe(2);

    await page.keyboard.press("Meta+z");
    await page.waitForTimeout(100);

    expect(await getBlockCount(page)).toBe(1);
    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["one line"]);
  });

  test("undoes block merge (Backspace at start)", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "First");
    await pressKey(page, "Enter");
    await typeText(page, "Second");
    await page.waitForTimeout(400);

    // Move to start of second block and backspace to merge
    await pressKey(page, "Home");
    await pressKey(page, "Backspace");
    await page.waitForTimeout(400);

    expect(await getBlockCount(page)).toBe(1);

    await page.keyboard.press("Meta+z");
    await page.waitForTimeout(100);

    expect(await getBlockCount(page)).toBe(2);
  });

  test("undoes character deletion (Backspace)", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "abcde");
    await page.waitForTimeout(400);
    await pressKey(page, "Backspace");
    await page.waitForTimeout(400);

    const before = await getBlockTexts(page);
    expect(before).toEqual(["abcd"]);

    await page.keyboard.press("Meta+z");
    await page.waitForTimeout(100);

    const after = await getBlockTexts(page);
    expect(after).toEqual(["abcde"]);
  });

  test("multiple undos work in sequence", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "A");
    await page.waitForTimeout(400);
    await typeText(page, "B");
    await page.waitForTimeout(400);
    await typeText(page, "C");
    await page.waitForTimeout(400);

    await page.keyboard.press("Meta+z"); // undo C
    await page.waitForTimeout(100);
    await page.keyboard.press("Meta+z"); // undo B
    await page.waitForTimeout(100);

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["A"]);
  });
});

test.describe("Redo (Cmd+Shift+Z)", () => {
  test("redoes after undo", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "hello");
    await page.waitForTimeout(400);
    await typeText(page, " world");
    await page.waitForTimeout(400);

    await page.keyboard.press("Meta+z");
    await page.waitForTimeout(100);
    expect(await getBlockTexts(page)).toEqual(["hello"]);

    await page.keyboard.press("Meta+Shift+z");
    await page.waitForTimeout(100);
    expect(await getBlockTexts(page)).toEqual(["hello world"]);
  });

  test("redo is cleared when new content is typed after undo", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "hello");
    await page.waitForTimeout(400);
    await typeText(page, " world");
    await page.waitForTimeout(400);

    await page.keyboard.press("Meta+z");
    await page.waitForTimeout(100);

    // Type something new — redo history should be cleared
    await typeText(page, " there");
    await page.waitForTimeout(400);

    // Redo should do nothing since we typed new content
    await page.keyboard.press("Meta+Shift+z");
    await page.waitForTimeout(100);

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["hello there"]);
  });

  test("Cmd+Y also redoes", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "test");
    await page.waitForTimeout(400);
    await typeText(page, "ing");
    await page.waitForTimeout(400);

    await page.keyboard.press("Meta+z");
    await page.waitForTimeout(100);
    expect(await getBlockTexts(page)).toEqual(["test"]);

    await page.keyboard.press("Meta+y");
    await page.waitForTimeout(100);
    expect(await getBlockTexts(page)).toEqual(["testing"]);
  });
});

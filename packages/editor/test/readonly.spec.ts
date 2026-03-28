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

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  await page.waitForTimeout(200);
});

test.describe("Read-only Mode", () => {
  test("editor is not contentEditable when read-only is checked", async ({ page }) => {
    // First type some content
    await editor(page).click();
    await page.waitForTimeout(100);
    await page.keyboard.type("hello", { delay: 30 });
    await page.waitForTimeout(100);

    // Enable read-only
    const readOnlyCheckbox = page.locator("input[type='checkbox']").first();
    await readOnlyCheckbox.check();
    await page.waitForTimeout(200);

    const isEditable = await editor(page).getAttribute("contenteditable");
    expect(isEditable).toBe("false");
  });

  test("typing does not change content in read-only mode", async ({ page }) => {
    // Type initial content
    await editor(page).click();
    await page.waitForTimeout(100);
    await page.keyboard.type("original", { delay: 30 });
    await page.waitForTimeout(100);

    // Enable read-only
    const readOnlyCheckbox = page.locator("input[type='checkbox']").first();
    await readOnlyCheckbox.check();
    await page.waitForTimeout(200);

    // Try to type
    await editor(page).click();
    await page.waitForTimeout(100);
    await page.keyboard.type("new text", { delay: 30 });
    await page.waitForTimeout(100);

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["original"]);
  });

  test("placeholder is not shown in read-only mode", async ({ page }) => {
    // Enable read-only on empty editor
    const readOnlyCheckbox = page.locator("input[type='checkbox']").first();
    await readOnlyCheckbox.check();
    await page.waitForTimeout(200);

    const placeholder = page.locator(".cx-placeholder");
    await expect(placeholder).toBeHidden();
  });

  test("toggling read-only off re-enables editing", async ({ page }) => {
    // Type content
    await editor(page).click();
    await page.waitForTimeout(100);
    await page.keyboard.type("hello", { delay: 30 });
    await page.waitForTimeout(100);

    const readOnlyCheckbox = page.locator("input[type='checkbox']").first();

    // Enable then disable read-only
    await readOnlyCheckbox.check();
    await page.waitForTimeout(200);
    await readOnlyCheckbox.uncheck();
    await page.waitForTimeout(200);

    const isEditable = await editor(page).getAttribute("contenteditable");
    expect(isEditable).toBe("true");

    // Should be able to type again
    await editor(page).click();
    await page.waitForTimeout(100);
    await page.keyboard.press("End");
    await page.keyboard.type(" world", { delay: 30 });
    await page.waitForTimeout(100);

    const texts = await getBlockTexts(page);
    expect(texts[0]).toContain("world");
  });
});

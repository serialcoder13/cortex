import { test, expect, type Page } from "@playwright/test";

function editor(page: Page) {
  return page.locator(".cx-editor");
}

async function getBlockTexts(page: Page): Promise<string[]> {
  const doc = await page.evaluate(() => {
    return (window as any).__editorDoc ?? (window as any).__editorRef?.getDocument?.();
  });
  if (!doc) return [];
  return doc.blocks.map((b: any) => b.content.map((s: any) => s.text).join(""));
}

async function focusEditor(page: Page) {
  await editor(page).click();
  await page.waitForTimeout(100);
}

async function typeText(page: Page, text: string) {
  await page.keyboard.type(text, { delay: 30 });
  await page.waitForTimeout(100);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  await page.waitForTimeout(200);
});

test("typing spaces between words works", async ({ page }) => {
  await focusEditor(page);
  await typeText(page, "hello world");

  const texts = await getBlockTexts(page);
  expect(texts).toEqual(["hello world"]);
});

test("typing multiple consecutive spaces works", async ({ page }) => {
  await focusEditor(page);
  await typeText(page, "a  b");

  const texts = await getBlockTexts(page);
  expect(texts).toEqual(["a  b"]);
});

test("trailing space is preserved in model", async ({ page }) => {
  await focusEditor(page);
  await typeText(page, "hello ");

  const texts = await getBlockTexts(page);
  expect(texts).toEqual(["hello "]);
});

test("typing after a space works correctly", async ({ page }) => {
  await focusEditor(page);
  await typeText(page, "abc ");
  await typeText(page, "def");

  const texts = await getBlockTexts(page);
  expect(texts).toEqual(["abc def"]);
});

test("space at beginning of text works", async ({ page }) => {
  await focusEditor(page);
  await typeText(page, " hello");

  const texts = await getBlockTexts(page);
  expect(texts).toEqual([" hello"]);
});

test("DOM shows spaces correctly (not collapsed)", async ({ page }) => {
  await focusEditor(page);
  await typeText(page, "a  b");
  await page.waitForTimeout(200);

  // Check that the DOM actually shows two spaces
  const domText = await editor(page).innerText();
  expect(domText.trim()).toContain("a  b");
});

test("cursor stays after space when typing continues", async ({ page }) => {
  await focusEditor(page);
  await typeText(page, "one ");
  await page.waitForTimeout(100);
  await typeText(page, "two ");
  await page.waitForTimeout(100);
  await typeText(page, "three");

  const texts = await getBlockTexts(page);
  expect(texts).toEqual(["one two three"]);
});

test("backspace after space deletes the space", async ({ page }) => {
  await focusEditor(page);
  await typeText(page, "hello ");
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(100);

  const texts = await getBlockTexts(page);
  expect(texts).toEqual(["hello"]);
});

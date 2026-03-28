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

test.describe("Copy & Paste", () => {
  test("pasting plain text inserts into current block", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "before ");

    // Paste via clipboard API
    await page.evaluate(() => {
      const editor = document.querySelector(".cx-editor");
      const dt = new DataTransfer();
      dt.setData("text/plain", "pasted text");
      const event = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
      editor?.dispatchEvent(event);
    });
    await page.waitForTimeout(200);

    const texts = await getBlockTexts(page);
    expect(texts[0]).toContain("pasted text");
  });

  test("pasting multi-line text creates multiple blocks", async ({ page }) => {
    await focusEditor(page);

    await page.evaluate(() => {
      const editor = document.querySelector(".cx-editor");
      const dt = new DataTransfer();
      dt.setData("text/plain", "Line 1\nLine 2\nLine 3");
      const event = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
      editor?.dispatchEvent(event);
    });
    await page.waitForTimeout(200);

    expect(await getBlockCount(page)).toBeGreaterThanOrEqual(3);
  });

  test("pasting markdown creates properly typed blocks", async ({ page }) => {
    await focusEditor(page);

    await page.evaluate(() => {
      const editor = document.querySelector(".cx-editor");
      const dt = new DataTransfer();
      dt.setData("text/plain", "# My Title\n\nSome paragraph text\n\n- Item 1\n- Item 2");
      const event = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
      editor?.dispatchEvent(event);
    });
    await page.waitForTimeout(200);

    const types = await getBlockTypes(page);
    expect(types).toContain("heading1");
    expect(types).toContain("bulletList");
  });
});

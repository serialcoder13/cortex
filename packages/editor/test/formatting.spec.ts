import { test, expect, type Page } from "@playwright/test";

// ---- Helpers ----

function editor(page: Page) { return page.locator(".cx-editor"); }

async function getDoc(page: Page) {
  return page.evaluate(() =>
    (window as any).__editorDoc ?? (window as any).__editorRef?.getDocument?.()
  );
}

async function focusEditor(page: Page) {
  await editor(page).click();
  await page.waitForTimeout(150);
}

async function typeText(page: Page, text: string) {
  await page.keyboard.type(text, { delay: 30 });
  await page.waitForTimeout(100);
}

async function selectLast(page: Page, charCount: number) {
  for (let i = 0; i < charCount; i++) {
    await page.keyboard.press("Shift+ArrowLeft");
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(100);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  await page.waitForTimeout(200);
});

test.describe("Bold (Cmd+B)", () => {
  test("applies bold to selected text", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "hello world");
    await selectLast(page, 5); // select "world"
    await page.keyboard.press("Meta+b");
    await page.waitForTimeout(200);

    const doc = await getDoc(page);
    const spans = doc.blocks[0].content;
    const boldSpan = spans.find((s: any) => s.marks?.some((m: any) => m.type === "bold"));
    expect(boldSpan).toBeTruthy();
    expect(boldSpan.text).toBe("world");
  });

  test("toggles bold off on already-bold text", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "hello world");
    await selectLast(page, 5);
    await page.keyboard.press("Meta+b");
    await page.waitForTimeout(200);

    // Re-select "world" and toggle off
    await page.keyboard.press("End");
    await page.waitForTimeout(50);
    await selectLast(page, 5);
    await page.keyboard.press("Meta+b");
    await page.waitForTimeout(200);

    const doc = await getDoc(page);
    const spans = doc.blocks[0].content;
    const boldSpan = spans.find((s: any) => s.marks?.some((m: any) => m.type === "bold"));
    expect(boldSpan).toBeFalsy();
  });
});

test.describe("Italic (Cmd+I)", () => {
  test("applies italic to selected text", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "hello world");
    await selectLast(page, 5);
    await page.keyboard.press("Meta+i");
    await page.waitForTimeout(200);

    const doc = await getDoc(page);
    const italicSpan = doc.blocks[0].content.find(
      (s: any) => s.marks?.some((m: any) => m.type === "italic")
    );
    expect(italicSpan).toBeTruthy();
    expect(italicSpan.text).toBe("world");
  });
});

test.describe("Underline (Cmd+U)", () => {
  test("applies underline to selected text", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "hello world");
    await selectLast(page, 5);
    await page.keyboard.press("Meta+u");
    await page.waitForTimeout(200);

    const doc = await getDoc(page);
    const underlineSpan = doc.blocks[0].content.find(
      (s: any) => s.marks?.some((m: any) => m.type === "underline")
    );
    expect(underlineSpan).toBeTruthy();
  });
});

test.describe("Strikethrough (Cmd+Shift+S)", () => {
  test("applies strikethrough to selected text", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "hello world");
    await selectLast(page, 5);
    await page.keyboard.press("Meta+Shift+s");
    await page.waitForTimeout(200);

    const doc = await getDoc(page);
    const strikeSpan = doc.blocks[0].content.find(
      (s: any) => s.marks?.some((m: any) => m.type === "strikethrough")
    );
    expect(strikeSpan).toBeTruthy();
  });
});

test.describe("Code (Cmd+E)", () => {
  test("applies code mark to selected text", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "use the foo function");
    await selectLast(page, 3); // select "ion" ... actually select "foo"
    // Go back more
    await page.keyboard.press("Home");
    await page.waitForTimeout(50);
    // Select "foo" (chars 8-11)
    for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowRight");
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Shift+ArrowRight");
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(100);

    await page.keyboard.press("Meta+e");
    await page.waitForTimeout(200);

    const doc = await getDoc(page);
    const codeSpan = doc.blocks[0].content.find(
      (s: any) => s.marks?.some((m: any) => m.type === "code")
    );
    expect(codeSpan).toBeTruthy();
    expect(codeSpan.text).toBe("foo");
  });
});

test.describe("Multiple Marks", () => {
  test("can apply bold and italic to the same text", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "important text");
    await selectLast(page, 4); // select "text"
    await page.keyboard.press("Meta+b");
    await page.waitForTimeout(100);
    await selectLast(page, 4);
    await page.keyboard.press("Meta+i");
    await page.waitForTimeout(200);

    const doc = await getDoc(page);
    const biSpan = doc.blocks[0].content.find(
      (s: any) => s.marks?.some((m: any) => m.type === "bold") &&
                   s.marks?.some((m: any) => m.type === "italic")
    );
    expect(biSpan).toBeTruthy();
  });
});

test.describe("Floating Toolbar", () => {
  test("toolbar appears when text is selected", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "select me");
    await selectLast(page, 2); // select "me"

    // Toolbar should appear
    // The toolbar uses fixed positioning, look for the pill shape
    const toolbar = page.locator("button[title*='Bold']").locator("..");
    await page.waitForTimeout(300);
    // At minimum, check that Bold button is visible somewhere
    const boldBtn = page.locator("button[title*='Bold']");
    await expect(boldBtn).toBeVisible({ timeout: 2000 });
  });

  test("toolbar disappears when selection is collapsed", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "select me");
    await selectLast(page, 2);
    await page.waitForTimeout(300);

    // Collapse selection
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);

    const boldBtn = page.locator("button[title*='Bold']");
    await expect(boldBtn).toBeHidden({ timeout: 2000 });
  });
});

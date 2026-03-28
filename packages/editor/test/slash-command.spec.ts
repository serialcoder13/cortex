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

// ---- Tests ----

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  await page.waitForTimeout(200);
});

test.describe("Slash Command — Opening", () => {
  test("typing '/' at start of empty block opens the menu", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/");
    await page.waitForTimeout(300);

    const menu = page.locator("[data-testid='slash-command-menu']");
    await expect(menu).toBeVisible({ timeout: 2000 });
  });

  test("typing '/' after a space opens the menu", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "hello /");
    await page.waitForTimeout(300);

    const menu = page.locator("[data-testid='slash-command-menu']");
    await expect(menu).toBeVisible({ timeout: 2000 });
  });

  test("typing '/' in the middle of a word does NOT open the menu", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "hello/world");
    await page.waitForTimeout(300);

    const menu = page.locator("[data-testid='slash-command-menu']");
    const visible = await menu.isVisible().catch(() => false);
    // Should not be visible since "/" is between letters
    expect(visible).toBe(false);
  });

  test("Escape closes the slash menu", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/");
    await page.waitForTimeout(300);
    const menu = page.locator("[data-testid='slash-command-menu']");
    await expect(menu).toBeVisible({ timeout: 2000 });

    await pressKey(page, "Escape");
    await page.waitForTimeout(200);
    await expect(menu).toBeHidden();
  });

  test("filtering narrows the menu items", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/head");
    await page.waitForTimeout(300);

    const menu = page.locator("[data-testid='slash-command-menu']");
    await expect(menu).toBeVisible({ timeout: 2000 });

    // Should show heading-related items
    const buttons = menu.locator("button");
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(10); // filtered down from the full list
  });
});

test.describe("Slash Command — Selection", () => {
  test("selecting H1 from '/' on empty block converts to heading1 without extra block", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/");
    await page.waitForTimeout(300);

    const menu = page.locator("[data-testid='slash-command-menu']");
    await expect(menu).toBeVisible({ timeout: 2000 });

    // Type to filter to heading1
    await typeText(page, "heading 1");
    await page.waitForTimeout(200);

    // Press Enter to select
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);

    // Should have exactly 1 block of type heading1
    const types = await getBlockTypes(page);
    expect(types).toEqual(["heading1"]);

    // Should NOT have created an extra block
    const count = await getBlockCount(page);
    expect(count).toBe(1);

    // The block should be empty (slash text cleared)
    const texts = await getBlockTexts(page);
    expect(texts).toEqual([""]);
  });

  test("selecting H1 from '/' converts and allows typing", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/");
    await page.waitForTimeout(300);

    // Filter and select heading1
    await typeText(page, "heading 1");
    await page.waitForTimeout(200);
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);

    // Now type content
    await typeText(page, "My Heading");
    await page.waitForTimeout(100);

    const types = await getBlockTypes(page);
    expect(types).toEqual(["heading1"]);

    const texts = await getBlockTexts(page);
    expect(texts).toEqual(["My Heading"]);
  });

  test("selecting bullet list creates bullet block", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/bullet");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);

    const types = await getBlockTypes(page);
    expect(types).toEqual(["bulletList"]);
  });

  test("selecting code block creates code block", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/code");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);

    const types = await getBlockTypes(page);
    expect(types).toEqual(["codeBlock"]);
  });

  test("selecting quote creates quote block", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/quote");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);

    const types = await getBlockTypes(page);
    expect(types).toEqual(["quote"]);
  });

  test("clicking a slash menu item works", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/");
    await page.waitForTimeout(300);

    const menu = page.locator("[data-testid='slash-command-menu']");
    await expect(menu).toBeVisible({ timeout: 2000 });

    // Click the first button in the menu
    const firstButton = menu.locator("button").first();
    await firstButton.click();
    await page.waitForTimeout(200);

    // Menu should close
    await expect(menu).toBeHidden();

    // Should have 1 block (converted, not extra)
    const count = await getBlockCount(page);
    expect(count).toBe(1);
  });

  test("slash command after Enter on existing text creates new block of type", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "existing text");
    await pressKey(page, "Enter");
    await typeText(page, "/");
    await page.waitForTimeout(300);
    await typeText(page, "heading 1");
    await page.waitForTimeout(200);
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);

    const types = await getBlockTypes(page);
    expect(types[0]).toBe("paragraph");
    expect(types[1]).toBe("heading1");
    expect(await getBlockCount(page)).toBe(2);
  });
});

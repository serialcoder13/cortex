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

test.describe("Find (Cmd+F)", () => {
  test("Cmd+F opens the find bar", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "hello world");

    await page.keyboard.press("Meta+f");
    await page.waitForTimeout(200);

    // Find bar should have a search input
    const findInput = page.locator("input[placeholder*='Find']");
    await expect(findInput).toBeVisible({ timeout: 2000 });
  });

  test("typing in find bar shows match count", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "hello world hello");
    await pressKey(page, "Enter");
    await typeText(page, "hello again");

    await page.keyboard.press("Meta+f");
    await page.waitForTimeout(200);

    const findInput = page.locator("input[placeholder*='Find']");
    await findInput.fill("hello");
    await page.waitForTimeout(300);

    // Should show match count like "1/3"
    const countText = await page.locator("text=/\\d+\\/\\d+/").first().textContent();
    expect(countText).toContain("/");
    const [, total] = countText!.split("/");
    expect(parseInt(total!)).toBeGreaterThanOrEqual(2);
  });

  test("Escape closes the find bar", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "test");

    await page.keyboard.press("Meta+f");
    await page.waitForTimeout(200);

    const findInput = page.locator("input[placeholder*='Find']");
    await expect(findInput).toBeVisible();

    await findInput.press("Escape");
    await page.waitForTimeout(200);

    await expect(findInput).toBeHidden();
  });

  test.fixme("Enter in find bar goes to next match", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "aaa bbb aaa");

    await page.keyboard.press("Meta+f");
    await page.waitForTimeout(200);

    const findInput = page.locator("input[placeholder*='Find']");
    await findInput.fill("aaa");
    await page.waitForTimeout(500);

    // Should show match count (N/N format)
    const getCount = () => page.evaluate(() => {
      const els = document.querySelectorAll("span");
      for (const el of els) {
        if (el.textContent?.match(/\d+\/\d+/)) return el.textContent;
      }
      return null;
    });

    const countBefore = await getCount();
    expect(countBefore).toBeTruthy();
    expect(countBefore).toMatch(/\d+\/2/); // 2 matches total

    // Click the Next button (chevron down)
    const nextBtn = page.locator("button[title*='Next']");
    await expect(nextBtn).toBeVisible({ timeout: 2000 });
    await nextBtn.click({ force: true });
    await page.waitForTimeout(500);

    const countAfter = await getCount();
    expect(countAfter).toMatch(/2\/2/);
  });
});

test.describe("Find & Replace (Cmd+H)", () => {
  test("Cmd+H opens find bar with replace input", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "hello");

    await page.keyboard.press("Meta+h");
    await page.waitForTimeout(200);

    const findInput = page.locator("input[placeholder*='Find']");
    const replaceInput = page.locator("input[placeholder*='Replace']");
    await expect(findInput).toBeVisible({ timeout: 2000 });
    await expect(replaceInput).toBeVisible({ timeout: 2000 });
  });

  test("Replace button replaces the current match", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "foo bar foo");

    await page.keyboard.press("Meta+h");
    await page.waitForTimeout(200);

    const findInput = page.locator("input[placeholder*='Find']");
    const replaceInput = page.locator("input[placeholder*='Replace']");
    await findInput.fill("foo");
    await page.waitForTimeout(200);
    await replaceInput.fill("baz");
    await page.waitForTimeout(100);

    // Click Replace button
    const replaceBtn = page.locator("button", { hasText: "Replace" }).first();
    await replaceBtn.click();
    await page.waitForTimeout(200);

    const texts = await getBlockTexts(page);
    // At least one "foo" should be replaced with "baz"
    expect(texts[0]).toContain("baz");
  });

  test.fixme("Replace All button replaces all matches", async ({ page }) => {
    await page.reload();
    await page.waitForSelector(".cx-editor");
    await page.waitForTimeout(200);
    await focusEditor(page);
    await typeText(page, "foo bar foo baz foo");

    await page.keyboard.press("Meta+h");
    await page.waitForTimeout(200);

    const findInput = page.locator("input[placeholder*='Find']");
    const replaceInput = page.locator("input[placeholder*='Replace']");
    await findInput.fill("foo");
    await page.waitForTimeout(200);
    await replaceInput.fill("qux");
    await page.waitForTimeout(100);

    const allBtn = page.locator("button", { hasText: "All" });
    await allBtn.click();
    await page.waitForTimeout(200);

    const texts = await getBlockTexts(page);
    expect(texts[0]).toBe("qux bar qux baz qux");
  });
});

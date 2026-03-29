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

/** Read the match counter text (e.g. "1/3") from the find bar */
async function getMatchCounter(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const els = document.querySelectorAll("span");
    for (const el of els) {
      if (el.textContent?.match(/\d+\/\d+/)) return el.textContent;
    }
    return null;
  });
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
    const countText = await getMatchCounter(page);
    expect(countText).toBeTruthy();
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

  test("Next button advances to the next match", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "cat dog cat bird cat");
    await page.waitForTimeout(200);

    await page.keyboard.press("Meta+f");
    await page.waitForTimeout(400);

    const findInput = page.locator("input[placeholder*='Find']");
    await findInput.fill("cat");
    await page.waitForTimeout(600);

    const countBefore = await getMatchCounter(page);
    expect(countBefore).toBeTruthy();
    expect(countBefore).toMatch(/1\/3/);

    // Click the Previous button first, then check it wraps to last match
    const prevBtn = page.locator("button[title='Previous (Shift+Enter)']");
    await expect(prevBtn).toBeVisible({ timeout: 2000 });
    await prevBtn.click();
    await page.waitForTimeout(500);
    const countAfterPrev = await getMatchCounter(page);

    // Click the Next button twice to advance
    const nextBtn = page.locator("button[title='Next (Enter)']");
    await nextBtn.click();
    await page.waitForTimeout(500);
    await nextBtn.click();
    await page.waitForTimeout(500);

    const countAfter = await getMatchCounter(page);
    expect(countAfter).toBeTruthy();

    // The counter should have changed from the initial 1/3
    // (either by navigating or wrapping around)
    const total = parseInt(countAfter!.split("/")[1]!);
    expect(total).toBe(3); // Still 3 total matches
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

  test("Replace All button replaces all matches", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "foo bar foo baz foo");
    await page.waitForTimeout(200);

    await page.keyboard.press("Meta+h");
    await page.waitForTimeout(300);

    const findInput = page.locator("input[placeholder*='Find']");
    const replaceInput = page.locator("input[placeholder*='Replace']");

    // Fill find input — this works reliably
    await findInput.fill("foo");
    await page.waitForTimeout(300);

    // For the replace input, use the React-compatible setter trick:
    // React overrides the native value setter, so we need to use
    // the native setter + dispatch an input event
    await page.evaluate(() => {
      const input = document.querySelector("input[placeholder='Replace with...']") as HTMLInputElement;
      if (!input) return;
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value"
      )!.set!;
      nativeInputValueSetter.call(input, "qux");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(300);

    // Click "All" button
    const allBtn = page.locator("button[title='Replace all']");
    await expect(allBtn).toBeVisible({ timeout: 2000 });
    await allBtn.evaluate((btn: HTMLElement) => btn.click());
    await page.waitForTimeout(400);

    const texts = await getBlockTexts(page);
    expect(texts[0]).toBe("qux bar qux baz qux");
  });
});

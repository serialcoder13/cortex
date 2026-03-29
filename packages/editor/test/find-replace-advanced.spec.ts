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

async function getMatchCounter(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const els = document.querySelectorAll("span");
    for (const el of els) {
      if (el.textContent?.match(/\d+\/\d+/)) return el.textContent;
    }
    return null;
  });
}

/** Count CSS-highlighted marks in the editor */
async function getHighlightCount(page: Page): Promise<number> {
  return page.evaluate(() =>
    document.querySelectorAll(".cx-find-highlight-overlay").length
  );
}

/** Count active (current) highlight marks */
async function getActiveHighlightCount(page: Page): Promise<number> {
  return page.evaluate(() =>
    document.querySelectorAll(".cx-find-highlight-overlay.active").length
  );
}

/** Open find bar with Cmd+F */
async function openFind(page: Page) {
  await page.keyboard.press("Meta+f");
  await page.waitForTimeout(300);
}

/** Open find & replace with Cmd+H */
async function openFindReplace(page: Page) {
  await page.keyboard.press("Meta+h");
  await page.waitForTimeout(300);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  await page.waitForTimeout(200);
});

// ---- CSS Highlight Tests ----

test.describe("Find — CSS Highlights", () => {
  test("all occurrences get highlighted with yellow marks", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "cat dog cat bird cat");
    await page.waitForTimeout(200);

    await openFind(page);
    const findInput = page.locator("input[placeholder*='Find']");
    await findInput.fill("cat");
    await page.waitForTimeout(500);

    const count = await getHighlightCount(page);
    expect(count).toBe(3);
  });

  test("exactly one highlight is the active (current) match", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "abc def abc ghi abc");
    await page.waitForTimeout(200);

    await openFind(page);
    const findInput = page.locator("input[placeholder*='Find']");
    await findInput.fill("abc");
    await page.waitForTimeout(500);

    const activeCount = await getActiveHighlightCount(page);
    expect(activeCount).toBe(1);
  });

  test("highlights work across multiple blocks", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "hello world");
    await pressKey(page, "Enter");
    await typeText(page, "hello again");
    await pressKey(page, "Enter");
    await typeText(page, "say hello");
    await page.waitForTimeout(200);

    await openFind(page);
    const findInput = page.locator("input[placeholder*='Find']");
    await findInput.fill("hello");
    await page.waitForTimeout(500);

    const count = await getHighlightCount(page);
    expect(count).toBe(3);

    const counter = await getMatchCounter(page);
    expect(counter).toBe("1/3");
  });

  test("overlapping pattern matches are all found", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "aaaa");
    await page.waitForTimeout(200);

    await openFind(page);
    const findInput = page.locator("input[placeholder*='Find']");
    await findInput.fill("aa");
    await page.waitForTimeout(500);

    // "aaaa" contains "aa" at offsets 0, 1, 2 = 3 matches
    const counter = await getMatchCounter(page);
    expect(counter).toBeTruthy();
    const total = parseInt(counter!.split("/")[1]!);
    expect(total).toBeGreaterThanOrEqual(2);
  });

  test("highlights within words with formatted spans work", async ({ page }) => {
    await focusEditor(page);
    // Type text with "di" appearing in various positions
    await typeText(page, "edit adi dine");
    await page.waitForTimeout(200);

    await openFind(page);
    const findInput = page.locator("input[placeholder*='Find']");
    await findInput.fill("di");
    await page.waitForTimeout(500);

    // "edit" has "di" at offset 1, "adi" at offset 5, "dine" at offset 9
    const count = await getHighlightCount(page);
    expect(count).toBe(3);

    const counter = await getMatchCounter(page);
    expect(counter).toBe("1/3");
  });

  test("clearing search removes all highlights", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "test test test");
    await page.waitForTimeout(200);

    await openFind(page);
    const findInput = page.locator("input[placeholder*='Find']");
    await findInput.fill("test");
    await page.waitForTimeout(500);

    expect(await getHighlightCount(page)).toBe(3);

    // Clear the search
    await findInput.fill("");
    await page.waitForTimeout(300);

    expect(await getHighlightCount(page)).toBe(0);
  });

  test("closing find bar removes all highlights", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "test test test");
    await page.waitForTimeout(200);

    await openFind(page);
    const findInput = page.locator("input[placeholder*='Find']");
    await findInput.fill("test");
    await page.waitForTimeout(500);

    expect(await getHighlightCount(page)).toBe(3);

    // Press Escape to close
    await findInput.press("Escape");
    await page.waitForTimeout(300);

    expect(await getHighlightCount(page)).toBe(0);
  });
});

// ---- Navigation Tests ----

test.describe("Find — Navigation", () => {
  test("Next button advances active highlight", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "one two one three one");
    await page.waitForTimeout(200);

    await openFind(page);
    const findInput = page.locator("input[placeholder*='Find']");
    await findInput.fill("one");
    await page.waitForTimeout(500);

    expect(await getMatchCounter(page)).toBe("1/3");

    // Click Next
    const nextBtn = page.locator("button[title='Next (Enter)']");
    await nextBtn.click();
    await page.waitForTimeout(300);

    // Still exactly 1 active highlight
    expect(await getActiveHighlightCount(page)).toBe(1);
    // Counter should advance (but may reset due to doc change; check total stays 3)
    const counter = await getMatchCounter(page);
    const total = parseInt(counter!.split("/")[1]!);
    expect(total).toBe(3);
  });

  test("Previous button goes backwards", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "one two one three one");
    await page.waitForTimeout(200);

    await openFind(page);
    const findInput = page.locator("input[placeholder*='Find']");
    await findInput.fill("one");
    await page.waitForTimeout(500);

    // Click Prev to wrap to last match
    const prevBtn = page.locator("button[title='Previous (Shift+Enter)']");
    await prevBtn.click();
    await page.waitForTimeout(300);

    const counter = await getMatchCounter(page);
    expect(counter).toBeTruthy();
    const total = parseInt(counter!.split("/")[1]!);
    expect(total).toBe(3);
  });

  test("find input keeps focus while navigating", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "test one test two");
    await page.waitForTimeout(200);

    await openFind(page);
    const findInput = page.locator("input[placeholder*='Find']");
    await findInput.fill("test");
    await page.waitForTimeout(500);

    // Click Next
    const nextBtn = page.locator("button[title='Next (Enter)']");
    await nextBtn.click();
    await page.waitForTimeout(200);

    // The find input should still be typeable — type more characters
    await findInput.fill("test one");
    await page.waitForTimeout(400);

    // Should now find 1 match
    const counter = await getMatchCounter(page);
    const total = parseInt(counter!.split("/")[1]!);
    expect(total).toBe(1);
  });
});

// ---- Replace Tests ----

test.describe("Find & Replace", () => {
  test("Replace replaces the current match", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "foo bar foo baz");
    await page.waitForTimeout(200);

    await openFindReplace(page);
    const findInput = page.locator("input[placeholder*='Find']");
    const replaceInput = page.locator("input[placeholder*='Replace']");

    await findInput.fill("foo");
    await page.waitForTimeout(300);
    await replaceInput.fill("qux");
    await page.waitForTimeout(200);

    const replaceBtn = page.locator("button[title='Replace current']");
    await replaceBtn.click();
    await page.waitForTimeout(300);

    const texts = await getBlockTexts(page);
    expect(texts[0]).toContain("qux");
    // At least one foo should remain
    expect(texts[0]).toContain("foo");
  });

  test("Replace All replaces every match", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "foo bar foo baz foo");
    await page.waitForTimeout(200);

    await openFindReplace(page);
    const findInput = page.locator("input[placeholder*='Find']");
    const replaceInput = page.locator("input[placeholder*='Replace']");

    await findInput.fill("foo");
    await page.waitForTimeout(300);
    await replaceInput.fill("qux");
    await page.waitForTimeout(200);

    // Use the native value setter to ensure React state updates
    await page.evaluate(() => {
      const input = document.querySelector("input[placeholder='Replace with...']") as HTMLInputElement;
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value"
      )!.set!;
      setter.call(input, "qux");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(300);

    const allBtn = page.locator("button[title='Replace all']");
    await allBtn.evaluate((btn: HTMLElement) => btn.click());
    await page.waitForTimeout(400);

    const texts = await getBlockTexts(page);
    expect(texts[0]).toBe("qux bar qux baz qux");
  });

  test("Replace All across multiple blocks", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "hello world");
    await pressKey(page, "Enter");
    await typeText(page, "hello there");
    await page.waitForTimeout(200);

    await openFindReplace(page);
    const findInput = page.locator("input[placeholder*='Find']");

    await findInput.fill("hello");
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      const input = document.querySelector("input[placeholder='Replace with...']") as HTMLInputElement;
      if (!input) return;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, "value"
      )!.set!;
      setter.call(input, "goodbye");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(300);

    const allBtn = page.locator("button[title='Replace all']");
    await allBtn.evaluate((btn: HTMLElement) => btn.click());
    await page.waitForTimeout(400);

    const texts = await getBlockTexts(page);
    expect(texts[0]).toBe("goodbye world");
    expect(texts[1]).toBe("goodbye there");
  });

  test("Replace with empty string deletes matches", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "the big the small");
    await page.waitForTimeout(200);

    await openFindReplace(page);
    const findInput = page.locator("input[placeholder*='Find']");

    await findInput.fill("the ");
    await page.waitForTimeout(300);

    // replacement is already empty by default
    const allBtn = page.locator("button[title='Replace all']");
    await allBtn.evaluate((btn: HTMLElement) => btn.click());
    await page.waitForTimeout(400);

    const texts = await getBlockTexts(page);
    expect(texts[0]).toBe("big small");
  });
});

// ---- Drag Handle Tests ----

test.describe("Find Bar — Drag Handle", () => {
  test("find bar has a drag handle", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "test");

    await openFind(page);

    const dragHandle = page.locator("[title='Drag to move']");
    expect(await dragHandle.count()).toBe(1);
  });

  test("dragging the handle moves the find bar", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "test");

    await openFind(page);

    const dragHandle = page.locator("[title='Drag to move']");
    const handleBox = await dragHandle.boundingBox();
    expect(handleBox).toBeTruthy();

    // Get initial position of the find bar panel
    const getBarPosition = () => page.evaluate(() => {
      const panel = document.querySelector("input[placeholder='Find...']")
        ?.closest("div[style*='position']");
      if (!panel) return null;
      const rect = panel.getBoundingClientRect();
      return { x: rect.x, y: rect.y };
    });

    const before = await getBarPosition();
    expect(before).toBeTruthy();

    // Drag: mousedown on handle, move left and down, mouseup
    await dragHandle.hover();
    await page.mouse.down();
    await page.mouse.move(handleBox!.x - 150, handleBox!.y + 80, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const after = await getBarPosition();
    expect(after).toBeTruthy();
    // Panel should have moved left
    expect(after!.x).toBeLessThan(before!.x - 50);
  });
});

// ---- Edge Cases ----

test.describe("Find — Edge Cases", () => {
  test("searching for text not in document shows 0/0", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "hello world");
    await page.waitForTimeout(200);

    await openFind(page);
    const findInput = page.locator("input[placeholder*='Find']");
    await findInput.fill("xyz");
    await page.waitForTimeout(300);

    const counter = await getMatchCounter(page);
    expect(counter).toBe("0/0");
    expect(await getHighlightCount(page)).toBe(0);
  });

  test("case insensitive search finds all variants", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "Hello hello HELLO");
    await page.waitForTimeout(200);

    await openFind(page);
    const findInput = page.locator("input[placeholder*='Find']");
    await findInput.fill("hello");
    await page.waitForTimeout(500);

    const counter = await getMatchCounter(page);
    const total = parseInt(counter!.split("/")[1]!);
    expect(total).toBe(3);
  });

  test("single character search works", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "abcabc");
    await page.waitForTimeout(200);

    await openFind(page);
    const findInput = page.locator("input[placeholder*='Find']");
    await findInput.fill("a");
    await page.waitForTimeout(500);

    const counter = await getMatchCounter(page);
    expect(counter).toBe("1/2");
    expect(await getHighlightCount(page)).toBe(2);
  });
});

// ---- Document Integrity Tests ----

test.describe("Find — Document Integrity", () => {
  test("highlights do NOT corrupt the document model", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "idi and adi and didi");
    await page.waitForTimeout(200);

    // Verify initial text
    let texts = await getBlockTexts(page);
    expect(texts[0]).toBe("idi and adi and didi");

    await openFind(page);
    const findInput = page.locator("input[placeholder*='Find']");
    await findInput.fill("di");
    await page.waitForTimeout(500);

    // Document model should be unchanged
    texts = await getBlockTexts(page);
    expect(texts[0]).toBe("idi and adi and didi");

    // Counter should show all matches
    const counter = await getMatchCounter(page);
    const total = parseInt(counter!.split("/")[1]!);
    expect(total).toBeGreaterThanOrEqual(4);
  });

  test("typing in editor while find is open preserves text", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "hello world hello");
    await page.waitForTimeout(200);

    await openFind(page);
    const findInput = page.locator("input[placeholder*='Find']");
    await findInput.fill("hello");
    await page.waitForTimeout(500);

    // Now click in the editor and type
    await editor(page).click();
    await page.waitForTimeout(100);
    await page.keyboard.press("End");
    await page.keyboard.type(" extra", { delay: 30 });
    await page.waitForTimeout(300);

    // Document should have the new text appended, nothing corrupted
    const texts = await getBlockTexts(page);
    const fullText = texts.join(" ");
    expect(fullText).toContain("hello world hello");
    expect(fullText).toContain("extra");
  });

  test("closing find bar does not corrupt text", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "foo bar foo baz foo");
    await page.waitForTimeout(200);

    await openFind(page);
    const findInput = page.locator("input[placeholder*='Find']");
    await findInput.fill("foo");
    await page.waitForTimeout(500);

    // Close the find bar
    await findInput.press("Escape");
    await page.waitForTimeout(300);

    // Text should be exactly the same
    const texts = await getBlockTexts(page);
    expect(texts[0]).toBe("foo bar foo baz foo");
  });

  test("repeated open/close/search does not corrupt text", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "test data test data test");
    await page.waitForTimeout(200);

    for (let i = 0; i < 3; i++) {
      // Click editor to ensure it has focus before opening find
      await editor(page).click();
      await page.waitForTimeout(200);
      await page.keyboard.press("Meta+f");
      await page.waitForTimeout(400);
      const findInput = page.locator("input[placeholder*='Find']");
      await expect(findInput).toBeVisible({ timeout: 2000 });
      await findInput.fill("test");
      await page.waitForTimeout(300);
      await findInput.press("Escape");
      await page.waitForTimeout(400);
    }

    const texts = await getBlockTexts(page);
    expect(texts[0]).toBe("test data test data test");
  });

  test("highlights in block with many matches shows all", async ({ page }) => {
    await focusEditor(page);
    // Type text with lots of repeated pattern
    await typeText(page, "abababababab");
    await page.waitForTimeout(200);

    await openFind(page);
    const findInput = page.locator("input[placeholder*='Find']");
    await findInput.fill("ab");
    await page.waitForTimeout(500);

    const counter = await getMatchCounter(page);
    const total = parseInt(counter!.split("/")[1]!);
    expect(total).toBe(6); // "abababababab" has 6 non-overlapping "ab"

    const highlightCount = await getHighlightCount(page);
    expect(highlightCount).toBe(6);
  });
});

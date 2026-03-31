import { test, expect, type Page } from "@playwright/test";

function editor(page: Page) {
  return page.locator(".cx-editor");
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

/** Get the active element info inside the editor */
async function getActiveElementInfo(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!active) return { tag: "none", dataset: {}, textContent: "" };
    return {
      tag: active.tagName.toLowerCase(),
      dataset: { ...((active as HTMLElement).dataset ?? {}) },
      textContent: active.textContent ?? "",
      contentEditable: (active as HTMLElement).contentEditable,
      closestListBlock: !!(active as HTMLElement).closest?.("[data-list-block]"),
      closestListItemId: (active as HTMLElement).closest?.("[data-list-item-id]")?.getAttribute("data-list-item-id") ?? null,
    };
  });
}

/** Get all list item texts from the list block */
async function getListItemTexts(page: Page) {
  return page.evaluate(() => {
    const items = document.querySelectorAll("[data-list-block] [data-list-item-id]");
    return Array.from(items).map((el) => {
      const content = el.querySelector("[data-content]");
      return content?.textContent ?? "";
    });
  });
}

/** Get the count of list items */
async function getListItemCount(page: Page) {
  return page.evaluate(() => {
    return document.querySelectorAll("[data-list-block] [data-list-item-id]").length;
  });
}

/** Get the total block count in the editor */
async function getBlockCount(page: Page) {
  return page.evaluate(() => {
    return document.querySelectorAll(".cx-editor [data-block-id]").length;
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  await page.waitForTimeout(200);
});

test.describe("List Block — Focus on Creation", () => {
  test("slash command creates list and focuses first item", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/bullet");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(500);

    const info = await getActiveElementInfo(page);
    expect(info.closestListBlock).toBe(true);
    expect(info.contentEditable).toBe("true");
  });

  test("markdown shortcut '- ' creates list and focuses first item", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "- ");
    await page.waitForTimeout(500);

    // The block should have become a list
    const listBlock = page.locator("[data-list-block]");
    await expect(listBlock).toBeVisible();

    const info = await getActiveElementInfo(page);
    expect(info.closestListBlock).toBe(true);
  });
});

test.describe("List Block — Focus on Enter", () => {
  test("Enter creates new item and focuses it", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/bullet");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(500);

    // Type in first item
    await typeText(page, "First item");
    await page.waitForTimeout(100);

    // Press Enter to create second item
    await pressKey(page, "Enter");
    await page.waitForTimeout(500);

    // Should now have 2 items
    const count = await getListItemCount(page);
    expect(count).toBe(2);

    // Focus should be inside the list block on the NEW item
    const info = await getActiveElementInfo(page);
    expect(info.closestListBlock).toBe(true);
    expect(info.contentEditable).toBe("true");
    // The active element should be empty (the new item)
    expect(info.textContent).toBe("");
  });

  test("Enter does NOT create extra blocks outside the list", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/bullet");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(500);

    const blocksBefore = await getBlockCount(page);

    await typeText(page, "Hello");
    await pressKey(page, "Enter");
    await page.waitForTimeout(500);

    const blocksAfter = await getBlockCount(page);
    // Should still be the same number of top-level blocks
    // (list block manages items internally, no new blocks should be created)
    expect(blocksAfter).toBe(blocksBefore);
  });

  test("multiple Enters create multiple items, all focused correctly", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/bullet");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(500);

    await typeText(page, "One");
    await pressKey(page, "Enter");
    await page.waitForTimeout(300);

    await typeText(page, "Two");
    await pressKey(page, "Enter");
    await page.waitForTimeout(300);

    await typeText(page, "Three");
    await page.waitForTimeout(200);

    const texts = await getListItemTexts(page);
    expect(texts).toEqual(["One", "Two", "Three"]);

    // Focus should still be in the list
    const info = await getActiveElementInfo(page);
    expect(info.closestListBlock).toBe(true);
  });

  test("Enter splits text at cursor position", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/bullet");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(500);

    await typeText(page, "HelloWorld");
    await page.waitForTimeout(200);
    // Move cursor back 5 characters to between "Hello" and "World"
    for (let i = 0; i < 5; i++) {
      await pressKey(page, "ArrowLeft");
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(200);
    await pressKey(page, "Enter");
    await page.waitForTimeout(500);

    const texts = await getListItemTexts(page);
    expect(texts).toEqual(["Hello", "World"]);

    // Focus should be on "World" (the second item)
    const info = await getActiveElementInfo(page);
    expect(info.closestListBlock).toBe(true);
    expect(info.textContent).toBe("World");
  });
});

test.describe("List Block — Tab/Backspace Focus", () => {
  test("Tab indents and keeps focus", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/bullet");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(500);

    await typeText(page, "Parent");
    await pressKey(page, "Enter");
    await page.waitForTimeout(300);
    await typeText(page, "Child");

    // Tab to indent
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    const info = await getActiveElementInfo(page);
    expect(info.closestListBlock).toBe(true);
    expect(info.textContent).toBe("Child");
  });

  test("Backspace at start merges with previous item and keeps focus", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/bullet");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(500);

    await typeText(page, "First");
    await pressKey(page, "Enter");
    await page.waitForTimeout(300);
    await typeText(page, "Second");

    // Move to start of "Second"
    await pressKey(page, "Home");
    await page.waitForTimeout(100);
    await pressKey(page, "Backspace");
    await page.waitForTimeout(500);

    const texts = await getListItemTexts(page);
    expect(texts).toEqual(["FirstSecond"]);

    const info = await getActiveElementInfo(page);
    expect(info.closestListBlock).toBe(true);
  });
});

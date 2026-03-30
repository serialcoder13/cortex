import { test, expect, type Page } from "@playwright/test";

function editor(page: Page) {
  return page.locator(".cx-editor");
}

async function getDoc(page: Page) {
  return page.evaluate(
    () =>
      (window as any).__editorDoc ??
      (window as any).__editorRef?.getDocument?.(),
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

async function pressKey(page: Page, key: string) {
  await page.keyboard.press(key);
  await page.waitForTimeout(100);
}

/** Create a list block via slash command */
async function createListBlock(page: Page) {
  await focusEditor(page);
  await typeText(page, "/nestable");
  await page.waitForTimeout(300);
  await pressKey(page, "Enter");
  await page.waitForTimeout(500);
}

/** Get the list block props */
async function getListProps(page: Page) {
  const doc = await getDoc(page);
  const listBlock = doc?.blocks?.find((b: any) => b.type === "list");
  return listBlock?.props ?? null;
}

/** Get the list items from props */
async function getListItems(page: Page): Promise<any[]> {
  const props = await getListProps(page);
  return props?.listItems ?? [];
}

/** Click on a list item by its index (0-based) */
async function clickListItem(page: Page, index: number) {
  const items = page.locator("[data-list-item-id] [data-content]");
  await items.nth(index).click();
  await page.waitForTimeout(150);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  await page.waitForTimeout(200);
});

// ----------------------------------------------------------
// 1. Creation
// ----------------------------------------------------------

test.describe("List Block — Creation", () => {
  test("slash command /list creates a list block", async ({ page }) => {
    await createListBlock(page);

    const doc = await getDoc(page);
    const listBlock = doc.blocks.find((b: any) => b.type === "list");
    expect(listBlock).toBeDefined();
    expect(listBlock.props.listItems).toBeDefined();
    expect(listBlock.props.listItems.length).toBe(1);
  });

  test("list block renders with a bullet marker", async ({ page }) => {
    await createListBlock(page);

    const marker = page.locator("[data-list-block] span[contenteditable='false']");
    await expect(marker.first()).toBeVisible();
    const text = await marker.first().textContent();
    expect(text?.trim()).toBeTruthy();
  });

  test("can type in the list item", async ({ page }) => {
    await createListBlock(page);

    // Click the first item's editable area
    await clickListItem(page, 0);
    await typeText(page, "Hello world");
    // Blur to commit — click outside the list block
    await page.click("h2");
    await page.waitForTimeout(300);

    const items = await getListItems(page);
    expect(items[0].content[0].text).toBe("Hello world");
  });
});

// ----------------------------------------------------------
// 2. Enter key — add items
// ----------------------------------------------------------

test.describe("List Block — Enter Key", () => {
  test("Enter creates a new item after current", async ({ page }) => {
    await createListBlock(page);
    await clickListItem(page, 0);
    await typeText(page, "First");
    await pressKey(page, "Enter");
    await page.waitForTimeout(300);

    const items = await getListItems(page);
    expect(items.length).toBe(2);
    expect(items[0].content[0].text).toBe("First");
    expect(items[1].content[0].text).toBe("");
  });

  test("Enter splits text at cursor position", async ({ page }) => {
    await createListBlock(page);
    await clickListItem(page, 0);
    await typeText(page, "Hello");
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);
    await typeText(page, "World");
    await page.click("h2");
    await page.waitForTimeout(300);

    const items = await getListItems(page);
    expect(items.length).toBe(2);
    expect(items[0].content[0].text).toBe("Hello");
    expect(items[1].content[0].text).toBe("World");
  });

  test("Enter on empty item at indent 0 exits list", async ({ page }) => {
    await createListBlock(page);
    await clickListItem(page, 0);
    // Don't type anything — item is empty
    await pressKey(page, "Enter");
    await page.waitForTimeout(300);

    // Should convert to paragraph
    const doc = await getDoc(page);
    expect(doc.blocks[0].type).toBe("paragraph");
  });

  test("can create multiple items", async ({ page }) => {
    await createListBlock(page);
    await clickListItem(page, 0);
    await typeText(page, "One");
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);
    await typeText(page, "Two");
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);
    await typeText(page, "Three");
    // Blur to commit last item
    await page.click("h2");
    await page.waitForTimeout(300);

    const items = await getListItems(page);
    expect(items.length).toBe(3);
    expect(items[0].content[0].text).toBe("One");
    expect(items[1].content[0].text).toBe("Two");
    expect(items[2].content[0].text).toBe("Three");
  });
});

// ----------------------------------------------------------
// 3. Tab / Shift+Tab — indent / outdent
// ----------------------------------------------------------

test.describe("List Block — Tab Indent / Shift+Tab Outdent", () => {
  test("Tab on second item indents it", async ({ page }) => {
    await createListBlock(page);
    await clickListItem(page, 0);
    await typeText(page, "Parent");
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);
    await typeText(page, "Child");
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    const items = await getListItems(page);
    expect(items[0].indent).toBe(0);
    expect(items[1].indent).toBe(1);
  });

  test("Tab on first item does nothing", async ({ page }) => {
    await createListBlock(page);
    await clickListItem(page, 0);
    await typeText(page, "First");
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    const items = await getListItems(page);
    expect(items[0].indent).toBe(0);
  });

  test("Shift+Tab on indented item outdents it", async ({ page }) => {
    await createListBlock(page);
    await clickListItem(page, 0);
    await typeText(page, "Parent");
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);
    await typeText(page, "Child");
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    // Verify indented
    let items = await getListItems(page);
    expect(items[1].indent).toBe(1);

    // Now outdent
    await page.keyboard.press("Shift+Tab");
    await page.waitForTimeout(300);

    items = await getListItems(page);
    expect(items[1].indent).toBe(0);
  });

  test("can create 3 levels of nesting", async ({ page }) => {
    await createListBlock(page);
    await clickListItem(page, 0);
    await typeText(page, "Level 0");
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);
    await typeText(page, "Level 1");
    await pressKey(page, "Tab");
    await page.waitForTimeout(200);
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);
    await typeText(page, "Level 2");
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    const items = await getListItems(page);
    expect(items.length).toBe(3);
    expect(items[0].indent).toBe(0);
    expect(items[1].indent).toBe(1);
    expect(items[2].indent).toBe(2);
  });

  test("Enter on empty indented item outdents instead of creating new", async ({
    page,
  }) => {
    await createListBlock(page);
    await clickListItem(page, 0);
    await typeText(page, "Parent");
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);
    await typeText(page, "Child");
    await pressKey(page, "Tab");
    await pressKey(page, "Enter");
    // Now on empty item at indent 1 — Enter should outdent
    await pressKey(page, "Enter");
    await page.waitForTimeout(300);

    const items = await getListItems(page);
    // The empty item should now be at indent 0
    const lastItem = items[items.length - 1];
    expect(lastItem.indent).toBe(0);
  });
});

// ----------------------------------------------------------
// 4. Backspace
// ----------------------------------------------------------

test.describe("List Block — Backspace", () => {
  test("Backspace at start of indented item outdents it", async ({ page }) => {
    await createListBlock(page);
    await clickListItem(page, 0);
    await typeText(page, "Parent");
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);
    await typeText(page, "Child");
    await pressKey(page, "Tab");
    await page.waitForTimeout(200);

    // Move to start
    await pressKey(page, "Home");
    await pressKey(page, "Backspace");
    await page.waitForTimeout(300);

    const items = await getListItems(page);
    expect(items[1].indent).toBe(0);
  });

  test("Backspace merges with previous item when at indent 0", async ({
    page,
  }) => {
    await createListBlock(page);
    await clickListItem(page, 0);
    await typeText(page, "First");
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);
    await typeText(page, "Second");
    await page.waitForTimeout(200);

    // Move to start of second item
    await pressKey(page, "Home");
    await pressKey(page, "Backspace");
    await page.waitForTimeout(300);

    const items = await getListItems(page);
    expect(items.length).toBe(1);
    expect(items[0].content[0].text).toBe("FirstSecond");
  });
});

// ----------------------------------------------------------
// 5. Rendering
// ----------------------------------------------------------

test.describe("List Block — Rendering", () => {
  test("indented items are visually shifted right", async ({ page }) => {
    await createListBlock(page);
    await clickListItem(page, 0);
    await typeText(page, "Parent");
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);
    await typeText(page, "Child");
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    // Check that the child marker has extra marginLeft
    const markers = page.locator(
      "[data-list-block] span[contenteditable='false']",
    );
    const parentML = await markers.nth(0).evaluate(
      (el) => parseFloat((el as HTMLElement).style.marginLeft || "0"),
    );
    const childML = await markers.nth(1).evaluate(
      (el) => parseFloat((el as HTMLElement).style.marginLeft || "0"),
    );
    expect(childML).toBeGreaterThan(parentML);
  });

  test("nested items have different bullet styles by default", async ({
    page,
  }) => {
    await createListBlock(page);
    await clickListItem(page, 0);
    await typeText(page, "Level 0");
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);
    await typeText(page, "Level 1");
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    const markers = page.locator(
      "[data-list-block] span[contenteditable='false']",
    );
    const parentBullet = (await markers.nth(0).textContent())?.trim();
    const childBullet = (await markers.nth(1).textContent())?.trim();

    // Default: level 0 = disc (•), level 1 = circle (◦)
    expect(parentBullet).toBe("•");
    expect(childBullet).toBe("◦");
  });
});

// ----------------------------------------------------------
// 6. It is a SINGLE block
// ----------------------------------------------------------

test.describe("List Block — Single Block Architecture", () => {
  test("entire list is one block in the document", async ({ page }) => {
    await createListBlock(page);
    await clickListItem(page, 0);
    await typeText(page, "One");
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);
    await typeText(page, "Two");
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);
    await typeText(page, "Three");
    await page.waitForTimeout(300);

    const doc = await getDoc(page);
    const listBlocks = doc.blocks.filter((b: any) => b.type === "list");
    expect(listBlocks.length).toBe(1);
    expect(listBlocks[0].props.listItems.length).toBe(3);
  });

  test("markdown serializes all items as one list", async ({ page }) => {
    await createListBlock(page);
    await clickListItem(page, 0);
    await typeText(page, "Alpha");
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);
    await typeText(page, "Beta");
    await pressKey(page, "Tab");
    await page.waitForTimeout(200);
    // Blur to commit all text
    await page.click("h2");
    await page.waitForTimeout(500);

    // Click Markdown tab to ensure it's shown
    const mdTab = page.getByText("Markdown", { exact: true });
    if (await mdTab.isVisible()) await mdTab.click();
    await page.waitForTimeout(300);

    // Check markdown output in the debug panel
    const mdOutput = await page.evaluate(() => {
      const el = document.querySelector(".cx-editor-container");
      if (!el) return "";
      // Look for pre elements or text in the debug panel area
      const allText = el.textContent || "";
      return allText;
    });

    expect(mdOutput).toContain("- Alpha");
    expect(mdOutput).toContain("- Beta");
  });
});

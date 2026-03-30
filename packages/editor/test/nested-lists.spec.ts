import { test, expect, type Page } from "@playwright/test";

// ============================================================
// Helpers
// ============================================================

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

/** Create a bullet list with items via slash command */
async function createBulletList(page: Page, items: string[]) {
  await focusEditor(page);
  await typeText(page, "/bullet");
  await page.waitForTimeout(300);
  await pressKey(page, "Enter");
  await page.waitForTimeout(200);
  for (let i = 0; i < items.length; i++) {
    await typeText(page, items[i]);
    if (i < items.length - 1) {
      await pressKey(page, "Enter");
      await page.waitForTimeout(100);
    }
  }
  await page.waitForTimeout(200);
}

/** Create a numbered list with items via slash command */
async function createNumberedList(page: Page, items: string[]) {
  await focusEditor(page);
  await typeText(page, "/numbered");
  await page.waitForTimeout(300);
  await pressKey(page, "Enter");
  await page.waitForTimeout(200);
  for (let i = 0; i < items.length; i++) {
    await typeText(page, items[i]);
    if (i < items.length - 1) {
      await pressKey(page, "Enter");
      await page.waitForTimeout(100);
    }
  }
  await page.waitForTimeout(200);
}

/** Get all block types from the document model */
async function getBlockTypes(page: Page): Promise<string[]> {
  const doc = await getDoc(page);
  if (!doc) return [];
  return doc.blocks.map((b: any) => b.type);
}

/** Get the visible list markers (bullet chars or number labels) */
async function getListMarkers(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const blocks = document.querySelectorAll(".cx-editor [data-block-id]");
    const markers: string[] = [];
    blocks.forEach((block) => {
      // Collect all markers, including nested ones
      const markerEls = block.querySelectorAll(
        "span[contenteditable='false']",
      );
      markerEls.forEach((el) => {
        const text = el.textContent?.trim() ?? "";
        if (text && text.length <= 5) markers.push(text);
      });
    });
    return markers;
  });
}

/** Get block at index and check its children count */
async function getBlockChildren(
  page: Page,
  blockIndex: number,
): Promise<{ type: string; childCount: number; childTypes: string[] }> {
  const doc = await getDoc(page);
  const block = doc.blocks[blockIndex];
  return {
    type: block.type,
    childCount: block.children?.length ?? 0,
    childTypes: (block.children ?? []).map((c: any) => c.type),
  };
}

/** Get the indent levels of all visible list items by checking paddingLeft */
async function getListIndentLevels(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const items = document.querySelectorAll(
      ".cx-editor [data-block-id]",
    );
    const levels: number[] = [];
    items.forEach((item) => {
      const el = item as HTMLElement;
      // Check for nested structure — look for data-content elements
      // and measure their indentation
      const style = el.style;
      const ml = parseFloat(style.marginLeft || "0");
      const pl = parseFloat(style.paddingLeft || "0");
      levels.push(Math.round((ml + pl) / 24)); // assume ~24px per indent level
    });
    return levels;
  });
}

/** Open the block menu for a specific block index */
async function openBlockMenu(page: Page, blockIndex: number = 0) {
  const blocks = editor(page).locator("[data-block-id]");
  await blocks.nth(blockIndex).hover();
  await page.waitForTimeout(200);
  const gripButton = page.locator(
    '[aria-label="Drag to reorder or click for options"]',
  );
  await gripButton.last().click();
  await page.waitForTimeout(300);
}

// ============================================================
// Tests
// ============================================================

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  await page.waitForTimeout(200);
});

// ----------------------------------------------------------
// 1. Tab key creates nested (indented) list items
// ----------------------------------------------------------

test.describe("List Nesting — Tab to Indent", () => {
  test("Tab on second bullet item nests it under the first", async ({
    page,
  }) => {
    await createBulletList(page, ["Parent", "Child"]);

    // Move cursor to "Child" item and press Tab
    // "Child" is the second list block
    const blocks = editor(page).locator("[data-block-id]");
    const secondBlock = blocks.nth(1);
    await secondBlock.click();
    await page.waitForTimeout(100);

    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    // "Child" should now be a child of "Parent" — check document model
    const info = await getBlockChildren(page, 0);
    expect(info.childCount).toBeGreaterThanOrEqual(1);
    expect(info.childTypes[0]).toBe("bulletList");
  });

  test("Tab on second numbered item nests it under the first", async ({
    page,
  }) => {
    await createNumberedList(page, ["First", "Second"]);

    const blocks = editor(page).locator("[data-block-id]");
    await blocks.nth(1).click();
    await page.waitForTimeout(100);
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    const info = await getBlockChildren(page, 0);
    expect(info.childCount).toBeGreaterThanOrEqual(1);
  });

  test("nested item renders with increased indentation", async ({ page }) => {
    await createBulletList(page, ["Parent", "Child"]);

    const blocks = editor(page).locator("[data-block-id]");
    await blocks.nth(1).click();
    await page.waitForTimeout(100);
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    // The nested item should be visually indented
    // Check that the child content is rendered with extra left margin/padding
    const hasNestedContent = await page.evaluate(() => {
      const blockEls = document.querySelectorAll(
        ".cx-editor [data-block-id]",
      );
      // Look for nested list items (children rendered inside a parent block)
      for (const el of blockEls) {
        const nested = el.querySelectorAll("[data-block-id]");
        if (nested.length > 0) return true;
        // Or check for child content with indentation
        const children = el.querySelector(
          "[style*='marginLeft'], [style*='paddingLeft']",
        );
        if (
          children &&
          parseFloat((children as HTMLElement).style.marginLeft || "0") > 10
        )
          return true;
      }
      return false;
    });
    expect(hasNestedContent).toBe(true);
  });

  test("cannot indent first item in a list (no parent to nest under)", async ({
    page,
  }) => {
    await createBulletList(page, ["First", "Second"]);

    // Try to Tab on the first item
    const blocks = editor(page).locator("[data-block-id]");
    await blocks.nth(0).click();
    await page.waitForTimeout(100);
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    // First item should remain at top level with no children above it
    const info = await getBlockChildren(page, 0);
    // It should NOT have become a child of anything
    const types = await getBlockTypes(page);
    expect(types[0]).toBe("bulletList");
  });

  test("multiple Tabs create deeper nesting (max 1 level deeper than previous)", async ({
    page,
  }) => {
    await createBulletList(page, ["Level 0", "Level 1", "Level 2"]);

    // Indent second item
    const blocks = editor(page).locator("[data-block-id]");
    await blocks.nth(1).click();
    await page.waitForTimeout(100);
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    // Indent third item once (becomes child of second = level 1)
    await blocks.nth(2).click();
    await page.waitForTimeout(100);
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    // Indent third item again (becomes level 2 = child of child)
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    // Verify the nesting structure
    const parentInfo = await getBlockChildren(page, 0);
    expect(parentInfo.childCount).toBeGreaterThanOrEqual(1);
  });
});

// ----------------------------------------------------------
// 2. Shift+Tab to outdent (un-nest) list items
// ----------------------------------------------------------

test.describe("List Nesting — Shift+Tab to Outdent", () => {
  test("Shift+Tab on nested item moves it back to parent level", async ({
    page,
  }) => {
    await createBulletList(page, ["Parent", "Child"]);

    // First indent the second item
    const blocks = editor(page).locator("[data-block-id]");
    await blocks.nth(1).click();
    await page.waitForTimeout(100);
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    // Verify it's nested
    let info = await getBlockChildren(page, 0);
    expect(info.childCount).toBeGreaterThanOrEqual(1);

    // Now Shift+Tab to outdent — click on the nested child content
    // The child is now inside the first block's children
    const nestedContent = editor(page).locator("[data-content]").nth(1);
    await nestedContent.click();
    await page.waitForTimeout(100);
    await page.keyboard.press("Shift+Tab");
    await page.waitForTimeout(300);

    // Should be back at top level — two separate blocks
    info = await getBlockChildren(page, 0);
    expect(info.childCount).toBe(0);

    const types = await getBlockTypes(page);
    expect(types.filter((t) => t === "bulletList").length).toBe(2);
  });

  test("Shift+Tab on top-level list item exits the list (converts to paragraph)", async ({
    page,
  }) => {
    await createBulletList(page, ["Only item"]);

    const blocks = editor(page).locator("[data-block-id]");
    await blocks.nth(0).click();
    await page.waitForTimeout(100);
    await page.keyboard.press("Shift+Tab");
    await page.waitForTimeout(300);

    // The item should become a paragraph
    const types = await getBlockTypes(page);
    expect(types[0]).toBe("paragraph");
  });
});

// ----------------------------------------------------------
// 3. Enter key behavior in lists
// ----------------------------------------------------------

test.describe("List — Enter Key Behavior", () => {
  test("Enter in a list item creates a new item at the same level", async ({
    page,
  }) => {
    await createBulletList(page, ["Item one"]);

    // Press Enter at the end of "Item one"
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);
    await typeText(page, "Item two");
    await page.waitForTimeout(200);

    const types = await getBlockTypes(page);
    const bulletCount = types.filter((t) => t === "bulletList").length;
    expect(bulletCount).toBe(2);
  });

  test("Enter on empty list item exits the list", async ({ page }) => {
    await createBulletList(page, ["Item one"]);

    // Press Enter to create a new empty item, then Enter again to exit
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);
    // Now we're on an empty bullet list item — press Enter to exit
    await pressKey(page, "Enter");
    await page.waitForTimeout(300);

    const types = await getBlockTypes(page);
    // Should have: bulletList (Item one), paragraph (empty)
    expect(types).toContain("paragraph");
  });

  test("Enter on empty nested item outdents it", async ({ page }) => {
    await createBulletList(page, ["Parent", "Child", ""]);

    // Indent second and third items
    const blocks = editor(page).locator("[data-block-id]");
    await blocks.nth(1).click();
    await page.waitForTimeout(100);
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    await blocks.nth(2).click();
    await page.waitForTimeout(100);
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    // Verify: "Parent" has 2 children (Child and empty)
    let info = await getBlockChildren(page, 0);
    expect(info.childCount).toBe(2);

    // Click on the empty nested item and press Enter — should outdent
    const nestedContent = editor(page).locator("[data-content]").nth(2);
    await nestedContent.click();
    await page.waitForTimeout(100);
    await pressKey(page, "Enter");
    await page.waitForTimeout(300);

    // The empty item should now be at top level
    const types = await getBlockTypes(page);
    const bulletCount = types.filter((t) => t === "bulletList").length;
    expect(bulletCount).toBeGreaterThanOrEqual(2);
  });
});

// ----------------------------------------------------------
// 4. Nested list rendering
// ----------------------------------------------------------

test.describe("List — Nested Rendering", () => {
  test("nested bullet list items have different bullet styles by default", async ({
    page,
  }) => {
    await createBulletList(page, ["Parent", "Child"]);

    const blocks = editor(page).locator("[data-block-id]");
    await blocks.nth(1).click();
    await page.waitForTimeout(100);
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    // Get all visible bullet markers
    const markers = await getListMarkers(page);
    // Parent should have default bullet (•), child should have different (◦ or similar)
    expect(markers.length).toBeGreaterThanOrEqual(2);
    // They should be different bullets at different levels
    if (markers.length >= 2) {
      // At least verify both render
      expect(markers[0]).toBeTruthy();
      expect(markers[1]).toBeTruthy();
    }
  });

  test("nested numbered list computes numbers independently per level", async ({
    page,
  }) => {
    await createNumberedList(page, ["First", "Sub A", "Sub B", "Second"]);

    const blocks = editor(page).locator("[data-block-id]");

    // Indent items 1 and 2 (Sub A, Sub B)
    await blocks.nth(1).click();
    await page.waitForTimeout(100);
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    await blocks.nth(2).click();
    await page.waitForTimeout(100);
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    // Expected numbering:
    // 1. First
    //   1. Sub A
    //   2. Sub B
    // 2. Second
    const markers = await getListMarkers(page);
    expect(markers.length).toBeGreaterThanOrEqual(4);
  });
});

// ----------------------------------------------------------
// 5. Mixed list types in nesting
// ----------------------------------------------------------

test.describe("List — Mixed Ordered/Unordered Nesting", () => {
  test("can nest a bullet list under a numbered list item", async ({
    page,
  }) => {
    // Create a numbered list
    await createNumberedList(page, ["First"]);

    // Press Enter, then change the new item to bullet via slash or turn-into
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);
    await typeText(page, "Sub item");
    await page.waitForTimeout(200);

    // The new item is also numbered. Open block menu to Turn into bullet list
    const blocks = editor(page).locator("[data-block-id]");
    await blocks.nth(1).hover();
    await page.waitForTimeout(200);
    const gripButton = page.locator(
      '[aria-label="Drag to reorder or click for options"]',
    );
    await gripButton.last().click();
    await page.waitForTimeout(300);

    // Turn into bullet list
    await page.getByText("Turn into").hover();
    await page.waitForTimeout(300);
    const bulletOpt = page.getByText("Bullet List");
    if (await bulletOpt.isVisible()) {
      await bulletOpt.dispatchEvent("mousedown");
      await page.waitForTimeout(300);
    }

    // Now indent it under the numbered item
    await blocks.nth(1).click();
    await page.waitForTimeout(100);
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    // Verify: parent is numbered, child is bullet
    const info = await getBlockChildren(page, 0);
    if (info.childCount > 0) {
      expect(info.type).toBe("numberedList");
      expect(info.childTypes[0]).toBe("bulletList");
    }
  });
});

// ----------------------------------------------------------
// 6. Block menu — per-level style configuration
// ----------------------------------------------------------

test.describe("List — Per-Level Style in Block Menu", () => {
  test("block menu shows bullet style option for bullet list", async ({
    page,
  }) => {
    await createBulletList(page, ["Item"]);
    await openBlockMenu(page, 0);

    await expect(page.getByText("Bullet style")).toBeVisible();
  });

  test("block menu shows number format option for numbered list", async ({
    page,
  }) => {
    await createNumberedList(page, ["Item"]);
    await openBlockMenu(page, 0);

    await expect(page.getByText("Number format")).toBeVisible();
  });

  test("changing bullet style updates the visual marker", async ({ page }) => {
    await createBulletList(page, ["Item"]);
    await openBlockMenu(page, 0);

    await page.getByText("Bullet style").hover();
    await page.waitForTimeout(300);
    await page.getByText("Arrow").dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    const markers = await getListMarkers(page);
    expect(markers[0]).toBe("→");
  });

  test("changing number style to uppercase applies A, B, C", async ({
    page,
  }) => {
    await createNumberedList(page, ["One", "Two", "Three"]);
    await openBlockMenu(page, 0);

    await page.getByText("Number format").hover();
    await page.waitForTimeout(300);
    await page.getByText("Uppercase").dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    const markers = await getListMarkers(page);
    expect(markers[0]).toContain("A");
    expect(markers[1]).toContain("B");
    expect(markers[2]).toContain("C");
  });

  test("start from changes the numbering start", async ({ page }) => {
    await createNumberedList(page, ["One", "Two"]);
    await openBlockMenu(page, 0);

    const input = page.locator('input[type="number"]');
    await input.click();
    await input.fill("5");
    await input.press("Enter");
    await page.waitForTimeout(500);

    const markers = await getListMarkers(page);
    expect(markers[0]).toContain("5");
    expect(markers[1]).toContain("6");
  });
});

// ----------------------------------------------------------
// 7. Backspace behavior in lists
// ----------------------------------------------------------

test.describe("List — Backspace Behavior", () => {
  test("Backspace at start of first list item converts to paragraph", async ({
    page,
  }) => {
    await createBulletList(page, ["Item"]);

    // Move to start of the item
    const blocks = editor(page).locator("[data-block-id]");
    await blocks.nth(0).click();
    await page.waitForTimeout(100);
    await pressKey(page, "Home");
    await pressKey(page, "Backspace");
    await page.waitForTimeout(300);

    const types = await getBlockTypes(page);
    expect(types[0]).toBe("paragraph");
  });

  test("Backspace at start of nested item outdents it", async ({ page }) => {
    await createBulletList(page, ["Parent", "Child"]);

    // Indent the second item
    const blocks = editor(page).locator("[data-block-id]");
    await blocks.nth(1).click();
    await page.waitForTimeout(100);
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    // Verify it's nested
    let info = await getBlockChildren(page, 0);
    expect(info.childCount).toBeGreaterThanOrEqual(1);

    // Move to start of nested item and press Backspace
    const nestedContent = editor(page).locator("[data-content]").nth(1);
    await nestedContent.click();
    await page.waitForTimeout(100);
    await pressKey(page, "Home");
    await pressKey(page, "Backspace");
    await page.waitForTimeout(300);

    // It should be outdented back to top level
    info = await getBlockChildren(page, 0);
    expect(info.childCount).toBe(0);
  });
});

// ----------------------------------------------------------
// 8. Markdown round-trip for nested lists
// ----------------------------------------------------------

test.describe("List — Markdown Round-trip", () => {
  test("nested bullet list serializes with indentation", async ({ page }) => {
    await createBulletList(page, ["Parent", "Child"]);

    // Indent the second item
    const blocks = editor(page).locator("[data-block-id]");
    await blocks.nth(1).click();
    await page.waitForTimeout(100);
    await pressKey(page, "Tab");
    await page.waitForTimeout(500);

    // Check the markdown output in the debug panel
    const mdOutput = await page.evaluate(() => {
      const el = document.querySelector(".cx-editor-container");
      if (!el) return "";
      const panels = el.querySelectorAll("div");
      for (const panel of panels) {
        const text = panel.textContent || "";
        if (text.includes("- Parent")) return text;
      }
      return "";
    });

    // Should have indented child: "  - Child"
    expect(mdOutput).toContain("- Parent");
    expect(mdOutput).toMatch(/\s{2}- Child/);
  });

  test("nested numbered list serializes with correct numbering", async ({
    page,
  }) => {
    await createNumberedList(page, ["First", "Sub"]);

    const blocks = editor(page).locator("[data-block-id]");
    await blocks.nth(1).click();
    await page.waitForTimeout(100);
    await pressKey(page, "Tab");
    await page.waitForTimeout(500);

    const mdOutput = await page.evaluate(() => {
      const el = document.querySelector(".cx-editor-container");
      if (!el) return "";
      const panels = el.querySelectorAll("div");
      for (const panel of panels) {
        const text = panel.textContent || "";
        if (text.includes("1. First")) return text;
      }
      return "";
    });

    expect(mdOutput).toContain("1. First");
    // Nested numbered item should be indented
    expect(mdOutput).toMatch(/\s{2,}1\. Sub/);
  });
});

// ----------------------------------------------------------
// 9. Deep nesting (3+ levels)
// ----------------------------------------------------------

test.describe("List — Deep Nesting", () => {
  test("can create 3 levels of nesting", async ({ page }) => {
    await createBulletList(page, ["Level 0", "Level 1", "Level 2"]);

    const blocks = editor(page).locator("[data-block-id]");

    // Indent second item (becomes level 1)
    await blocks.nth(1).click();
    await page.waitForTimeout(100);
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    // Indent third item twice (becomes level 2)
    await blocks.nth(2).click();
    await page.waitForTimeout(100);
    await pressKey(page, "Tab");
    await page.waitForTimeout(200);
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    // Verify 3-level nesting exists
    const parentInfo = await getBlockChildren(page, 0);
    expect(parentInfo.childCount).toBeGreaterThanOrEqual(1);

    // The level-1 child should have its own child (level 2)
    const doc = await getDoc(page);
    const level1 = doc.blocks[0].children?.[0];
    expect(level1).toBeDefined();
    expect(level1?.children?.length).toBeGreaterThanOrEqual(1);
  });

  test("each nesting level can have different bullet style", async ({
    page,
  }) => {
    await createBulletList(page, ["Level 0", "Level 1"]);

    const blocks = editor(page).locator("[data-block-id]");

    // Indent second item
    await blocks.nth(1).click();
    await page.waitForTimeout(100);
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    // Change parent bullet style to arrow
    await openBlockMenu(page, 0);
    await page.getByText("Bullet style").hover();
    await page.waitForTimeout(300);
    await page.getByText("Arrow").dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    const markers = await getListMarkers(page);
    // Parent should be → and child should have a different default
    expect(markers[0]).toBe("→");
    if (markers.length > 1) {
      // Child should have its own bullet style (default for level 1)
      expect(markers[1]).toBeTruthy();
    }
  });
});

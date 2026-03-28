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

/** Create N blocks with text "Block 1", "Block 2", etc. */
async function createBlocks(page: Page, count: number) {
  await focusEditor(page);
  for (let i = 1; i <= count; i++) {
    if (i > 1) await pressKey(page, "Enter");
    await typeText(page, `Block ${i}`);
  }
  await page.waitForTimeout(200);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  await page.waitForTimeout(200);
});

test.describe("Drag Handle Visibility", () => {
  test("drag handle appears on block hover", async ({ page }) => {
    await createBlocks(page, 2);

    // Hover over the first block
    const firstBlock = editor(page).locator("[data-block-id]").first();
    await firstBlock.hover();
    await page.waitForTimeout(300);

    // The drag handle should be visible (opacity: 1)
    // Drag handles are siblings of the contentEditable, positioned absolutely
    const handle = page.locator("[aria-label='Drag to reorder']").first();
    const opacity = await handle.evaluate((el) => getComputedStyle(el).opacity);
    expect(parseFloat(opacity)).toBeGreaterThan(0);
  });
});

test.describe("Drag and Drop Reordering", () => {
  test("drag handle is draggable", async ({ page }) => {
    await createBlocks(page, 3);

    const handle = page.locator("[aria-label='Drag to reorder']").first();
    const draggable = await handle.getAttribute("draggable");
    expect(draggable).toBe("true");
  });

  test.fixme("dragging a block to a new position reorders blocks", async ({ page }) => {
    await createBlocks(page, 3);
    expect(await getBlockTexts(page)).toEqual(["Block 1", "Block 2", "Block 3"]);

    // Get the drag handle for block 1 and the position of block 3
    const handles = page.locator("[aria-label='Drag to reorder']");
    const handle1 = handles.first();
    const block3 = editor(page).locator("[data-block-id]").nth(2);

    const handleBox = await handle1.boundingBox();
    const block3Box = await block3.boundingBox();

    if (handleBox && block3Box) {
      // Drag from handle1 to below block3
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(100);

      // Move to below block 3
      await page.mouse.move(block3Box.x + block3Box.width / 2, block3Box.y + block3Box.height, { steps: 5 });
      await page.waitForTimeout(100);

      await page.mouse.up();
      await page.waitForTimeout(200);

      const texts = await getBlockTexts(page);
      // Block 1 should now be at the end
      expect(texts).toEqual(["Block 2", "Block 3", "Block 1"]);
    }
  });
});

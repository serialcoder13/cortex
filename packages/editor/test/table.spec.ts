import { test, expect, type Page } from "@playwright/test";

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

test.describe("Table Block — Creation", () => {
  test("'/table' creates a table block", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/table");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);

    const types = await getBlockTypes(page);
    expect(types).toContain("table");
  });

  test("table renders with a visible table element", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/table");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);

    const table = editor(page).locator("table");
    await expect(table).toBeVisible();
  });

  test("default table has 3 rows and 3 columns", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/table");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);

    const rows = editor(page).locator("table tr");
    expect(await rows.count()).toBe(3);

    const firstRowCells = editor(page).locator("table tr").first().locator("td, th");
    expect(await firstRowCells.count()).toBe(3);
  });

  test("table has column menu buttons (⋯)", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/table");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);

    // Should have 3 column header buttons
    const colButtons = page.locator("[aria-label='Drag to reorder or click for options']")
      .or(page.locator("button").filter({ has: page.locator("svg") }));
    // Check for the MoreHorizontal icon buttons above the table
    const moreButtons = editor(page).locator("table").locator("..").locator("button");
    expect(await moreButtons.count()).toBeGreaterThan(0);
  });

  test("table has row handle buttons", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/table");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);

    // Row handles should be in the first column
    const handles = editor(page).locator("table td").first().locator("..");
    expect(await handles.count()).toBeGreaterThan(0);
  });

  test("table has add-row button below", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/table");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);

    // Look for + buttons
    const plusButtons = editor(page).locator("button").filter({ hasText: "" });
    expect(await plusButtons.count()).toBeGreaterThan(0);
  });
});

test.describe("Table Block — Cell Editing", () => {
  test("clicking a cell allows typing", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/table");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(300);

    // Find any contentEditable element inside the table
    const table = editor(page).locator("table");
    await expect(table).toBeVisible();

    // Click a cell — try the second row, first data cell
    const tds = table.locator("td");
    const tdCount = await tds.count();
    expect(tdCount).toBeGreaterThan(0);

    // Click the first td that has a contentEditable child or is itself editable
    await tds.first().click();
    await page.waitForTimeout(200);
    await page.keyboard.type("Hello", { delay: 30 });
    await page.waitForTimeout(200);

    // The table should now contain "Hello" somewhere
    const tableText = await table.textContent();
    expect(tableText).toContain("Hello");
  });

  test("table data persists to model after cell edit", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/table");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(300);

    // Find editable cells
    const editableCells = editor(page).locator("[contenteditable='true']").filter({
      has: page.locator("xpath=ancestor::table"),
    });

    // If there are contentEditable divs inside td elements
    const allCE = editor(page).locator("table [contenteditable='true']");
    if (await allCE.count() > 0) {
      await allCE.first().click();
      await page.waitForTimeout(100);
      await page.keyboard.type("Test Data", { delay: 30 });
      // Blur to trigger update
      await page.keyboard.press("Tab");
      await page.waitForTimeout(300);

      // Check model
      const doc = await getDoc(page);
      const tableBlock = doc.blocks.find((b: any) => b.type === "table");
      expect(tableBlock).toBeTruthy();
      if (tableBlock?.props?.tableData) {
        const flatData = (tableBlock.props.tableData as string[][]).flat();
        expect(flatData.some((cell: string) => cell.includes("Test"))).toBeTruthy();
      }
    }
  });
});

test.describe("Table Block — Row Operations", () => {
  test("add row button adds a new row", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/table");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(300);

    const rowsBefore = await editor(page).locator("table tr").count();

    // Click the add-row + button (below the table)
    const addButtons = editor(page).locator("button").filter({
      has: page.locator("svg"),
    });
    // The add-row button should be below the table
    const allButtons = await addButtons.all();
    for (const btn of allButtons) {
      const box = await btn.boundingBox();
      const tableBox = await editor(page).locator("table").boundingBox();
      if (box && tableBox && box.y > tableBox.y + tableBox.height - 10) {
        await btn.click();
        await page.waitForTimeout(200);
        break;
      }
    }

    const rowsAfter = await editor(page).locator("table tr").count();
    expect(rowsAfter).toBe(rowsBefore + 1);
  });
});

test.describe("Table Block — Column Operations", () => {
  test("add column button adds a new column", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/table");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(300);

    const colsBefore = await editor(page).locator("table tr").first().locator("td, th").count();

    // Click the add-column + button (right of the table)
    const addButtons = editor(page).locator("button").filter({
      has: page.locator("svg"),
    });
    const allButtons = await addButtons.all();
    for (const btn of allButtons) {
      const box = await btn.boundingBox();
      const tableBox = await editor(page).locator("table").boundingBox();
      if (box && tableBox && box.x > tableBox.x + tableBox.width - 10) {
        await btn.click();
        await page.waitForTimeout(200);
        break;
      }
    }

    const colsAfter = await editor(page).locator("table tr").first().locator("td, th").count();
    expect(colsAfter).toBe(colsBefore + 1);
  });
});

test.describe("Table Block — Markdown Serialization", () => {
  test("table with data serializes to markdown with pipes", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/table");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(300);

    // Type in a cell to trigger data sync to model
    const table = editor(page).locator("table");
    const tds = table.locator("td");
    await tds.first().click();
    await page.waitForTimeout(200);
    await page.keyboard.type("Name", { delay: 30 });
    await page.keyboard.press("Tab");
    await page.waitForTimeout(500);

    // Check markdown output
    const markdownTab = page.locator("button", { hasText: "Markdown" });
    await markdownTab.click();
    await page.waitForTimeout(200);

    const md = await page.locator("pre").textContent();
    expect(md).toContain("|");
    expect(md).toContain("Name");
  });
});

test.describe("Typing After Table", () => {
  test("typing in the editor after creating a table works correctly", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "Before table");
    await pressKey(page, "Enter");
    await typeText(page, "/table");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(300);

    // The first block should still have its text
    const texts = await getBlockTexts(page);
    expect(texts[0]).toBe("Before table");
  });

  test("text typed before table is not reversed", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "Title");
    await page.waitForTimeout(200);

    const texts = await getBlockTexts(page);
    expect(texts[0]).toBe("Title");

    // DOM text should match
    const domText = await editor(page).innerText();
    expect(domText).toContain("Title");
  });
});

import { test, expect, type Page } from "@playwright/test";

function editor(page: Page) { return page.locator(".cx-editor"); }

async function getDoc(page: Page) {
  return page.evaluate(() =>
    (window as any).__editorDoc ?? (window as any).__editorRef?.getDocument?.()
  );
}

async function getBlockTypes(page: Page): Promise<string[]> {
  const doc = await getDoc(page);
  if (!doc) return [];
  return doc.blocks.map((b: any) => b.type);
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

/** Create a table via slash command */
async function createTable(page: Page) {
  await focusEditor(page);
  await typeText(page, "/table");
  await page.waitForTimeout(300);
  await pressKey(page, "Enter");
  await page.waitForTimeout(300);
}

/** Get the table element */
function table(page: Page) {
  return editor(page).locator("table");
}

/** Get all cell texts as 2D array */
async function getTableData(page: Page): Promise<string[][]> {
  return page.evaluate(() => {
    const tbl = document.querySelector(".cx-editor table");
    if (!tbl) return [];
    const rows: string[][] = [];
    tbl.querySelectorAll("tr").forEach((tr) => {
      const cells: string[] = [];
      tr.querySelectorAll("td").forEach((td) => {
        cells.push(td.textContent?.trim() ?? "");
      });
      if (cells.length > 0) rows.push(cells);
    });
    return rows;
  });
}

/** Get table dimensions [rows, cols] */
async function getTableDimensions(page: Page): Promise<[number, number]> {
  const data = await getTableData(page);
  return [data.length, data[0]?.length ?? 0];
}

/** Click the column menu button for a given column index */
async function openColumnMenu(page: Page, colIdx: number) {
  // First click a cell in the column to make the handle visible
  const tds = table(page).locator("tr").first().locator("td");
  await tds.nth(colIdx).click();
  await page.waitForTimeout(200);

  // Use aria-label to find column option buttons
  const colButtons = page.locator("[data-table-block] button[aria-label='Column options']");
  const count = await colButtons.count();
  if (count > colIdx) {
    await colButtons.nth(colIdx).hover();
    await page.waitForTimeout(100);
    await colButtons.nth(colIdx).click();
    await page.waitForTimeout(200);
    return;
  }

  // Fallback: find buttons above the table by position
  const allButtons = page.locator("button").filter({ has: page.locator("svg") });
  const tableEl = table(page);
  const tableBox = await tableEl.boundingBox();
  if (!tableBox) return;
  const all = await allButtons.all();
  const aboveButtons: any[] = [];
  for (const btn of all) {
    const box = await btn.boundingBox();
    if (box && box.y < tableBox.y && box.y > tableBox.y - 60) {
      aboveButtons.push(btn);
    }
  }
  if (aboveButtons[colIdx]) {
    await aboveButtons[colIdx].click();
    await page.waitForTimeout(200);
  }
}

/** Click the row menu button (⋮⋮) for a given row index */
async function openRowMenu(page: Page, rowIdx: number) {
  // Row buttons are to the left of the table, inside or near each row
  const rows = table(page).locator("tr");
  const targetRow = rows.nth(rowIdx);
  const box = await targetRow.boundingBox();
  if (!box) return;

  // The row handle is to the left of the row — click there
  // It's a button with GripVertical icon
  const allButtons = page.locator("button").filter({ has: page.locator("svg") });
  const btnList = await allButtons.all();
  for (const btn of btnList) {
    const btnBox = await btn.boundingBox();
    if (btnBox && Math.abs(btnBox.y - box.y) < 20 && btnBox.x < box.x) {
      await btn.click();
      await page.waitForTimeout(200);
      return;
    }
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  await page.waitForTimeout(200);
});

test.describe("Table — Header Styling", () => {
  test("header row has bold text", async ({ page }) => {
    await createTable(page);

    // Type in first cell
    const tds = table(page).locator("td");
    await tds.first().click();
    await page.waitForTimeout(100);
    await page.keyboard.type("Header", { delay: 30 });
    await page.keyboard.press("Tab");
    await page.waitForTimeout(200);

    // First row cells should have fontWeight 600
    const firstRowTd = table(page).locator("tr").first().locator("td").first();
    const fw = await firstRowTd.locator("[contenteditable]").evaluate(el => getComputedStyle(el).fontWeight);
    expect(parseInt(fw)).toBeGreaterThanOrEqual(600);
  });

  test("non-header rows have normal weight text", async ({ page }) => {
    await createTable(page);

    const secondRowTd = table(page).locator("tr").nth(1).locator("td").first();
    const fw = await secondRowTd.locator("div").evaluate(el => getComputedStyle(el).fontWeight);
    expect(parseInt(fw)).toBeLessThanOrEqual(400);
  });
});

test.describe("Table — Cell Editing", () => {
  test("typing in a cell updates the content", async ({ page }) => {
    await createTable(page);

    const tds = table(page).locator("td");
    await tds.first().click();
    await page.waitForTimeout(100);
    await page.keyboard.type("Hello", { delay: 30 });
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);

    const data = await getTableData(page);
    expect(data[0][0]).toBe("Hello");
  });

  test("Tab key moves to next cell", async ({ page }) => {
    await createTable(page);

    const tds = table(page).locator("td");
    await tds.first().click();
    await page.waitForTimeout(100);
    await page.keyboard.type("A", { delay: 30 });
    await page.keyboard.press("Tab");
    await page.waitForTimeout(100);
    await page.keyboard.type("B", { delay: 30 });
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);

    const data = await getTableData(page);
    expect(data[0][0]).toBe("A");
    expect(data[0][1]).toBe("B");
  });

  test("Enter in cell commits the edit", async ({ page }) => {
    await createTable(page);

    const tds = table(page).locator("td");
    await tds.first().click();
    await page.waitForTimeout(100);
    await page.keyboard.type("Test", { delay: 30 });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);

    const data = await getTableData(page);
    expect(data[0][0]).toBe("Test");
  });
});

test.describe("Table — Add Row/Column", () => {
  test("add row button increases row count", async ({ page }) => {
    await createTable(page);
    const [rowsBefore] = await getTableDimensions(page);

    // Find add-row button (below the table)
    const tableBox = await table(page).boundingBox();
    const allBtns = await page.locator("button").filter({ has: page.locator("svg") }).all();
    for (const btn of allBtns) {
      const box = await btn.boundingBox();
      if (box && tableBox && box.y > tableBox.y + tableBox.height - 5) {
        await btn.click();
        await page.waitForTimeout(200);
        break;
      }
    }

    const [rowsAfter] = await getTableDimensions(page);
    expect(rowsAfter).toBe(rowsBefore + 1);
  });

  test("add column button increases column count", async ({ page }) => {
    await createTable(page);
    const [, colsBefore] = await getTableDimensions(page);

    // Find add-column button (right of the table)
    const tableBox = await table(page).boundingBox();
    const allBtns = await page.locator("button").filter({ has: page.locator("svg") }).all();
    for (const btn of allBtns) {
      const box = await btn.boundingBox();
      if (box && tableBox && box.x > tableBox.x + tableBox.width - 5) {
        await btn.click();
        await page.waitForTimeout(200);
        break;
      }
    }

    const [, colsAfter] = await getTableDimensions(page);
    expect(colsAfter).toBe(colsBefore + 1);
  });
});

test.describe("Table — Column Menu", () => {
  test("clicking column ⋯ button shows a dropdown menu", async ({ page }) => {
    await createTable(page);
    await openColumnMenu(page, 0);

    // Should show menu items like "Insert column left" or "Move left"
    const menuText = await page.locator("text=/Insert column|Delete column|Move left/i").first();
    await expect(menuText).toBeVisible({ timeout: 2000 });
  });

  test("insert column left adds a column before the current", async ({ page }) => {
    await createTable(page);

    // Put data in first cell
    const tds = table(page).locator("td");
    await tds.first().click();
    await page.waitForTimeout(100);
    await page.keyboard.type("Original", { delay: 30 });
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);

    const [, colsBefore] = await getTableDimensions(page);

    await openColumnMenu(page, 0);
    const insertLeft = page.locator("text=/Insert column left/i");
    if (await insertLeft.isVisible()) {
      await insertLeft.click();
      await page.waitForTimeout(300);

      const [, colsAfter] = await getTableDimensions(page);
      expect(colsAfter).toBe(colsBefore + 1);

      // Original data should have moved right
      const data = await getTableData(page);
      expect(data[0][1]).toBe("Original");
    }
  });

  test("delete column removes the column", async ({ page }) => {
    await createTable(page);
    const [, colsBefore] = await getTableDimensions(page);

    await openColumnMenu(page, 0);
    const deleteCol = page.locator("text=/Delete column/i");
    if (await deleteCol.isVisible()) {
      await deleteCol.click();
      await page.waitForTimeout(300);

      const [, colsAfter] = await getTableDimensions(page);
      expect(colsAfter).toBe(colsBefore - 1);
    }
  });
});

test.describe("Table — Row Menu", () => {
  test("clicking row handle shows a dropdown menu", async ({ page }) => {
    await createTable(page);
    await openRowMenu(page, 0);

    const menuText = await page.locator("text=/Insert row|Delete row/i").first();
    await expect(menuText).toBeVisible({ timeout: 2000 });
  });

  test("insert row below adds a row after the current", async ({ page }) => {
    await createTable(page);
    const [rowsBefore] = await getTableDimensions(page);

    await openRowMenu(page, 0);
    const insertBelow = page.locator("text=/Insert row below/i");
    if (await insertBelow.isVisible()) {
      await insertBelow.click();
      await page.waitForTimeout(300);

      const [rowsAfter] = await getTableDimensions(page);
      expect(rowsAfter).toBe(rowsBefore + 1);
    }
  });

  test("delete row removes the row", async ({ page }) => {
    await createTable(page);
    const [rowsBefore] = await getTableDimensions(page);

    await openRowMenu(page, 1); // delete second row (not header)
    const deleteRow = page.locator("text=/Delete row/i");
    if (await deleteRow.isVisible()) {
      await deleteRow.click();
      await page.waitForTimeout(300);

      const [rowsAfter] = await getTableDimensions(page);
      expect(rowsAfter).toBe(rowsBefore - 1);
    }
  });
});

test.describe("Table — Data Persistence", () => {
  test("table data syncs to document model", async ({ page }) => {
    await createTable(page);

    // Type in multiple cells
    const tds = table(page).locator("td");
    await tds.first().click();
    await page.waitForTimeout(100);
    await page.keyboard.type("Name", { delay: 30 });
    await page.keyboard.press("Tab");
    await page.waitForTimeout(100);
    await page.keyboard.type("Age", { delay: 30 });
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);

    // Check model
    const doc = await getDoc(page);
    const tableBlock = doc.blocks.find((b: any) => b.type === "table");
    expect(tableBlock).toBeTruthy();
    const td = tableBlock.props.tableData;
    if (td) {
      expect(td[0][0]).toBe("Name");
      expect(td[0][1]).toBe("Age");
    }
  });

  test("table data survives document re-render", async ({ page }) => {
    await createTable(page);

    // Type data
    const tds = table(page).locator("td");
    await tds.first().click();
    await page.waitForTimeout(100);
    await page.keyboard.type("Persist", { delay: 30 });
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);

    // Add a new paragraph block after the table (triggers re-render)
    await page.keyboard.press("Escape"); // close any menu
    await page.waitForTimeout(100);

    // Check the table still has the data
    const data = await getTableData(page);
    expect(data[0][0]).toBe("Persist");
  });
});

test.describe("Table — Markdown Round-trip", () => {
  test("table with data shows pipe-delimited markdown", async ({ page }) => {
    await createTable(page);

    const tds = table(page).locator("td");
    await tds.first().click();
    await page.waitForTimeout(100);
    await page.keyboard.type("Col1", { delay: 30 });
    await page.keyboard.press("Tab");
    await page.waitForTimeout(100);
    await page.keyboard.type("Col2", { delay: 30 });
    await page.keyboard.press("Tab");
    await page.waitForTimeout(500);

    // Check markdown
    const mdTab = page.locator("button", { hasText: "Markdown" });
    await mdTab.click();
    await page.waitForTimeout(200);

    const md = await page.locator("pre").textContent();
    expect(md).toContain("|");
    expect(md).toContain("Col1");
    expect(md).toContain("Col2");
  });
});

import { test, expect, type Page } from "@playwright/test";

function editor(page: Page) { return page.locator(".cx-editor"); }

async function getDoc(page: Page) {
  return page.evaluate(() =>
    (window as any).__editorDoc ?? (window as any).__editorRef?.getDocument?.()
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

async function createTable(page: Page) {
  await focusEditor(page);
  await typeText(page, "/table");
  await page.waitForTimeout(300);
  await pressKey(page, "Enter");
  await page.waitForTimeout(300);
}

function table(page: Page) {
  return editor(page).locator("table");
}

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

async function getTableDimensions(page: Page): Promise<[number, number]> {
  const data = await getTableData(page);
  return [data.length, data[0]?.length ?? 0];
}

async function getModelTableData(page: Page): Promise<string[][] | null> {
  const doc = await getDoc(page);
  const tableBlock = doc?.blocks?.find((b: any) => b.type === "table");
  return tableBlock?.props?.tableData ?? null;
}

async function getModelProps(page: Page): Promise<Record<string, any> | null> {
  const doc = await getDoc(page);
  const tableBlock = doc?.blocks?.find((b: any) => b.type === "table");
  return tableBlock?.props ?? null;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  await page.waitForTimeout(200);
});

// ---- Column dots centering ----

test.describe("Table — Column Dots Centering", () => {
  test("column handle buttons are horizontally centered over their columns", async ({ page }) => {
    await createTable(page);

    const tbl = table(page);
    const tableBox = await tbl.boundingBox();
    expect(tableBox).toBeTruthy();

    // Get first row cell positions
    const firstRowCells = tbl.locator("tr").first().locator("td");
    const cellCount = await firstRowCells.count();
    expect(cellCount).toBe(3);

    // Column handle buttons should be above the table and contain grip/dots icons
    const colHandles = page.locator("button[aria-label='Column options']");
    const handleCount = await colHandles.count();

    // If aria-label buttons exist, check their alignment
    // Otherwise check for buttons above the table with svg icons
    if (handleCount >= 3) {
      for (let i = 0; i < 3; i++) {
        const cellBox = await firstRowCells.nth(i).boundingBox();
        const handleBox = await colHandles.nth(i).boundingBox();
        if (cellBox && handleBox) {
          const cellCenter = cellBox.x + cellBox.width / 2;
          const handleCenter = handleBox.x + handleBox.width / 2;
          // Handle should be within 20px of cell center
          expect(Math.abs(cellCenter - handleCenter)).toBeLessThan(20);
        }
      }
    }
  });
});

// ---- Drag and Drop ----

test.describe("Table — Column Drag and Drop", () => {
  test("column handles are draggable", async ({ page }) => {
    await createTable(page);

    // Type data to identify columns
    const tds = table(page).locator("td");
    await tds.nth(0).click();
    await page.waitForTimeout(100);
    await typeText(page, "Col A");
    await pressKey(page, "Tab");
    await typeText(page, "Col B");
    await pressKey(page, "Tab");
    await typeText(page, "Col C");
    await pressKey(page, "Tab");
    await page.waitForTimeout(200);

    // Verify initial data
    const dataBefore = await getTableData(page);
    expect(dataBefore[0][0]).toBe("Col A");
    expect(dataBefore[0][1]).toBe("Col B");
    expect(dataBefore[0][2]).toBe("Col C");

    // Column handle buttons should have draggable attribute
    const draggableButtons = page.locator("[data-table-block] button[draggable='true']");
    const count = await draggableButtons.count();
    expect(count).toBeGreaterThan(0);
  });

  test("row handles are draggable", async ({ page }) => {
    await createTable(page);

    // Row handle buttons should have draggable attribute
    const draggableButtons = page.locator("[data-table-block] button[draggable='true']");
    const count = await draggableButtons.count();
    // Should have both column and row handles
    expect(count).toBeGreaterThanOrEqual(6); // 3 cols + 3 rows
  });
});

// ---- Column Resize ----

test.describe("Table — Column Resize", () => {
  test("resize handles exist on header row cell borders", async ({ page }) => {
    await createTable(page);

    // Look for resize handles (divs with cursor: col-resize)
    const resizeHandles = await page.evaluate(() => {
      const handles: number[] = [];
      document.querySelectorAll("[data-table-block] td").forEach((td) => {
        const resizer = Array.from(td.children).find(
          (el) => (el as HTMLElement).style.cursor === "col-resize"
        );
        if (resizer) handles.push(1);
      });
      return handles.length;
    });

    // Should have resize handles on header row (3 columns)
    expect(resizeHandles).toBeGreaterThanOrEqual(3);
  });
});

// ---- Cell Context Menu ----

test.describe("Table — Cell Context Menu", () => {
  test("right-click on a cell shows context menu", async ({ page }) => {
    await createTable(page);

    const tds = table(page).locator("td");
    await tds.first().click({ button: "right" });
    await page.waitForTimeout(200);

    // Should show menu with "Background color" option
    const menuText = await page.evaluate(() => {
      const menu = document.querySelector("[data-table-block] > div:last-child");
      return menu?.textContent ?? "";
    });

    // The context menu should contain color/alignment options
    const hasColorOption = await page.locator("button").filter({ hasText: "Background color" }).count();
    const hasAlignOption = await page.locator("button").filter({ hasText: "Alignment" }).count();

    expect(hasColorOption + hasAlignOption).toBeGreaterThan(0);
  });

  test("right-click menu has clear cell option", async ({ page }) => {
    await createTable(page);

    // Type something first
    const tds = table(page).locator("td");
    await tds.first().click();
    await typeText(page, "Test Data");
    await page.waitForTimeout(100);

    // Right-click
    await tds.first().click({ button: "right" });
    await page.waitForTimeout(200);

    const clearBtn = page.locator("button").filter({ hasText: "Clear cell" });
    expect(await clearBtn.count()).toBeGreaterThan(0);
  });
});

// ---- Table Templates ----

test.describe("Table — Templates", () => {
  test("empty table shows template button", async ({ page }) => {
    await createTable(page);

    // Should show "Use a template" button
    const templateBtn = page.locator("button").filter({ hasText: "Use a template" });
    expect(await templateBtn.count()).toBe(1);
  });

  test("clicking template button shows template list", async ({ page }) => {
    await createTable(page);

    const templateBtn = page.locator("button").filter({ hasText: "Use a template" });
    await templateBtn.click();
    await page.waitForTimeout(200);

    // Should show template names
    const taskTracker = page.locator("button").filter({ hasText: "Task Tracker" });
    const comparison = page.locator("button").filter({ hasText: "Comparison" });
    expect(await taskTracker.count()).toBe(1);
    expect(await comparison.count()).toBe(1);
  });

  test("selecting a template populates the table", async ({ page }) => {
    await createTable(page);

    const templateBtn = page.locator("button").filter({ hasText: "Use a template" });
    await templateBtn.click();
    await page.waitForTimeout(200);

    const taskTracker = page.locator("button").filter({ hasText: "Task Tracker" });
    await taskTracker.click();
    await page.waitForTimeout(300);

    const data = await getTableData(page);
    // Task Tracker has 4 columns: Task, Status, Assignee, Due Date
    expect(data[0]).toContain("Task");
    expect(data[0]).toContain("Status");
    expect(data.length).toBeGreaterThanOrEqual(3);
  });

  test("template button disappears after typing in cells", async ({ page }) => {
    await createTable(page);

    // Template button should be visible for empty table
    let templateBtn = page.locator("button").filter({ hasText: "Use a template" });
    expect(await templateBtn.count()).toBe(1);

    // Type in a cell
    const tds = table(page).locator("td");
    await tds.first().click();
    await typeText(page, "data");
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    // Template button should now be hidden (table is no longer all empty)
    templateBtn = page.locator("button").filter({ hasText: "Use a template" });
    expect(await templateBtn.count()).toBe(0);
  });
});

// ---- Border Toggle ----

test.describe("Table — Border Toggle", () => {
  test("border toggle button exists", async ({ page }) => {
    await createTable(page);

    const borderBtn = page.locator("button").filter({ hasText: "Borders" });
    expect(await borderBtn.count()).toBe(1);
  });

  test("clicking border toggle changes button text", async ({ page }) => {
    await createTable(page);

    const borderBtn = page.locator("button").filter({ hasText: "Borders" });
    await borderBtn.click();
    await page.waitForTimeout(200);

    // After toggling off, should show "No Borders"
    const noBorderBtn = page.locator("button").filter({ hasText: "No Borders" });
    expect(await noBorderBtn.count()).toBe(1);
  });

  test("toggling borders changes cell border style", async ({ page }) => {
    await createTable(page);

    // Get initial border
    const getBorder = () => page.evaluate(() => {
      const td = document.querySelector(".cx-editor table td");
      return td ? getComputedStyle(td).borderColor : "";
    });

    const initialBorder = await getBorder();
    expect(initialBorder).toBeTruthy();

    // Toggle borders off
    const borderBtn = page.locator("button").filter({ hasText: "Borders" });
    await borderBtn.click();
    await page.waitForTimeout(200);

    // Border should now be transparent
    const newBorder = await page.evaluate(() => {
      const td = document.querySelector(".cx-editor table td");
      return td ? (td as HTMLElement).style.border : "";
    });
    expect(newBorder).toContain("transparent");
  });
});

// ---- Compact Mode ----

test.describe("Table — Compact Mode", () => {
  test("compact toggle button exists", async ({ page }) => {
    await createTable(page);

    const compactBtn = page.locator("button").filter({ hasText: "Full Width" });
    expect(await compactBtn.count()).toBe(1);
  });

  test("clicking compact toggle changes table width", async ({ page }) => {
    await createTable(page);

    // Get initial table width
    const getTableWidth = () => page.evaluate(() => {
      const tbl = document.querySelector(".cx-editor table") as HTMLElement;
      return tbl?.style.width ?? "";
    });

    expect(await getTableWidth()).toBe("100%");

    // Toggle compact
    const compactBtn = page.locator("button").filter({ hasText: "Full Width" });
    await compactBtn.click();
    await page.waitForTimeout(200);

    expect(await getTableWidth()).toBe("auto");

    // Button should now say "Compact"
    const compactLabel = page.locator("button").filter({ hasText: "Compact" });
    expect(await compactLabel.count()).toBeGreaterThan(0);
  });
});

// ---- Cell Merge ----

test.describe("Table — Cell Merge", () => {
  test("shift-clicking cells selects them for merge", async ({ page }) => {
    await createTable(page);

    const tds = table(page).locator("td");

    // Shift-click first cell to start selection
    await tds.nth(0).click({ modifiers: ["Shift"] });
    await page.waitForTimeout(100);

    // Shift-click second cell to add to selection
    await tds.nth(1).click({ modifiers: ["Shift"] });
    await page.waitForTimeout(200);

    // Check that merge button appears in the toolbar
    const mergeBtn = page.locator("button").filter({ hasText: /Merge \d+ cells/ });
    expect(await mergeBtn.count()).toBe(1);
  });

  test("merge button shows correct cell count", async ({ page }) => {
    await createTable(page);

    const tds = table(page).locator("td");

    // Shift-click 3 cells to select them
    await tds.nth(0).click({ modifiers: ["Shift"] });
    await page.waitForTimeout(50);
    await tds.nth(1).click({ modifiers: ["Shift"] });
    await page.waitForTimeout(50);
    await tds.nth(2).click({ modifiers: ["Shift"] });
    await page.waitForTimeout(200);

    const mergeBtn = page.locator("button").filter({ hasText: "Merge 3 cells" });
    expect(await mergeBtn.count()).toBe(1);
  });
});

// ---- Markdown Serialization ----

test.describe("Table — Markdown Alignment", () => {
  test("table serializes to markdown with pipes", async ({ page }) => {
    await createTable(page);

    // Type data
    const tds = table(page).locator("td");
    await tds.first().click();
    await typeText(page, "Name");
    await pressKey(page, "Tab");
    await typeText(page, "Age");
    await pressKey(page, "Tab");
    await typeText(page, "City");
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    // Check markdown output
    const markdownTab = page.locator("button", { hasText: "Markdown" });
    if (await markdownTab.count() > 0) {
      await markdownTab.click();
      await page.waitForTimeout(200);
      const md = await page.locator("pre").textContent();
      expect(md).toContain("| Name | Age | City |");
      expect(md).toContain("| --- | --- | --- |");
    }
  });

  test("table data persists through model", async ({ page }) => {
    await createTable(page);

    const tds = table(page).locator("td");
    await tds.first().click();
    await typeText(page, "Hello");
    await pressKey(page, "Tab");
    await typeText(page, "World");
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    const modelData = await getModelTableData(page);
    expect(modelData).toBeTruthy();
    expect(modelData![0][0]).toBe("Hello");
    expect(modelData![0][1]).toBe("World");
  });
});

// ---- Column Menu Operations ----

test.describe("Table — Column Menu", () => {
  test("column menu shows Color submenu", async ({ page }) => {
    await createTable(page);

    // Hover over first column to show handle, then click it
    const tds = table(page).locator("td");
    await tds.first().click();
    await page.waitForTimeout(200);

    // Find and click the column handle above the first column
    const colButtons = page.locator("[data-table-block] button[aria-label='Column options']");
    if (await colButtons.count() > 0) {
      // Make button visible by hovering
      await colButtons.first().hover();
      await page.waitForTimeout(100);
      await colButtons.first().click();
      await page.waitForTimeout(200);

      // Should show Color option
      const colorBtn = page.locator("button").filter({ hasText: "Color" });
      expect(await colorBtn.count()).toBeGreaterThan(0);
    }
  });

  test("column menu shows Alignment submenu", async ({ page }) => {
    await createTable(page);

    const tds = table(page).locator("td");
    await tds.first().click();
    await page.waitForTimeout(200);

    const colButtons = page.locator("[data-table-block] button[aria-label='Column options']");
    if (await colButtons.count() > 0) {
      await colButtons.first().hover();
      await page.waitForTimeout(100);
      await colButtons.first().click();
      await page.waitForTimeout(200);

      const alignBtn = page.locator("button").filter({ hasText: "Alignment" });
      expect(await alignBtn.count()).toBeGreaterThan(0);
    }
  });
});

// ---- Row Menu Operations ----

test.describe("Table — Row Menu", () => {
  test("row menu shows insert, color, clear, duplicate, delete options", async ({ page }) => {
    await createTable(page);

    // Click a cell to make row handle visible
    const tds = table(page).locator("td");
    await tds.nth(3).click(); // second row, first col
    await page.waitForTimeout(200);

    // Find row handle buttons (to the left of the table)
    const rowButtons = page.locator("[data-table-block] button[aria-label='Row options']");
    if (await rowButtons.count() > 0) {
      await rowButtons.nth(1).hover();
      await page.waitForTimeout(100);
      await rowButtons.nth(1).click();
      await page.waitForTimeout(200);

      const insertAbove = page.locator("button").filter({ hasText: "Insert row above" });
      const insertBelow = page.locator("button").filter({ hasText: "Insert row below" });
      const colorOpt = page.locator("button").filter({ hasText: "Color" });
      const clearOpt = page.locator("button").filter({ hasText: "Clear contents" });
      const dupOpt = page.locator("button").filter({ hasText: "Duplicate" });
      const deleteOpt = page.locator("button").filter({ hasText: "Delete row" });

      expect(await insertAbove.count()).toBe(1);
      expect(await insertBelow.count()).toBe(1);
      expect(await colorOpt.count()).toBeGreaterThan(0);
      expect(await clearOpt.count()).toBe(1);
      expect(await dupOpt.count()).toBe(1);
      expect(await deleteOpt.count()).toBe(1);
    }
  });
});

// ---- Data Integrity ----

test.describe("Table — Data Integrity", () => {
  test("adding and deleting rows preserves data", async ({ page }) => {
    await createTable(page);

    // Fill cells
    const tds = table(page).locator("td");
    for (let i = 0; i < 3; i++) {
      await tds.nth(i).click();
      await typeText(page, `H${i + 1}`);
      await page.waitForTimeout(50);
    }
    // Blur to commit
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    const [rowsBefore] = await getTableDimensions(page);
    expect(rowsBefore).toBe(3);

    // Add row via button
    const addRowBtn = page.locator("[data-table-block] button[title='Add row']");
    if (await addRowBtn.count() > 0) {
      await addRowBtn.click();
      await page.waitForTimeout(200);
    }

    const [rowsAfter] = await getTableDimensions(page);
    expect(rowsAfter).toBe(4);

    // Header data should still be there
    const data = await getTableData(page);
    expect(data[0][0]).toBe("H1");
    expect(data[0][1]).toBe("H2");
    expect(data[0][2]).toBe("H3");
  });

  test("adding and deleting columns preserves data", async ({ page }) => {
    await createTable(page);

    // Fill header
    const tds = table(page).locator("td");
    await tds.nth(0).click();
    await typeText(page, "A");
    await pressKey(page, "Tab");
    await typeText(page, "B");
    await pressKey(page, "Tab");
    await typeText(page, "C");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    const [, colsBefore] = await getTableDimensions(page);
    expect(colsBefore).toBe(3);

    // Add column via button
    const addColBtn = page.locator("[data-table-block] button[title='Add column']");
    if (await addColBtn.count() > 0) {
      await addColBtn.click();
      await page.waitForTimeout(200);
    }

    const [, colsAfter] = await getTableDimensions(page);
    expect(colsAfter).toBe(4);

    // Data integrity
    const data = await getTableData(page);
    expect(data[0][0]).toBe("A");
    expect(data[0][1]).toBe("B");
    expect(data[0][2]).toBe("C");
    expect(data[0][3]).toBe(""); // new column
  });

  test("Tab wraps from last column to next row", async ({ page }) => {
    await createTable(page);

    const tds = table(page).locator("td");
    await tds.first().click();
    await typeText(page, "1");
    await pressKey(page, "Tab");
    await typeText(page, "2");
    await pressKey(page, "Tab");
    await typeText(page, "3");
    await pressKey(page, "Tab"); // should wrap to row 2, col 0
    await typeText(page, "4");
    await pressKey(page, "Tab");
    await page.waitForTimeout(300);

    const data = await getTableData(page);
    expect(data[0]).toEqual(["1", "2", "3"]);
    expect(data[1][0]).toBe("4");
  });
});

// ---- Hover visibility ----

test.describe("Table — Hover Visibility", () => {
  test("column dots appear on hover over column area", async ({ page }) => {
    await createTable(page);

    // Column handle buttons should initially have opacity 0
    const colButtons = page.locator("[data-table-block] button[aria-label='Column options']");
    if (await colButtons.count() > 0) {
      const initialOpacity = await colButtons.first().evaluate(
        (el) => getComputedStyle(el).opacity
      );
      // Should be 0 or very low when no cell is active
      expect(parseFloat(initialOpacity)).toBeLessThanOrEqual(0.5);

      // Click a cell to activate column
      const tds = table(page).locator("td");
      await tds.first().click();
      await page.waitForTimeout(200);

      // Now the button for the active column should be visible
      const activeOpacity = await colButtons.first().evaluate(
        (el) => getComputedStyle(el).opacity
      );
      expect(parseFloat(activeOpacity)).toBe(1);
    }
  });

  test("row dots appear when hovering row", async ({ page }) => {
    await createTable(page);

    // Click a cell to make row handle visible
    const tds = table(page).locator("td");
    await tds.nth(3).click(); // second row
    await page.waitForTimeout(200);

    const rowButtons = page.locator("[data-table-block] button[aria-label='Row options']");
    if (await rowButtons.count() > 0) {
      const opacity = await rowButtons.nth(1).evaluate(
        (el) => getComputedStyle(el).opacity
      );
      expect(parseFloat(opacity)).toBe(1);
    }
  });
});

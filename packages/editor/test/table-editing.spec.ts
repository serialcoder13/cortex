import { test, expect, type Page } from "@playwright/test";

function editor(page: Page) { return page.locator(".cx-editor"); }
function table(page: Page) { return editor(page).locator("table"); }

async function getDoc(page: Page) {
  return page.evaluate(() =>
    (window as any).__editorDoc ?? (window as any).__editorRef?.getDocument?.()
  );
}

async function focusEditor(page: Page) {
  await editor(page).click();
  await page.waitForTimeout(150);
}

async function createTable(page: Page) {
  await focusEditor(page);
  await page.keyboard.type("/table", { delay: 30 });
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
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

async function getModelTableData(page: Page): Promise<string[][] | null> {
  const doc = await getDoc(page);
  const tableBlock = doc?.blocks?.find((b: any) => b.type === "table");
  return tableBlock?.props?.tableData ?? null;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  await page.waitForTimeout(200);
});

test.describe("Table Cell Editing — Thorough", () => {
  test("type in first header cell and blur — data persists", async ({ page }) => {
    await createTable(page);
    const tds = table(page).locator("td");

    await tds.nth(0).click();
    await page.waitForTimeout(100);
    await page.keyboard.type("Name", { delay: 30 });
    // Click outside the table to blur
    await editor(page).click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(300);

    const data = await getTableData(page);
    expect(data[0][0]).toBe("Name");

    const model = await getModelTableData(page);
    expect(model?.[0]?.[0]).toBe("Name");
  });

  test("type in second header cell and blur — data persists", async ({ page }) => {
    await createTable(page);
    const tds = table(page).locator("td");

    await tds.nth(1).click();
    await page.waitForTimeout(100);
    await page.keyboard.type("Age", { delay: 30 });
    await editor(page).click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(300);

    const data = await getTableData(page);
    expect(data[0][1]).toBe("Age");
  });

  test("type in THIRD header cell and blur — data persists", async ({ page }) => {
    await createTable(page);
    const tds = table(page).locator("td");

    await tds.nth(2).click();
    await page.waitForTimeout(100);
    await page.keyboard.type("City", { delay: 30 });
    await editor(page).click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(300);

    const data = await getTableData(page);
    expect(data[0][2]).toBe("City");

    const model = await getModelTableData(page);
    expect(model?.[0]?.[2]).toBe("City");
  });

  test("type in all three header cells sequentially", async ({ page }) => {
    await createTable(page);
    const tds = table(page).locator("td");

    // Cell 0
    await tds.nth(0).click();
    await page.waitForTimeout(100);
    await page.keyboard.type("Name", { delay: 30 });

    // Cell 1 — click directly (blurs cell 0)
    await tds.nth(1).click();
    await page.waitForTimeout(100);
    await page.keyboard.type("Age", { delay: 30 });

    // Cell 2 — click directly (blurs cell 1)
    await tds.nth(2).click();
    await page.waitForTimeout(100);
    await page.keyboard.type("City", { delay: 30 });

    // Blur last cell
    await editor(page).click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(500);

    const data = await getTableData(page);
    expect(data[0][0]).toBe("Name");
    expect(data[0][1]).toBe("Age");
    expect(data[0][2]).toBe("City");
  });

  test("type in body cell (row 1, col 0)", async ({ page }) => {
    await createTable(page);
    const tds = table(page).locator("td");

    // Click cell in second row
    await tds.nth(3).click(); // row1, col0
    await page.waitForTimeout(100);
    await page.keyboard.type("Alice", { delay: 30 });
    await editor(page).click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(300);

    const data = await getTableData(page);
    expect(data[1][0]).toBe("Alice");
  });

  test("editing one cell does NOT erase another cell", async ({ page }) => {
    await createTable(page);
    const tds = table(page).locator("td");

    // Type in cell 0
    await tds.nth(0).click();
    await page.waitForTimeout(100);
    await page.keyboard.type("First", { delay: 30 });

    // Click cell 1 to move focus (blur cell 0)
    await tds.nth(1).click();
    await page.waitForTimeout(300);
    await page.keyboard.type("Second", { delay: 30 });

    // Blur
    await editor(page).click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(300);

    // Verify both cells have data
    const data = await getTableData(page);
    expect(data[0][0]).toBe("First");
    expect(data[0][1]).toBe("Second");
  });

  test("clicking directly between cells preserves all data", async ({ page }) => {
    await createTable(page);
    const tds = table(page).locator("td");

    // Fill all three header cells by clicking each
    await tds.nth(0).click();
    await page.waitForTimeout(100);
    await page.keyboard.type("A", { delay: 50 });

    await tds.nth(1).click();
    await page.waitForTimeout(200);
    await page.keyboard.type("B", { delay: 50 });

    await tds.nth(2).click();
    await page.waitForTimeout(200);
    await page.keyboard.type("C", { delay: 50 });

    // Blur
    await editor(page).click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(500);

    // ALL three should be preserved
    const data = await getTableData(page);
    expect(data[0][0]).toBe("A");
    expect(data[0][1]).toBe("B");
    expect(data[0][2]).toBe("C");

    // Check model too
    const model = await getModelTableData(page);
    expect(model?.[0]?.[0]).toBe("A");
    expect(model?.[0]?.[1]).toBe("B");
    expect(model?.[0]?.[2]).toBe("C");
  });

  test("editing body cells across multiple rows", async ({ page }) => {
    await createTable(page);
    const tds = table(page).locator("td");

    // Row 0
    await tds.nth(0).click();
    await page.waitForTimeout(100);
    await page.keyboard.type("H1", { delay: 30 });

    // Row 1
    await tds.nth(3).click();
    await page.waitForTimeout(200);
    await page.keyboard.type("R1C0", { delay: 30 });

    // Row 2
    await tds.nth(6).click();
    await page.waitForTimeout(200);
    await page.keyboard.type("R2C0", { delay: 30 });

    await editor(page).click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(500);

    const data = await getTableData(page);
    expect(data[0][0]).toBe("H1");
    expect(data[1][0]).toBe("R1C0");
    expect(data[2][0]).toBe("R2C0");
  });
});

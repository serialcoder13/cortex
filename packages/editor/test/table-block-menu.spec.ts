import { test, expect, type Page } from "@playwright/test";

// ---- Helpers ----

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

/** Create a table via slash command */
async function createTable(page: Page) {
  await focusEditor(page);
  await typeText(page, "/table");
  await page.waitForTimeout(300);
  await pressKey(page, "Enter");
  await page.waitForTimeout(300);
}

/** Create a table with data so the template picker doesn't show */
async function createTableWithData(page: Page) {
  await createTable(page);
  const tds = editor(page).locator("table td");
  await tds.first().click();
  await page.waitForTimeout(100);
  await page.keyboard.type("Header 1", { delay: 20 });
  await page.keyboard.press("Tab");
  await page.waitForTimeout(100);
  await page.keyboard.type("Header 2", { delay: 20 });
  await page.keyboard.press("Tab");
  await page.waitForTimeout(100);
  await page.keyboard.type("Header 3", { delay: 20 });
  // Blur to commit
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
}

function table(page: Page) {
  return editor(page).locator("table");
}

/** Open the block menu by clicking the grip handle next to the table block */
async function openBlockMenu(page: Page) {
  // Hover over the table block to reveal the drag handle
  const tableBlock = editor(page).locator("[data-table-block]");
  await tableBlock.hover();
  await page.waitForTimeout(200);

  // The grip handle button has aria-label "Drag to reorder or click for options"
  const gripButton = page.locator(
    '[aria-label="Drag to reorder or click for options"]',
  );
  const count = await gripButton.count();
  if (count > 0) {
    // Click the last one visible (there may be multiple for different blocks)
    await gripButton.last().click();
    await page.waitForTimeout(300);
    return;
  }

  // Fallback: find the GripVertical icon button near the table
  const tableBox = await tableBlock.boundingBox();
  if (!tableBox) throw new Error("Could not find table bounding box");

  const allButtons = page.locator("button, [draggable='true']");
  const btnList = await allButtons.all();
  for (const btn of btnList) {
    const box = await btn.boundingBox();
    if (
      box &&
      box.x < tableBox.x &&
      Math.abs(box.y - tableBox.y) < 40 &&
      box.width < 40
    ) {
      await btn.click();
      await page.waitForTimeout(300);
      return;
    }
  }
  throw new Error("Could not find grip handle to open block menu");
}

/** Get a block's props by type */
async function getTableBlockProps(page: Page) {
  const doc = await getDoc(page);
  if (!doc) return null;
  const tableBlock = doc.blocks.find((b: any) => b.type === "table");
  return tableBlock?.props ?? null;
}

/** Get cell background colors as a 2D array */
async function getCellBackgrounds(page: Page): Promise<string[][]> {
  return page.evaluate(() => {
    const tbl = document.querySelector(".cx-editor table");
    if (!tbl) return [];
    const rows: string[][] = [];
    tbl.querySelectorAll("tr").forEach((tr) => {
      const cells: string[] = [];
      tr.querySelectorAll("td").forEach((td) => {
        cells.push(
          (td as HTMLElement).style.backgroundColor || "",
        );
      });
      if (cells.length > 0) rows.push(cells);
    });
    return rows;
  });
}

/** Check if any cell in the table has a non-empty, non-highlight background color */
async function hasAnyColoredCell(page: Page): Promise<boolean> {
  const bgs = await getCellBackgrounds(page);
  return bgs.some((row) =>
    row.some((bg) => bg !== "" && !bg.includes("0.06") && !bg.includes("0.12")),
  );
}

/** Check if the table has visible borders */
async function tableBorderStyle(page: Page): Promise<string> {
  return page.evaluate(() => {
    const tbl = document.querySelector(".cx-editor table");
    if (!tbl) return "";
    const firstTd = tbl.querySelector("td");
    if (!firstTd) return "";
    return (firstTd as HTMLElement).style.border || "";
  });
}

/** Check if the table is full width or compact */
async function tableWidth(page: Page): Promise<string> {
  return page.evaluate(() => {
    const tbl = document.querySelector(".cx-editor table");
    if (!tbl) return "";
    return (tbl as HTMLElement).style.width || "";
  });
}

// ---- Tests ----

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  await page.waitForTimeout(200);
});

test.describe("Table Block Menu — Visibility", () => {
  test("block menu shows table-specific options for table blocks", async ({
    page,
  }) => {
    await createTableWithData(page);
    await openBlockMenu(page);

    // Should see table-specific items
    await expect(page.getByText("Hide Borders")).toBeVisible();
    // "Full Width" or "Compact" should be visible
    const compactOrFull =
      (await page.getByText("Compact").isVisible()) ||
      (await page.getByText("Full Width").isVisible());
    expect(compactOrFull).toBe(true);
    await expect(page.getByText("Color Theme")).toBeVisible();
  });

  test("block menu does NOT show Turn into for table blocks", async ({
    page,
  }) => {
    await createTableWithData(page);
    await openBlockMenu(page);

    await expect(page.getByText("Turn into")).not.toBeVisible();
  });

  test("block menu still shows common items for table blocks", async ({
    page,
  }) => {
    await createTableWithData(page);
    await openBlockMenu(page);

    await expect(page.getByText("Move up")).toBeVisible();
    await expect(page.getByText("Move down")).toBeVisible();
    await expect(page.getByText("Duplicate")).toBeVisible();
    await expect(page.getByText("Delete")).toBeVisible();
  });
});

test.describe("Table Block Menu — Toggle Borders", () => {
  test("clicking Hide Borders updates the table", async ({ page }) => {
    await createTableWithData(page);

    // Initially borders should be visible (showBorders defaults to true)
    const initialBorder = await tableBorderStyle(page);
    expect(initialBorder).not.toContain("transparent");

    await openBlockMenu(page);
    await page.getByText("Hide Borders").click();
    await page.waitForTimeout(300);

    // After hiding, borders should be transparent
    const newBorder = await tableBorderStyle(page);
    expect(newBorder).toContain("transparent");

    // Verify in document model
    const props = await getTableBlockProps(page);
    expect(props?.showBorders).toBe(false);
  });

  test("toggling borders off then on restores them", async ({ page }) => {
    await createTableWithData(page);

    // Hide borders
    await openBlockMenu(page);
    await page.getByText("Hide Borders").click();
    await page.waitForTimeout(300);

    let props = await getTableBlockProps(page);
    expect(props?.showBorders).toBe(false);

    // Show borders again
    await openBlockMenu(page);
    await page.getByText("Show Borders").click();
    await page.waitForTimeout(300);

    props = await getTableBlockProps(page);
    expect(props?.showBorders).toBe(true);

    const border = await tableBorderStyle(page);
    expect(border).not.toContain("transparent");
  });
});

test.describe("Table Block Menu — Toggle Compact/Full Width", () => {
  test("clicking Compact changes table width mode", async ({ page }) => {
    await createTableWithData(page);

    // Default should be full width (compact = false)
    const initialWidth = await tableWidth(page);
    expect(initialWidth).toContain("100%");

    await openBlockMenu(page);
    await page.getByText("Compact").click();
    await page.waitForTimeout(300);

    // After compact, width should be "auto"
    const newWidth = await tableWidth(page);
    expect(newWidth).toContain("auto");

    const props = await getTableBlockProps(page);
    expect(props?.compact).toBe(true);
  });

  test("toggling compact then full width restores width", async ({ page }) => {
    await createTableWithData(page);

    // Set compact
    await openBlockMenu(page);
    await page.getByText("Compact").click();
    await page.waitForTimeout(300);

    let props = await getTableBlockProps(page);
    expect(props?.compact).toBe(true);

    // Set full width
    await openBlockMenu(page);
    await page.getByText("Full Width").click();
    await page.waitForTimeout(300);

    props = await getTableBlockProps(page);
    expect(props?.compact).toBe(false);

    const width = await tableWidth(page);
    expect(width).toContain("100%");
  });
});

test.describe("Table Block Menu — Color Templates", () => {
  test("Color Theme submenu shows all templates", async ({ page }) => {
    await createTableWithData(page);
    await openBlockMenu(page);

    // Hover over Color Theme to open submenu
    await page.getByText("Color Theme").hover();
    await page.waitForTimeout(300);

    // Verify all template names are visible
    await expect(page.getByText("Default", { exact: true })).toBeVisible();
    await expect(page.getByText("Striped Gray", { exact: true })).toBeVisible();
    await expect(page.getByText("Blue Header", { exact: true })).toBeVisible();
    await expect(page.getByText("Green Header", { exact: true })).toBeVisible();
    await expect(page.getByText("Purple Header", { exact: true })).toBeVisible();
    await expect(page.getByText("Warm Tones", { exact: true })).toBeVisible();
    await expect(page.getByText("Rose", { exact: true })).toBeVisible();
  });

  test("applying Blue Header template colors the cells", async ({ page }) => {
    await createTableWithData(page);

    // No colors initially
    const before = await hasAnyColoredCell(page);
    expect(before).toBe(false);

    await openBlockMenu(page);
    await page.getByText("Color Theme").hover();
    await page.waitForTimeout(300);

    // Use mousedown to match the menu's onMouseDown handler
    await page.getByText("Blue Header", { exact: true }).dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    // Cells should now have colors
    const after = await hasAnyColoredCell(page);
    expect(after).toBe(true);

    // Verify document model has cellMeta
    const props = await getTableBlockProps(page);
    expect(props?.cellMeta).toBeDefined();
    expect(Object.keys(props?.cellMeta ?? {}).length).toBeGreaterThan(0);

    // Header row should have blue tint (#dbeafe)
    const bgs = await getCellBackgrounds(page);
    expect(bgs.length).toBeGreaterThan(0);
    // First row cells should all have the header color
    const headerBgs = bgs[0];
    for (const bg of headerBgs) {
      expect(bg).not.toBe("");
    }
  });

  test("applying Striped Gray template creates alternating rows", async ({
    page,
  }) => {
    await createTableWithData(page);

    await openBlockMenu(page);
    await page.getByText("Color Theme").hover();
    await page.waitForTimeout(300);
    await page.getByText("Striped Gray", { exact: true }).dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    const props = await getTableBlockProps(page);
    expect(props?.cellMeta).toBeDefined();

    // Header row (row 0) should have color
    expect(props?.cellMeta?.["0-0"]?.bgColor).toBe("#f3f4f6");
    // Row 1 (odd) should have no color entry or empty
    const row1Color = props?.cellMeta?.["1-0"]?.bgColor;
    expect(!row1Color || row1Color === "").toBe(true);
    // Row 2 (even) should have alternating color
    expect(props?.cellMeta?.["2-0"]?.bgColor).toBe("#f9fafb");
  });

  test("applying Default template clears all colors", async ({ page }) => {
    await createTableWithData(page);

    // First apply a colored template
    await openBlockMenu(page);
    await page.getByText("Color Theme").hover();
    await page.waitForTimeout(300);
    await page.getByText("Blue Header", { exact: true }).dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    let colored = await hasAnyColoredCell(page);
    expect(colored).toBe(true);

    // Now apply Default to clear
    await openBlockMenu(page);
    await page.getByText("Color Theme").hover();
    await page.waitForTimeout(300);
    await page.getByText("Default", { exact: true }).dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    colored = await hasAnyColoredCell(page);
    expect(colored).toBe(false);

    const props = await getTableBlockProps(page);
    // cellMeta should be empty
    expect(Object.keys(props?.cellMeta ?? {}).length).toBe(0);
  });

  test("applying Green Header template sets correct colors", async ({
    page,
  }) => {
    await createTableWithData(page);

    await openBlockMenu(page);
    await page.getByText("Color Theme").hover();
    await page.waitForTimeout(300);
    await page.getByText("Green Header", { exact: true }).dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    const props = await getTableBlockProps(page);
    expect(props?.cellMeta?.["0-0"]?.bgColor).toBe("#dcfce7");
  });

  test("applying Purple Header template sets correct colors", async ({
    page,
  }) => {
    await createTableWithData(page);

    await openBlockMenu(page);
    await page.getByText("Color Theme").hover();
    await page.waitForTimeout(300);
    await page.getByText("Purple Header", { exact: true }).dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    const props = await getTableBlockProps(page);
    expect(props?.cellMeta?.["0-0"]?.bgColor).toBe("#ede9fe");
  });

  test("applying Warm Tones template sets correct colors", async ({
    page,
  }) => {
    await createTableWithData(page);

    await openBlockMenu(page);
    await page.getByText("Color Theme").hover();
    await page.waitForTimeout(300);
    await page.getByText("Warm Tones", { exact: true }).dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    const props = await getTableBlockProps(page);
    expect(props?.cellMeta?.["0-0"]?.bgColor).toBe("#ffedd5");
  });

  test("applying Rose template sets correct colors", async ({ page }) => {
    await createTableWithData(page);

    await openBlockMenu(page);
    await page.getByText("Color Theme").hover();
    await page.waitForTimeout(300);
    await page.getByText("Rose", { exact: true }).dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    const props = await getTableBlockProps(page);
    expect(props?.cellMeta?.["0-0"]?.bgColor).toBe("#fce7f3");
  });

  test("switching between color templates replaces old colors", async ({
    page,
  }) => {
    await createTableWithData(page);

    // Apply blue
    await openBlockMenu(page);
    await page.getByText("Color Theme").hover();
    await page.waitForTimeout(300);
    await page.getByText("Blue Header", { exact: true }).dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    let props = await getTableBlockProps(page);
    expect(props?.cellMeta?.["0-0"]?.bgColor).toBe("#dbeafe");

    // Switch to green
    await openBlockMenu(page);
    await page.getByText("Color Theme").hover();
    await page.waitForTimeout(300);
    await page.getByText("Green Header", { exact: true }).dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    props = await getTableBlockProps(page);
    // Should now be green, not blue
    expect(props?.cellMeta?.["0-0"]?.bgColor).toBe("#dcfce7");
  });
});

test.describe("Table Block Menu — Color Template Rendering", () => {
  test("cell background colors are actually rendered in the DOM", async ({
    page,
  }) => {
    await createTableWithData(page);

    await openBlockMenu(page);
    await page.getByText("Color Theme").hover();
    await page.waitForTimeout(300);
    await page.getByText("Blue Header", { exact: true }).dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    // Check the actual CSS on the first header cell
    const firstTd = table(page).locator("tr").first().locator("td").first();
    const bg = await firstTd.evaluate(
      (el) => (el as HTMLElement).style.backgroundColor,
    );
    expect(bg).not.toBe("");
  });

  test("color template colors persist after editing a cell", async ({
    page,
  }) => {
    await createTableWithData(page);

    // Apply blue header
    await openBlockMenu(page);
    await page.getByText("Color Theme").hover();
    await page.waitForTimeout(300);
    await page.getByText("Blue Header", { exact: true }).dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    // Edit a cell
    const secondRowFirstTd = table(page)
      .locator("tr")
      .nth(1)
      .locator("td")
      .first();
    await secondRowFirstTd.click();
    await page.waitForTimeout(100);
    await page.keyboard.type("Edited", { delay: 20 });
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);

    // Header colors should still be present
    const props = await getTableBlockProps(page);
    expect(props?.cellMeta?.["0-0"]?.bgColor).toBe("#dbeafe");
  });
});

test.describe("Table Block Menu — Color Template Reapply on Row/Col Changes", () => {
  test("adding a row preserves the color pattern", async ({ page }) => {
    await createTableWithData(page);

    // Apply Striped Gray template
    await openBlockMenu(page);
    await page.getByText("Color Theme").hover();
    await page.waitForTimeout(300);
    await page.getByText("Striped Gray", { exact: true }).dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    // Verify colorTemplate is stored
    let props = await getTableBlockProps(page);
    expect(props?.colorTemplate).toBe("Striped Gray");

    // Add a row via the "Add row" button
    const addRowBtn = page.getByTitle("Add row");
    await addRowBtn.click();
    await page.waitForTimeout(400);

    // Verify the new row also has colors from the pattern
    props = await getTableBlockProps(page);
    const tableData = props?.tableData as string[][] | undefined;
    const totalRows = tableData?.length ?? 0;
    expect(totalRows).toBeGreaterThan(3);

    // With Striped Gray: row 0 = #f3f4f6, odd rows = "", even rows = #f9fafb
    // The new row should follow this pattern
    expect(props?.cellMeta?.["0-0"]?.bgColor).toBe("#f3f4f6"); // header
    // Row 2 (even) should have color
    expect(props?.cellMeta?.["2-0"]?.bgColor).toBe("#f9fafb");
  });

  test("colorTemplate name is stored in block props", async ({ page }) => {
    await createTableWithData(page);

    await openBlockMenu(page);
    await page.getByText("Color Theme").hover();
    await page.waitForTimeout(300);
    await page.getByText("Blue Header", { exact: true }).dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    const props = await getTableBlockProps(page);
    expect(props?.colorTemplate).toBe("Blue Header");
  });

  test("applying Default clears colorTemplate name", async ({ page }) => {
    await createTableWithData(page);

    // Apply Blue Header
    await openBlockMenu(page);
    await page.getByText("Color Theme").hover();
    await page.waitForTimeout(300);
    await page.getByText("Blue Header", { exact: true }).dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    let props = await getTableBlockProps(page);
    expect(props?.colorTemplate).toBe("Blue Header");

    // Apply Default
    await openBlockMenu(page);
    await page.getByText("Color Theme").hover();
    await page.waitForTimeout(300);
    await page.getByText("Default", { exact: true }).dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    props = await getTableBlockProps(page);
    expect(props?.colorTemplate).toBe("");
  });
});

test.describe("Table — Markdown Serialization of Metadata", () => {
  test("table with color template includes cortex-table comment in markdown", async ({
    page,
  }) => {
    await createTableWithData(page);

    // Apply Blue Header
    await openBlockMenu(page);
    await page.getByText("Color Theme").hover();
    await page.waitForTimeout(300);
    await page.getByText("Blue Header", { exact: true }).dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    // Get the debug panel markdown output
    const mdOutput = await page.evaluate(() => {
      const el = document.querySelector(".cx-editor-container");
      if (!el) return "";
      // Look for the debug panel with markdown content
      const debugPanels = el.querySelectorAll("div");
      for (const panel of debugPanels) {
        const text = panel.textContent || "";
        if (text.includes("cortex-table:")) return text;
      }
      return "";
    });

    expect(mdOutput).toContain("cortex-table:");
    expect(mdOutput).toContain("cellMeta");
    expect(mdOutput).toContain("colorTemplate");
  });

  test("table with hidden borders includes showBorders in markdown", async ({
    page,
  }) => {
    await createTableWithData(page);

    await openBlockMenu(page);
    await page.getByText("Hide Borders").click();
    await page.waitForTimeout(300);

    const mdOutput = await page.evaluate(() => {
      const el = document.querySelector(".cx-editor-container");
      if (!el) return "";
      const debugPanels = el.querySelectorAll("div");
      for (const panel of debugPanels) {
        const text = panel.textContent || "";
        if (text.includes("cortex-table:")) return text;
      }
      return "";
    });

    expect(mdOutput).toContain("cortex-table:");
    expect(mdOutput).toContain('"showBorders":false');
  });

  test("table with compact mode includes compact in markdown", async ({
    page,
  }) => {
    await createTableWithData(page);

    await openBlockMenu(page);
    await page.getByText("Compact").click();
    await page.waitForTimeout(300);

    const mdOutput = await page.evaluate(() => {
      const el = document.querySelector(".cx-editor-container");
      if (!el) return "";
      const debugPanels = el.querySelectorAll("div");
      for (const panel of debugPanels) {
        const text = panel.textContent || "";
        if (text.includes("cortex-table:")) return text;
      }
      return "";
    });

    expect(mdOutput).toContain("cortex-table:");
    expect(mdOutput).toContain('"compact":true');
  });

  test("default table without metadata has no cortex-table comment", async ({
    page,
  }) => {
    await createTableWithData(page);

    const mdOutput = await page.evaluate(() => {
      const el = document.querySelector(".cx-editor-container");
      if (!el) return "";
      const debugPanels = el.querySelectorAll("div");
      for (const panel of debugPanels) {
        const text = panel.textContent || "";
        if (text.includes("| Header 1")) return text;
      }
      return "";
    });

    expect(mdOutput).not.toContain("cortex-table:");
  });
});

test.describe("Table — Add Row/Column Color Inheritance", () => {
  test("add-row button at bottom preserves color pattern", async ({ page }) => {
    await createTableWithData(page);

    // Apply Rose template
    await openBlockMenu(page);
    await page.getByText("Color Theme").hover();
    await page.waitForTimeout(300);
    await page.getByText("Rose", { exact: true }).dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    // Verify initial state: 3 rows, header has color
    let props = await getTableBlockProps(page);
    expect(props?.colorTemplate).toBe("Rose");
    expect(props?.cellMeta?.["0-0"]?.bgColor).toBe("#fce7f3");

    // Click the "Add row" button at the bottom
    await page.getByTitle("Add row").click();
    await page.waitForTimeout(400);

    // Should now have 4 rows
    props = await getTableBlockProps(page);
    const tableData = props?.tableData as string[][];
    expect(tableData.length).toBe(4);

    // Row 0 (header) = #fce7f3, Row 2 (even) = #fdf2f8, Row 3 (new, odd) = no color
    expect(props?.cellMeta?.["0-0"]?.bgColor).toBe("#fce7f3");
    expect(props?.cellMeta?.["2-0"]?.bgColor).toBe("#fdf2f8");

    // Add another row — should be even, so it gets color
    await page.getByTitle("Add row").click();
    await page.waitForTimeout(400);

    props = await getTableBlockProps(page);
    expect((props?.tableData as string[][]).length).toBe(5);
    expect(props?.cellMeta?.["4-0"]?.bgColor).toBe("#fdf2f8");
  });

  test("add-column button preserves color pattern", async ({ page }) => {
    await createTableWithData(page);

    // Apply Blue Header template
    await openBlockMenu(page);
    await page.getByText("Color Theme").hover();
    await page.waitForTimeout(300);
    await page.getByText("Blue Header", { exact: true }).dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    let props = await getTableBlockProps(page);
    expect(props?.cellMeta?.["0-0"]?.bgColor).toBe("#dbeafe");

    // Click "Add column" button
    await page.getByTitle("Add column").click();
    await page.waitForTimeout(400);

    // The new column's header cell should also have the header color
    props = await getTableBlockProps(page);
    const cols = (props?.tableData as string[][])[0].length;
    expect(cols).toBe(4); // was 3, now 4
    expect(props?.cellMeta?.[`0-${cols - 1}`]?.bgColor).toBe("#dbeafe");
  });
});

test.describe("Table — Placeholder Hides After Template", () => {
  test("placeholder is hidden when table block exists with content", async ({
    page,
  }) => {
    // Create a table with content
    await createTableWithData(page);
    await page.waitForTimeout(300);

    // The placeholder element should be hidden (display:none) when there's content
    const placeholder = editor(page).locator(".cx-placeholder");
    const count = await placeholder.count();
    if (count > 0) {
      await expect(placeholder).not.toBeVisible();
    }
  });

  test("placeholder hides after applying a table template from picker", async ({
    page,
  }) => {
    await focusEditor(page);

    // Create a table via slash command
    await typeText(page, "/table");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(500);

    // Apply a template from the picker if visible
    const templateBtn = page.getByText("Use a template");
    const hasPicker = await templateBtn.isVisible().catch(() => false);
    if (hasPicker) {
      await templateBtn.click();
      await page.waitForTimeout(200);
      await page.getByText("Contact List").click();
      await page.waitForTimeout(500);
    }

    // Placeholder should not be visible (table has content)
    const placeholder = editor(page).locator(".cx-placeholder");
    const count = await placeholder.count();
    if (count > 0) {
      await expect(placeholder).not.toBeVisible();
    }
  });
});

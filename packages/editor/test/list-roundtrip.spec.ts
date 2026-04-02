import { test, expect, type Page } from "@playwright/test";

// ---- Helpers ----

function editor(page: Page) {
  return page.locator(".cx-editor");
}

async function loadMarkdown(page: Page, md: string) {
  await page.evaluate((md) => (window as any).__loadMarkdown(md), md);
  await page.waitForTimeout(300);
}

async function getMarkdown(page: Page): Promise<string> {
  return page.evaluate(() => (window as any).__getMarkdown());
}

async function getDoc(page: Page) {
  return page.evaluate(() => (window as any).__editorDoc);
}

async function getListMarkers(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const items = document.querySelectorAll("[data-list-block] [data-list-item-id]");
    return Array.from(items).map((el) => {
      const marker = el.querySelector("span[contenteditable='false']");
      return marker?.textContent?.trim() ?? "";
    });
  });
}

async function getListItemTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const items = document.querySelectorAll("[data-list-block] [data-list-item-id]");
    return Array.from(items).map((el) => {
      const content = el.querySelector("[data-content]");
      return content?.textContent ?? "";
    });
  });
}

async function getMarkerStyles(page: Page): Promise<Array<{ color: string; fontSize: string }>> {
  return page.evaluate(() => {
    const items = document.querySelectorAll("[data-list-block] [data-list-item-id]");
    return Array.from(items).map((el) => {
      const marker = el.querySelector("span[contenteditable='false']") as HTMLElement | null;
      return {
        color: marker?.style.color ?? "",
        fontSize: marker?.style.fontSize ?? "",
      };
    });
  });
}

async function getBlockCount(page: Page): Promise<number> {
  return page.evaluate(() =>
    document.querySelectorAll(".cx-editor [data-block-id]").length,
  );
}

async function openBlockMenu(page: Page, blockIndex: number = 0) {
  const blocks = editor(page).locator("[data-block-id]");
  await blocks.nth(blockIndex).hover();
  await page.waitForTimeout(200);
  const grip = page.locator('[aria-label="Drag to reorder or click for options"]');
  await grip.last().click();
  await page.waitForTimeout(300);
}

// ---- Tests ----

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  await page.waitForTimeout(200);
});

test.describe("Markdown → Editor Rendering", () => {
  test("simple bullet list renders correctly", async ({ page }) => {
    await loadMarkdown(page, "- Apple\n- Banana\n- Cherry\n");

    const texts = await getListItemTexts(page);
    expect(texts).toEqual(["Apple", "Banana", "Cherry"]);

    const markers = await getListMarkers(page);
    expect(markers.every((m) => m === "•")).toBe(true);
  });

  test("simple numbered list renders correctly", async ({ page }) => {
    await loadMarkdown(page, "1. First\n2. Second\n3. Third\n");

    const texts = await getListItemTexts(page);
    expect(texts).toEqual(["First", "Second", "Third"]);

    const markers = await getListMarkers(page);
    expect(markers).toEqual(["1.", "2.", "3."]);
  });

  test("nested mixed list renders with correct indent levels", async ({ page }) => {
    const md = [
      "1. Top level one",
      "  - Nested bullet",
      "  - Another bullet",
      "    1. Deep numbered",
      "2. Top level two",
    ].join("\n") + "\n";

    await loadMarkdown(page, md);

    const texts = await getListItemTexts(page);
    expect(texts).toEqual([
      "Top level one",
      "Nested bullet",
      "Another bullet",
      "Deep numbered",
      "Top level two",
    ]);

    // Should have markers — numbers at level 0, bullets at level 1, numbers at level 2
    const markers = await getListMarkers(page);
    expect(markers[0]).toMatch(/1/);
    expect(markers[1]).toMatch(/[•◦▪–→]/);
    expect(markers[2]).toMatch(/[•◦▪–→]/);
    expect(markers[3]).toMatch(/1|i/); // number at deeper level
    expect(markers[4]).toMatch(/2/);
  });

  test("list with inline formatting renders rich content", async ({ page }) => {
    const md = "- **Bold item**\n- *Italic item*\n- [Link item](https://example.com)\n";
    await loadMarkdown(page, md);

    const texts = await getListItemTexts(page);
    expect(texts).toEqual(["Bold item", "Italic item", "Link item"]);

    // Check that bold is rendered as <strong>
    const boldEl = page.locator("[data-list-block] strong");
    await expect(boldEl).toBeVisible();

    // Check that link is rendered as <a>
    const linkEl = page.locator("[data-list-block] a");
    await expect(linkEl).toBeVisible();
    await expect(linkEl).toHaveAttribute("href", "https://example.com");
  });

  test("alpha-upper numbered list renders A, B, C markers", async ({ page }) => {
    const md = "A) First\nB) Second\nC) Third\n";
    await loadMarkdown(page, md);

    const markers = await getListMarkers(page);
    expect(markers).toEqual(["A)", "B)", "C)"]);
  });

  test("roman-lower numbered list renders i, ii, iii markers", async ({ page }) => {
    const md = "i) First\nii) Second\niii) Third\n";
    await loadMarkdown(page, md);

    const markers = await getListMarkers(page);
    expect(markers).toEqual(["i)", "ii)", "iii)"]);
  });
});

test.describe("Markdown → Markdown Round-trip (no edits)", () => {
  test("simple bullet list round-trips", async ({ page }) => {
    const original = "- Apple\n- Banana\n- Cherry\n";
    await loadMarkdown(page, original);

    const result = await getMarkdown(page);
    expect(result.trim()).toBe(original.trim());
  });

  test("simple numbered list round-trips", async ({ page }) => {
    const original = "1. First\n2. Second\n3. Third\n";
    await loadMarkdown(page, original);

    const result = await getMarkdown(page);
    expect(result.trim()).toBe(original.trim());
  });

  test("nested mixed list round-trips", async ({ page }) => {
    const original = [
      "1. Top one",
      "  - Nested bullet",
      "  - Another",
      "2. Top two",
    ].join("\n") + "\n";
    await loadMarkdown(page, original);

    const result = await getMarkdown(page);
    expect(result.trim()).toBe(original.trim());
  });

  test("list with surrounding content round-trips", async ({ page }) => {
    const original = "# Heading\n\nSome paragraph text.\n\n- Item one\n- Item two\n\nMore text after.\n";
    await loadMarkdown(page, original);

    const result = await getMarkdown(page);
    expect(result).toContain("# Heading");
    expect(result).toContain("Some paragraph text.");
    expect(result).toContain("- Item one");
    expect(result).toContain("- Item two");
    expect(result).toContain("More text after.");
  });
});

test.describe("Menu Changes → Markdown Persistence", () => {
  test("changing bullet style to arrow persists in markdown via cortex-list comment", async ({ page }) => {
    await loadMarkdown(page, "- Apple\n- Banana\n");

    // Open block menu
    await openBlockMenu(page, 0);

    // Open Bullet style submenu
    await page.getByText("Bullet style").hover();
    await page.waitForTimeout(300);

    // Open the level submenu (click on the level entry)
    const levelEntry = page.locator("text=Bullet type").or(page.locator("text=Level 1"));
    await levelEntry.hover();
    await page.waitForTimeout(300);

    // Click Arrow style
    await page.getByText("Arrow").dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    // Verify markers changed
    const markers = await getListMarkers(page);
    expect(markers.every((m) => m === "→")).toBe(true);

    // Verify markdown has cortex-list comment
    const md = await getMarkdown(page);
    expect(md).toContain("<!-- cortex-list:");
    expect(md).toContain("arrow");
    expect(md).toContain("- Apple");
    expect(md).toContain("- Banana");
  });

  test("changed bullet style survives markdown round-trip", async ({ page }) => {
    await loadMarkdown(page, "- Apple\n- Banana\n");

    // Change to square bullets
    await openBlockMenu(page, 0);
    await page.getByText("Bullet style").hover();
    await page.waitForTimeout(300);
    const levelEntry = page.locator("text=Bullet type").or(page.locator("text=Level 1"));
    await levelEntry.hover();
    await page.waitForTimeout(300);
    await page.getByText("Square").dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    // Get markdown with comment
    const md = await getMarkdown(page);
    expect(md).toContain("square");

    // Reload from that markdown
    await loadMarkdown(page, md);

    // Verify square markers survived
    const markers = await getListMarkers(page);
    expect(markers.every((m) => m === "▪")).toBe(true);
  });

  test("switching to numbered type persists and round-trips", async ({ page }) => {
    await loadMarkdown(page, "- Alpha\n- Beta\n- Gamma\n");

    // Open block menu → Bullet style → Level → switch to Numbered
    await openBlockMenu(page, 0);
    await page.getByText("Bullet style").hover();
    await page.waitForTimeout(300);
    const levelEntry = page.locator("text=Bullet type").or(page.locator("text=Level 1"));
    await levelEntry.hover();
    await page.waitForTimeout(300);
    await page.getByText("Numbered").dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    // Verify markers are now numbers
    const markers = await getListMarkers(page);
    expect(markers[0]).toMatch(/1/);
    expect(markers[1]).toMatch(/2/);
    expect(markers[2]).toMatch(/3/);

    // Round-trip
    const md = await getMarkdown(page);
    expect(md).toContain("1.");

    await loadMarkdown(page, md);
    const markersAfter = await getListMarkers(page);
    expect(markersAfter[0]).toMatch(/1/);
    expect(markersAfter[1]).toMatch(/2/);
  });

  test("color change persists in markdown and round-trips", async ({ page }) => {
    await loadMarkdown(page, "- Red item\n- Blue item\n");

    // Open block menu → Bullet style → Level → Color
    await openBlockMenu(page, 0);
    await page.getByText("Bullet style").hover();
    await page.waitForTimeout(300);
    const levelEntry = page.locator("text=Bullet type").or(page.locator("text=Level 1"));
    await levelEntry.hover();
    await page.waitForTimeout(300);

    // Click the red color swatch
    const redSwatch = page.locator('[title="Red"]');
    await redSwatch.dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    // Verify marker color changed
    const styles = await getMarkerStyles(page);
    expect(styles[0].color).toContain("rgb(212, 76, 71)"); // #d44c47

    // Verify markdown has color in cortex-list comment
    const md = await getMarkdown(page);
    expect(md).toContain("cortex-list:");
    expect(md).toContain("#d44c47");

    // Round-trip
    await loadMarkdown(page, md);
    const stylesAfter = await getMarkerStyles(page);
    expect(stylesAfter[0].color).toContain("rgb(212, 76, 71)");
  });

  test("size change persists in markdown and round-trips", async ({ page }) => {
    await loadMarkdown(page, "- Big item\n- Small item\n");

    // Open block menu → Bullet style → Level → Size → Large
    await openBlockMenu(page, 0);
    await page.getByText("Bullet style").hover();
    await page.waitForTimeout(300);
    const levelEntry = page.locator("text=Bullet type").or(page.locator("text=Level 1"));
    await levelEntry.hover();
    await page.waitForTimeout(300);

    await page.getByText("Large").dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    // Verify marker size changed
    const styles = await getMarkerStyles(page);
    expect(styles[0].fontSize).toBe("1.1em");

    // Verify markdown persistence
    const md = await getMarkdown(page);
    expect(md).toContain("cortex-list:");
    expect(md).toContain("large");

    // Round-trip
    await loadMarkdown(page, md);
    const stylesAfter = await getMarkerStyles(page);
    expect(stylesAfter[0].fontSize).toBe("1.1em");
  });
});

test.describe("Mixed Content Round-trip", () => {
  test("list among other blocks preserves everything", async ({ page }) => {
    const md = [
      "# My Document",
      "",
      "Some intro text here.",
      "",
      "- First bullet",
      "- Second bullet",
      "  - Nested under second",
      "- Third bullet",
      "",
      "A concluding paragraph.",
    ].join("\n") + "\n";

    await loadMarkdown(page, md);

    // Verify blocks
    const blockCount = await getBlockCount(page);
    expect(blockCount).toBeGreaterThanOrEqual(4); // heading + para + list + para

    // Verify list content
    const texts = await getListItemTexts(page);
    expect(texts).toContain("First bullet");
    expect(texts).toContain("Nested under second");

    // Round-trip
    const result = await getMarkdown(page);
    expect(result).toContain("# My Document");
    expect(result).toContain("Some intro text here.");
    expect(result).toContain("- First bullet");
    expect(result).toContain("- Nested under second");
    expect(result).toContain("A concluding paragraph.");
  });

  test("multiple lists in a document each render independently", async ({ page }) => {
    const md = [
      "- Bullet one",
      "- Bullet two",
      "",
      "Between the lists.",
      "",
      "1. Number one",
      "2. Number two",
    ].join("\n") + "\n";

    await loadMarkdown(page, md);

    // Should have 2 list blocks
    const listBlocks = page.locator("[data-list-block]");
    await expect(listBlocks).toHaveCount(2);

    const result = await getMarkdown(page);
    expect(result).toContain("- Bullet one");
    expect(result).toContain("Between the lists.");
    expect(result).toContain("1. Number one");
  });

  test("cortex-list comment does not appear for default-styled lists", async ({ page }) => {
    const md = "- Simple\n- Default\n- List\n";
    await loadMarkdown(page, md);

    const result = await getMarkdown(page);
    expect(result).not.toContain("cortex-list:");
    expect(result.trim()).toBe("- Simple\n- Default\n- List");
  });
});

test.describe("Edge Cases", () => {
  test("empty list item renders and round-trips", async ({ page }) => {
    const md = "- First\n- \n- Third\n";
    await loadMarkdown(page, md);

    const texts = await getListItemTexts(page);
    expect(texts.length).toBe(3);
    expect(texts[0]).toBe("First");
    expect(texts[2]).toBe("Third");
  });

  test("single item list renders and round-trips", async ({ page }) => {
    const md = "- Only item\n";
    await loadMarkdown(page, md);

    const texts = await getListItemTexts(page);
    expect(texts).toEqual(["Only item"]);

    const result = await getMarkdown(page);
    expect(result.trim()).toBe("- Only item");
  });

  test("deeply nested list renders correctly", async ({ page }) => {
    const md = [
      "- Level 0",
      "  - Level 1",
      "    - Level 2",
      "      - Level 3",
    ].join("\n") + "\n";

    await loadMarkdown(page, md);

    const texts = await getListItemTexts(page);
    expect(texts).toEqual(["Level 0", "Level 1", "Level 2", "Level 3"]);

    // Each level should have a different bullet style (cycling)
    const markers = await getListMarkers(page);
    const uniqueMarkers = new Set(markers);
    expect(uniqueMarkers.size).toBeGreaterThanOrEqual(3);
  });

  test("escaped markdown characters in list items render literally", async ({ page }) => {
    // Backslash-escaped * should not start a list
    const md = "- Normal item\n\n\\* Not a list item\n";
    await loadMarkdown(page, md);

    // The list should have 1 item, the escaped line should be a paragraph
    const texts = await getListItemTexts(page);
    expect(texts).toEqual(["Normal item"]);

    // The escaped text should appear as a paragraph with literal *
    const paraText = await page.evaluate(() => {
      const blocks = document.querySelectorAll(".cx-editor [data-block-id]");
      for (const block of blocks) {
        const content = block.querySelector("[data-content]");
        const text = content?.textContent ?? "";
        if (text.includes("Not a list")) return text;
      }
      return "";
    });
    expect(paraText).toContain("* Not a list item");
  });

  test("mixed bullet/numbered at same indent level from markdown", async ({ page }) => {
    const md = [
      "1. Make my changes",
      "  1. Fix bug",
      "  2. Improve formatting",
      "2. Push commits",
      "3. Open PR",
      "  - Describe changes",
      "  - Mention team",
    ].join("\n") + "\n";

    await loadMarkdown(page, md);

    const texts = await getListItemTexts(page);
    expect(texts).toContain("Make my changes");
    expect(texts).toContain("Fix bug");
    expect(texts).toContain("Describe changes");

    // Level 1 items "Fix bug" should have number markers
    // Level 1 items "Describe changes" should have bullet markers
    const markers = await getListMarkers(page);
    const fixBugIdx = texts.indexOf("Fix bug");
    const describeIdx = texts.indexOf("Describe changes");
    expect(markers[fixBugIdx]).toMatch(/1|i/); // some number
    expect(markers[describeIdx]).toMatch(/[•◦▪–→]/); // some bullet
  });
});

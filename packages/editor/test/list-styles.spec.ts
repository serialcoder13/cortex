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

/** Open the block menu by clicking the grip handle */
async function openBlockMenu(page: Page, blockIndex: number = 0) {
  // Hover over the target block to reveal handles
  const blocks = editor(page).locator("[data-block-id]");
  await blocks.nth(blockIndex).hover();
  await page.waitForTimeout(200);

  const gripButton = page.locator(
    '[aria-label="Drag to reorder or click for options"]',
  );
  await gripButton.last().click();
  await page.waitForTimeout(300);
}

/** Create a numbered list with 3 items */
async function createNumberedList(page: Page) {
  await focusEditor(page);
  await typeText(page, "/numbered");
  await page.waitForTimeout(300);
  await pressKey(page, "Enter");
  await page.waitForTimeout(200);
  await typeText(page, "First");
  await pressKey(page, "Enter");
  await page.waitForTimeout(100);
  await typeText(page, "Second");
  await pressKey(page, "Enter");
  await page.waitForTimeout(100);
  await typeText(page, "Third");
  await page.waitForTimeout(200);
}

/** Create a bullet list with 3 items */
async function createBulletList(page: Page) {
  await focusEditor(page);
  await typeText(page, "/bullet");
  await page.waitForTimeout(300);
  await pressKey(page, "Enter");
  await page.waitForTimeout(200);
  await typeText(page, "Apple");
  await pressKey(page, "Enter");
  await page.waitForTimeout(100);
  await typeText(page, "Banana");
  await pressKey(page, "Enter");
  await page.waitForTimeout(100);
  await typeText(page, "Cherry");
  await page.waitForTimeout(200);
}

/** Get the visible list markers (bullet chars or number labels) */
async function getListMarkers(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const blocks = document.querySelectorAll(".cx-editor [data-block-id]");
    const markers: string[] = [];
    blocks.forEach((block) => {
      const markerEl = block.querySelector(
        "span[contenteditable='false']",
      );
      if (markerEl) {
        markers.push(markerEl.textContent?.trim() ?? "");
      }
    });
    return markers;
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  await page.waitForTimeout(200);
});

test.describe("Numbered List — Number Format", () => {
  test("block menu shows Number format option for numbered list", async ({
    page,
  }) => {
    await createNumberedList(page);
    await openBlockMenu(page, 0);

    await expect(page.getByText("Number format")).toBeVisible();
  });

  test("changing to uppercase letters applies A, B, C format", async ({
    page,
  }) => {
    await createNumberedList(page);
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

  test("changing to lowercase letters applies a, b, c format", async ({
    page,
  }) => {
    await createNumberedList(page);
    await openBlockMenu(page, 0);

    await page.getByText("Number format").hover();
    await page.waitForTimeout(300);
    await page.getByText("Lowercase").dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    const markers = await getListMarkers(page);
    expect(markers[0]).toContain("a");
    expect(markers[1]).toContain("b");
    expect(markers[2]).toContain("c");
  });

  test("changing to roman upper applies I, II, III format", async ({
    page,
  }) => {
    await createNumberedList(page);
    await openBlockMenu(page, 0);

    await page.getByText("Number format").hover();
    await page.waitForTimeout(300);
    await page.getByText("Roman (upper)").dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    const markers = await getListMarkers(page);
    expect(markers[0]).toContain("I");
    expect(markers[1]).toContain("II");
    expect(markers[2]).toContain("III");
  });

  test("number format applies to entire run, not just clicked block", async ({
    page,
  }) => {
    await createNumberedList(page);
    // Open menu on the SECOND item
    await openBlockMenu(page, 1);

    await page.getByText("Number format").hover();
    await page.waitForTimeout(300);
    await page.getByText("Uppercase").dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    // ALL items in the run should use the same format
    const markers = await getListMarkers(page);
    expect(markers[0]).toContain("A");
    expect(markers[1]).toContain("B");
    expect(markers[2]).toContain("C");
  });

  test("numberStyle is stored on the first block in the run", async ({
    page,
  }) => {
    await createNumberedList(page);
    await openBlockMenu(page, 1);

    await page.getByText("Number format").hover();
    await page.waitForTimeout(300);
    await page.getByText("Lowercase").dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    const doc = await getDoc(page);
    // The first numberedList block should have the numberStyle
    const firstNumBlock = doc.blocks.find(
      (b: any) => b.type === "numberedList",
    );
    expect(firstNumBlock?.props?.numberStyle).toBe("alpha-lower");
  });
});

test.describe("Numbered List — Start From", () => {
  test("block menu shows Start from input for numbered list", async ({
    page,
  }) => {
    await createNumberedList(page);
    await openBlockMenu(page, 0);

    await expect(page.getByText("Start from")).toBeVisible();
  });

  test("changing start from updates the numbering", async ({ page }) => {
    await createNumberedList(page);
    await openBlockMenu(page, 0);

    // Find the start-from input and change it
    const input = page.locator('input[type="number"]');
    await input.click();
    await input.fill("5");
    await input.press("Enter");
    await page.waitForTimeout(500);

    const markers = await getListMarkers(page);
    expect(markers[0]).toContain("5");
    expect(markers[1]).toContain("6");
    expect(markers[2]).toContain("7");
  });

  test("start from works with different number formats", async ({ page }) => {
    await createNumberedList(page);

    // First change to uppercase
    await openBlockMenu(page, 0);
    await page.getByText("Number format").hover();
    await page.waitForTimeout(300);
    await page.getByText("Uppercase").dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    // Then change start from to 3
    await openBlockMenu(page, 0);
    const input = page.locator('input[type="number"]');
    await input.click();
    await input.fill("3");
    await input.press("Enter");
    await page.waitForTimeout(500);

    const markers = await getListMarkers(page);
    // 3=C, 4=D, 5=E
    expect(markers[0]).toContain("C");
    expect(markers[1]).toContain("D");
    expect(markers[2]).toContain("E");
  });
});

test.describe("Bullet List — Bullet Style", () => {
  test("block menu shows Bullet style option for bullet list", async ({
    page,
  }) => {
    await createBulletList(page);
    await openBlockMenu(page, 0);

    await expect(page.getByText("Bullet style")).toBeVisible();
  });

  test("block menu does NOT show Number format for bullet list", async ({
    page,
  }) => {
    await createBulletList(page);
    await openBlockMenu(page, 0);

    await expect(page.getByText("Number format")).not.toBeVisible();
    await expect(page.getByText("Start from")).not.toBeVisible();
  });

  test("changing to dash applies – bullet", async ({ page }) => {
    await createBulletList(page);
    await openBlockMenu(page, 0);

    await page.getByText("Bullet style").hover();
    await page.waitForTimeout(300);
    await page.getByText("Dash").dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    const markers = await getListMarkers(page);
    expect(markers[0]).toBe("–");
  });

  test("changing to arrow applies → bullet", async ({ page }) => {
    await createBulletList(page);
    await openBlockMenu(page, 0);

    await page.getByText("Bullet style").hover();
    await page.waitForTimeout(300);
    await page.getByText("Arrow").dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    const markers = await getListMarkers(page);
    expect(markers[0]).toBe("→");
  });

  test("changing to circle applies ◦ bullet", async ({ page }) => {
    await createBulletList(page);
    await openBlockMenu(page, 0);

    await page.getByText("Bullet style").hover();
    await page.waitForTimeout(300);
    await page.getByText("Circle").dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    const markers = await getListMarkers(page);
    expect(markers[0]).toBe("◦");
  });

  test("listStyle is stored in block props", async ({ page }) => {
    await createBulletList(page);
    await openBlockMenu(page, 0);

    await page.getByText("Bullet style").hover();
    await page.waitForTimeout(300);
    await page.getByText("Square").dispatchEvent("mousedown");
    await page.waitForTimeout(500);

    const doc = await getDoc(page);
    const bulletBlock = doc.blocks.find(
      (b: any) => b.type === "bulletList",
    );
    expect(bulletBlock?.props?.listStyle).toBe("square");
  });
});

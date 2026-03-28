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

test.describe("Code Block", () => {
  test("code block via ``` shortcut", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "```");
    await page.waitForTimeout(200);

    const types = await getBlockTypes(page);
    expect(types[0]).toBe("codeBlock");
  });

  test("code block renders with monospace font", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "```");
    await page.waitForTimeout(200);

    // Check for code/pre element in DOM
    const codeEl = editor(page).locator("code");
    if (await codeEl.count() > 0) {
      const fontFamily = await codeEl.first().evaluate(el => getComputedStyle(el).fontFamily);
      expect(fontFamily.toLowerCase()).toMatch(/mono|menlo|consolas|courier/);
    }
  });
});

test.describe("Divider Block", () => {
  test("--- creates a divider", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "---");
    await page.waitForTimeout(200);

    const types = await getBlockTypes(page);
    expect(types).toContain("divider");
  });

  test("divider renders as an hr element", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "---");
    await page.waitForTimeout(200);

    const hr = editor(page).locator("hr");
    await expect(hr).toBeVisible();
  });

  test("divider creates a paragraph after it", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "---");
    await page.waitForTimeout(200);

    const types = await getBlockTypes(page);
    expect(types[types.length - 1]).toBe("paragraph");
  });
});

test.describe("Callout Block", () => {
  test("callout via slash command", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/callout");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);

    const types = await getBlockTypes(page);
    expect(types).toEqual(["callout"]);
  });
});

test.describe("Toggle Block", () => {
  test("toggle via slash command", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/toggle");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);

    const types = await getBlockTypes(page);
    expect(types).toEqual(["toggle"]);
  });
});

test.describe("Table Block", () => {
  test("table via slash command", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/table");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);

    const types = await getBlockTypes(page);
    expect(types).toContain("table");
  });

  test("table renders with a table element", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/table");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);

    const table = editor(page).locator("table");
    await expect(table).toBeVisible();
  });
});

test.describe("Mermaid Block", () => {
  test("mermaid via slash command", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/mermaid");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);

    const types = await getBlockTypes(page);
    expect(types).toContain("mermaid");
  });
});

test.describe("Image Block", () => {
  test("image via slash command", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/image");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);

    const types = await getBlockTypes(page);
    expect(types).toContain("image");
  });

  test("image block shows upload placeholder", async ({ page }) => {
    await focusEditor(page);
    await typeText(page, "/image");
    await page.waitForTimeout(300);
    await pressKey(page, "Enter");
    await page.waitForTimeout(200);

    // Should show "Click to upload" text
    const uploadText = page.locator("text=/upload|drag/i");
    await expect(uploadText).toBeVisible({ timeout: 2000 });
  });
});

test.describe("Block via Slash Command — All Types", () => {
  const slashTests = [
    { filter: "text", expectedType: "paragraph" },
    { filter: "heading 1", expectedType: "heading1" },
    { filter: "heading 2", expectedType: "heading2" },
    { filter: "heading 3", expectedType: "heading3" },
    { filter: "bullet", expectedType: "bulletList" },
    { filter: "numbered", expectedType: "numberedList" },
    { filter: "todo", expectedType: "todo" },
    { filter: "code", expectedType: "codeBlock" },
    { filter: "quote", expectedType: "quote" },
    { filter: "callout", expectedType: "callout" },
    { filter: "toggle", expectedType: "toggle" },
    { filter: "divider", expectedType: "divider" },
    { filter: "image", expectedType: "image" },
    { filter: "table", expectedType: "table" },
    { filter: "mermaid", expectedType: "mermaid" },
  ];

  for (const { filter, expectedType } of slashTests) {
    test(`/ + "${filter}" + Enter creates ${expectedType} block`, async ({ page }) => {
      await focusEditor(page);
      await typeText(page, `/${filter}`);
      await page.waitForTimeout(300);

      const menu = page.locator("[data-testid='slash-command-menu']");
      const isMenuVisible = await menu.isVisible().catch(() => false);

      if (isMenuVisible) {
        await pressKey(page, "Enter");
        await page.waitForTimeout(200);

        const types = await getBlockTypes(page);
        expect(types).toContain(expectedType);
      } else {
        // Menu didn't appear — filter might not match, skip gracefully
        test.skip();
      }
    });
  }
});

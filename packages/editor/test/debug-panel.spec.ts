import { test, expect, type Page } from "@playwright/test";

function editor(page: Page) { return page.locator(".cx-editor"); }

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  await page.waitForTimeout(200);
});

test.describe("Debug Panel", () => {
  test("debug panel is visible when debug mode is checked", async ({ page }) => {
    // Debug mode is on by default in the test harness
    const markdownTab = page.locator("button", { hasText: "Markdown" });
    await expect(markdownTab).toBeVisible();
  });

  test("debug panel shows markdown tab by default", async ({ page }) => {
    const markdownTab = page.locator("button", { hasText: "Markdown" });
    await expect(markdownTab).toBeVisible();
    // Markdown tab should be active (has accent border)
  });

  test("debug panel shows document JSON tab", async ({ page }) => {
    const jsonTab = page.locator("button", { hasText: "Document JSON" });
    await expect(jsonTab).toBeVisible();

    await jsonTab.click();
    await page.waitForTimeout(200);

    // Should show JSON content with "blocks" key
    const pre = page.locator("pre");
    const content = await pre.textContent();
    expect(content).toContain('"blocks"');
    expect(content).toContain('"type"');
  });

  test("debug panel shows selection tab", async ({ page }) => {
    await editor(page).click();
    await page.waitForTimeout(100);
    await page.keyboard.type("hello", { delay: 30 });
    await page.waitForTimeout(100);

    const selTab = page.locator("button", { hasText: "Selection" });
    await selTab.click();
    await page.waitForTimeout(200);

    const pre = page.locator("pre");
    const content = await pre.textContent();
    expect(content).toContain("anchor");
    expect(content).toContain("focus");
    expect(content).toContain("blockId");
  });

  test("debug panel updates markdown when content changes", async ({ page }) => {
    await editor(page).click();
    await page.waitForTimeout(100);
    await page.keyboard.type("Hello world", { delay: 30 });
    await page.waitForTimeout(200);

    const pre = page.locator("pre");
    const content = await pre.textContent();
    expect(content).toContain("Hello world");
  });

  test("debug panel shows heading markdown correctly", async ({ page }) => {
    await editor(page).click();
    await page.waitForTimeout(100);
    await page.keyboard.type("# Big Title", { delay: 30 });
    await page.waitForTimeout(200);

    const pre = page.locator("pre");
    const content = await pre.textContent();
    expect(content).toContain("# Big Title");
  });

  test("debug panel shows block count and version", async ({ page }) => {
    await editor(page).click();
    await page.waitForTimeout(100);
    await page.keyboard.type("line 1", { delay: 30 });
    await page.keyboard.press("Enter");
    await page.keyboard.type("line 2", { delay: 30 });
    await page.waitForTimeout(200);

    // Should show "2 blocks"
    const blockInfo = page.locator("text=/\\d+ blocks/");
    await expect(blockInfo).toBeVisible();
    const infoText = await blockInfo.textContent();
    expect(infoText).toContain("2 blocks");
  });

  test("toggling debug mode off hides the panel", async ({ page }) => {
    const debugCheckbox = page.locator("input[type='checkbox']").nth(1);
    await debugCheckbox.uncheck();
    await page.waitForTimeout(200);

    const markdownTab = page.locator("button", { hasText: "Markdown" });
    await expect(markdownTab).toBeHidden();
  });
});

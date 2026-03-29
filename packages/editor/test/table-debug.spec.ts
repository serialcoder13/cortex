import { test, expect } from "@playwright/test";

test("diagnose: table cell beforeinput handling", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  await page.waitForTimeout(200);

  // Create table
  await page.locator(".cx-editor").click();
  await page.waitForTimeout(100);
  await page.keyboard.type("/table", { delay: 30 });
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);

  // Set up listener to track beforeinput events
  await page.evaluate(() => {
    (window as any).__beforeInputLog = [];
    const editor = document.querySelector(".cx-editor");
    if (!editor) return;
    editor.addEventListener("beforeinput", (e: any) => {
      (window as any).__beforeInputLog.push({
        target: e.target?.tagName,
        targetCE: e.target?.contentEditable,
        closestCEFalse: !!e.target?.closest?.("[contenteditable='false']"),
        inputType: e.inputType,
        data: e.data,
        defaultPrevented: e.defaultPrevented,
      });
    }, true); // capture phase
  });

  // Click the first cell and type
  const tds = page.locator(".cx-editor table td");
  await tds.first().click();
  await page.waitForTimeout(200);
  await page.keyboard.type("X", { delay: 50 });
  await page.waitForTimeout(200);

  const log = await page.evaluate(() => (window as any).__beforeInputLog);
  console.log("=== BEFOREINPUT LOG ===");
  for (const entry of log) {
    console.log(JSON.stringify(entry));
  }

  // Check if the text went into the cell or the editor
  const cellText = await tds.first().textContent();
  const editorModel = await page.evaluate(() => {
    const ref = (window as any).__editorRef;
    const doc = ref?.getDocument?.();
    return doc?.blocks?.[0]?.content?.map((s: any) => s.text).join("");
  });

  console.log("Cell text:", cellText);
  console.log("Model text:", editorModel);

  expect(true).toBe(true);
});

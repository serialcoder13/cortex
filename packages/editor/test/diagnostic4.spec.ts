import { test, expect } from "@playwright/test";

test("diagnose: Shift+ArrowLeft selection state", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  await page.waitForTimeout(300);

  await page.locator(".cx-editor").click();
  await page.waitForTimeout(200);
  await page.keyboard.type("abcde", { delay: 30 });
  await page.waitForTimeout(200);

  // Check model before selection
  const before = await page.evaluate(() => {
    const ref = (window as any).__editorRef;
    const doc = ref?.getDocument?.();
    return {
      text: doc?.blocks?.[0]?.content?.map((s: any) => s.text).join(""),
    };
  });
  console.log("=== BEFORE SELECTION ===", JSON.stringify(before));

  // Select last 3 chars with Shift+ArrowLeft
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Shift+ArrowLeft");
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(200);

  // Check browser selection
  const selState = await page.evaluate(() => {
    const sel = window.getSelection();
    return {
      anchorOffset: sel?.anchorOffset,
      focusOffset: sel?.focusOffset,
      isCollapsed: sel?.isCollapsed,
      anchorText: sel?.anchorNode?.textContent,
      focusText: sel?.focusNode?.textContent,
      selectedText: sel?.toString(),
    };
  });
  console.log("=== BROWSER SELECTION ===", JSON.stringify(selState));

  // Type to replace
  await page.keyboard.type("X", { delay: 50 });
  await page.waitForTimeout(300);

  const after = await page.evaluate(() => {
    const ref = (window as any).__editorRef;
    const doc = ref?.getDocument?.();
    return {
      text: doc?.blocks?.[0]?.content?.map((s: any) => s.text).join(""),
      domText: document.querySelector(".cx-editor")?.textContent,
    };
  });
  console.log("=== AFTER REPLACE ===", JSON.stringify(after));

  expect(true).toBe(true);
});

test("diagnose: Cmd+B bold selection range", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  await page.waitForTimeout(300);

  await page.locator(".cx-editor").click();
  await page.waitForTimeout(200);
  await page.keyboard.type("hello world", { delay: 30 });
  await page.waitForTimeout(200);

  // Select "world" (5 chars back)
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Shift+ArrowLeft");
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(200);

  const selBefore = await page.evaluate(() => {
    const sel = window.getSelection();
    return {
      anchorOffset: sel?.anchorOffset,
      focusOffset: sel?.focusOffset,
      selectedText: sel?.toString(),
    };
  });
  console.log("=== SELECTION BEFORE BOLD ===", JSON.stringify(selBefore));

  await page.keyboard.press("Meta+b");
  await page.waitForTimeout(300);

  const afterBold = await page.evaluate(() => {
    const ref = (window as any).__editorRef;
    const doc = ref?.getDocument?.();
    return {
      content: doc?.blocks?.[0]?.content,
    };
  });
  console.log("=== AFTER BOLD ===", JSON.stringify(afterBold));

  expect(true).toBe(true);
});

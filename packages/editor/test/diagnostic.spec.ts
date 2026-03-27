import { test, expect, type Page } from "@playwright/test";

test("diagnose: what happens when we type one character", async ({ page }) => {
  // Collect ALL console messages
  const logs: string[] = [];
  const errors: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    logs.push(`[${msg.type()}] ${text}`);
    if (msg.type() === "error") errors.push(text);
  });

  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  await page.waitForTimeout(300);

  // Step 1: Check initial state
  const editorEl = page.locator(".cx-editor");
  const initialHTML = await editorEl.innerHTML();
  console.log("=== INITIAL DOM ===");
  console.log(initialHTML);

  // Step 2: Focus the editor
  await editorEl.click();
  await page.waitForTimeout(200);

  // Check selection state after focus
  const selAfterFocus = await page.evaluate(() => {
    const sel = window.getSelection();
    return {
      anchorNode: sel?.anchorNode?.nodeName,
      anchorOffset: sel?.anchorOffset,
      focusNode: sel?.focusNode?.nodeName,
      focusOffset: sel?.focusOffset,
      isCollapsed: sel?.isCollapsed,
      rangeCount: sel?.rangeCount,
      anchorTextContent: sel?.anchorNode?.textContent,
    };
  });
  console.log("=== SELECTION AFTER FOCUS ===");
  console.log(JSON.stringify(selAfterFocus, null, 2));

  // Check React state
  const stateAfterFocus = await page.evaluate(() => {
    const doc = (window as any).__editorDoc;
    const ref = (window as any).__editorRef;
    return {
      docExists: !!doc,
      refExists: !!ref,
      refDoc: ref?.getDocument?.(),
    };
  });
  console.log("=== REACT STATE AFTER FOCUS ===");
  console.log(JSON.stringify(stateAfterFocus, null, 2));

  // Step 3: Type ONE character
  await page.keyboard.type("A", { delay: 50 });
  await page.waitForTimeout(300);

  // Check DOM after typing
  const afterTypeHTML = await editorEl.innerHTML();
  console.log("=== DOM AFTER TYPING 'A' ===");
  console.log(afterTypeHTML);

  const domText = await editorEl.innerText();
  console.log("=== INNER TEXT AFTER 'A' ===");
  console.log(JSON.stringify(domText));

  // Check model
  const modelAfterType = await page.evaluate(() => {
    const doc = (window as any).__editorDoc;
    const ref = (window as any).__editorRef;
    const refDoc = ref?.getDocument?.();
    return {
      fromOnChange: doc ? {
        blocks: doc.blocks.map((b: any) => ({
          type: b.type,
          content: b.content,
          id: b.id,
        })),
        version: doc.version,
      } : null,
      fromRef: refDoc ? {
        blocks: refDoc.blocks.map((b: any) => ({
          type: b.type,
          content: b.content,
          id: b.id,
        })),
        version: refDoc.version,
      } : null,
    };
  });
  console.log("=== MODEL AFTER 'A' ===");
  console.log(JSON.stringify(modelAfterType, null, 2));

  // Check selection after typing
  const selAfterType = await page.evaluate(() => {
    const sel = window.getSelection();
    return {
      anchorNode: sel?.anchorNode?.nodeName,
      anchorOffset: sel?.anchorOffset,
      focusNode: sel?.focusNode?.nodeName,
      focusOffset: sel?.focusOffset,
      isCollapsed: sel?.isCollapsed,
      anchorTextContent: sel?.anchorNode?.textContent,
    };
  });
  console.log("=== SELECTION AFTER 'A' ===");
  console.log(JSON.stringify(selAfterType, null, 2));

  // Step 4: Type a second character
  await page.keyboard.type("B", { delay: 50 });
  await page.waitForTimeout(300);

  const afterType2HTML = await editorEl.innerHTML();
  console.log("=== DOM AFTER TYPING 'B' ===");
  console.log(afterType2HTML);

  const domText2 = await editorEl.innerText();
  console.log("=== INNER TEXT AFTER 'AB' ===");
  console.log(JSON.stringify(domText2));

  const modelAfterType2 = await page.evaluate(() => {
    const ref = (window as any).__editorRef;
    const refDoc = ref?.getDocument?.();
    return refDoc ? {
      blocks: refDoc.blocks.map((b: any) => ({
        type: b.type,
        content: b.content,
      })),
      version: refDoc.version,
    } : null;
  });
  console.log("=== MODEL AFTER 'AB' ===");
  console.log(JSON.stringify(modelAfterType2, null, 2));

  // Step 5: Check for any beforeinput event handling
  const beforeInputCheck = await page.evaluate(() => {
    return new Promise((resolve) => {
      const editor = document.querySelector(".cx-editor");
      if (!editor) {
        resolve({ error: "no editor" });
        return;
      }
      const result: any = { events: [] };
      editor.addEventListener("beforeinput", (e: any) => {
        result.events.push({
          type: e.inputType,
          data: e.data,
          defaultPrevented: false, // will be true if preventDefault was called
        });
      }, { capture: true });

      // We'll check after the next input
      setTimeout(() => resolve(result), 500);
    });
  });

  // Type one more to trigger the listener
  await page.keyboard.type("C", { delay: 50 });
  await page.waitForTimeout(600);

  const beforeInputResult = await page.evaluate(() => {
    // Actually, the above listener captured events
    return {
      finalDOM: document.querySelector(".cx-editor")?.innerHTML,
      finalText: document.querySelector(".cx-editor")?.textContent,
    };
  });
  console.log("=== BEFORE INPUT CHECK ===");
  console.log(JSON.stringify(beforeInputResult, null, 2));

  // Print all console logs/errors
  console.log("=== BROWSER CONSOLE ===");
  for (const log of logs) {
    console.log(log);
  }
  if (errors.length > 0) {
    console.log("=== ERRORS ===");
    for (const err of errors) {
      console.log(err);
    }
  }

  // This test always passes — it's purely diagnostic
  expect(true).toBe(true);
});

test("diagnose: does beforeinput fire and get prevented", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  await page.waitForTimeout(300);

  // Set up a native beforeinput listener to see if preventDefault is called
  await page.evaluate(() => {
    const editor = document.querySelector(".cx-editor");
    if (!editor) return;

    (window as any).__beforeInputEvents = [];

    editor.addEventListener("beforeinput", (e: any) => {
      (window as any).__beforeInputEvents.push({
        inputType: e.inputType,
        data: e.data,
        defaultPrevented: e.defaultPrevented,
        cancelable: e.cancelable,
        timeStamp: e.timeStamp,
      });
    }); // Note: NOT capturing — listening in bubble phase, AFTER React

    // Also listen in capture phase to see the event first
    editor.addEventListener("beforeinput", (e: any) => {
      (window as any).__beforeInputCapture = (window as any).__beforeInputCapture || [];
      (window as any).__beforeInputCapture.push({
        inputType: e.inputType,
        data: e.data,
        defaultPrevented: e.defaultPrevented,
        cancelable: e.cancelable,
      });
    }, { capture: true });
  });

  // Focus and type
  await page.locator(".cx-editor").click();
  await page.waitForTimeout(200);
  await page.keyboard.type("X", { delay: 50 });
  await page.waitForTimeout(300);

  const events = await page.evaluate(() => ({
    bubble: (window as any).__beforeInputEvents,
    capture: (window as any).__beforeInputCapture,
  }));

  console.log("=== BEFOREINPUT EVENTS ===");
  console.log("Capture phase:", JSON.stringify(events.capture, null, 2));
  console.log("Bubble phase:", JSON.stringify(events.bubble, null, 2));

  // Check if the event was prevented
  if (events.bubble && events.bubble.length > 0) {
    const lastEvent = events.bubble[events.bubble.length - 1];
    console.log("Default prevented?", lastEvent.defaultPrevented);
  }

  expect(true).toBe(true);
});

test("diagnose: check if selection state is null when typing", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  await page.waitForTimeout(300);

  // Monkey-patch onBeforeInput to log selection state
  await page.evaluate(() => {
    (window as any).__inputDebug = [];
    const editor = document.querySelector(".cx-editor");
    if (!editor) return;

    // Listen for React's beforeinput handling
    const origDispatch = editor.dispatchEvent.bind(editor);

    // Instead, let's patch at a higher level — add beforeinput listener
    editor.addEventListener("beforeinput", (e: any) => {
      const sel = window.getSelection();
      (window as any).__inputDebug.push({
        phase: "beforeinput-native",
        inputType: e.inputType,
        data: e.data,
        selection: sel ? {
          anchorNode: sel.anchorNode?.nodeName,
          anchorOffset: sel.anchorOffset,
          focusNode: sel.focusNode?.nodeName,
          focusOffset: sel.focusOffset,
          anchorText: sel.anchorNode?.textContent?.slice(0, 20),
        } : null,
      });
    }, { capture: true });

    // Track input events too
    editor.addEventListener("input", (e: any) => {
      (window as any).__inputDebug.push({
        phase: "input-after",
        inputType: e.inputType,
        domText: editor.textContent,
      });
    });
  });

  await page.locator(".cx-editor").click();
  await page.waitForTimeout(200);

  // Type 3 characters slowly
  for (const char of ["X", "Y", "Z"]) {
    await page.keyboard.type(char, { delay: 50 });
    await page.waitForTimeout(200);
  }

  const debug = await page.evaluate(() => (window as any).__inputDebug);
  console.log("=== INPUT DEBUG LOG ===");
  for (const entry of debug) {
    console.log(JSON.stringify(entry));
  }

  const finalText = await page.locator(".cx-editor").innerText();
  console.log("=== FINAL DOM TEXT ===");
  console.log(JSON.stringify(finalText));

  expect(true).toBe(true);
});

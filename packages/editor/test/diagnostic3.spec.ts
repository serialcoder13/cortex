import { test, expect } from "@playwright/test";

test("diagnose: patch CortexEditor to expose selection state", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  await page.waitForTimeout(300);

  // Patch the editor's onBeforeInput to log whether selection is null
  await page.evaluate(() => {
    (window as any).__patchLog = [];

    const editor = document.querySelector(".cx-editor");
    if (!editor) return;

    // Get the React fiber to check props
    const fiberKey = Object.keys(editor).find(k => k.startsWith("__reactFiber$"));
    const propsKey = Object.keys(editor).find(k => k.startsWith("__reactProps$"));
    if (propsKey) {
      const props = (editor as any)[propsKey];
      (window as any).__patchLog.push({
        hasOnBeforeInput: !!props.onBeforeInput,
        hasOnKeyDown: !!props.onKeyDown,
        propKeys: Object.keys(props).filter(k => k.startsWith("on")),
      });
    }
  });

  const patchLog = await page.evaluate(() => (window as any).__patchLog);
  console.log("=== REACT PROPS ON EDITOR ELEMENT ===");
  console.log(JSON.stringify(patchLog, null, 2));

  // Now: focus and check selection state changes
  await page.evaluate(() => {
    // Listen for selectionchange events
    (window as any).__selChanges = [];
    document.addEventListener("selectionchange", () => {
      const sel = window.getSelection();
      (window as any).__selChanges.push({
        ts: Date.now(),
        anchorOffset: sel?.anchorOffset,
        focusOffset: sel?.focusOffset,
        anchorNodeName: sel?.anchorNode?.nodeName,
        isCollapsed: sel?.isCollapsed,
      });
    });
  });

  await page.locator(".cx-editor").click();
  await page.waitForTimeout(300);

  const selChanges1 = await page.evaluate(() => (window as any).__selChanges);
  console.log("=== SELECTION CHANGES AFTER CLICK ===");
  console.log(JSON.stringify(selChanges1, null, 2));

  // Check React props AGAIN after click (React may have re-rendered)
  const propsAfterClick = await page.evaluate(() => {
    const editor = document.querySelector(".cx-editor");
    if (!editor) return null;
    const propsKey = Object.keys(editor).find(k => k.startsWith("__reactProps$"));
    if (!propsKey) return null;
    const props = (editor as any)[propsKey];

    // Try to call onBeforeInput with a fake event to see what happens
    (window as any).__fakeCallResult = null;
    try {
      const fakeEvent = {
        nativeEvent: new InputEvent("beforeinput", {
          inputType: "insertText",
          data: "Q",
          bubbles: true,
          cancelable: true,
        }),
        preventDefault: () => { (window as any).__fakeCallResult = "prevented"; },
        stopPropagation: () => {},
        isPropagationStopped: () => false,
        isDefaultPrevented: () => false,
        persist: () => {},
        type: "beforeinput",
      };
      props.onBeforeInput?.(fakeEvent);
    } catch (err: any) {
      (window as any).__fakeCallResult = `error: ${err.message}`;
    }

    return {
      hasOnBeforeInput: !!props.onBeforeInput,
      fakeCallResult: (window as any).__fakeCallResult,
    };
  });
  console.log("=== PROPS AFTER CLICK + FAKE CALL ===");
  console.log(JSON.stringify(propsAfterClick, null, 2));

  // Type and check if onBeforeInput is called via a wrapping listener
  await page.evaluate(() => {
    const editor = document.querySelector(".cx-editor");
    if (!editor) return;
    const propsKey = Object.keys(editor).find(k => k.startsWith("__reactProps$"));
    if (!propsKey) return;
    const props = (editor as any)[propsKey];
    const origHandler = props.onBeforeInput;

    (window as any).__onBeforeInputCalls = [];

    // Wrap the handler
    props.onBeforeInput = function (e: any) {
      (window as any).__onBeforeInputCalls.push({
        called: true,
        eventType: e?.type,
        nativeEventType: e?.nativeEvent?.constructor?.name,
        inputType: e?.nativeEvent?.inputType,
      });
      return origHandler?.(e);
    };
  });

  await page.keyboard.type("A", { delay: 50 });
  await page.waitForTimeout(300);

  const calls = await page.evaluate(() => (window as any).__onBeforeInputCalls);
  console.log("=== onBeforeInput CALLS ===");
  console.log(JSON.stringify(calls, null, 2));

  // Check final state
  const finalState = await page.evaluate(() => {
    const ref = (window as any).__editorRef;
    const doc = ref?.getDocument?.();
    return {
      domText: document.querySelector(".cx-editor")?.textContent,
      modelBlocks: doc?.blocks?.map((b: any) => ({
        type: b.type,
        text: b.content.map((s: any) => s.text).join(""),
      })),
      modelVersion: doc?.version,
    };
  });
  console.log("=== FINAL STATE ===");
  console.log(JSON.stringify(finalState, null, 2));

  expect(true).toBe(true);
});

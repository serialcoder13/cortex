import { test, expect } from "@playwright/test";

test("diagnose: is React onBeforeInput handler even called", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".cx-editor");
  await page.waitForTimeout(300);

  // Inject a direct native beforeinput listener to check if React prevents it
  // AND check React's internal event handling
  await page.evaluate(() => {
    (window as any).__reactBeforeInputCalled = false;
    (window as any).__nativeBeforeInputCalled = false;
    (window as any).__selectionAtInput = null;

    const editor = document.querySelector(".cx-editor");
    if (!editor) return;

    // Monkey-patch the React event handler by wrapping the native addEventListener
    // Actually, let's just check if onBeforeInput fires by adding a MutationObserver
    // to see if React prevents the DOM change

    // Check: does React's onBeforeInput even map to native beforeinput?
    // Let's check by looking at what event React registers
    const originalAddEventListener = editor.addEventListener.bind(editor);
    (editor as any).__eventListeners = [];
    // This won't capture React's handlers since they're on the root, but let's try
  });

  // Focus
  await page.locator(".cx-editor").click();
  await page.waitForTimeout(200);

  // Check if selection is set in React state by looking at what the ref exposes
  const selectionCheck = await page.evaluate(() => {
    // We can't access React internal state directly, but we can check
    // if the handler would fire by simulating the condition
    const ref = (window as any).__editorRef;
    if (!ref) return { error: "no ref" };

    const doc = ref.getDocument();
    return {
      doc: {
        blockCount: doc.blocks.length,
        firstBlockId: doc.blocks[0]?.id,
        firstBlockContent: doc.blocks[0]?.content,
      },
    };
  });
  console.log("=== EDITOR STATE ===");
  console.log(JSON.stringify(selectionCheck, null, 2));

  // The key question: does the React component have selection state?
  // Let's check by looking at the DOM for evidence of writeSelection
  // If writeSelection was called, it would have set the browser selection
  const selState = await page.evaluate(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return { noSelection: true };

    // Check if the selection is inside the editor
    const editor = document.querySelector(".cx-editor");
    const isInEditor = editor?.contains(sel.anchorNode);

    return {
      isInEditor,
      anchorOffset: sel.anchorOffset,
      focusOffset: sel.focusOffset,
      anchorNodeType: sel.anchorNode?.nodeType,
      anchorText: sel.anchorNode?.textContent,
    };
  });
  console.log("=== BROWSER SELECTION ===");
  console.log(JSON.stringify(selState, null, 2));

  // Now let's try dispatching a synthetic beforeinput event to see
  // if React's handler catches it
  await page.evaluate(() => {
    const editor = document.querySelector(".cx-editor");
    if (!editor) return;

    // Watch if this event gets prevented
    (window as any).__syntheticResult = null;

    const event = new InputEvent("beforeinput", {
      inputType: "insertText",
      data: "Q",
      bubbles: true,
      cancelable: true,
    });

    editor.dispatchEvent(event);

    (window as any).__syntheticResult = {
      defaultPrevented: event.defaultPrevented,
    };
  });

  const synthResult = await page.evaluate(() => (window as any).__syntheticResult);
  console.log("=== SYNTHETIC BEFOREINPUT RESULT ===");
  console.log(JSON.stringify(synthResult, null, 2));

  // Let's also check: does React 19 use native beforeinput or something else?
  // Check by looking at event delegation on the root
  const reactRoot = await page.evaluate(() => {
    const app = document.getElementById("app");
    const root = app?.firstChild;
    // React 19 attaches events to the root container
    // Let's check what events are registered
    const el = document.querySelector(".cx-editor");
    if (!el) return { error: "no editor" };

    // Check if there's an __reactEvents$ property or similar
    const keys = Object.keys(el).filter(k => k.startsWith("__react") || k.startsWith("_react"));
    return { reactKeys: keys };
  });
  console.log("=== REACT INTERNALS ===");
  console.log(JSON.stringify(reactRoot, null, 2));

  expect(true).toBe(true);
});

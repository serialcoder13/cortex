import React, { useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { CortexEditor, type CortexEditorRef, type EditorDocument, createDocument } from "../src";
import "../src/theme/default.css";

function log(msg: string) {
  const el = document.getElementById("debug");
  if (el) {
    el.textContent += msg + "\n";
    el.scrollTop = el.scrollHeight;
  }
  console.log("[harness]", msg);
}

function App() {
  const editorRef = useRef<CortexEditorRef>(null);

  const handleChange = useCallback((doc: EditorDocument) => {
    // Expose document state for Playwright to inspect
    (window as any).__editorDoc = doc;
    const text = doc.blocks.map((b) =>
      b.content.map((s) => s.text).join("")
    );
    log(`change: blocks=${doc.blocks.length} text=${JSON.stringify(text)}`);
  }, []);

  const handleIdle = useCallback((doc: EditorDocument) => {
    log("idle");
  }, []);

  const handleBlur = useCallback((doc: EditorDocument) => {
    log("blur");
  }, []);

  // Expose ref globally for Playwright
  const setRef = useCallback((ref: CortexEditorRef | null) => {
    (editorRef as any).current = ref;
    (window as any).__editorRef = ref;
  }, []);

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>CortexEditor Test Harness</h2>
      <div data-testid="editor-container">
        <CortexEditor
          ref={setRef}
          onChange={handleChange}
          onIdle={handleIdle}
          onBlur={handleBlur}
          placeholder="Type here to test..."
        />
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("app")!);
root.render(<App />);

// Expose for Playwright
(window as any).__getDoc = () => (window as any).__editorDoc;

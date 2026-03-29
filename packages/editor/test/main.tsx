import React, { useRef, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { CortexEditor, type CortexEditorRef, type EditorDocument, markdownToBlocks } from "../src";
import "./styles.css";

function App() {
  const editorRef = useRef<CortexEditorRef>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [debugMode, setDebugMode] = useState(true);

  const handleChange = useCallback((doc: EditorDocument) => {
    (window as any).__editorDoc = doc;
  }, []);

  const handleIdle = useCallback(() => {}, []);
  const handleBlur = useCallback(() => {}, []);

  const setRef = useCallback((ref: CortexEditorRef | null) => {
    (editorRef as any).current = ref;
    (window as any).__editorRef = ref;
  }, []);

  return (
    <div>
      {/* Header with controls */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16,
      }}>
        <h2 style={{ margin: 0 }}>CortexEditor Test Harness</h2>
        <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 13 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={readOnly}
              onChange={(e) => setReadOnly(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            Read-only
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={debugMode}
              onChange={(e) => setDebugMode(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            Debug mode
          </label>
        </div>
      </div>
      <div data-testid="editor-container">
        <CortexEditor
          ref={setRef}
          onChange={handleChange}
          onIdle={handleIdle}
          onBlur={handleBlur}
          readOnly={readOnly}
          debugMode={debugMode}
          placeholder="Type here to test..."
        />
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("app")!);
root.render(<App />);

(window as any).__getDoc = () => (window as any).__editorDoc;

(window as any).__loadMarkdown = (md: string) => {
  const blocks = markdownToBlocks(md);
  const ref = (window as any).__editorRef;
  if (ref) {
    ref.setDocument({ blocks, version: Date.now() });
    (window as any).__editorDoc = { blocks, version: Date.now() };
  }
  return blocks;
};

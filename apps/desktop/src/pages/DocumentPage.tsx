import { useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  CortexEditor,
  type CortexEditorRef,
  type EditorDocument,
  blocksToMarkdown,
  markdownToBlocks,
  parseFrontmatter,
  stringifyFrontmatter,
  createDocument,
} from "@cortex/editor";
import { useDocument } from "../lib/hooks/useDocument";

export function DocumentPage() {
  const [searchParams] = useSearchParams();
  const docPath = searchParams.get("path");
  const editorRef = useRef<CortexEditorRef>(null);

  const { content, loading, saving, save, saveNow } = useDocument(docPath);

  // Convert markdown content to editor document
  const initialDoc = useMemo((): EditorDocument | undefined => {
    if (!content) return undefined;
    const { body } = parseFrontmatter(content);
    const blocks = markdownToBlocks(body);
    return blocks.length > 0 ? { blocks, version: 0 } : createDocument();
  }, [content]);

  const handleChange = useCallback(
    (doc: EditorDocument) => {
      if (!docPath) return;
      const markdown = blocksToMarkdown(doc.blocks);
      const frontmatter = content ? parseFrontmatter(content).frontmatter : {};
      const full = stringifyFrontmatter(
        { ...frontmatter, modified: new Date().toISOString() },
        markdown,
      );
      save(full);
    },
    [docPath, content, save],
  );

  const handleIdle = useCallback(
    (doc: EditorDocument) => {
      if (!docPath || !content) return;
      const markdown = blocksToMarkdown(doc.blocks);
      const frontmatter = parseFrontmatter(content).frontmatter;
      const full = stringifyFrontmatter(
        { ...frontmatter, modified: new Date().toISOString() },
        markdown,
      );
      saveNow(full);
    },
    [docPath, content, saveNow],
  );

  const handleBlur = useCallback(
    (doc: EditorDocument) => {
      if (!docPath || !content) return;
      const markdown = blocksToMarkdown(doc.blocks);
      const frontmatter = parseFrontmatter(content).frontmatter;
      const full = stringifyFrontmatter(
        { ...frontmatter, modified: new Date().toISOString() },
        markdown,
      );
      saveNow(full);
    },
    [docPath, content, saveNow],
  );

  if (!docPath) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        Select a document or create a new one.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-neutral-600">{docPath}</span>
        {saving && <span className="text-xs text-neutral-500">Saving...</span>}
      </div>
      <CortexEditor
        ref={editorRef}
        initialDocument={initialDoc}
        onChange={handleChange}
        onIdle={handleIdle}
        onBlur={handleBlur}
        idleDebounceMs={60000}
        placeholder="Type '/' for commands..."
        className="min-h-[60vh]"
      />
    </div>
  );
}

import { useState, useCallback, useEffect, useRef } from "react";
import { storage } from "../storage";
import { AutoSave } from "../autosave";

export interface UseDocumentReturn {
  /** Decrypted document content (null while loading or when no path is set). */
  content: string | null;
  /** True while the document is being fetched from the vault. */
  loading: boolean;
  /** True while a write is in-flight. */
  saving: boolean;
  /** Human-readable error from the last failed load/save. */
  error: string | null;
  /** Queue a debounced auto-save. */
  save: (newContent: string) => void;
  /** Immediately persist content, bypassing the debounce timer. */
  saveNow: (newContent: string) => Promise<void>;
}

/**
 * React hook that loads a single document from the vault and provides
 * debounced auto-save via {@link AutoSave}.
 *
 * @param docPath  Vault-relative path of the document. Pass `null` to
 *                 indicate that no document is selected.
 */
export function useDocument(docPath: string | null): UseDocumentReturn {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const autoSaveRef = useRef<AutoSave | null>(null);
  const docPathRef = useRef(docPath);
  docPathRef.current = docPath;

  // ---------------------------------------------------------------------------
  // Initialise / tear-down the AutoSave instance once.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const autoSave = new AutoSave(async (path: string, text: string) => {
      setSaving(true);
      try {
        await storage.writeDocument(path, text);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Auto-save failed";
        setError(message);
      } finally {
        setSaving(false);
      }
    });

    autoSaveRef.current = autoSave;

    return () => {
      autoSave.destroy();
      autoSaveRef.current = null;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Load document whenever docPath changes.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!docPath) {
        setContent(null);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Flush any pending write for the *previous* document before loading
        // the new one so we don't lose edits.
        await autoSaveRef.current?.flush();

        const text = await storage.readDocument(docPath);
        if (!cancelled) {
          setContent(text);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "Failed to load document";
          setError(message);
          setContent(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [docPath]);

  // ---------------------------------------------------------------------------
  // Public save helpers
  // ---------------------------------------------------------------------------

  /** Schedule a debounced save. */
  const save = useCallback(
    (newContent: string) => {
      if (!docPathRef.current) return;
      setContent(newContent);
      autoSaveRef.current?.schedule(docPathRef.current, newContent);
    },
    [],
  );

  /** Persist immediately (e.g. on Ctrl+S or before navigating away). */
  const saveNow = useCallback(
    async (newContent: string) => {
      if (!docPathRef.current) return;

      setContent(newContent);
      setError(null);
      setSaving(true);

      try {
        // Write directly — no need to go through the debounce path.
        autoSaveRef.current?.cancel();
        await storage.writeDocument(docPathRef.current, newContent);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to save document";
        setError(message);
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  return { content, loading, saving, error, save, saveNow };
}

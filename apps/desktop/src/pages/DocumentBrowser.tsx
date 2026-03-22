import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { storage, type DocumentMeta } from "../lib/storage";

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentBrowser() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocumentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const allDocs = await storage.listDocuments();
        if (cancelled) return;
        setDocs(allDocs);
      } catch (err) {
        console.error("Failed to list documents:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Filter to docs/ paths, sort by modified date descending, then filter by search
  const filteredDocs = useMemo(() => {
    const docsList = docs
      .filter((d) => d.path.startsWith("docs/"))
      .sort(
        (a, b) =>
          new Date(b.modified_at).getTime() -
          new Date(a.modified_at).getTime(),
      );

    if (!searchQuery.trim()) return docsList;

    const query = searchQuery.toLowerCase();
    return docsList.filter(
      (d) =>
        d.title.toLowerCase().includes(query) ||
        d.path.toLowerCase().includes(query),
    );
  }, [docs, searchQuery]);

  const handleNewDocument = useCallback(async () => {
    setCreating(true);
    try {
      const timestamp = Date.now();
      const path = `docs/untitled-${timestamp}.md`;
      const content = `---\ntitle: "Untitled"\ndoc_type: note\ncreated: ${new Date().toISOString()}\n---\n\n`;
      await storage.writeDocument(path, content);
      navigate(`/doc?path=${encodeURIComponent(path)}`);
    } catch (err) {
      console.error("Failed to create document:", err);
    } finally {
      setCreating(false);
    }
  }, [navigate]);

  const handleDocClick = useCallback(
    (path: string) => {
      navigate(`/doc?path=${encodeURIComponent(path)}`);
    },
    [navigate],
  );

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Documents</h2>
        <button
          type="button"
          onClick={handleNewDocument}
          disabled={creating}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
          >
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
          {creating ? "Creating..." : "New Document"}
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
            clipRule="evenodd"
          />
        </svg>
        <input
          type="text"
          placeholder="Filter by title..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-neutral-800 bg-neutral-900 py-2.5 pl-10 pr-4 text-sm text-neutral-100 placeholder-neutral-500 outline-none transition-colors focus:border-neutral-600 focus:ring-1 focus:ring-neutral-600"
        />
      </div>

      {/* Document list */}
      {loading ? (
        <div className="flex h-64 items-center justify-center text-neutral-500">
          Loading...
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center gap-2 text-neutral-500">
          <p className="text-sm">
            {searchQuery
              ? "No documents match your filter."
              : "No documents yet."}
          </p>
          {!searchQuery && (
            <p className="text-xs text-neutral-600">
              Click "New Document" to create one.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          {filteredDocs.map((doc) => (
            <button
              key={doc.path}
              type="button"
              onClick={() => handleDocClick(doc.path)}
              className="flex w-full items-start gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-neutral-900"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="mt-0.5 h-5 w-5 flex-shrink-0 text-neutral-500"
              >
                <path
                  fillRule="evenodd"
                  d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5zm2.25 8.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 3a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-neutral-200">
                  {doc.title || doc.path}
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-neutral-500">
                  <span className="truncate">{doc.path}</span>
                  <span className="flex-shrink-0">{formatBytes(doc.size_bytes)}</span>
                  <span className="flex-shrink-0">{formatDate(doc.modified_at)}</span>
                </div>
                {doc.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {doc.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

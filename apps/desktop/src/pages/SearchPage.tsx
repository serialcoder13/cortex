import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { storage, type SearchResult } from "../lib/storage";

export function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!query.trim()) {
      setResults([]);
      setHasSearched(false);
      setSearching(false);
      return;
    }

    setSearching(true);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await storage.search(query.trim());
        setResults(res);
        setHasSearched(true);
      } catch (err) {
        console.error("Search failed:", err);
        setResults([]);
        setHasSearched(true);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  const handleResultClick = useCallback(
    (path: string) => {
      navigate(`/doc?path=${encodeURIComponent(path)}`);
    },
    [navigate],
  );

  // Highlight matching terms in snippet
  const highlightSnippet = useCallback(
    (snippet: string) => {
      if (!query.trim()) return snippet;

      const terms = query
        .trim()
        .split(/\s+/)
        .filter((t) => t.length > 0);
      if (terms.length === 0) return snippet;

      // Build a regex that matches any of the search terms
      const escaped = terms.map((t) =>
        t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      );
      const regex = new RegExp(`(${escaped.join("|")})`, "gi");

      const parts = snippet.split(regex);

      return parts.map((part, i) => {
        const isMatch = regex.test(part);
        // Reset regex lastIndex since it's stateful with 'g' flag
        regex.lastIndex = 0;
        return isMatch ? (
          <mark
            key={i}
            className="rounded bg-blue-500/30 px-0.5 text-blue-300"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        );
      });
    },
    [query],
  );

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Header */}
      <h2 className="mb-6 text-2xl font-semibold">Search</h2>

      {/* Search input */}
      <div className="relative mb-6">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-500"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
            clipRule="evenodd"
          />
        </svg>
        <input
          type="text"
          placeholder="Search across all documents..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          className="w-full rounded-lg border border-neutral-800 bg-neutral-900 py-3 pl-11 pr-4 text-sm text-neutral-100 placeholder-neutral-500 outline-none transition-colors focus:border-neutral-600 focus:ring-1 focus:ring-neutral-600"
        />
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <svg
              className="h-4 w-4 animate-spin text-neutral-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Results */}
      {!hasSearched && !searching && (
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-neutral-500">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-8 w-8 text-neutral-700"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <p className="text-sm">Type to search across your vault</p>
        </div>
      )}

      {hasSearched && !searching && results.length === 0 && (
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-neutral-500">
          <p className="text-sm">No results found for "{query}"</p>
          <p className="text-xs text-neutral-600">
            Try different keywords or check your spelling.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-1">
          <div className="mb-3 text-xs text-neutral-500">
            {results.length} result{results.length !== 1 ? "s" : ""}
          </div>

          {results.map((result) => (
            <button
              key={result.path}
              type="button"
              onClick={() => handleResultClick(result.path)}
              className="flex w-full flex-col gap-1 rounded-lg px-4 py-3 text-left transition-colors hover:bg-neutral-900"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-neutral-200">
                  {result.title || result.path}
                </span>
                <span className="flex-shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-500">
                  {Math.round(result.score * 100)}%
                </span>
              </div>
              <span className="text-xs text-neutral-500">{result.path}</span>
              {result.snippet && (
                <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-neutral-400">
                  {highlightSnippet(result.snippet)}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

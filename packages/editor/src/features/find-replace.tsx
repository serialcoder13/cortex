// ============================================================
// Find & Replace — floating bar (similar to toolbar style).
// Triggered via Cmd+F (find) or Cmd+H (find & replace).
// Highlights matches in the document and allows navigation.
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Search, Replace, ChevronUp, ChevronDown, X } from "lucide-react";
import type { EditorDocument, Block } from "../core/types";
import { getPlainText } from "../core/types";

export interface FindReplaceProps {
  doc: EditorDocument;
  /** Whether to show the replace input */
  showReplace: boolean;
  /** Called to highlight matches (pass match positions to editor) */
  onHighlight: (matches: FindMatch[]) => void;
  /** Called when user selects a match to navigate to */
  onNavigate: (match: FindMatch) => void;
  /** Called when replacing text */
  onReplace: (match: FindMatch, replacement: string) => void;
  /** Called when replacing all matches */
  onReplaceAll: (matches: FindMatch[], replacement: string) => void;
  /** Called when the panel should close */
  onClose: () => void;
}

export interface FindMatch {
  blockId: string;
  blockIndex: number;
  offset: number;
  length: number;
  text: string;
}

/** Find all occurrences of a query in the document */
export function findInDocument(doc: EditorDocument, query: string, caseSensitive = false): FindMatch[] {
  if (!query) return [];
  const matches: FindMatch[] = [];
  const q = caseSensitive ? query : query.toLowerCase();

  for (let i = 0; i < doc.blocks.length; i++) {
    const block = doc.blocks[i]!;
    const text = getPlainText(block.content);
    const searchText = caseSensitive ? text : text.toLowerCase();
    let pos = 0;
    while (pos < searchText.length) {
      const idx = searchText.indexOf(q, pos);
      if (idx === -1) break;
      matches.push({
        blockId: block.id,
        blockIndex: i,
        offset: idx,
        length: query.length,
        text: text.slice(idx, idx + query.length),
      });
      pos = idx + 1;
    }
  }
  return matches;
}

export function FindReplaceBar({
  doc,
  showReplace: initialShowReplace,
  onHighlight,
  onNavigate,
  onReplace,
  onReplaceAll,
  onClose,
}: FindReplaceProps) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [showReplace, setShowReplace] = useState(initialShowReplace);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [matches, setMatches] = useState<FindMatch[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Search when query or doc changes
  useEffect(() => {
    const found = findInDocument(doc, query);
    setMatches(found);
    setCurrentIndex(0);
    onHighlight(found);
  }, [query, doc, onHighlight]);

  // Navigate to current match
  useEffect(() => {
    if (matches.length > 0 && matches[currentIndex]) {
      onNavigate(matches[currentIndex]);
    }
  }, [currentIndex, matches, onNavigate]);

  const goNext = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIndex((i) => (i + 1) % matches.length);
  }, [matches.length]);

  const goPrev = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIndex((i) => (i - 1 + matches.length) % matches.length);
  }, [matches.length]);

  const handleReplace = useCallback(() => {
    if (matches.length === 0 || !matches[currentIndex]) return;
    onReplace(matches[currentIndex], replacement);
  }, [matches, currentIndex, replacement, onReplace]);

  const handleReplaceAll = useCallback(() => {
    if (matches.length === 0) return;
    onReplaceAll(matches, replacement);
  }, [matches, replacement, onReplaceAll]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      goNext();
    } else if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      goPrev();
    }
  }, [onClose, goNext, goPrev]);

  const btnStyle = (enabled: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 26,
    height: 26,
    borderRadius: 4,
    border: "none",
    cursor: enabled ? "pointer" : "default",
    backgroundColor: "transparent",
    color: enabled ? "var(--text-secondary, #4a4a4a)" : "var(--text-muted, #ccc)",
    transition: "background-color 80ms",
  });

  const inputStyle: React.CSSProperties = {
    border: "none",
    outline: "none",
    background: "transparent",
    color: "var(--text-primary, #1a1a1a)",
    fontSize: 13,
    padding: "4px 0",
    fontFamily: "inherit",
    flex: 1,
    minWidth: 0,
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "8px 10px",
        borderRadius: "0 0 0 10px",
        backgroundColor: "var(--bg-secondary, #f5f5f5)",
        border: "1px solid var(--border-primary, #e5e5e5)",
        borderTop: "none",
        borderRight: "none",
        boxShadow: "0 2px 12px var(--shadow, rgba(0,0,0,0.1))",
        fontSize: 13,
      }}
    >
      {/* Find row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Search size={14} style={{ color: "var(--text-muted, #999)", flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Find..."
          style={{ ...inputStyle, width: 180 }}
        />
        <span style={{
          fontSize: 11,
          color: "var(--text-muted, #999)",
          flexShrink: 0,
          minWidth: 40,
          textAlign: "center",
        }}>
          {matches.length > 0 ? `${currentIndex + 1}/${matches.length}` : "0/0"}
        </span>
        <button type="button" onClick={goPrev} style={btnStyle(matches.length > 0)} title="Previous (Shift+Enter)">
          <ChevronUp size={14} />
        </button>
        <button type="button" onClick={goNext} style={btnStyle(matches.length > 0)} title="Next (Enter)">
          <ChevronDown size={14} />
        </button>
        <button
          type="button"
          onClick={() => setShowReplace(!showReplace)}
          style={{
            ...btnStyle(true),
            backgroundColor: showReplace ? "var(--bg-active, #e0e0e0)" : "transparent",
          }}
          title="Toggle replace"
        >
          <Replace size={14} />
        </button>
        <button type="button" onClick={onClose} style={btnStyle(true)} title="Close (Esc)">
          <X size={14} />
        </button>
      </div>

      {/* Replace row */}
      {showReplace && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 20 }}>
          <input
            type="text"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Replace with..."
            style={{ ...inputStyle, width: 180 }}
          />
          <button
            type="button"
            onClick={handleReplace}
            style={{
              border: "none",
              borderRadius: 4,
              padding: "3px 8px",
              fontSize: 11,
              fontWeight: 500,
              cursor: matches.length > 0 ? "pointer" : "default",
              backgroundColor: matches.length > 0 ? "var(--bg-tertiary, #eee)" : "transparent",
              color: matches.length > 0 ? "var(--text-primary, #1a1a1a)" : "var(--text-muted, #ccc)",
            }}
            title="Replace current"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={handleReplaceAll}
            style={{
              border: "none",
              borderRadius: 4,
              padding: "3px 8px",
              fontSize: 11,
              fontWeight: 500,
              cursor: matches.length > 0 ? "pointer" : "default",
              backgroundColor: matches.length > 0 ? "var(--bg-tertiary, #eee)" : "transparent",
              color: matches.length > 0 ? "var(--text-primary, #1a1a1a)" : "var(--text-muted, #ccc)",
            }}
            title="Replace all"
          >
            All
          </button>
        </div>
      )}
    </div>
  );
}

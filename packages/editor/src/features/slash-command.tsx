// ============================================================
// Slash Command Menu — appears when user types "/" in an
// empty or beginning-of-block position. Shows a filterable
// list of block types to insert.
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BlockType } from "../core/types";
import { blockDefinitions, type BlockDefinition } from "../blocks/registry";

interface SlashCommandProps {
  /** Screen position where the menu should appear */
  position: { x: number; y: number };
  /** Current filter text (characters typed after "/") */
  filter: string;
  /** Called when a block type is selected */
  onSelect: (type: BlockType) => void;
  /** Called when the menu should close */
  onClose: () => void;
}

export function SlashCommandMenu({ position, filter, onSelect, onClose }: SlashCommandProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // Filter block definitions based on input
  const filtered = useMemo(() => {
    if (!filter) return blockDefinitions;
    const lower = filter.toLowerCase();
    return blockDefinitions.filter(
      (def) =>
        def.label.toLowerCase().includes(lower) ||
        def.description.toLowerCase().includes(lower) ||
        def.keywords.some((k) => k.includes(lower)),
    );
  }, [filter]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => (i + 1) % filtered.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
          break;
        case "Enter": {
          e.preventDefault();
          const item = filtered[selectedIndex];
          if (item) onSelect(item.type);
          break;
        }
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [filtered, selectedIndex, onSelect, onClose]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  // Scroll selected item into view
  useEffect(() => {
    const selected = menuRef.current?.querySelector("[data-selected=true]");
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (filtered.length === 0) {
    return (
      <div
        ref={menuRef}
        className="cx-fixed cx-z-50 cx-w-72 cx-rounded-lg cx-border cx-border-neutral-700 cx-bg-neutral-900 cx-p-2 cx-shadow-xl"
        style={{ left: position.x, top: position.y }}
      >
        <p className="cx-px-2 cx-py-3 cx-text-center cx-text-sm cx-text-neutral-500">
          No matching blocks
        </p>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      className="cx-fixed cx-z-50 cx-max-h-80 cx-w-72 cx-overflow-y-auto cx-rounded-lg cx-border cx-border-neutral-700 cx-bg-neutral-900 cx-py-1 cx-shadow-xl"
      style={{ left: position.x, top: position.y }}
    >
      <div className="cx-px-3 cx-py-1.5 cx-text-xs cx-font-medium cx-uppercase cx-tracking-wider cx-text-neutral-500">
        Blocks
      </div>
      {filtered.map((def, i) => (
        <button
          key={def.type}
          type="button"
          data-selected={i === selectedIndex}
          className={`cx-flex cx-w-full cx-items-center cx-gap-3 cx-px-3 cx-py-2 cx-text-left cx-transition-colors ${
            i === selectedIndex
              ? "cx-bg-neutral-800 cx-text-white"
              : "cx-text-neutral-300 hover:cx-bg-neutral-800/50"
          }`}
          onClick={() => onSelect(def.type)}
          onMouseEnter={() => setSelectedIndex(i)}
        >
          <span className="cx-flex cx-h-8 cx-w-8 cx-items-center cx-justify-center cx-rounded cx-bg-neutral-800 cx-text-sm">
            {getBlockIcon(def.type)}
          </span>
          <div>
            <div className="cx-text-sm cx-font-medium">{def.label}</div>
            <div className="cx-text-xs cx-text-neutral-500">{def.description}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

function getBlockIcon(type: BlockType): string {
  const icons: Record<string, string> = {
    paragraph: "T",
    heading1: "H1",
    heading2: "H2",
    heading3: "H3",
    bulletList: "•",
    numberedList: "1.",
    todo: "☐",
    codeBlock: "<>",
    quote: "❝",
    callout: "💡",
    toggle: "▶",
    divider: "—",
    image: "🖼",
    embed: "🔗",
    table: "⊞",
  };
  return icons[type] ?? "¶";
}

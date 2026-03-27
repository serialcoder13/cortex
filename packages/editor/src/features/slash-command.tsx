// ============================================================
// Slash Command Menu — appears when user types "/" in an
// empty or beginning-of-block position. Shows a filterable
// list of block types to insert, grouped by category.
// ============================================================

import React, { useEffect, useMemo, useRef, useState } from "react";
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

// Group definitions by category for display
const CATEGORIES: { label: string; types: BlockType[] }[] = [
  { label: "Basic", types: ["paragraph", "heading1", "heading2", "heading3"] },
  { label: "Lists", types: ["bulletList", "numberedList", "todo"] },
  { label: "Advanced", types: ["codeBlock", "quote", "callout", "toggle"] },
  { label: "Media", types: ["divider", "image", "embed", "table"] },
];

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

  // Group filtered items by category
  const grouped = useMemo(() => {
    if (filter) {
      // When filtering, show flat list
      return [{ label: "Results", items: filtered }];
    }
    return CATEGORIES.map((cat) => ({
      label: cat.label,
      items: cat.types
        .map((t) => filtered.find((d) => d.type === t))
        .filter(Boolean) as BlockDefinition[],
    })).filter((g) => g.items.length > 0);
  }, [filtered, filter]);

  // Flat list for keyboard nav
  const flatItems = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

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
          setSelectedIndex((i) => (i + 1) % flatItems.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => (i - 1 + flatItems.length) % flatItems.length);
          break;
        case "Enter": {
          e.preventDefault();
          const item = flatItems[selectedIndex];
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
  }, [flatItems, selectedIndex, onSelect, onClose]);

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

  // Compute position, flipping upward if near bottom of viewport
  const menuStyle = useMemo(() => {
    const maxHeight = 340;
    const flipUp = position.y + maxHeight > window.innerHeight - 20;
    return {
      left: position.x,
      top: flipUp ? undefined : position.y,
      bottom: flipUp ? window.innerHeight - position.y + 8 : undefined,
    };
  }, [position]);

  if (flatItems.length === 0) {
    return (
      <div
        ref={menuRef}
        className="cx-fixed cx-z-50 cx-w-72 cx-rounded-lg cx-p-2 cx-menu-enter"
        style={{
          ...menuStyle,
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-primary)",
          boxShadow: "0 4px 16px var(--shadow)",
        }}
      >
        <p
          className="cx-px-2 cx-py-3 cx-text-center cx-text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          No matching blocks
        </p>
      </div>
    );
  }

  let flatIndex = 0;

  return (
    <div
      ref={menuRef}
      data-testid="slash-command-menu"
      className="cx-fixed cx-z-50 cx-max-h-[340px] cx-w-72 cx-overflow-y-auto cx-rounded-lg cx-py-1 cx-menu-enter"
      style={{
        ...menuStyle,
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border-primary)",
        boxShadow: "0 4px 16px var(--shadow)",
      }}
    >
      {grouped.map((group) => (
        <div key={group.label}>
          <div
            className="cx-px-3 cx-py-1.5 cx-text-[11px] cx-font-medium cx-uppercase cx-tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            {group.label}
          </div>
          {group.items.map((def) => {
            const idx = flatIndex++;
            const isSelected = idx === selectedIndex;
            return (
              <button
                key={def.type}
                type="button"
                data-selected={isSelected}
                className="cx-flex cx-w-full cx-items-center cx-gap-3 cx-px-3 cx-py-2 cx-text-left cx-transition-colors cx-rounded-md cx-mx-0"
                style={{
                  backgroundColor: isSelected ? "var(--bg-tertiary)" : "transparent",
                  color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
                }}
                onClick={() => onSelect(def.type)}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <span
                  className="cx-flex cx-h-9 cx-w-9 cx-items-center cx-justify-center cx-rounded-md cx-text-sm cx-flex-shrink-0"
                  style={{
                    backgroundColor: "var(--bg-tertiary)",
                    color: "var(--text-primary)",
                  }}
                >
                  {getBlockIcon(def.type)}
                </span>
                <div className="cx-flex-1 cx-min-w-0">
                  <div className="cx-text-sm cx-font-medium" style={{ color: "var(--text-primary)" }}>
                    {def.label}
                  </div>
                  <div className="cx-text-xs" style={{ color: "var(--text-muted)" }}>
                    {def.description}
                  </div>
                </div>
                {def.shortcut && (
                  <span
                    className="cx-text-[11px] cx-font-mono cx-flex-shrink-0"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {def.shortcut}
                  </span>
                )}
              </button>
            );
          })}
        </div>
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

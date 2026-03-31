// ============================================================
// Slash Command Menu — appears when user types "/" in an
// empty or beginning-of-block position. Shows a filterable
// list of block types to insert, grouped by category.
// ============================================================

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { BlockType } from "../core/types";
import { blockDefinitions, type BlockDefinition } from "../blocks/registry";
import {
  Type,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  List,
  CheckSquare,
  Code,
  Quote,
  Lightbulb,
  ChevronRight,
  TableOfContents,
  Minus,
  Image,
  Link,
  Table,
  Component,
} from "lucide-react";

interface SlashCommandProps {
  position: { x: number; y: number };
  filter: string;
  onSelect: (type: BlockType) => void;
  onClose: () => void;
}

const CATEGORIES: { label: string; types: BlockType[] }[] = [
  { label: "Basic", types: ["paragraph", "heading1", "heading2", "heading3", "heading4", "heading5", "heading6"] },
  { label: "Lists", types: ["list", "todo"] },
  { label: "Advanced", types: ["codeBlock", "quote", "callout", "toggle", "toc", "customComponent"] },
  { label: "Media", types: ["divider", "image", "embed", "table"] },
];

const ICON_SIZE = 16;

function getBlockIcon(type: BlockType): React.ReactNode {
  const icons: Record<string, React.ReactNode> = {
    paragraph: <Type size={ICON_SIZE} />,
    heading1: <Heading1 size={ICON_SIZE} />,
    heading2: <Heading2 size={ICON_SIZE} />,
    heading3: <Heading3 size={ICON_SIZE} />,
    heading4: <Heading4 size={ICON_SIZE} />,
    heading5: <Heading5 size={ICON_SIZE} />,
    heading6: <Heading6 size={ICON_SIZE} />,
    list: <List size={ICON_SIZE} />,
    todo: <CheckSquare size={ICON_SIZE} />,
    codeBlock: <Code size={ICON_SIZE} />,
    quote: <Quote size={ICON_SIZE} />,
    callout: <Lightbulb size={ICON_SIZE} />,
    toggle: <ChevronRight size={ICON_SIZE} />,
    divider: <Minus size={ICON_SIZE} />,
    image: <Image size={ICON_SIZE} />,
    embed: <Link size={ICON_SIZE} />,
    table: <Table size={ICON_SIZE} />,
    toc: <TableOfContents size={ICON_SIZE} />,
    customComponent: <Component size={ICON_SIZE} />,
  };
  return icons[type] ?? <Type size={ICON_SIZE} />;
}

export function SlashCommandMenu({ position, filter, onSelect, onClose }: SlashCommandProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const grouped = useMemo(() => {
    if (filter) {
      return [{ label: "Results", items: filtered }];
    }
    return CATEGORIES.map((cat) => ({
      label: cat.label,
      items: cat.types
        .map((t) => filtered.find((d) => d.type === t))
        .filter(Boolean) as BlockDefinition[],
    })).filter((g) => g.items.length > 0);
  }, [filtered, filter]);

  const flatItems = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  useEffect(() => { setSelectedIndex(0); }, [filter]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          e.stopImmediatePropagation();
          setSelectedIndex((i) => (i + 1) % flatItems.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          e.stopImmediatePropagation();
          setSelectedIndex((i) => (i - 1 + flatItems.length) % flatItems.length);
          break;
        case "Enter": {
          e.preventDefault();
          e.stopImmediatePropagation();
          const item = flatItems[selectedIndex];
          if (item) onSelect(item.type);
          break;
        }
        case "Escape":
          e.preventDefault();
          e.stopImmediatePropagation();
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

  // Scroll selected into view
  useEffect(() => {
    const el = menuRef.current?.querySelector("[data-selected=true]");
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const menuPos = useMemo(() => {
    const flipUp = position.y + 340 > globalThis.innerHeight - 20;
    return {
      position: "fixed" as const,
      left: position.x,
      top: flipUp ? undefined : position.y,
      bottom: flipUp ? globalThis.innerHeight - position.y + 8 : undefined,
      zIndex: 50,
    };
  }, [position]);

  if (flatItems.length === 0) {
    return (
      <div
        ref={menuRef}
        style={{
          ...menuPos,
          width: 240,
          borderRadius: 10,
          padding: 8,
          backgroundColor: "var(--bg-secondary, #f5f5f5)",
          border: "1px solid var(--border-primary, #e5e5e5)",
          boxShadow: "0 4px 20px var(--shadow, rgba(0,0,0,0.12))",
        }}
      >
        <p style={{ padding: "12px 8px", textAlign: "center", fontSize: 13, color: "var(--text-muted, #999)", margin: 0 }}>
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
      style={{
        ...menuPos,
        width: 240,
        maxHeight: 340,
        overflowY: "auto",
        overflowX: "hidden",
        scrollbarWidth: "thin",
        scrollbarColor: "rgba(0,0,0,0.15) transparent",
        borderRadius: 10,
        padding: "4px 0",
        backgroundColor: "var(--bg-secondary, #f5f5f5)",
        border: "1px solid var(--border-primary, #e5e5e5)",
        boxShadow: "0 4px 20px var(--shadow, rgba(0,0,0,0.12))",
      }}
    >
      {grouped.map((group) => (
        <div key={group.label}>
          {/* Category label */}
          <div
            style={{
              padding: "8px 12px 4px",
              fontSize: 10,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--text-muted, #999)",
              opacity: 0.8,
            }}
          >
            {group.label}
          </div>
          {/* Items */}
          {group.items.map((def) => {
            const idx = flatIndex++;
            const isSelected = idx === selectedIndex;
            return (
              <button
                key={def.type}
                type="button"
                data-selected={isSelected}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSelect(def.type)}
                onMouseEnter={() => setSelectedIndex(idx)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "6px 10px",
                  margin: "0 2px",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  textAlign: "left",
                  backgroundColor: isSelected ? "var(--bg-tertiary, #eee)" : "transparent",
                  color: isSelected ? "var(--text-primary, #1a1a1a)" : "var(--text-secondary, #4a4a4a)",
                  transition: "background-color 80ms",
                  fontFamily: "inherit",
                  fontSize: 13,
                  boxSizing: "border-box",
                }}
              >
                {/* Icon */}
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    backgroundColor: "var(--bg-tertiary, #eee)",
                    color: "var(--text-primary, #1a1a1a)",
                    flexShrink: 0,
                  }}
                >
                  {getBlockIcon(def.type)}
                </span>
                {/* Label + description */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13, color: "var(--text-primary, #1a1a1a)" }}>
                    {def.label}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted, #999)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {def.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

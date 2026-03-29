// ============================================================
// Emoji Picker — appears when user types ":" in text.
// Shows a filterable list of emoji shortcodes with previews.
// Uses the same UX patterns as the slash command menu.
// ============================================================

import React, { useEffect, useMemo, useRef, useState } from "react";
import { emojiMap } from "../markdown/emoji";

interface EmojiPickerProps {
  position: { x: number; y: number };
  filter: string;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

// Pre-compute the list for fast filtering
const EMOJI_LIST = Object.entries(emojiMap)
  .filter(([key]) => key.length > 1) // skip single-char emoticon shortcuts
  .map(([name, char]) => ({ name, char }));

// Categorize common emoji for the unfiltered view
const CATEGORIES: { label: string; names: string[] }[] = [
  { label: "Smileys", names: ["smile", "grinning", "laughing", "joy", "wink", "blush", "heart_eyes", "sunglasses", "thinking", "cry", "angry", "thumbsup", "thumbsdown", "clap", "pray", "wave"] },
  { label: "Hearts", names: ["heart", "sparkling_heart", "broken_heart", "fire", "star", "sparkles", "100", "tada", "trophy", "crown"] },
  { label: "Nature", names: ["dog", "cat", "unicorn", "rainbow", "sun_with_face", "cloud", "snowflake", "ocean", "rose", "four_leaf_clover"] },
  { label: "Food", names: ["coffee", "pizza", "hamburger", "cake", "beer", "wine_glass", "apple", "avocado", "cookie"] },
  { label: "Objects", names: ["rocket", "bulb", "book", "memo", "computer", "gear", "warning", "eyes", "brain", "link"] },
];

export function EmojiPicker({ position, filter, onSelect, onClose }: EmojiPickerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!filter) {
      // Show categorized view
      return CATEGORIES.flatMap((cat) =>
        cat.names
          .map((n) => EMOJI_LIST.find((e) => e.name === n))
          .filter(Boolean) as { name: string; char: string }[],
      );
    }
    const lower = filter.toLowerCase();
    return EMOJI_LIST.filter((e) => e.name.includes(lower)).slice(0, 50);
  }, [filter]);

  useEffect(() => { setSelectedIndex(0); }, [filter]);

  // Keyboard navigation (capture phase, same as slash command)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          e.stopImmediatePropagation();
          setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          e.stopImmediatePropagation();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter": {
          e.preventDefault();
          e.stopImmediatePropagation();
          const item = filtered[selectedIndex];
          if (item) onSelect(item.char);
          break;
        }
        case "Escape":
          e.preventDefault();
          e.stopImmediatePropagation();
          onClose();
          break;
        case "Tab": {
          e.preventDefault();
          e.stopImmediatePropagation();
          const item = filtered[selectedIndex];
          if (item) onSelect(item.char);
          break;
        }
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

  // Scroll selected into view
  useEffect(() => {
    const el = menuRef.current?.querySelector("[data-selected=true]");
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Position with flip-up detection
  const menuPos = useMemo(() => {
    const flipUp = position.y + 280 > globalThis.innerHeight - 20;
    return {
      position: "fixed" as const,
      left: position.x,
      top: flipUp ? undefined : position.y,
      bottom: flipUp ? globalThis.innerHeight - position.y + 8 : undefined,
      zIndex: 50,
    };
  }, [position]);

  if (filtered.length === 0) {
    return (
      <div
        ref={menuRef}
        style={{
          ...menuPos,
          width: 260,
          borderRadius: 10,
          padding: 8,
          backgroundColor: "var(--bg-secondary, #f5f5f5)",
          border: "1px solid var(--border-primary, #e5e5e5)",
          boxShadow: "0 4px 20px var(--shadow, rgba(0,0,0,0.12))",
        }}
      >
        <p style={{ padding: "12px 8px", textAlign: "center", fontSize: 13, color: "var(--text-muted, #999)", margin: 0 }}>
          No matching emoji
        </p>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      data-testid="emoji-picker"
      style={{
        ...menuPos,
        width: 260,
        maxHeight: 280,
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
      {!filter && (
        <div style={{
          padding: "6px 12px 4px",
          fontSize: 10,
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--text-muted, #999)",
        }}>
          Emoji
        </div>
      )}
      {filtered.map((item, idx) => {
        const isSelected = idx === selectedIndex;
        return (
          <button
            key={item.name}
            type="button"
            data-selected={isSelected}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(item.char)}
            onMouseEnter={() => setSelectedIndex(idx)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "5px 10px",
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
            <span style={{ fontSize: 20, lineHeight: 1, width: 28, textAlign: "center" }}>
              {item.char}
            </span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              :{item.name}:
            </span>
          </button>
        );
      })}
    </div>
  );
}

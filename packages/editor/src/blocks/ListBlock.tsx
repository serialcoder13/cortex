// ============================================================
// ListBlock — single-block list editor with:
//   • Nested items via indent levels
//   • Per-level bullet/number style
//   • Tab/Shift+Tab for indent/outdent
//   • Enter to create new items, exit on empty
//   • Self-contained editing (like TableBlock)
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Block, ListItem, ListLevelStyle, TextSpan } from "../core/types";
import { generateId } from "../core/types";

// ---- DOM helpers ----

/** Get the caret offset within an element by walking text nodes */
function getCaretOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return el.textContent?.length ?? 0;
  const range = sel.getRangeAt(0);
  const preRange = document.createRange();
  preRange.selectNodeContents(el);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString().length;
}

// ---- Bullet / Number formatting ----

const BULLET_CHARS: Record<string, string> = {
  disc: "•",
  circle: "◦",
  square: "▪",
  dash: "–",
  arrow: "→",
};

const DEFAULT_BULLET_BY_LEVEL = ["disc", "circle", "square", "dash", "disc"];

function formatNumber(n: number, style: string): string {
  switch (style) {
    case "alpha-lower":
      return String.fromCharCode(96 + ((n - 1) % 26) + 1);
    case "alpha-upper":
      return String.fromCharCode(64 + ((n - 1) % 26) + 1);
    case "roman-lower":
      return toRoman(n).toLowerCase();
    case "roman-upper":
      return toRoman(n);
    default:
      return String(n);
  }
}

function toRoman(num: number): string {
  const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const syms = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"];
  let result = "";
  let n = Math.max(1, Math.min(num, 3999));
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) {
      result += syms[i];
      n -= vals[i];
    }
  }
  return result;
}

// ---- Compute numbering per indent level ----

function computeItemNumbers(
  items: ListItem[],
  levelStyles: ListLevelStyle[],
): Map<string, number> {
  const map = new Map<string, number>();
  // Track counters per indent level
  const counters: Record<number, number> = {};

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const lvl = item.indent;
    const style = levelStyles[lvl];

    // Reset deeper levels when we encounter a shallower item
    for (const key of Object.keys(counters)) {
      if (Number(key) > lvl) delete counters[Number(key)];
    }

    if (!style || style.kind === "number") {
      counters[lvl] = (counters[lvl] ?? ((style?.startFrom ?? 1) - 1)) + 1;
      map.set(item.id, counters[lvl]);
    }
  }
  return map;
}

// ---- Individual list item cell ----

function ListItemCell({
  item,
  marker,
  indent,
  readOnly,
  onCommit,
  onFocus,
  onKeyDown,
}: {
  item: ListItem;
  marker: React.ReactNode;
  indent: number;
  readOnly?: boolean;
  onCommit: (id: string, text: string) => void;
  onFocus: (id: string) => void;
  onKeyDown: (id: string, e: React.KeyboardEvent) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const committedRef = useRef(item.content.map((s) => s.text).join(""));

  useEffect(() => {
    const text = item.content.map((s) => s.text).join("");
    if (ref.current && ref.current.textContent !== text && document.activeElement !== ref.current) {
      ref.current.textContent = text;
      committedRef.current = text;
    }
  }, [item.content]);

  return (
    <div
      data-list-item-id={item.id}
      style={{
        display: "flex",
        gap: 6,
        paddingLeft: indent * 24 + 4,
        alignItems: "baseline",
        padding: "1px 0",
      }}
    >
      <span
        style={{
          userSelect: "none",
          color: "var(--text-muted, #999)",
          lineHeight: 1.625,
          fontSize: "0.85em",
          minWidth: "1.2em",
          textAlign: "right",
          flexShrink: 0,
          marginLeft: indent * 24,
        }}
        contentEditable={false}
      >
        {marker}
      </span>
      <div
        ref={ref}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        data-content
        onClick={(e) => {
          e.stopPropagation();
          ref.current?.focus();
          onFocus(item.id);
        }}
        onFocus={(e) => {
          e.stopPropagation();
          onFocus(item.id);
        }}
        onBlur={() => {
          const text = ref.current?.textContent ?? "";
          if (text !== committedRef.current) {
            committedRef.current = text;
            onCommit(item.id, text);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Tab" || e.key === "Enter" || e.key === "Backspace") {
            // Let ListBlock handle these
            onKeyDown(item.id, e);
            return;
          }
          e.stopPropagation();
        }}
        onBeforeInput={(e) => e.stopPropagation()}
        style={{
          minHeight: "1.5em",
          flex: 1,
          lineHeight: 1.625,
          outline: "none",
          cursor: "text",
        }}
      />
    </div>
  );
}

// ---- Main ListBlock Component ----

export function ListBlock({ block, readOnly }: { block: Block; readOnly?: boolean }) {
  const defaultItems: ListItem[] = [{ id: generateId(), content: [{ text: "" }], indent: 0 }];
  const [items, setItems] = useState<ListItem[]>(
    () => (block.props.listItems as ListItem[]) ?? defaultItems,
  );
  const [levelStyles, setLevelStyles] = useState<ListLevelStyle[]>(
    () => (block.props.levelStyles as ListLevelStyle[]) ?? [{ kind: "bullet" }],
  );
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync items from props when changed externally
  useEffect(() => {
    const incoming = block.props.listItems as ListItem[] | undefined;
    if (incoming) {
      setItems(incoming);
      itemsRef.current = incoming;
    }
  }, [block.props.listItems]);

  useEffect(() => {
    const incoming = block.props.levelStyles as ListLevelStyle[] | undefined;
    if (incoming) setLevelStyles(incoming);
  }, [block.props.levelStyles]);

  // ---- Dispatch update to CortexEditor ----

  const dispatchUpdate = useCallback(
    (newItems: ListItem[], newLevelStyles?: ListLevelStyle[]) => {
      setItems(newItems);
      itemsRef.current = newItems;
      if (newLevelStyles) setLevelStyles(newLevelStyles);
      globalThis.dispatchEvent(
        new CustomEvent("cortex-list-update", {
          detail: {
            blockId: block.id,
            listItems: newItems,
            levelStyles: newLevelStyles ?? levelStyles,
          },
        }),
      );
    },
    [block.id, levelStyles],
  );

  // ---- Cell commit ----

  const handleCommit = useCallback(
    (itemId: string, text: string) => {
      const newItems = itemsRef.current.map((it) =>
        it.id === itemId ? { ...it, content: [{ text }] as TextSpan[] } : it,
      );
      dispatchUpdate(newItems);
    },
    [dispatchUpdate],
  );

  // ---- Focus tracking ----

  const handleFocus = useCallback((itemId: string) => {
    setActiveItemId(itemId);
  }, []);

  // ---- Focus a specific item by ID ----

  const focusItem = useCallback(
    (itemId: string, atEnd = false) => {
      // Double rAF to ensure React has rendered the new items
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = containerRef.current?.querySelector(
            `[data-list-item-id="${itemId}"] [data-content]`,
          ) as HTMLElement | null;
          if (el) {
            el.focus();
            if (atEnd && el.textContent) {
              const range = document.createRange();
              const sel = window.getSelection();
              range.selectNodeContents(el);
              range.collapse(false);
              sel?.removeAllRanges();
              sel?.addRange(range);
            }
          }
        });
      });
    },
    [],
  );

  // ---- Keyboard handling ----

  const handleItemKeyDown = useCallback(
    (itemId: string, e: React.KeyboardEvent) => {
      const idx = itemsRef.current.findIndex((it) => it.id === itemId);
      if (idx < 0) return;
      const item = itemsRef.current[idx];

      // Helper: commit current DOM text into the item before structural changes
      const commitText = (): ListItem => {
        const domText = (e.currentTarget as HTMLElement).textContent ?? "";
        const updated = { ...item, content: [{ text: domText }] as TextSpan[] };
        itemsRef.current = itemsRef.current.map((it) => (it.id === itemId ? updated : it));
        return updated;
      };

      // ---- Tab: indent ----
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        if (idx === 0) return; // Can't indent first item
        const prevItem = itemsRef.current[idx - 1];
        if (item.indent > prevItem.indent) return; // Already max depth
        const committed = commitText();
        const newItems = [...itemsRef.current];
        newItems[idx] = { ...committed, indent: committed.indent + 1 };
        dispatchUpdate(newItems);
        focusItem(itemId);
        return;
      }

      // ---- Shift+Tab: outdent ----
      if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        if (item.indent === 0) return; // Already at top
        const committed = commitText();
        const newItems = [...itemsRef.current];
        newItems[idx] = { ...committed, indent: committed.indent - 1 };
        dispatchUpdate(newItems);
        focusItem(itemId);
        return;
      }

      // ---- Enter: new item or outdent empty ----
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();

        // Commit current text first
        const el = e.currentTarget as HTMLElement;
        const text = el.textContent ?? "";

        if (text === "" && item.indent > 0) {
          // Empty nested item — outdent
          const newItems = [...itemsRef.current];
          newItems[idx] = { ...item, indent: item.indent - 1 };
          dispatchUpdate(newItems);
          focusItem(itemId);
          return;
        }

        if (text === "" && item.indent === 0 && itemsRef.current.length === 1) {
          // Only item and empty — convert to paragraph (dispatch delete-list event)
          globalThis.dispatchEvent(
            new CustomEvent("cortex-list-exit", {
              detail: { blockId: block.id },
            }),
          );
          return;
        }

        // Split at cursor position
        const offset = getCaretOffset(el);
        const beforeText = text.slice(0, offset);
        const afterText = text.slice(offset);

        const newItem: ListItem = {
          id: generateId(),
          content: [{ text: afterText }],
          indent: item.indent,
        };
        const newItems = [...itemsRef.current];
        newItems[idx] = { ...item, content: [{ text: beforeText }] as TextSpan[] };
        newItems.splice(idx + 1, 0, newItem);
        dispatchUpdate(newItems);
        focusItem(newItem.id);
        return;
      }

      // ---- Backspace at start ----
      if (e.key === "Backspace") {
        const caretPos = getCaretOffset(e.currentTarget as HTMLElement);
        const sel = window.getSelection();
        if (caretPos === 0 || (sel?.isCollapsed && e.currentTarget.textContent === "")) {
          e.preventDefault();
          e.stopPropagation();

          const text = e.currentTarget.textContent ?? "";

          if (item.indent > 0) {
            // Outdent
            const newItems = [...itemsRef.current];
            newItems[idx] = { ...item, indent: item.indent - 1 };
            dispatchUpdate(newItems);
            focusItem(itemId);
            return;
          }

          if (idx === 0 && text === "") {
            // First item empty — convert block to paragraph
            globalThis.dispatchEvent(
              new CustomEvent("cortex-list-exit", {
                detail: { blockId: block.id },
              }),
            );
            return;
          }

          if (idx > 0) {
            // Merge with previous item
            const prevItem = itemsRef.current[idx - 1];
            const prevText = prevItem.content.map((s) => s.text).join("");
            const mergedText = prevText + text;
            const newItems = [...itemsRef.current];
            newItems[idx - 1] = { ...prevItem, content: [{ text: mergedText }] as TextSpan[] };
            newItems.splice(idx, 1);
            dispatchUpdate(newItems);
            focusItem(prevItem.id, true);
            return;
          }
        }
        // Let normal backspace happen (within text)
        e.stopPropagation();
        return;
      }

      e.stopPropagation();
    },
    [block.id, dispatchUpdate, focusItem],
  );

  // ---- Compute markers ----

  const numbers = computeItemNumbers(items, levelStyles);

  const getMarker = (item: ListItem): React.ReactNode => {
    const lvl = item.indent;
    const style = levelStyles[lvl];
    const kind = style?.kind ?? "bullet";

    if (kind === "number") {
      const num = numbers.get(item.id) ?? 1;
      const fmt = style?.numberStyle ?? "decimal";
      const formatted = formatNumber(num, fmt);
      const suffix = fmt === "decimal" ? "." : ")";
      return `${formatted}${suffix}`;
    }

    const bulletStyle = style?.bulletStyle ?? DEFAULT_BULLET_BY_LEVEL[lvl % DEFAULT_BULLET_BY_LEVEL.length];
    return BULLET_CHARS[bulletStyle] ?? "•";
  };

  return (
    <div
      ref={containerRef}
      contentEditable={false}
      data-list-block
      style={{ margin: "2px 0" }}
    >
      {items.map((item) => (
        <ListItemCell
          key={item.id}
          item={item}
          marker={getMarker(item)}
          indent={item.indent}
          readOnly={readOnly}
          onCommit={handleCommit}
          onFocus={handleFocus}
          onKeyDown={handleItemKeyDown}
        />
      ))}
    </div>
  );
}

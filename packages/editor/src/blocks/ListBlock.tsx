// ============================================================
// ListBlock — single self-contained block that renders an
// entire list (bullet, numbered, or mixed). Features:
//   • Nested items via indent levels
//   • Per-level bullet/number style
//   • Tab/Shift+Tab for indent/outdent
//   • Enter to create new items, exit on empty
//   • Backspace to merge/outdent/exit
//   • Self-contained editing (like TableBlock)
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Block, ListItem, ListLevelStyle, TextSpan } from "../core/types";
import { generateId } from "../core/types";
import { TextContent } from "./TextContent";

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

/** Place caret at a specific offset inside an element */
function setCaretOffset(el: HTMLElement, offset: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();

  let remaining = offset;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const len = node.textContent?.length ?? 0;
    if (remaining <= len) {
      range.setStart(node, remaining);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= len;
    node = walker.nextNode();
  }
  // Fallback: place at end
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

// ---- Bullet / Number formatting ----

export const BULLET_CHARS: Record<string, string> = {
  disc: "•",
  circle: "◦",
  square: "▪",
  dash: "–",
  arrow: "→",
  star: "★",
  checkmark: "✓",
};

const DEFAULT_BULLET_BY_LEVEL = ["disc", "circle", "square", "dash", "disc"];
const DEFAULT_NUMBER_BY_LEVEL = ["decimal", "roman-lower", "alpha-lower", "decimal", "roman-lower"];

export function formatNumber(n: number, style: string): string {
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

/** Resolve the effective kind for an item: item override > level style > "bullet" */
function getItemKind(item: ListItem, levelStyles: ListLevelStyle[]): "bullet" | "number" {
  return item.kind ?? levelStyles[item.indent]?.kind ?? "bullet";
}

function computeItemNumbers(
  items: ListItem[],
  levelStyles: ListLevelStyle[],
): Map<string, number> {
  const map = new Map<string, number>();
  const counters: Record<number, number> = {};
  // Track the last kind seen at each level to reset counters on kind switch
  const lastKindAtLevel: Record<number, "bullet" | "number"> = {};

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const lvl = item.indent;
    const style = levelStyles[lvl];
    const kind = getItemKind(item, levelStyles);

    // Reset deeper levels when we encounter a shallower item
    for (const key of Object.keys(counters)) {
      if (Number(key) > lvl) {
        delete counters[Number(key)];
        delete lastKindAtLevel[Number(key)];
      }
    }

    // Reset counter when kind switches at the same level (e.g. number → bullet → number)
    if (lastKindAtLevel[lvl] && lastKindAtLevel[lvl] !== kind) {
      delete counters[lvl];
    }
    lastKindAtLevel[lvl] = kind;

    if (kind === "number") {
      counters[lvl] = (counters[lvl] ?? ((style?.startFrom ?? 1) - 1)) + 1;
      map.set(item.id, counters[lvl]);
    }
  }
  return map;
}

// ---- Individual list item cell ----

const MARKER_SIZE_MAP: Record<string, string> = {
  small: "0.7em",
  medium: "0.85em",
  large: "1.1em",
};

/** Check if content has any inline marks (bold, link, etc.) */
function hasMarks(content: TextSpan[]): boolean {
  return content.some((s) => s.marks && s.marks.length > 0);
}

function ListItemCell({
  item,
  marker,
  markerColor,
  markerSize,
  indent,
  readOnly,
  onCommit,
  onFocus,
  onKeyDown,
}: {
  item: ListItem;
  marker: React.ReactNode;
  markerColor?: string;
  markerSize?: string;
  indent: number;
  readOnly?: boolean;
  onCommit: (id: string, text: string) => void;
  onFocus: (id: string) => void;
  onKeyDown: (id: string, e: React.KeyboardEvent) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const committedRef = useRef(item.content.map((s) => s.text).join(""));
  const rich = hasMarks(item.content);

  useEffect(() => {
    // Only sync plain text directly when there are no marks.
    // When marks are present, React renders TextContent children instead.
    if (!rich) {
      const text = item.content.map((s) => s.text).join("");
      if (ref.current && ref.current.textContent !== text) {
        ref.current.textContent = text;
        committedRef.current = text;
      }
    }
  }, [item.content, rich]);

  return (
    <div
      data-list-item-id={item.id}
      style={{
        display: "flex",
        gap: 6,
        alignItems: "baseline",
        padding: "1px 0",
        paddingLeft: 4,
      }}
    >
      <span
        style={{
          userSelect: "none",
          color: markerColor || "var(--text-muted, #999)",
          lineHeight: 1.625,
          fontSize: MARKER_SIZE_MAP[markerSize ?? "medium"] ?? "0.85em",
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
            e.stopPropagation();
            // Mark current DOM text as committed so the upcoming onBlur
            // (triggered by focus moving to a new item) doesn't overwrite
            // the structural change made by the key handler.
            committedRef.current = ref.current?.textContent ?? "";
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
      >
        {rich && <TextContent content={item.content} />}
      </div>
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
  const [, setActiveItemId] = useState<string | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-focus the first item when the list block is freshly created
  const didAutoFocus = useRef(false);
  useEffect(() => {
    if (didAutoFocus.current || readOnly) return;
    // Only auto-focus if the list has a single empty item (freshly created)
    if (items.length === 1 && items[0].content.every((s) => s.text === "")) {
      didAutoFocus.current = true;
      requestAnimationFrame(() => {
        const el = containerRef.current?.querySelector(
          `[data-list-item-id="${items[0].id}"] [data-content]`,
        ) as HTMLElement | null;
        el?.focus();
      });
    } else {
      didAutoFocus.current = true;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Track whether we initiated the last update (to skip redundant prop syncs)
  const selfUpdateRef = useRef(false);

  // Sync items from props when changed externally (not by us)
  useEffect(() => {
    if (selfUpdateRef.current) {
      selfUpdateRef.current = false;
      return;
    }
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
      selfUpdateRef.current = true;
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
    (itemId: string, atEnd = false, caretOffset?: number) => {
      const tryFocus = (attempts: number) => {
        requestAnimationFrame(() => {
          const el = containerRef.current?.querySelector(
            `[data-list-item-id="${itemId}"] [data-content]`,
          ) as HTMLElement | null;
          if (!el) {
            if (attempts > 0) tryFocus(attempts - 1);
            return;
          }
          el.focus();
          if (caretOffset !== undefined) {
            setCaretOffset(el, caretOffset);
          } else if (atEnd && el.textContent) {
            setCaretOffset(el, el.textContent.length);
          }
        });
      };
      // Give React 3 frames to commit the DOM update
      tryFocus(3);
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
          // Only item and empty — convert to paragraph
          globalThis.dispatchEvent(
            new CustomEvent("cortex-list-exit", {
              detail: { blockId: block.id },
            }),
          );
          return;
        }

        if (text === "" && item.indent === 0) {
          // Empty top-level item with siblings — remove this item and
          // exit list, inserting a paragraph after the list block
          const newItems = [...itemsRef.current];
          newItems.splice(idx, 1);
          dispatchUpdate(newItems);
          globalThis.dispatchEvent(
            new CustomEvent("cortex-list-exit-split", {
              detail: { blockId: block.id, afterIndex: idx },
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
          kind: item.kind,
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
            focusItem(prevItem.id, false, prevText.length);
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
    const kind = getItemKind(item, levelStyles);

    if (kind === "number") {
      const num = numbers.get(item.id) ?? 1;
      const fmt = style?.numberStyle ?? DEFAULT_NUMBER_BY_LEVEL[lvl % DEFAULT_NUMBER_BY_LEVEL.length];
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
      {items.map((item) => {
        const lvlStyle = levelStyles[item.indent];
        return (
          <ListItemCell
            key={item.id}
            item={item}
            marker={getMarker(item)}
            markerColor={lvlStyle?.color}
            markerSize={lvlStyle?.size}
            indent={item.indent}
            readOnly={readOnly}
            onCommit={handleCommit}
            onFocus={handleFocus}
            onKeyDown={handleItemKeyDown}
          />
        );
      })}
    </div>
  );
}

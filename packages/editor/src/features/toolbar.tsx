// ============================================================
// Floating Toolbar — appears above text selections.
// Shows formatting buttons (bold, italic, underline, etc.)
// All colors use CSS variables for theme compatibility.
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Link,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Mark, MarkType } from "../core/types";

interface ToolbarProps {
  /** Screen position (centered above selection) */
  position: { x: number; y: number };
  /** Marks active at the current selection */
  activeMarks: MarkType[];
  /** Called when a mark button is clicked */
  onToggleMark: (mark: Mark) => void;
  /** Called when the toolbar should close */
  onClose: () => void;
}

const ICON_SIZE = 15;

const markButtons: {
  mark: MarkType;
  label: string;
  shortcut: string;
  Icon: LucideIcon;
  group: number;
}[] = [
  { mark: "bold", label: "Bold", shortcut: "⌘B", Icon: Bold, group: 0 },
  { mark: "italic", label: "Italic", shortcut: "⌘I", Icon: Italic, group: 0 },
  { mark: "underline", label: "Underline", shortcut: "⌘U", Icon: Underline, group: 0 },
  { mark: "strikethrough", label: "Strikethrough", shortcut: "⌘⇧S", Icon: Strikethrough, group: 0 },
  { mark: "code", label: "Code", shortcut: "⌘E", Icon: Code, group: 1 },
  { mark: "link", label: "Link", shortcut: "⌘K", Icon: Link, group: 1 },
];

export function FloatingToolbar({ position, activeMarks, onToggleMark, onClose }: ToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const linkInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [onClose]);

  // Focus the link input when it appears
  useEffect(() => {
    if (showLinkInput) {
      linkInputRef.current?.focus();
    }
  }, [showLinkInput]);

  const toolbarStyle = useMemo(() => {
    const GAP = 8;
    const flipDown = position.y < 50;
    return {
      position: "fixed" as const,
      left: position.x,
      top: flipDown ? position.y + 28 + GAP : position.y - GAP,
      transform: flipDown
        ? "translateX(-50%)"
        : "translateX(-50%) translateY(-100%)",
    };
  }, [position]);

  const handleMarkClick = useCallback((mark: MarkType) => {
    if (mark === "link") {
      setShowLinkInput(true);
      setLinkUrl("");
      return;
    }
    onToggleMark({ type: mark });
  }, [onToggleMark]);

  const handleLinkSubmit = useCallback(() => {
    if (linkUrl.trim()) {
      let href = linkUrl.trim();
      if (!/^https?:\/\//i.test(href) && !href.startsWith("/")) {
        href = "https://" + href;
      }
      onToggleMark({ type: "link", attrs: { href } });
    }
    setShowLinkInput(false);
    setLinkUrl("");
  }, [linkUrl, onToggleMark]);

  const handleLinkKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleLinkSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowLinkInput(false);
      setLinkUrl("");
    }
  }, [handleLinkSubmit]);

  let lastGroup = -1;

  return (
    <div
      ref={toolbarRef}
      style={{
        ...toolbarStyle,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "4px 6px",
        borderRadius: showLinkInput ? 12 : 9999,
        backgroundColor: "var(--bg-secondary, #f5f5f5)",
        border: "1px solid var(--border-primary, #e5e5e5)",
        boxShadow: "0 2px 12px var(--shadow, rgba(0,0,0,0.1))",
        userSelect: "none",
      }}
    >
      {!showLinkInput ? (
        // Mark buttons
        markButtons.map(({ mark, label, shortcut, Icon, group }) => {
          const isActive = activeMarks.includes(mark);
          const showDivider = lastGroup !== -1 && group !== lastGroup;
          lastGroup = group;
          return (
            <React.Fragment key={mark}>
              {showDivider && (
                <div
                  style={{
                    width: 1,
                    height: 16,
                    margin: "0 3px",
                    backgroundColor: "var(--border-primary, #e5e5e5)",
                  }}
                />
              )}
              <button
                type="button"
                title={`${label} (${shortcut})`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: "none",
                  cursor: "pointer",
                  backgroundColor: isActive ? "var(--bg-active, #e0e0e0)" : "transparent",
                  color: isActive ? "var(--text-primary, #1a1a1a)" : "var(--text-muted, #999)",
                  transition: "background-color 120ms, color 120ms",
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleMarkClick(mark);
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = "var(--bg-hover, #eee)";
                  e.currentTarget.style.color = "var(--text-primary, #1a1a1a)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = isActive ? "var(--bg-active, #e0e0e0)" : "transparent";
                  e.currentTarget.style.color = isActive ? "var(--text-primary, #1a1a1a)" : "var(--text-muted, #999)";
                }}
              >
                <Icon size={ICON_SIZE} strokeWidth={2} />
              </button>
            </React.Fragment>
          );
        })
      ) : (
        // Link URL input
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 4px" }}>
          <Link size={14} style={{ color: "var(--text-muted, #999)", flexShrink: 0 }} />
          <input
            ref={linkInputRef}
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={handleLinkKeyDown}
            placeholder="Paste or type a URL..."
            style={{
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--text-primary, #1a1a1a)",
              fontSize: 13,
              width: 200,
              padding: "4px 0",
              fontFamily: "inherit",
            }}
          />
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              handleLinkSubmit();
            }}
            style={{
              border: "none",
              background: linkUrl.trim() ? "var(--accent, #2563eb)" : "var(--bg-tertiary, #eee)",
              color: linkUrl.trim() ? "#fff" : "var(--text-muted, #999)",
              borderRadius: 4,
              padding: "3px 8px",
              fontSize: 11,
              fontWeight: 600,
              cursor: linkUrl.trim() ? "pointer" : "default",
              transition: "background-color 120ms",
            }}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}

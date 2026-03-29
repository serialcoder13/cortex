// ============================================================
// Floating Toolbar — appears above text selections.
// Shows formatting buttons (bold, italic, underline, etc.)
// plus color pickers for text color and highlight.
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
  Paintbrush,
  Highlighter,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Mark, MarkType } from "../core/types";

/**
 * When true, the toolbar is showing the link URL input and should NOT be
 * closed by selection changes. Read by CortexEditor's updateToolbarState.
 */
export let isToolbarLinkInputActive = false;

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

const TEXT_COLORS = [
  { label: "Default", value: "inherit" },
  { label: "Gray", value: "#9ca3af" },
  { label: "Brown", value: "#a16207" },
  { label: "Orange", value: "#ea580c" },
  { label: "Yellow", value: "#ca8a04" },
  { label: "Green", value: "#16a34a" },
  { label: "Blue", value: "#2563eb" },
  { label: "Purple", value: "#7c3aed" },
  { label: "Pink", value: "#db2777" },
  { label: "Red", value: "#dc2626" },
];

const HIGHLIGHT_COLORS = [
  { label: "None", value: "transparent" },
  { label: "Gray", value: "#f3f4f6" },
  { label: "Brown", value: "#fef3c7" },
  { label: "Orange", value: "#ffedd5" },
  { label: "Yellow", value: "#fef9c3" },
  { label: "Green", value: "#dcfce7" },
  { label: "Blue", value: "#dbeafe" },
  { label: "Purple", value: "#ede9fe" },
  { label: "Pink", value: "#fce7f3" },
  { label: "Red", value: "#fee2e2" },
];

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

type ColorDropdown = "textColor" | "highlight" | null;

export function FloatingToolbar({ position, activeMarks, onToggleMark, onClose }: ToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const linkInputRef = useRef<HTMLInputElement>(null);
  const [openColorDropdown, setOpenColorDropdown] = useState<ColorDropdown>(null);

  // Close on outside click — but NOT when the link input is showing
  const showLinkInputRef = useRef(false);
  showLinkInputRef.current = showLinkInput;
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        if (!showLinkInputRef.current) {
          onClose();
        }
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [onClose]);

  // Save the selection when switching to link input, and focus the input
  const savedSelectionRef = useRef<Range | null>(null);
  useEffect(() => {
    isToolbarLinkInputActive = showLinkInput;
    if (showLinkInput) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
      }
      setTimeout(() => linkInputRef.current?.focus(), 0);
    }
    return () => { isToolbarLinkInputActive = false; };
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
      setOpenColorDropdown(null);
      return;
    }
    onToggleMark({ type: mark });
  }, [onToggleMark]);

  const handleLinkSubmit = useCallback(() => {
    // Restore the saved selection before applying the mark
    if (savedSelectionRef.current) {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(savedSelectionRef.current);
      }
    }
    if (linkUrl.trim()) {
      let href = linkUrl.trim();
      if (!/^https?:\/\//i.test(href) && !href.startsWith("/")) {
        href = "https://" + href;
      }
      onToggleMark({ type: "link", attrs: { href } });
    }
    setShowLinkInput(false);
    setLinkUrl("");
    savedSelectionRef.current = null;
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

  const handleTextColor = useCallback((color: string) => {
    onToggleMark({ type: "color" as MarkType, attrs: { color } });
    setOpenColorDropdown(null);
  }, [onToggleMark]);

  const handleHighlightColor = useCallback((color: string) => {
    onToggleMark({ type: "highlight" as MarkType, attrs: { color } });
    setOpenColorDropdown(null);
  }, [onToggleMark]);

  const toggleColorDropdown = useCallback((dropdown: ColorDropdown) => {
    setOpenColorDropdown((prev) => (prev === dropdown ? null : dropdown));
  }, []);

  // Shared button style helper
  const getButtonStyle = (isActive: boolean): React.CSSProperties => ({
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
  });

  const handleButtonMouseEnter = (e: React.MouseEvent<HTMLButtonElement>, isActive: boolean) => {
    if (!isActive) e.currentTarget.style.backgroundColor = "var(--bg-hover, #eee)";
    e.currentTarget.style.color = "var(--text-primary, #1a1a1a)";
  };

  const handleButtonMouseLeave = (e: React.MouseEvent<HTMLButtonElement>, isActive: boolean) => {
    e.currentTarget.style.backgroundColor = isActive ? "var(--bg-active, #e0e0e0)" : "transparent";
    e.currentTarget.style.color = isActive ? "var(--text-primary, #1a1a1a)" : "var(--text-muted, #999)";
  };

  let lastGroup = -1;

  const renderDivider = () => (
    <div
      style={{
        width: 1,
        height: 16,
        margin: "0 3px",
        backgroundColor: "var(--border-primary, #e5e5e5)",
      }}
    />
  );

  const renderColorDropdown = (
    colors: { label: string; value: string }[],
    onSelect: (color: string) => void,
    isHighlight: boolean,
  ) => (
    <div
      style={{
        position: "absolute",
        top: "100%",
        left: "50%",
        transform: "translateX(-50%)",
        marginTop: 6,
        padding: 8,
        borderRadius: 10,
        backgroundColor: "var(--bg-secondary, #f5f5f5)",
        border: "1px solid var(--border-primary, #e5e5e5)",
        boxShadow: "0 4px 16px var(--shadow, rgba(0,0,0,0.12))",
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: 6,
        zIndex: 51,
      }}
    >
      {colors.map(({ label, value }) => (
        <button
          key={value}
          type="button"
          title={label}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSelect(value);
          }}
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            border: value === "inherit" || value === "transparent"
              ? "2px dashed var(--border-primary, #ccc)"
              : "2px solid var(--border-primary, #e5e5e5)",
            backgroundColor: isHighlight
              ? value
              : value === "inherit" ? "var(--text-primary, #1a1a1a)" : value,
            cursor: "pointer",
            padding: 0,
            transition: "transform 100ms, box-shadow 100ms",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.2)";
            e.currentTarget.style.boxShadow = "0 0 0 2px var(--accent, #2563eb)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
      ))}
    </div>
  );

  return (
    <div
      ref={toolbarRef}
      style={{
        ...toolbarStyle,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          padding: "4px 6px",
          borderRadius: showLinkInput ? 12 : 9999,
          backgroundColor: "var(--bg-secondary, #f5f5f5)",
          border: "1px solid var(--border-primary, #e5e5e5)",
          boxShadow: "0 2px 12px var(--shadow, rgba(0,0,0,0.1))",
          userSelect: "none",
          position: "relative",
        }}
      >
        {!showLinkInput ? (
          <>
            {/* Standard mark buttons */}
            {markButtons.map(({ mark, label, shortcut, Icon, group }) => {
              const isActive = activeMarks.includes(mark);
              const showDivider = lastGroup !== -1 && group !== lastGroup;
              lastGroup = group;
              return (
                <React.Fragment key={mark}>
                  {showDivider && renderDivider()}
                  <button
                    type="button"
                    title={`${label} (${shortcut})`}
                    style={getButtonStyle(isActive)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleMarkClick(mark);
                    }}
                    onMouseEnter={(e) => handleButtonMouseEnter(e, isActive)}
                    onMouseLeave={(e) => handleButtonMouseLeave(e, isActive)}
                  >
                    <Icon size={ICON_SIZE} strokeWidth={2} />
                  </button>
                </React.Fragment>
              );
            })}

            {/* Group 2 divider */}
            {renderDivider()}

            {/* Superscript button */}
            <button
              type="button"
              title="Superscript"
              style={{
                ...getButtonStyle(activeMarks.includes("superscript" as MarkType)),
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "inherit",
                lineHeight: 1,
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                onToggleMark({ type: "superscript" as MarkType });
              }}
              onMouseEnter={(e) => handleButtonMouseEnter(e, activeMarks.includes("superscript" as MarkType))}
              onMouseLeave={(e) => handleButtonMouseLeave(e, activeMarks.includes("superscript" as MarkType))}
            >
              X<sup style={{ fontSize: 8, lineHeight: 1 }}>2</sup>
            </button>

            {/* Subscript button */}
            <button
              type="button"
              title="Subscript"
              style={{
                ...getButtonStyle(activeMarks.includes("subscript" as MarkType)),
                fontSize: 12,
                fontWeight: 700,
                fontFamily: "inherit",
                lineHeight: 1,
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                onToggleMark({ type: "subscript" as MarkType });
              }}
              onMouseEnter={(e) => handleButtonMouseEnter(e, activeMarks.includes("subscript" as MarkType))}
              onMouseLeave={(e) => handleButtonMouseLeave(e, activeMarks.includes("subscript" as MarkType))}
            >
              X<sub style={{ fontSize: 8, lineHeight: 1 }}>2</sub>
            </button>

            {/* Text Color button */}
            <button
              type="button"
              title="Text color"
              style={getButtonStyle(openColorDropdown === "textColor")}
              onMouseDown={(e) => {
                e.preventDefault();
                toggleColorDropdown("textColor");
              }}
              onMouseEnter={(e) => handleButtonMouseEnter(e, openColorDropdown === "textColor")}
              onMouseLeave={(e) => handleButtonMouseLeave(e, openColorDropdown === "textColor")}
            >
              <Paintbrush size={ICON_SIZE} strokeWidth={2} />
            </button>

            {/* Highlight Color button */}
            <button
              type="button"
              title="Highlight color"
              style={getButtonStyle(openColorDropdown === "highlight")}
              onMouseDown={(e) => {
                e.preventDefault();
                toggleColorDropdown("highlight");
              }}
              onMouseEnter={(e) => handleButtonMouseEnter(e, openColorDropdown === "highlight")}
              onMouseLeave={(e) => handleButtonMouseLeave(e, openColorDropdown === "highlight")}
            >
              <Highlighter size={ICON_SIZE} strokeWidth={2} />
            </button>

            {/* Color dropdown (positioned absolutely below toolbar) */}
            {openColorDropdown === "textColor" &&
              renderColorDropdown(TEXT_COLORS, handleTextColor, false)}
            {openColorDropdown === "highlight" &&
              renderColorDropdown(HIGHLIGHT_COLORS, handleHighlightColor, true)}
          </>
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
    </div>
  );
}

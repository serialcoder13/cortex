// ============================================================
// Floating Toolbar — appears above text selections.
// Shows formatting buttons (bold, italic, underline, etc.)
// All colors use CSS variables for theme compatibility.
// ============================================================

import React, { useEffect, useMemo, useRef } from "react";
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

const markButtons: { mark: MarkType; label: string; shortcut: string; icon: string; group: number }[] = [
  { mark: "bold", label: "Bold", shortcut: "⌘B", icon: "B", group: 0 },
  { mark: "italic", label: "Italic", shortcut: "⌘I", icon: "I", group: 0 },
  { mark: "underline", label: "Underline", shortcut: "⌘U", icon: "U", group: 0 },
  { mark: "strikethrough", label: "Strikethrough", shortcut: "⌘⇧S", icon: "S", group: 0 },
  { mark: "code", label: "Code", shortcut: "⌘E", icon: "</>", group: 1 },
];

export function FloatingToolbar({ position, activeMarks, onToggleMark, onClose }: ToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);

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

  // Flip toolbar below selection if near the top of viewport
  const toolbarStyle = useMemo(() => {
    const flipDown = position.y < 50;
    return {
      left: position.x,
      top: flipDown ? position.y + 30 : position.y - 10,
      transform: "translateX(-50%)",
    };
  }, [position]);

  let lastGroup = -1;

  return (
    <div
      ref={toolbarRef}
      className="cx-fixed cx-z-50 cx-flex cx-items-center cx-gap-0.5 cx-rounded-lg cx-px-1 cx-py-1 cx-menu-enter"
      style={{
        ...toolbarStyle,
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border-primary)",
        boxShadow: "0 4px 16px var(--shadow)",
      }}
    >
      {markButtons.map(({ mark, label, shortcut, icon, group }) => {
        const isActive = activeMarks.includes(mark);
        const showDivider = lastGroup !== -1 && group !== lastGroup;
        lastGroup = group;
        return (
          <React.Fragment key={mark}>
            {showDivider && (
              <div
                className="cx-mx-0.5 cx-h-4 cx-w-px"
                style={{ backgroundColor: "var(--border-primary)" }}
              />
            )}
            <button
              type="button"
              title={`${label} (${shortcut})`}
              className={`cx-flex cx-h-7 cx-min-w-[28px] cx-items-center cx-justify-center cx-rounded cx-px-1.5 cx-text-sm cx-font-medium cx-transition-colors ${mark === "italic" ? "cx-italic" : ""} ${mark === "strikethrough" ? "cx-line-through" : ""} ${mark === "underline" ? "cx-underline" : ""} ${mark === "bold" ? "cx-font-bold" : ""}`}
              style={{
                backgroundColor: isActive ? "var(--bg-active)" : "transparent",
                color: isActive ? "var(--text-primary)" : "var(--text-muted)",
              }}
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent losing selection
                onToggleMark({ type: mark });
              }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget.style.backgroundColor = "var(--bg-hover)");
                e.currentTarget.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = isActive ? "var(--bg-active)" : "transparent";
                e.currentTarget.style.color = isActive ? "var(--text-primary)" : "var(--text-muted)";
              }}
            >
              {icon}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ============================================================
// Floating Toolbar — appears above text selections.
// Shows formatting buttons (bold, italic, underline, etc.)
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from "react";
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

const markButtons: { mark: MarkType; label: string; shortcut: string; icon: string }[] = [
  { mark: "bold", label: "Bold", shortcut: "⌘B", icon: "B" },
  { mark: "italic", label: "Italic", shortcut: "⌘I", icon: "I" },
  { mark: "underline", label: "Underline", shortcut: "⌘U", icon: "U" },
  { mark: "strikethrough", label: "Strikethrough", shortcut: "⌘⇧S", icon: "S" },
  { mark: "code", label: "Code", shortcut: "⌘E", icon: "</>" },
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

  return (
    <div
      ref={toolbarRef}
      className="cx-fixed cx-z-50 cx-flex cx-items-center cx-gap-0.5 cx-rounded-lg cx-border cx-border-neutral-700 cx-bg-neutral-900 cx-px-1 cx-py-1 cx-shadow-xl"
      style={{
        left: position.x,
        top: position.y,
        transform: "translateX(-50%)",
      }}
    >
      {markButtons.map(({ mark, label, shortcut, icon }) => {
        const isActive = activeMarks.includes(mark);
        return (
          <button
            key={mark}
            type="button"
            title={`${label} (${shortcut})`}
            className={`cx-flex cx-h-7 cx-min-w-[28px] cx-items-center cx-justify-center cx-rounded cx-px-1.5 cx-text-sm cx-font-medium cx-transition-colors ${
              isActive
                ? "cx-bg-neutral-700 cx-text-white"
                : "cx-text-neutral-400 hover:cx-bg-neutral-800 hover:cx-text-neutral-200"
            } ${mark === "italic" ? "cx-italic" : ""} ${mark === "strikethrough" ? "cx-line-through" : ""} ${mark === "underline" ? "cx-underline" : ""} ${mark === "bold" ? "cx-font-bold" : ""}`}
            onMouseDown={(e) => {
              e.preventDefault(); // Prevent losing selection
              onToggleMark({ type: mark });
            }}
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// BlockRenderer — renders a single block based on its type.
// Each block is a contentEditable container identified by
// data-block-id. The content area is marked with data-content.
// All colors use CSS variables for theme compatibility.
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Plus, MoreHorizontal, MoreVertical, Trash2, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, ArrowDownAZ, ArrowUpAZ, Copy, XSquare } from "lucide-react";
import type { Block } from "../core/types";
import { TextContent } from "./TextContent";
import { getRegisteredComponent } from "./component-registry";

interface BlockRendererProps {
  block: Block;
  readOnly?: boolean;
  onToggleTodo?: (blockId: string) => void;
  onToggleCollapse?: (blockId: string) => void;
}

export function BlockRenderer({ block, readOnly = false, onToggleTodo, onToggleCollapse }: BlockRendererProps) {
  switch (block.type) {
    case "paragraph":
      return <ParagraphBlock block={block} />;
    case "heading1":
      return <HeadingBlock block={block} level={1} />;
    case "heading2":
      return <HeadingBlock block={block} level={2} />;
    case "heading3":
      return <HeadingBlock block={block} level={3} />;
    case "bulletList":
      return <BulletListBlock block={block} />;
    case "numberedList":
      return <NumberedListBlock block={block} />;
    case "todo":
      return <TodoBlock block={block} readOnly={readOnly} onToggle={onToggleTodo} />;
    case "codeBlock":
      return <CodeBlock block={block} />;
    case "quote":
      return <QuoteBlock block={block} />;
    case "callout":
      return <CalloutBlock block={block} />;
    case "toggle":
      return <ToggleBlock block={block} onToggle={onToggleCollapse} />;
    case "divider":
      return <DividerBlock />;
    case "image":
      return <ImageBlock block={block} readOnly={readOnly} />;
    case "table":
      return <TableBlock block={block} readOnly={readOnly} />;
    case "mermaid":
      return <MermaidBlock block={block} />;
    case "customComponent":
      return <CustomComponentBlock block={block} />;
    default:
      return <ParagraphBlock block={block} />;
  }
}

// ---- Block Components ----

function ParagraphBlock({ block }: { block: Block }) {
  return (
    <div data-content style={{ minHeight: "1.5em", lineHeight: 1.625, padding: "1px 0" }}>
      <TextContent content={block.content} />
    </div>
  );
}

function HeadingBlock({ block, level }: { block: Block; level: 1 | 2 | 3 }) {
  const styles: Record<1 | 2 | 3, React.CSSProperties> = {
    1: { fontSize: "1.875rem", fontWeight: 700, lineHeight: 1.25, marginTop: 40, marginBottom: 4 },
    2: { fontSize: "1.5rem", fontWeight: 600, lineHeight: 1.25, marginTop: 32, marginBottom: 4 },
    3: { fontSize: "1.25rem", fontWeight: 600, lineHeight: 1.375, marginTop: 24, marginBottom: 4 },
  };

  return (
    <div data-content style={{ minHeight: "1.2em", ...styles[level] }}>
      <TextContent content={block.content} />
    </div>
  );
}

function BulletListBlock({ block }: { block: Block }) {
  return (
    <div style={{ display: "flex", gap: 6, paddingLeft: 4, alignItems: "baseline" }}>
      <span
        style={{ userSelect: "none", color: "var(--text-muted, #999)", lineHeight: 1.625, fontSize: "0.8em" }}
        contentEditable={false}
      >
        •
      </span>
      <div data-content style={{ minHeight: "1.5em", flex: 1, lineHeight: 1.625 }}>
        <TextContent content={block.content} />
      </div>
    </div>
  );
}

function NumberedListBlock({ block }: { block: Block }) {
  const number = block.props.number ?? 1;
  return (
    <div style={{ display: "flex", gap: 6, paddingLeft: 4, alignItems: "baseline" }}>
      <span
        style={{
          minWidth: "1.2em",
          textAlign: "right",
          userSelect: "none",
          color: "var(--text-muted)",
        }}
        contentEditable={false}
      >
        {String(number)}.
      </span>
      <div data-content style={{ minHeight: "1.5em", flex: 1, lineHeight: 1.625 }}>
        <TextContent content={block.content} />
      </div>
    </div>
  );
}

function TodoBlock({ block, readOnly, onToggle }: { block: Block; readOnly?: boolean; onToggle?: (id: string) => void }) {
  const checked = block.props.checked ?? false;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (readOnly) return;
      e.preventDefault();
      e.stopPropagation();
      onToggle?.(block.id);
    },
    [block.id, onToggle, readOnly],
  );

  return (
    <div style={{ display: "flex", gap: 8, paddingLeft: 6 }}>
      <button
        type="button"
        style={{
          marginTop: "0.2em",
          height: 18,
          width: 18,
          flexShrink: 0,
          borderRadius: 3,
          border: "1px solid",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 150ms",
          borderColor: checked ? "var(--accent)" : "var(--border-secondary)",
          backgroundColor: checked ? "var(--accent)" : "transparent",
          padding: 0,
          cursor: "pointer",
        }}
        contentEditable={false}
        onClick={handleClick}
        aria-checked={checked}
        role="checkbox"
      >
        {checked && (
          <svg style={{ height: 12, width: 12 }} viewBox="0 0 16 16" fill="white">
            <path d="M12.207 4.793a1 1 0 0 1 0 1.414l-5 5a1 1 0 0 1-1.414 0l-2-2a1 1 0 0 1 1.414-1.414L6.5 9.086l4.293-4.293a1 1 0 0 1 1.414 0z" />
          </svg>
        )}
      </button>
      <div
        data-content
        style={{
          minHeight: "1.5em",
          flex: 1,
          lineHeight: 1.625,
          transition: "color 150ms, background-color 150ms",
          ...(checked ? { textDecoration: "line-through", color: "var(--text-muted)" } : {}),
        }}
      >
        <TextContent content={block.content} />
      </div>
    </div>
  );
}

function CodeBlock({ block }: { block: Block }) {
  const language = block.props.language ?? "";
  return (
    <div
      style={{
        margin: "8px 0",
        borderRadius: 8,
        border: "1px solid",
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--border-primary)",
      }}
    >
      {language && (
        <div
          style={{
            paddingLeft: 16,
            paddingRight: 16,
            paddingTop: 4,
            paddingBottom: 4,
            fontSize: "0.75rem",
            borderBottom: "1px solid",
            userSelect: "none",
            color: "var(--text-muted)",
            borderColor: "var(--border-primary)",
          }}
          contentEditable={false}
        >
          {language}
        </div>
      )}
      <pre style={{ padding: 16, overflowX: "auto" }}>
        <code
          data-content
          style={{
            fontFamily: "'SF Mono', 'Fira Code', Menlo, monospace",
            fontSize: "0.875rem",
            lineHeight: 1.625,
            color: "var(--text-primary)",
          }}
        >
          <TextContent content={block.content} />
        </code>
      </pre>
    </div>
  );
}

function QuoteBlock({ block }: { block: Block }) {
  return (
    <div style={{ display: "flex" }}>
      <div
        style={{
          marginRight: 12,
          width: 4,
          flexShrink: 0,
          borderRadius: "9999px",
          backgroundColor: "var(--accent)",
        }}
        contentEditable={false}
      />
      <div
        data-content
        style={{
          minHeight: "1.5em",
          flex: 1,
          fontStyle: "italic",
          lineHeight: 1.625,
          color: "var(--text-secondary)",
        }}
      >
        <TextContent content={block.content} />
      </div>
    </div>
  );
}

function CalloutBlock({ block }: { block: Block }) {
  const emoji = block.props.emoji ?? "💡";

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        borderRadius: 8,
        border: "1px solid",
        padding: 16,
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--border-primary)",
      }}
    >
      <span style={{ fontSize: "1.125rem", userSelect: "none" }} contentEditable={false}>
        {emoji}
      </span>
      <div data-content style={{ minHeight: "1.5em", flex: 1, lineHeight: 1.625 }}>
        <TextContent content={block.content} />
      </div>
    </div>
  );
}

function ToggleBlock({ block, onToggle }: { block: Block; onToggle?: (id: string) => void }) {
  const collapsed = block.props.collapsed ?? true;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onToggle?.(block.id);
    },
    [block.id, onToggle],
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 4 }}>
        <button
          type="button"
          style={{
            marginTop: "0.25em",
            height: 20,
            width: 20,
            flexShrink: 0,
            transition: "transform 150ms",
            color: "var(--text-muted)",
            transform: collapsed ? "rotate(0deg)" : "rotate(90deg)",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
          contentEditable={false}
          onClick={handleClick}
        >
          <svg viewBox="0 0 16 16" fill="currentColor" style={{ height: "100%", width: "100%" }}>
            <path d="M6 4l4 4-4 4V4z" />
          </svg>
        </button>
        <div data-content style={{ minHeight: "1.5em", flex: 1, fontWeight: 500, lineHeight: 1.625 }}>
          <TextContent content={block.content} />
        </div>
      </div>
      {!collapsed && block.children.length > 0 && (
        <div
          style={{
            marginLeft: 24,
            marginTop: 4,
            borderLeft: "1px solid",
            paddingLeft: 16,
            borderColor: "var(--border-primary)",
          }}
        >
          {/* Children rendered by parent editor */}
        </div>
      )}
    </div>
  );
}

function DividerBlock() {
  return (
    <div style={{ paddingTop: 12, paddingBottom: 12 }} contentEditable={false}>
      <hr style={{ borderColor: "var(--border-primary)" }} />
    </div>
  );
}

function ImageBlock({ block, readOnly }: { block: Block; readOnly?: boolean }) {
  const src = block.props.src;
  const alt = block.props.alt ?? "";
  const caption = block.props.caption;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        globalThis.dispatchEvent(
          new CustomEvent("cortex-image-upload", {
            detail: { blockId: block.id, dataUrl, fileName: file.name },
          }),
        );
      };
      reader.readAsDataURL(file);
    },
    [block.id],
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const file = e.dataTransfer.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect],
  );

  if (!src) {
    return (
      <button
        type="button"
        style={{
          display: "flex",
          height: 192,
          width: "100%",
          cursor: "pointer",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          borderRadius: 8,
          border: "1px dashed",
          backgroundColor: "transparent",
          transition: "color 150ms, background-color 150ms",
          borderColor: "var(--border-secondary)",
          color: "var(--text-muted)",
        }}
        contentEditable={false}
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <svg style={{ height: 32, width: 32 }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
          />
        </svg>
        <span style={{ fontSize: "0.875rem" }}>Click to upload or drag an image</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleInputChange}
        />
      </button>
    );
  }

  return (
    <div style={{ margin: "8px 0" }} contentEditable={false}>
      <img src={src} alt={alt} style={{ maxWidth: "100%", borderRadius: 8 }} />
      {caption && (
        <p style={{ marginTop: 4, textAlign: "center", fontSize: "0.875rem", color: "var(--text-muted)" }}>
          {caption}
        </p>
      )}
    </div>
  );
}

/** Individual table cell — manages its own DOM text independently of React state */
function TableCell({
  value,
  isHeader,
  readOnly,
  onCommit,
  onFocusCell,
  onTab,
}: {
  value: string;
  isHeader: boolean;
  readOnly?: boolean;
  onCommit: (text: string) => void;
  onFocusCell: () => void;
  onTab?: (forward: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const committedRef = useRef(value);

  useEffect(() => {
    if (ref.current && ref.current.textContent !== value && document.activeElement !== ref.current) {
      ref.current.textContent = value;
      committedRef.current = value;
    }
  }, [value]);

  return (
    <div
      ref={ref}
      contentEditable={!readOnly}
      suppressContentEditableWarning
      onClick={(e) => {
        e.stopPropagation();
        ref.current?.focus();
        onFocusCell();
      }}
      onFocus={(e) => {
        e.stopPropagation();
        onFocusCell();
      }}
      onBlur={() => {
        const text = ref.current?.textContent ?? "";
        if (text !== committedRef.current) {
          committedRef.current = text;
          onCommit(text);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Tab") {
          e.preventDefault();
          e.stopPropagation();
          // Commit current cell
          const text = ref.current?.textContent ?? "";
          if (text !== committedRef.current) {
            committedRef.current = text;
            onCommit(text);
          }
          onTab?.(!e.shiftKey);
          return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          ref.current?.blur();
        }
        e.stopPropagation();
      }}
      onBeforeInput={(e) => e.stopPropagation()}
      style={{
        padding: "8px 12px",
        outline: "none",
        fontWeight: isHeader ? 600 : "normal",
        minHeight: "1.5em",
        lineHeight: 1.5,
        cursor: "text",
      }}
    />
  );
}

function TableBlock({ block, readOnly }: { block: Block; readOnly?: boolean }) {
  const tableRef = useRef<HTMLDivElement>(null);
  const defaultData: string[][] = [
    ["", "", ""],
    ["", "", ""],
    ["", "", ""],
  ];
  const [data, setData] = useState<string[][]>(() =>
    block.props.tableData && (block.props.tableData as string[][]).length > 0
      ? (block.props.tableData as string[][])
      : defaultData,
  );
  const hasHeader = block.props.tableHeader ?? true;
  const dataRef = useRef(data);
  dataRef.current = data;

  // Active cell tracking (for row/column highlighting)
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);

  // Dropdown state: { type: "col" | "row", index: number } | null
  const [menu, setMenu] = useState<{ type: "col" | "row"; index: number } | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Note: we do NOT sync from block.props.tableData on every change,
  // because that would race with local cell edits. The local state is the
  // source of truth. The initial state is set from props in useState above.

  // Close menu on outside click
  useEffect(() => {
    if (!menu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menu]);

  const dispatchUpdate = useCallback(
    (newData: string[][]) => {
      setData(newData);
      globalThis.dispatchEvent(
        new CustomEvent("cortex-table-update", {
          detail: { blockId: block.id, tableData: newData },
        }),
      );
    },
    [block.id],
  );

  const handleCellInput = useCallback(
    (rowIdx: number, colIdx: number, value: string) => {
      // Update the ref immediately (no React re-render)
      const current = dataRef.current;
      if (current[rowIdx]) {
        current[rowIdx] = [...current[rowIdx]];
        current[rowIdx][colIdx] = value;
      }
      // Dispatch to model without triggering React state update
      // (avoids re-rendering cells and losing focus)
      const newData = current.map((r) => [...r]);
      globalThis.dispatchEvent(
        new CustomEvent("cortex-table-update", {
          detail: { blockId: block.id, tableData: newData },
        }),
      );
    },
    [block.id],
  );

  // Column operations
  const insertColumn = useCallback(
    (colIdx: number, direction: "left" | "right") => {
      const insertAt = direction === "left" ? colIdx : colIdx + 1;
      const newData = data.map((row) => {
        const r = [...row];
        r.splice(insertAt, 0, "");
        return r;
      });
      dispatchUpdate(newData);
      setMenu(null);
    },
    [data, dispatchUpdate],
  );

  const deleteColumn = useCallback(
    (colIdx: number) => {
      if (data[0].length <= 1) return; // Don't delete last column
      const newData = data.map((row) => {
        const r = [...row];
        r.splice(colIdx, 1);
        return r;
      });
      dispatchUpdate(newData);
      setMenu(null);
    },
    [data, dispatchUpdate],
  );

  // Row operations
  const insertRow = useCallback(
    (rowIdx: number, direction: "above" | "below") => {
      const insertAt = direction === "above" ? rowIdx : rowIdx + 1;
      const cols = data[0]?.length ?? 3;
      const newRow = Array(cols).fill("");
      const newData = [...data];
      newData.splice(insertAt, 0, newRow);
      dispatchUpdate(newData);
      setMenu(null);
    },
    [data, dispatchUpdate],
  );

  const deleteRow = useCallback(
    (rowIdx: number) => {
      if (data.length <= 1) return; // Don't delete last row
      const newData = [...data];
      newData.splice(rowIdx, 1);
      dispatchUpdate(newData);
      setMenu(null);
    },
    [data, dispatchUpdate],
  );

  // Move column left/right
  const moveColumn = useCallback(
    (colIdx: number, direction: "left" | "right") => {
      const targetIdx = direction === "left" ? colIdx - 1 : colIdx + 1;
      if (targetIdx < 0 || targetIdx >= (data[0]?.length ?? 0)) return;
      const newData = data.map((row) => {
        const r = [...row];
        [r[colIdx], r[targetIdx]] = [r[targetIdx], r[colIdx]];
        return r;
      });
      dispatchUpdate(newData);
      setMenu(null);
    },
    [data, dispatchUpdate],
  );

  // Move row up/down
  const moveRow = useCallback(
    (rowIdx: number, direction: "up" | "down") => {
      const targetIdx = direction === "up" ? rowIdx - 1 : rowIdx + 1;
      if (targetIdx < 0 || targetIdx >= data.length) return;
      const newData = data.map((r) => [...r]);
      [newData[rowIdx], newData[targetIdx]] = [newData[targetIdx], newData[rowIdx]];
      dispatchUpdate(newData);
      setMenu(null);
    },
    [data, dispatchUpdate],
  );

  // Sort all data rows by a column
  const sortByColumn = useCallback(
    (colIdx: number, direction: "asc" | "desc") => {
      const startIdx = hasHeader ? 1 : 0;
      const headerRows = data.slice(0, startIdx);
      const bodyRows = data.slice(startIdx).map((r) => [...r]);
      bodyRows.sort((a, b) => {
        const cmp = (a[colIdx] ?? "").localeCompare(b[colIdx] ?? "");
        return direction === "asc" ? cmp : -cmp;
      });
      dispatchUpdate([...headerRows, ...bodyRows]);
      setMenu(null);
    },
    [data, hasHeader, dispatchUpdate],
  );

  // Sort cells within a single row
  const sortRow = useCallback(
    (rowIdx: number, direction: "asc" | "desc") => {
      const newData = data.map((r) => [...r]);
      const sorted = [...newData[rowIdx]].sort((a, b) => {
        const cmp = a.localeCompare(b);
        return direction === "asc" ? cmp : -cmp;
      });
      newData[rowIdx] = sorted;
      dispatchUpdate(newData);
      setMenu(null);
    },
    [data, dispatchUpdate],
  );

  // Clear all cells in a column
  const clearColumn = useCallback(
    (colIdx: number) => {
      const newData = data.map((r) => {
        const row = [...r];
        row[colIdx] = "";
        return row;
      });
      dispatchUpdate(newData);
      setMenu(null);
    },
    [data, dispatchUpdate],
  );

  // Clear all cells in a row
  const clearRow = useCallback(
    (rowIdx: number) => {
      const newData = data.map((r) => [...r]);
      newData[rowIdx] = newData[rowIdx].map(() => "");
      dispatchUpdate(newData);
      setMenu(null);
    },
    [data, dispatchUpdate],
  );

  // Duplicate a column (insert copy to the right)
  const duplicateColumn = useCallback(
    (colIdx: number) => {
      const newData = data.map((row) => {
        const r = [...row];
        r.splice(colIdx + 1, 0, r[colIdx]);
        return r;
      });
      dispatchUpdate(newData);
      setMenu(null);
    },
    [data, dispatchUpdate],
  );

  // Duplicate a row (insert copy below)
  const duplicateRow = useCallback(
    (rowIdx: number) => {
      const newData = data.map((r) => [...r]);
      newData.splice(rowIdx + 1, 0, [...newData[rowIdx]]);
      dispatchUpdate(newData);
      setMenu(null);
    },
    [data, dispatchUpdate],
  );

  const addRow = useCallback(() => {
    const cols = data[0]?.length ?? 3;
    const newRow = Array(cols).fill("");
    dispatchUpdate([...data, newRow]);
  }, [data, dispatchUpdate]);

  const addColumn = useCallback(() => {
    const newData = data.map((row) => [...row, ""]);
    dispatchUpdate(newData);
  }, [data, dispatchUpdate]);

  const numCols = data[0]?.length ?? 0;

  const dropdownStyles: React.CSSProperties = {
    position: "absolute",
    backgroundColor: "var(--bg-primary, white)",
    border: "1px solid var(--border-primary, #e5e5e5)",
    borderRadius: 8,
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    padding: "4px 0",
    zIndex: 100,
    minWidth: 160,
  };

  const menuItemStyles: React.CSSProperties = {
    padding: "6px 12px",
    cursor: "pointer",
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "var(--text-primary, #333)",
    background: "none",
    border: "none",
    width: "100%",
    textAlign: "left",
  };

  const menuItemDangerStyles: React.CSSProperties = {
    ...menuItemStyles,
    color: "var(--text-danger, #dc2626)",
  };

  return (
    <div
      ref={tableRef}
      style={{ margin: "8px 0", position: "relative" }}
      contentEditable={false}
      onBlur={(e) => {
        // Clear active cell when focus leaves the table entirely
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setActiveCell(null);
        }
      }}
    >
      {/* Wrapper with table + add-column button side by side */}
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <div style={{ flex: 1, overflow: "visible" }}>
          {/* Column header buttons row (hidden in readOnly) */}
          {!readOnly && <div style={{ display: "flex", paddingLeft: 28 }}>
            {data[0]?.map((_col, ci) => (
              <div
                key={ci}
                style={{
                  minWidth: 80,
                  flex: 1,
                  display: "flex",
                  justifyContent: "center",
                  position: "relative",
                }}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenu(menu?.type === "col" && menu.index === ci ? null : { type: "col", index: ci });
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "2px 6px",
                    borderRadius: 4,
                    color: "var(--text-muted, #999)",
                    fontSize: 14,
                    lineHeight: 1,
                    display: "flex",
                    alignItems: "center",
                    opacity: activeCell?.col === ci || (menu?.type === "col" && menu.index === ci) ? 1 : 0,
                    transition: "opacity 150ms",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.opacity = "1";
                    (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-hover, #f0f0f0)";
                  }}
                  onMouseLeave={(e) => {
                    if (activeCell?.col !== ci && !(menu?.type === "col" && menu.index === ci)) {
                      (e.currentTarget as HTMLElement).style.opacity = "0";
                    }
                    (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                  }}
                  title="Column options"
                >
                  <MoreHorizontal size={14} />
                </button>
                {/* Column dropdown menu */}
                {menu?.type === "col" && menu.index === ci && (
                  <div ref={menuRef} style={{ ...dropdownStyles, top: "100%", left: "50%", transform: "translateX(-50%)" }}>
                    <button
                      type="button"
                      style={{ ...menuItemStyles, ...(ci === 0 ? { opacity: 0.4, cursor: "default" } : {}) }}
                      onMouseEnter={(e) => { if (ci > 0) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-hover, #f8f8f8)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                      onMouseDown={(e) => { e.preventDefault(); if (ci > 0) moveColumn(ci, "left"); }}
                    >
                      <ArrowLeft size={14} /> Move column left
                    </button>
                    <button
                      type="button"
                      style={{ ...menuItemStyles, ...(ci === numCols - 1 ? { opacity: 0.4, cursor: "default" } : {}) }}
                      onMouseEnter={(e) => { if (ci < numCols - 1) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-hover, #f8f8f8)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                      onMouseDown={(e) => { e.preventDefault(); if (ci < numCols - 1) moveColumn(ci, "right"); }}
                    >
                      <ArrowRight size={14} /> Move column right
                    </button>
                    <div style={{ height: 1, backgroundColor: "var(--border-primary, #e5e5e5)", margin: "4px 0" }} />
                    <button
                      type="button"
                      style={menuItemStyles}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-hover, #f8f8f8)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                      onMouseDown={(e) => { e.preventDefault(); insertColumn(ci, "left"); }}
                    >
                      <Plus size={14} /> Insert column left
                    </button>
                    <button
                      type="button"
                      style={menuItemStyles}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-hover, #f8f8f8)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                      onMouseDown={(e) => { e.preventDefault(); insertColumn(ci, "right"); }}
                    >
                      <Plus size={14} /> Insert column right
                    </button>
                    <div style={{ height: 1, backgroundColor: "var(--border-primary, #e5e5e5)", margin: "4px 0" }} />
                    <button
                      type="button"
                      style={menuItemStyles}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-hover, #f8f8f8)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                      onMouseDown={(e) => { e.preventDefault(); sortByColumn(ci, "asc"); }}
                    >
                      <ArrowDownAZ size={14} /> Sort column A-Z
                    </button>
                    <button
                      type="button"
                      style={menuItemStyles}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-hover, #f8f8f8)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                      onMouseDown={(e) => { e.preventDefault(); sortByColumn(ci, "desc"); }}
                    >
                      <ArrowUpAZ size={14} /> Sort column Z-A
                    </button>
                    <div style={{ height: 1, backgroundColor: "var(--border-primary, #e5e5e5)", margin: "4px 0" }} />
                    <button
                      type="button"
                      style={menuItemStyles}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-hover, #f8f8f8)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                      onMouseDown={(e) => { e.preventDefault(); clearColumn(ci); }}
                    >
                      <XSquare size={14} /> Clear column contents
                    </button>
                    <div style={{ height: 1, backgroundColor: "var(--border-primary, #e5e5e5)", margin: "4px 0" }} />
                    <button
                      type="button"
                      style={menuItemStyles}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-hover, #f8f8f8)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                      onMouseDown={(e) => { e.preventDefault(); duplicateColumn(ci); }}
                    >
                      <Copy size={14} /> Duplicate column
                    </button>
                    {numCols > 1 && (<>
                      <div style={{ height: 1, backgroundColor: "var(--border-primary, #e5e5e5)", margin: "4px 0" }} />
                      <button
                        type="button"
                        style={menuItemDangerStyles}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-hover, #f8f8f8)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                        onMouseDown={(e) => { e.preventDefault(); deleteColumn(ci); }}
                      >
                        <Trash2 size={14} /> Delete column
                      </button>
                    </>)}
                  </div>
                )}
              </div>
            ))}
          </div>}

          {/* Table */}
          <div style={{ display: "flex" }}>
            {/* Row handle buttons column (hidden in readOnly) */}
            {!readOnly && <div style={{ display: "flex", flexDirection: "column", justifyContent: "stretch" }}>
              {data.map((_row, ri) => (
                <div
                  key={ri}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 28,
                    flex: 1,
                    position: "relative",
                  }}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenu(menu?.type === "row" && menu.index === ri ? null : { type: "row", index: ri });
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "2px 4px",
                      borderRadius: 4,
                      color: "var(--text-muted, #999)",
                      fontSize: 14,
                      lineHeight: 1,
                      display: "flex",
                      alignItems: "center",
                      opacity: activeCell?.row === ri || hoveredRow === ri || (menu?.type === "row" && menu.index === ri) ? 1 : 0,
                      transition: "opacity 150ms",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-hover, #f0f0f0)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                    title="Row options"
                  >
                    <MoreVertical size={14} />
                  </button>
                  {/* Row dropdown menu */}
                  {menu?.type === "row" && menu.index === ri && (
                    <div ref={menuRef} style={{ ...dropdownStyles, top: "50%", left: "100%", transform: "translateY(-50%)" }}>
                      <button
                        type="button"
                        style={menuItemStyles}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-hover, #f8f8f8)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                        onClick={() => insertRow(ri, "above")}
                      >
                        <Plus size={14} /> Insert row above
                      </button>
                      <button
                        type="button"
                        style={menuItemStyles}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-hover, #f8f8f8)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                        onClick={() => insertRow(ri, "below")}
                      >
                        <Plus size={14} /> Insert row below
                      </button>
                      {data.length > 1 && (
                        <button
                          type="button"
                          style={menuItemDangerStyles}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-hover, #f8f8f8)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                          onClick={() => deleteRow(ri)}
                        >
                          <Trash2 size={14} /> Delete row
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>}

            {/* Actual table */}
            <table
              style={{
                borderCollapse: "collapse",
                border: "1px solid var(--border-primary, #e5e5e5)",
                width: "100%",
              }}
            >
              <tbody>
                {data.map((row, ri) => {
                  const isHeader = hasHeader && ri === 0;
                  return (
                    <tr
                      key={ri}
                      onMouseEnter={() => setHoveredRow(ri)}
                      onMouseLeave={() => setHoveredRow(null)}
                      style={{
                        backgroundColor:
                          isHeader
                            ? "var(--bg-secondary, #f5f5f5)"
                            : hoveredRow === ri
                              ? "var(--bg-hover, #f8f8f8)"
                              : "transparent",
                        transition: "background-color 100ms",
                      }}
                    >
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          onClick={(e) => {
                            // If click lands on td (not inner div), focus the cell div
                            const cellDiv = (e.currentTarget as HTMLElement).querySelector("[contenteditable='true']") as HTMLElement;
                            if (cellDiv && e.target === e.currentTarget) {
                              cellDiv.focus();
                              setActiveCell({ row: ri, col: ci });
                            }
                          }}
                          style={{
                            border: "1px solid var(--border-primary, #e5e5e5)",
                            padding: 0,
                            minWidth: 80,
                            verticalAlign: "top",
                            backgroundColor:
                              activeCell && (activeCell.row === ri || activeCell.col === ci)
                                ? "rgba(37, 99, 235, 0.06)"
                                : undefined,
                            outline: activeCell?.row === ri && activeCell?.col === ci
                              ? "2px solid rgba(37, 99, 235, 0.4)"
                              : undefined,
                            outlineOffset: -2,
                          }}
                        >
                          <TableCell
                            key={`${ri}-${ci}`}
                            value={cell}
                            isHeader={isHeader}
                            readOnly={readOnly}
                            onCommit={(text) => handleCellInput(ri, ci, text)}
                            onFocusCell={() => setActiveCell({ row: ri, col: ci })}
                            onTab={(forward) => {
                              // Navigate to next/prev cell
                              const numCols2 = data[0]?.length ?? 0;
                              let nextRow = ri;
                              let nextCol = forward ? ci + 1 : ci - 1;
                              if (nextCol >= numCols2) { nextRow++; nextCol = 0; }
                              if (nextCol < 0) { nextRow--; nextCol = numCols2 - 1; }
                              if (nextRow >= 0 && nextRow < data.length) {
                                setActiveCell({ row: nextRow, col: nextCol });
                                // Focus the target cell
                                setTimeout(() => {
                                  const cells = tableRef.current?.querySelectorAll("td");
                                  const targetIdx = nextRow * numCols2 + nextCol;
                                  const targetTd = cells?.[targetIdx];
                                  const cellDiv = targetTd?.querySelector("[contenteditable]") as HTMLElement;
                                  cellDiv?.focus();
                                }, 0);
                              }
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Add column button (to the right of the table, hidden in readOnly) */}
            {!readOnly &&
            <div style={{ display: "flex", alignItems: "center" }}>
              <button
                type="button"
                onClick={addColumn}
                title="Add column"
                style={{
                  background: "none",
                  border: "1px dashed var(--border-primary, #e5e5e5)",
                  borderRadius: 4,
                  cursor: "pointer",
                  padding: "4px 6px",
                  marginLeft: 4,
                  color: "var(--text-muted, #999)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: 0.5,
                  transition: "opacity 150ms",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.5"; }}
              >
                <Plus size={14} />
              </button>
            </div>}
          </div>

          {/* Add row button (below the table, hidden in readOnly) */}
          {!readOnly && <div style={{ display: "flex", justifyContent: "center", paddingLeft: readOnly ? 0 : 28, marginTop: 4 }}>
            <button
              type="button"
              onClick={addRow}
              title="Add row"
              style={{
                background: "none",
                border: "1px dashed var(--border-primary, #e5e5e5)",
                borderRadius: 4,
                cursor: "pointer",
                padding: "4px 20px",
                color: "var(--text-muted, #999)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                fontSize: 13,
                opacity: 0.5,
                transition: "opacity 150ms",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.5"; }}
            >
              <Plus size={14} />
            </button>
          </div>}
        </div>
      </div>
    </div>
  );
}

function MermaidBlock({ block }: { block: Block }) {
  const code = block.props.mermaidCode ?? "";
  const containerId = `mermaid-${block.id}`;
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;

    const mermaid = (window as any).mermaid;
    if (!mermaid?.render) return;

    let cancelled = false;

    (async () => {
      try {
        const result = await mermaid.render(containerId, code);
        if (!cancelled) {
          setSvg(result.svg);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Mermaid render error");
          setSvg(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, containerId]);

  return (
    <div
      style={{
        margin: "8px 0",
        borderRadius: 8,
        border: "1px solid",
        overflow: "hidden",
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--border-primary)",
      }}
      contentEditable={false}
    >
      <div
        style={{
          paddingLeft: 16,
          paddingRight: 16,
          paddingTop: 4,
          paddingBottom: 4,
          fontSize: "0.75rem",
          borderBottom: "1px solid",
          userSelect: "none",
          color: "var(--text-muted)",
          borderColor: "var(--border-primary)",
        }}
      >
        Mermaid
      </div>
      <div style={{ padding: 16 }}>
        {svg ? (
          <div dangerouslySetInnerHTML={{ __html: svg }} />
        ) : error ? (
          <pre
            style={{
              fontFamily: "'SF Mono', 'Fira Code', Menlo, monospace",
              fontSize: "0.875rem",
              whiteSpace: "pre-wrap",
              color: "var(--text-secondary)",
            }}
          >
            {code}
            {"\n\n"}
            <span style={{ color: "var(--text-muted)" }}>Error: {error}</span>
          </pre>
        ) : (
          <pre
            style={{
              fontFamily: "'SF Mono', 'Fira Code', Menlo, monospace",
              fontSize: "0.875rem",
              whiteSpace: "pre-wrap",
              color: "var(--text-secondary)",
            }}
          >
            {code}
            {!(window as any).mermaid && (
              <>
                {"\n\n"}
                <span style={{ color: "var(--text-muted)" }}>
                  Mermaid library not loaded. Include mermaid to render this diagram.
                </span>
              </>
            )}
          </pre>
        )}
      </div>
    </div>
  );
}

function CustomComponentBlock({ block }: { block: Block }) {
  const componentName = (block.props.componentName ?? "") as string;
  const def = getRegisteredComponent(componentName);

  if (!def) {
    return (
      <div
        style={{
          margin: "8px 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          border: "1px dashed var(--border-secondary, #d4d4d4)",
          padding: 24,
          color: "var(--text-muted, #999)",
          fontSize: 13,
        }}
        contentEditable={false}
      >
        Custom component: <strong style={{ marginLeft: 4 }}>{componentName || "unnamed"}</strong>&nbsp;(not registered)
      </div>
    );
  }

  const Comp = def.component;

  return (
    <div style={{ margin: "8px 0" }} contentEditable={false}>
      <Comp
        props={block.props}
        readOnly={false}
      />
    </div>
  );
}

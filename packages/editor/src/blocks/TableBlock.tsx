// ============================================================
// TableBlock — full-featured table editor with:
//   • Column/row menus with rich operations
//   • Drag-and-drop reorder for columns and rows
//   • Column resize via drag handles
//   • Per-cell context menu (background color, alignment)
//   • Table templates
//   • GFM-compatible markdown serialization
// ============================================================

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  ArrowLeft,
  ArrowRight,
  ArrowDownAZ,
  ArrowUpAZ,
  Copy,
  XSquare,
  GripVertical,
  GripHorizontal,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Paintbrush,
  ChevronRight,
  Palette,
  Merge,
  SplitSquareHorizontal,
  SquareDashedBottom,
} from "lucide-react";
import type { Block } from "../core/types";

// ---- Types ----

type CellAlign = "left" | "center" | "right";

interface CellMeta {
  bgColor?: string;
  align?: CellAlign;
  borderless?: boolean; // hide borders for this cell
}

// Key format: "row-col"
type CellMetaMap = Record<string, CellMeta>;

// Merge spans: key is "row-col" of the top-left cell
interface MergeSpan {
  rowSpan: number;
  colSpan: number;
}
type MergeMap = Record<string, MergeSpan>;

// ---- Color Templates (table-level presets applied via block menu) ----

export interface ColorTemplate {
  name: string;
  description: string;
  preview: { header: string; evenRow: string; oddRow: string };
  apply: (rows: number, cols: number) => CellMetaMap;
}

export const COLOR_TEMPLATES: ColorTemplate[] = [
  {
    name: "Default",
    description: "No colors",
    preview: { header: "", evenRow: "", oddRow: "" },
    apply: () => ({}),
  },
  {
    name: "Striped Gray",
    description: "Alternating gray rows",
    preview: { header: "#f3f4f6", evenRow: "", oddRow: "#f9fafb" },
    apply: (rows, cols) => {
      const m: CellMetaMap = {};
      for (let r = 0; r < rows; r++) {
        const bg = r === 0 ? "#f3f4f6" : r % 2 === 0 ? "#f9fafb" : "";
        if (bg) for (let c = 0; c < cols; c++) m[`${r}-${c}`] = { bgColor: bg };
      }
      return m;
    },
  },
  {
    name: "Blue Header",
    description: "Blue header with light rows",
    preview: { header: "#dbeafe", evenRow: "", oddRow: "#eff6ff" },
    apply: (rows, cols) => {
      const m: CellMetaMap = {};
      for (let r = 0; r < rows; r++) {
        const bg = r === 0 ? "#dbeafe" : r % 2 === 0 ? "#eff6ff" : "";
        if (bg) for (let c = 0; c < cols; c++) m[`${r}-${c}`] = { bgColor: bg };
      }
      return m;
    },
  },
  {
    name: "Green Header",
    description: "Green header with light rows",
    preview: { header: "#dcfce7", evenRow: "", oddRow: "#f0fdf4" },
    apply: (rows, cols) => {
      const m: CellMetaMap = {};
      for (let r = 0; r < rows; r++) {
        const bg = r === 0 ? "#dcfce7" : r % 2 === 0 ? "#f0fdf4" : "";
        if (bg) for (let c = 0; c < cols; c++) m[`${r}-${c}`] = { bgColor: bg };
      }
      return m;
    },
  },
  {
    name: "Purple Header",
    description: "Purple header with light rows",
    preview: { header: "#ede9fe", evenRow: "", oddRow: "#f5f3ff" },
    apply: (rows, cols) => {
      const m: CellMetaMap = {};
      for (let r = 0; r < rows; r++) {
        const bg = r === 0 ? "#ede9fe" : r % 2 === 0 ? "#f5f3ff" : "";
        if (bg) for (let c = 0; c < cols; c++) m[`${r}-${c}`] = { bgColor: bg };
      }
      return m;
    },
  },
  {
    name: "Warm Tones",
    description: "Orange header with warm rows",
    preview: { header: "#ffedd5", evenRow: "", oddRow: "#fff7ed" },
    apply: (rows, cols) => {
      const m: CellMetaMap = {};
      for (let r = 0; r < rows; r++) {
        const bg = r === 0 ? "#ffedd5" : r % 2 === 0 ? "#fff7ed" : "";
        if (bg) for (let c = 0; c < cols; c++) m[`${r}-${c}`] = { bgColor: bg };
      }
      return m;
    },
  },
  {
    name: "Rose",
    description: "Pink header with rose rows",
    preview: { header: "#fce7f3", evenRow: "", oddRow: "#fdf2f8" },
    apply: (rows, cols) => {
      const m: CellMetaMap = {};
      for (let r = 0; r < rows; r++) {
        const bg = r === 0 ? "#fce7f3" : r % 2 === 0 ? "#fdf2f8" : "";
        if (bg) for (let c = 0; c < cols; c++) m[`${r}-${c}`] = { bgColor: bg };
      }
      return m;
    },
  },
];

/** Look up a color template by name and reapply it for the given dimensions */
export function reapplyColorTemplate(
  templateName: string,
  rows: number,
  cols: number,
): CellMetaMap {
  const tmpl = COLOR_TEMPLATES.find((t) => t.name === templateName);
  if (!tmpl) return {};
  return tmpl.apply(rows, cols);
}

// ---- Color Palette ----

const CELL_COLORS = [
  { name: "None", value: "" },
  { name: "Light Gray", value: "#f3f4f6" },
  { name: "Light Red", value: "#fee2e2" },
  { name: "Light Orange", value: "#ffedd5" },
  { name: "Light Yellow", value: "#fef9c3" },
  { name: "Light Green", value: "#dcfce7" },
  { name: "Light Blue", value: "#dbeafe" },
  { name: "Light Purple", value: "#ede9fe" },
  { name: "Light Pink", value: "#fce7f3" },
];

// ---- Table Templates ----

export interface TableTemplate {
  name: string;
  description: string;
  data: string[][];
  columnAlignments?: CellAlign[];
  cellMeta?: CellMetaMap;
}

export const TABLE_TEMPLATES: TableTemplate[] = [
  {
    name: "Empty 3×3",
    description: "Blank table with header row",
    data: [
      ["Column 1", "Column 2", "Column 3"],
      ["", "", ""],
      ["", "", ""],
    ],
  },
  {
    name: "Task Tracker",
    description: "Track tasks with status and assignee",
    data: [
      ["Task", "Status", "Assignee", "Due Date"],
      ["Design mockups", "In Progress", "Alice", ""],
      ["API endpoints", "Todo", "Bob", ""],
      ["Write tests", "Todo", "", ""],
    ],
  },
  {
    name: "Comparison",
    description: "Compare features or options",
    data: [
      ["Feature", "Option A", "Option B", "Option C"],
      ["Price", "", "", ""],
      ["Performance", "", "", ""],
      ["Ease of Use", "", "", ""],
      ["Support", "", "", ""],
    ],
  },
  {
    name: "Weekly Schedule",
    description: "Plan your week",
    data: [
      ["Time", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      ["9:00 AM", "", "", "", "", ""],
      ["10:00 AM", "", "", "", "", ""],
      ["11:00 AM", "", "", "", "", ""],
      ["12:00 PM", "", "", "", "", ""],
      ["2:00 PM", "", "", "", "", ""],
      ["3:00 PM", "", "", "", "", ""],
    ],
  },
  {
    name: "Pros & Cons",
    description: "Evaluate pros and cons",
    data: [
      ["Pros", "Cons"],
      ["", ""],
      ["", ""],
      ["", ""],
    ],
  },
  {
    name: "Contact List",
    description: "Store contacts information",
    data: [
      ["Name", "Email", "Phone", "Company"],
      ["", "", "", ""],
      ["", "", "", ""],
    ],
  },
];

// ---- Individual Cell ----

function TableCell({
  value,
  isHeader,
  readOnly,
  align,
  onCommit,
  onFocusCell,
  onTab,
  onContextMenu,
}: {
  value: string;
  isHeader: boolean;
  readOnly?: boolean;
  align?: CellAlign;
  onCommit: (text: string) => void;
  onFocusCell: () => void;
  onTab?: (forward: boolean) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
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
        if (e.shiftKey) {
          // Let shift-clicks bubble up to the <td> for multi-select
          return;
        }
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
      onContextMenu={onContextMenu}
      style={{
        padding: "8px 12px",
        outline: "none",
        fontWeight: isHeader ? 600 : "normal",
        minHeight: "1.5em",
        lineHeight: 1.5,
        cursor: "text",
        textAlign: align ?? "left",
      }}
    />
  );
}

// ---- Color Picker Sub-menu ----

function ColorPicker({
  currentColor,
  onSelect,
}: {
  currentColor?: string;
  onSelect: (color: string) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 4,
        padding: 8,
        minWidth: 140,
      }}
    >
      {CELL_COLORS.map((c) => (
        <button
          key={c.value || "none"}
          type="button"
          title={c.name}
          onClick={() => onSelect(c.value)}
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            border: currentColor === c.value
              ? "2px solid rgba(37, 99, 235, 0.6)"
              : "1px solid var(--border-primary, #e5e5e5)",
            backgroundColor: c.value || "var(--bg-primary, white)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            transition: "transform 100ms",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.transform = "scale(1.1)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.transform = "scale(1)";
          }}
        >
          {c.value === "" ? "✕" : ""}
        </button>
      ))}
    </div>
  );
}

// ---- Main TableBlock Component ----

export function TableBlock({ block, readOnly }: { block: Block; readOnly?: boolean }) {
  const tableRef = useRef<HTMLDivElement>(null);
  const tableElRef = useRef<HTMLTableElement>(null);
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

  // Cell metadata (colors, alignment)
  const [cellMeta, setCellMeta] = useState<CellMetaMap>(
    () => (block.props.cellMeta as CellMetaMap) ?? {},
  );
  const cellMetaRef = useRef(cellMeta);
  cellMetaRef.current = cellMeta;

  // Sync cellMeta from props when changed externally (e.g. color templates via block menu)
  useEffect(() => {
    const incoming = (block.props.cellMeta as CellMetaMap) ?? {};
    setCellMeta(incoming);
    cellMetaRef.current = incoming;
  }, [block.props.cellMeta]);

  // Column alignments (derived from cellMeta header row, or stored separately)
  const [columnAlignments, setColumnAlignments] = useState<CellAlign[]>(
    () => (block.props.columnAlignments as CellAlign[]) ?? [],
  );

  // Column widths for resize (in pixels, undefined = auto)
  const [columnWidths, setColumnWidths] = useState<number[]>(
    () => (block.props.columnWidths as number[]) ?? [],
  );

  // Measured column widths from the DOM (for aligning header dots)
  const [measuredColWidths, setMeasuredColWidths] = useState<number[]>([]);

  // Active cell tracking
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);

  // Dropdown menu state
  const [menu, setMenu] = useState<{ type: "col" | "row" | "cell"; index: number; colIndex?: number } | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Cell context menu
  const [cellMenu, setCellMenu] = useState<{
    row: number;
    col: number;
    x: number;
    y: number;
    subMenu?: "color" | "alignment";
  } | null>(null);
  const cellMenuRef = useRef<HTMLDivElement>(null);

  // Drag state for columns/rows
  const [dragCol, setDragCol] = useState<{ from: number; over: number | null } | null>(null);
  const [dragRow, setDragRow] = useState<{ from: number; over: number | null } | null>(null);

  // Resize state
  const [resizing, setResizing] = useState<{
    colIndex: number;
    startX: number;
    startWidth: number;
  } | null>(null);

  // Template selector
  const [showTemplates, setShowTemplates] = useState(false);

  // Merge cells map: key is "row-col" of top-left cell
  const [merges, setMerges] = useState<MergeMap>(
    () => (block.props.merges as MergeMap) ?? {},
  );

  // Border visibility (controlled via block menu)
  const showBorders = (block.props.showBorders as boolean) ?? true;

  // Compact mode (controlled via block menu)
  const compact = (block.props.compact as boolean) ?? false;

  // Active color template name (used to reapply on row/col changes)
  const activeColorTemplate = (block.props.colorTemplate as string) ?? "";

  // Cell selection for merge (multi-select with shift+click)
  const [selectedCells, setSelectedCells] = useState<{ row: number; col: number }[]>([]);

  // ---- Measure column widths from DOM ----
  useLayoutEffect(() => {
    const table = tableElRef.current;
    if (!table) return;
    const firstRow = table.querySelector("tr");
    if (!firstRow) return;
    const cells = firstRow.querySelectorAll("td, th");
    const widths: number[] = [];
    cells.forEach((cell) => widths.push((cell as HTMLElement).offsetWidth));
    setMeasuredColWidths(widths);
  }, [data]);

  // Re-measure on resize
  useEffect(() => {
    const table = tableElRef.current;
    if (!table) return;
    const observer = new ResizeObserver(() => {
      const firstRow = table.querySelector("tr");
      if (!firstRow) return;
      const cells = firstRow.querySelectorAll("td, th");
      const widths: number[] = [];
      cells.forEach((cell) => widths.push((cell as HTMLElement).offsetWidth));
      setMeasuredColWidths(widths);
    });
    observer.observe(table);
    return () => observer.disconnect();
  }, []);

  // Close menus on outside click
  useEffect(() => {
    if (!menu && !cellMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menu && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
      if (cellMenu && cellMenuRef.current && !cellMenuRef.current.contains(e.target as Node)) {
        setCellMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menu, cellMenu]);

  // ---- Resize mouse tracking ----
  useEffect(() => {
    if (!resizing) return;
    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizing.startX;
      const newWidth = Math.max(50, resizing.startWidth + delta);
      setColumnWidths((prev) => {
        const next = [...prev];
        next[resizing.colIndex] = newWidth;
        return next;
      });
    };
    const onMouseUp = () => {
      // Persist column widths
      const widths = [...columnWidths];
      if (resizing) widths[resizing.colIndex] = Math.max(50, resizing.startWidth + 0);
      setResizing(null);
      dispatchMetaUpdate({ columnWidths: widths });
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [resizing]);

  // ---- Dispatch helpers ----

  const dispatchUpdate = useCallback(
    (newData: string[][]) => {
      setData(newData);
      dataRef.current = newData;
      globalThis.dispatchEvent(
        new CustomEvent("cortex-table-update", {
          detail: { blockId: block.id, tableData: newData },
        }),
      );
    },
    [block.id],
  );

  const dispatchMetaUpdate = useCallback(
    (meta: Record<string, unknown>) => {
      globalThis.dispatchEvent(
        new CustomEvent("cortex-table-update", {
          detail: { blockId: block.id, tableData: dataRef.current, ...meta },
        }),
      );
    },
    [block.id],
  );

  const handleCellInput = useCallback(
    (rowIdx: number, colIdx: number, value: string) => {
      const current = dataRef.current;
      if (current[rowIdx]) {
        current[rowIdx] = [...current[rowIdx]];
        current[rowIdx][colIdx] = value;
      }
      const newData = current.map((r) => [...r]);
      globalThis.dispatchEvent(
        new CustomEvent("cortex-table-update", {
          detail: { blockId: block.id, tableData: newData },
        }),
      );
    },
    [block.id],
  );

  // ---- Column operations ----

  const insertColumn = useCallback(
    (colIdx: number, direction: "left" | "right") => {
      const insertAt = direction === "left" ? colIdx : colIdx + 1;
      const newData = data.map((row) => {
        const r = [...row];
        r.splice(insertAt, 0, "");
        return r;
      });
      // Update column alignments
      const newAligns = [...columnAlignments];
      newAligns.splice(insertAt, 0, "left");
      setColumnAlignments(newAligns);
      // Update column widths
      const newWidths = [...columnWidths];
      newWidths.splice(insertAt, 0, 0);
      setColumnWidths(newWidths);
      // Reapply color template or shift meta
      const newMeta = activeColorTemplate
        ? reapplyColorTemplate(activeColorTemplate, newData.length, newData[0].length)
        : shiftCellMetaForInsertCol(cellMeta, insertAt, data.length);
      setCellMeta(newMeta);
      dispatchUpdate(newData);
      if (activeColorTemplate) dispatchMetaUpdate({ cellMeta: newMeta });
      setMenu(null);
    },
    [data, columnAlignments, columnWidths, cellMeta, activeColorTemplate, dispatchUpdate, dispatchMetaUpdate],
  );

  const deleteColumn = useCallback(
    (colIdx: number) => {
      if (data[0].length <= 1) return;
      const newData = data.map((row) => {
        const r = [...row];
        r.splice(colIdx, 1);
        return r;
      });
      const newAligns = [...columnAlignments];
      newAligns.splice(colIdx, 1);
      setColumnAlignments(newAligns);
      const newWidths = [...columnWidths];
      newWidths.splice(colIdx, 1);
      setColumnWidths(newWidths);
      const newMeta = activeColorTemplate
        ? reapplyColorTemplate(activeColorTemplate, newData.length, newData[0].length)
        : shiftCellMetaForDeleteCol(cellMeta, colIdx, data.length, data[0].length);
      setCellMeta(newMeta);
      dispatchUpdate(newData);
      if (activeColorTemplate) dispatchMetaUpdate({ cellMeta: newMeta });
      setMenu(null);
    },
    [data, columnAlignments, columnWidths, cellMeta, activeColorTemplate, dispatchUpdate, dispatchMetaUpdate],
  );

  // ---- Row operations ----

  const insertRow = useCallback(
    (rowIdx: number, direction: "above" | "below") => {
      const insertAt = direction === "above" ? rowIdx : rowIdx + 1;
      const cols = data[0]?.length ?? 3;
      const newRow = Array(cols).fill("");
      const newData = [...data];
      newData.splice(insertAt, 0, newRow);
      // Reapply color template or shift meta
      const newMeta = activeColorTemplate
        ? reapplyColorTemplate(activeColorTemplate, newData.length, newData[0].length)
        : shiftCellMetaForInsertRow(cellMeta, insertAt, data[0]?.length ?? 0);
      setCellMeta(newMeta);
      dispatchUpdate(newData);
      if (activeColorTemplate) dispatchMetaUpdate({ cellMeta: newMeta });
      setMenu(null);
    },
    [data, cellMeta, activeColorTemplate, dispatchUpdate, dispatchMetaUpdate],
  );

  const deleteRow = useCallback(
    (rowIdx: number) => {
      if (data.length <= 1) return;
      const newData = [...data];
      newData.splice(rowIdx, 1);
      const newMeta = activeColorTemplate
        ? reapplyColorTemplate(activeColorTemplate, newData.length, newData[0]?.length ?? 0)
        : shiftCellMetaForDeleteRow(cellMeta, rowIdx, data[0]?.length ?? 0, data.length);
      setCellMeta(newMeta);
      dispatchUpdate(newData);
      if (activeColorTemplate) dispatchMetaUpdate({ cellMeta: newMeta });
      setMenu(null);
    },
    [data, cellMeta, activeColorTemplate, dispatchUpdate, dispatchMetaUpdate],
  );

  // Move column
  const moveColumn = useCallback(
    (colIdx: number, targetIdx: number) => {
      if (targetIdx < 0 || targetIdx >= (data[0]?.length ?? 0)) return;
      const newData = data.map((row) => {
        const r = [...row];
        const [removed] = r.splice(colIdx, 1);
        r.splice(targetIdx, 0, removed);
        return r;
      });
      const newAligns = [...columnAlignments];
      const [removedAlign] = newAligns.splice(colIdx, 1);
      newAligns.splice(targetIdx, 0, removedAlign ?? "left");
      setColumnAlignments(newAligns);
      const newWidths = [...columnWidths];
      const [removedWidth] = newWidths.splice(colIdx, 1);
      newWidths.splice(targetIdx, 0, removedWidth ?? 0);
      setColumnWidths(newWidths);
      dispatchUpdate(newData);
      setMenu(null);
    },
    [data, columnAlignments, columnWidths, dispatchUpdate],
  );

  // Move row
  const moveRow = useCallback(
    (rowIdx: number, targetIdx: number) => {
      if (targetIdx < 0 || targetIdx >= data.length) return;
      const newData = data.map((r) => [...r]);
      const [removed] = newData.splice(rowIdx, 1);
      newData.splice(targetIdx, 0, removed);
      dispatchUpdate(newData);
      setMenu(null);
    },
    [data, dispatchUpdate],
  );

  // Sort column
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

  // Clear column
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

  // Duplicate column
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

  // Duplicate row
  const duplicateRow = useCallback(
    (rowIdx: number) => {
      const newData = data.map((r) => [...r]);
      newData.splice(rowIdx + 1, 0, [...newData[rowIdx]]);
      dispatchUpdate(newData);
      setMenu(null);
    },
    [data, dispatchUpdate],
  );

  // Clear row
  const clearRow = useCallback(
    (rowIdx: number) => {
      const newData = data.map((r) => [...r]);
      newData[rowIdx] = newData[rowIdx].map(() => "");
      dispatchUpdate(newData);
      setMenu(null);
    },
    [data, dispatchUpdate],
  );

  const addRow = useCallback(() => {
    const cols = data[0]?.length ?? 3;
    const newRow = Array(cols).fill("");
    const newData = [...data, newRow];
    if (activeColorTemplate) {
      const newMeta = reapplyColorTemplate(activeColorTemplate, newData.length, cols);
      setCellMeta(newMeta);
      cellMetaRef.current = newMeta;
      dispatchUpdate(newData);
      dispatchMetaUpdate({ cellMeta: newMeta });
    } else {
      dispatchUpdate(newData);
    }
  }, [data, activeColorTemplate, dispatchUpdate, dispatchMetaUpdate]);

  const addColumn = useCallback(() => {
    const newData = data.map((row) => [...row, ""]);
    if (activeColorTemplate) {
      const newMeta = reapplyColorTemplate(activeColorTemplate, newData.length, newData[0].length);
      setCellMeta(newMeta);
      cellMetaRef.current = newMeta;
      dispatchUpdate(newData);
      dispatchMetaUpdate({ cellMeta: newMeta });
    } else {
      dispatchUpdate(newData);
    }
  }, [data, activeColorTemplate, dispatchUpdate, dispatchMetaUpdate]);

  // ---- Cell meta operations ----

  const setCellBgColor = useCallback(
    (row: number, col: number, color: string) => {
      const key = `${row}-${col}`;
      const newMeta = { ...cellMeta };
      if (!color) {
        if (newMeta[key]) {
          const { bgColor, ...rest } = newMeta[key];
          if (Object.keys(rest).length === 0) {
            delete newMeta[key];
          } else {
            newMeta[key] = rest;
          }
        }
      } else {
        newMeta[key] = { ...(newMeta[key] ?? {}), bgColor: color };
      }
      setCellMeta(newMeta);
      cellMetaRef.current = newMeta;
      // Manual color override clears active template so row/col additions preserve this change
      dispatchMetaUpdate({ cellMeta: newMeta, colorTemplate: "" });
    },
    [cellMeta, dispatchMetaUpdate],
  );

  const setCellAlignment = useCallback(
    (row: number, col: number, align: CellAlign) => {
      // For header row, set column-level alignment
      if (hasHeader && row === 0) {
        const newAligns = [...columnAlignments];
        while (newAligns.length <= col) newAligns.push("left");
        newAligns[col] = align;
        setColumnAlignments(newAligns);
        dispatchMetaUpdate({ columnAlignments: newAligns });
      }
      const key = `${row}-${col}`;
      const newMeta = { ...cellMeta };
      newMeta[key] = { ...(newMeta[key] ?? {}), align };
      setCellMeta(newMeta);
      cellMetaRef.current = newMeta;
      dispatchMetaUpdate({ cellMeta: newMeta });
    },
    [cellMeta, columnAlignments, hasHeader, dispatchMetaUpdate],
  );

  const setColumnBgColor = useCallback(
    (colIdx: number, color: string) => {
      const newMeta = { ...cellMeta };
      for (let r = 0; r < data.length; r++) {
        const key = `${r}-${colIdx}`;
        if (!color) {
          if (newMeta[key]) {
            const { bgColor, ...rest } = newMeta[key];
            if (Object.keys(rest).length === 0) delete newMeta[key];
            else newMeta[key] = rest;
          }
        } else {
          newMeta[key] = { ...(newMeta[key] ?? {}), bgColor: color };
        }
      }
      setCellMeta(newMeta);
      cellMetaRef.current = newMeta;
      dispatchMetaUpdate({ cellMeta: newMeta, colorTemplate: "" });
      setMenu(null);
    },
    [cellMeta, data, dispatchMetaUpdate],
  );

  const setColumnAlignment = useCallback(
    (colIdx: number, align: CellAlign) => {
      const newAligns = [...columnAlignments];
      while (newAligns.length <= colIdx) newAligns.push("left");
      newAligns[colIdx] = align;
      setColumnAlignments(newAligns);
      dispatchMetaUpdate({ columnAlignments: newAligns });
      setMenu(null);
    },
    [columnAlignments, dispatchMetaUpdate],
  );

  const setRowBgColor = useCallback(
    (rowIdx: number, color: string) => {
      const newMeta = { ...cellMeta };
      const cols = data[0]?.length ?? 0;
      for (let c = 0; c < cols; c++) {
        const key = `${rowIdx}-${c}`;
        if (!color) {
          if (newMeta[key]) {
            const { bgColor, ...rest } = newMeta[key];
            if (Object.keys(rest).length === 0) delete newMeta[key];
            else newMeta[key] = rest;
          }
        } else {
          newMeta[key] = { ...(newMeta[key] ?? {}), bgColor: color };
        }
      }
      setCellMeta(newMeta);
      cellMetaRef.current = newMeta;
      dispatchMetaUpdate({ cellMeta: newMeta, colorTemplate: "" });
      setMenu(null);
    },
    [cellMeta, data, dispatchMetaUpdate],
  );

  // ---- Apply template ----

  const applyTemplate = useCallback(
    (template: TableTemplate) => {
      dispatchUpdate(template.data.map((r) => [...r]));
      if (template.columnAlignments) setColumnAlignments([...template.columnAlignments]);
      if (template.cellMeta) {
        setCellMeta({ ...template.cellMeta });
        cellMetaRef.current = { ...template.cellMeta };
      }
      setShowTemplates(false);
    },
    [dispatchUpdate],
  );

  // ---- Merge cells ----

  /** Check if a cell is hidden by a merge (covered by another cell's span) */
  const isCellHiddenByMerge = useCallback(
    (row: number, col: number): boolean => {
      for (const [key, span] of Object.entries(merges)) {
        const [mr, mc] = key.split("-").map(Number);
        if (row >= mr && row < mr + span.rowSpan && col >= mc && col < mc + span.colSpan) {
          if (row !== mr || col !== mc) return true; // hidden (not the anchor)
        }
      }
      return false;
    },
    [merges],
  );

  /** Get the merge span for a cell (if it's the anchor of a merge) */
  const getMergeSpan = useCallback(
    (row: number, col: number): MergeSpan | undefined => {
      return merges[`${row}-${col}`];
    },
    [merges],
  );

  /** Merge selected cells into one */
  const mergeCells = useCallback(() => {
    if (selectedCells.length < 2) return;
    const minRow = Math.min(...selectedCells.map((c) => c.row));
    const maxRow = Math.max(...selectedCells.map((c) => c.row));
    const minCol = Math.min(...selectedCells.map((c) => c.col));
    const maxCol = Math.max(...selectedCells.map((c) => c.col));
    const rowSpan = maxRow - minRow + 1;
    const colSpan = maxCol - minCol + 1;
    const newMerges = { ...merges };
    newMerges[`${minRow}-${minCol}`] = { rowSpan, colSpan };
    setMerges(newMerges);
    setSelectedCells([]);
    dispatchMetaUpdate({ merges: newMerges });
  }, [selectedCells, merges, dispatchMetaUpdate]);

  /** Unmerge a cell */
  const unmergeCells = useCallback(
    (row: number, col: number) => {
      const key = `${row}-${col}`;
      if (!merges[key]) return;
      const newMerges = { ...merges };
      delete newMerges[key];
      setMerges(newMerges);
      dispatchMetaUpdate({ merges: newMerges });
    },
    [merges, dispatchMetaUpdate],
  );

  // ---- Column drag-and-drop ----

  const handleColDragStart = useCallback(
    (e: React.DragEvent, colIdx: number) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", `col:${colIdx}`);
      setDragCol({ from: colIdx, over: null });
    },
    [],
  );

  const handleColDragOver = useCallback(
    (e: React.DragEvent, colIdx: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragCol((prev) => prev ? { ...prev, over: colIdx } : null);
    },
    [],
  );

  const handleColDrop = useCallback(
    (e: React.DragEvent, colIdx: number) => {
      e.preventDefault();
      if (dragCol && dragCol.from !== colIdx) {
        moveColumn(dragCol.from, colIdx);
      }
      setDragCol(null);
    },
    [dragCol, moveColumn],
  );

  const handleColDragEnd = useCallback(() => {
    setDragCol(null);
  }, []);

  // ---- Row drag-and-drop ----

  const handleRowDragStart = useCallback(
    (e: React.DragEvent, rowIdx: number) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", `row:${rowIdx}`);
      setDragRow({ from: rowIdx, over: null });
    },
    [],
  );

  const handleRowDragOver = useCallback(
    (e: React.DragEvent, rowIdx: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragRow((prev) => prev ? { ...prev, over: rowIdx } : null);
    },
    [],
  );

  const handleRowDrop = useCallback(
    (e: React.DragEvent, rowIdx: number) => {
      e.preventDefault();
      if (dragRow && dragRow.from !== rowIdx) {
        moveRow(dragRow.from, rowIdx);
      }
      setDragRow(null);
    },
    [dragRow, moveRow],
  );

  const handleRowDragEnd = useCallback(() => {
    setDragRow(null);
  }, []);

  // ---- Resize handlers ----

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, colIdx: number) => {
      e.preventDefault();
      e.stopPropagation();
      const table = tableElRef.current;
      if (!table) return;
      const cells = table.querySelector("tr")?.querySelectorAll("td, th");
      const currentWidth = cells?.[colIdx]
        ? (cells[colIdx] as HTMLElement).offsetWidth
        : 100;
      setResizing({ colIndex: colIdx, startX: e.clientX, startWidth: currentWidth });
    },
    [],
  );

  const numCols = data[0]?.length ?? 0;
  const numRows = data.length;

  // ---- Styles ----

  const dropdownStyles: React.CSSProperties = {
    position: "absolute",
    backgroundColor: "var(--bg-primary, white)",
    border: "1px solid var(--border-primary, #e5e5e5)",
    borderRadius: 8,
    boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
    padding: "4px 0",
    zIndex: 100,
    minWidth: 180,
    overflow: "visible",
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
    whiteSpace: "nowrap",
  };

  const menuItemDangerStyles: React.CSSProperties = {
    ...menuItemStyles,
    color: "var(--text-danger, #dc2626)",
  };

  const separatorStyle: React.CSSProperties = {
    height: 1,
    backgroundColor: "var(--border-primary, #e5e5e5)",
    margin: "4px 0",
  };

  const hoverBg = (e: React.MouseEvent) => {
    (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-hover, #f5f5f5)";
  };
  const unhoverBg = (e: React.MouseEvent) => {
    (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
  };

  // ---- Sub-menu state for column/row menus ----
  const [colMenuSub, setColMenuSub] = useState<"color" | "alignment" | null>(null);
  const [rowMenuSub, setRowMenuSub] = useState<"color" | null>(null);

  // Reset sub-menus when menu changes
  useEffect(() => {
    setColMenuSub(null);
    setRowMenuSub(null);
  }, [menu]);

  // ---- Template Picker (shown when table is empty) ----
  const isAllEmpty = data.every((row) => row.every((cell) => cell === ""));

  return (
    <div
      ref={tableRef}
      style={{ margin: "8px 0", position: "relative" }}
      contentEditable={false}
      data-table-block
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setActiveCell(null);
        }
      }}
    >
      {/* Template picker for empty tables */}
      {!readOnly && isAllEmpty && (
        <div style={{ position: "relative", marginBottom: 8 }}>
          <button
            type="button"
            onClick={() => setShowTemplates(!showTemplates)}
            style={{
              background: "none",
              border: "1px solid var(--border-primary, #e5e5e5)",
              borderRadius: 6,
              cursor: "pointer",
              padding: "4px 10px",
              fontSize: 12,
              color: "var(--text-muted, #999)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Palette size={12} /> Use a template
          </button>
          {showTemplates && (
            <div
              style={{
                ...dropdownStyles,
                position: "absolute",
                top: "100%",
                left: 0,
                marginTop: 4,
                minWidth: 280,
                maxWidth: 400,
                zIndex: 100,
              }}
            >
              {TABLE_TEMPLATES.map((t, idx) => (
                <button
                  key={idx}
                  type="button"
                  style={{ ...menuItemStyles, flexDirection: "column", alignItems: "flex-start", padding: "8px 12px" }}
                  onMouseEnter={hoverBg}
                  onMouseLeave={unhoverBg}
                  onClick={() => applyTemplate(t)}
                >
                  <span style={{ fontWeight: 500 }}>{t.name}</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted, #888)" }}>{t.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Merge toolbar — only shown when multiple cells are selected */}
      {!readOnly && selectedCells.length >= 2 && (
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 6,
            paddingLeft: 28,
            alignItems: "center",
          }}
        >
          <button
            type="button"
            onClick={mergeCells}
            title="Merge selected cells"
            style={{
              background: "none",
              border: "1px solid var(--border-primary, #e5e5e5)",
              borderRadius: 4,
              cursor: "pointer",
              padding: "3px 8px",
              fontSize: 12,
              color: "rgba(37, 99, 235, 0.8)",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontWeight: 500,
            }}
          >
            <Merge size={12} /> Merge {selectedCells.length} cells
          </button>
        </div>
      )}

      {/* Merge toolbar — only shown when multiple cells are selected */}
      {!readOnly && selectedCells.length >= 2 && (
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 6,
            paddingLeft: 28,
            alignItems: "center",
          }}
        >
          <button
            type="button"
            onClick={mergeCells}
            title="Merge selected cells"
            style={{
              background: "none",
              border: "1px solid var(--border-primary, #e5e5e5)",
              borderRadius: 4,
              cursor: "pointer",
              padding: "3px 8px",
              fontSize: 12,
              color: "rgba(37, 99, 235, 0.8)",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontWeight: 500,
            }}
          >
            <Merge size={12} /> Merge {selectedCells.length} cells
          </button>
        </div>
      )}

      {/* Main layout */}
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <div style={{ flex: compact ? "none" : 1, overflow: "visible" }}>
          {/* Column header buttons — positioned to align with actual table columns */}
          {!readOnly && (
            <div
              style={{
                display: "flex",
                paddingLeft: 28,
                height: 24,
                alignItems: "center",
              }}
            >
              {data[0]?.map((_col, ci) => {
                const width = measuredColWidths[ci];
                const isColDragOver = dragCol?.over === ci && dragCol?.from !== ci;
                return (
                  <div
                    key={ci}
                    style={{
                      width: width || undefined,
                      minWidth: width ? undefined : 80,
                      flex: width ? "none" : 1,
                      display: "flex",
                      justifyContent: "center",
                      position: "relative",
                      borderBottom: isColDragOver ? "2px solid rgba(37, 99, 235, 0.5)" : undefined,
                    }}
                    onDragOver={(e) => handleColDragOver(e, ci)}
                    onDrop={(e) => handleColDrop(e, ci)}
                  >
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => handleColDragStart(e, ci)}
                      onDragEnd={handleColDragEnd}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenu(
                          menu?.type === "col" && menu.index === ci
                            ? null
                            : { type: "col", index: ci },
                        );
                      }}
                      aria-label="Column options"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "grab",
                        padding: "2px 6px",
                        borderRadius: 4,
                        color: "var(--text-muted, #999)",
                        fontSize: 14,
                        lineHeight: 1,
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                        opacity:
                          activeCell?.col === ci ||
                          hoveredCol === ci ||
                          (menu?.type === "col" && menu.index === ci) ||
                          dragCol?.from === ci
                            ? 1
                            : 0,
                        transition: "opacity 150ms",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.opacity = "1";
                        (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-hover, #f0f0f0)";
                        setHoveredCol(ci);
                      }}
                      onMouseLeave={(e) => {
                        if (
                          activeCell?.col !== ci &&
                          !(menu?.type === "col" && menu.index === ci)
                        ) {
                          (e.currentTarget as HTMLElement).style.opacity = "0";
                        }
                        (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                        setHoveredCol(null);
                      }}
                      title="Drag to reorder or click for options"
                    >
                      <GripHorizontal size={14} />
                    </button>

                    {/* Column dropdown menu */}
                    {menu?.type === "col" && menu.index === ci && (
                      <div
                        ref={menuRef}
                        style={{
                          ...dropdownStyles,
                          top: "100%",
                          left: "50%",
                          transform: "translateX(-50%)",
                        }}
                      >
                        {/* Move */}
                        <button
                          type="button"
                          style={{ ...menuItemStyles, ...(ci === 0 ? { opacity: 0.4, cursor: "default" } : {}) }}
                          onMouseEnter={ci > 0 ? hoverBg : undefined}
                          onMouseLeave={unhoverBg}
                          onMouseDown={(e) => { e.preventDefault(); if (ci > 0) moveColumn(ci, ci - 1); }}
                        >
                          <ArrowLeft size={14} /> Move left
                        </button>
                        <button
                          type="button"
                          style={{ ...menuItemStyles, ...(ci === numCols - 1 ? { opacity: 0.4, cursor: "default" } : {}) }}
                          onMouseEnter={ci < numCols - 1 ? hoverBg : undefined}
                          onMouseLeave={unhoverBg}
                          onMouseDown={(e) => { e.preventDefault(); if (ci < numCols - 1) moveColumn(ci, ci + 1); }}
                        >
                          <ArrowRight size={14} /> Move right
                        </button>
                        <div style={separatorStyle} />

                        {/* Insert */}
                        <button type="button" style={menuItemStyles} onMouseEnter={hoverBg} onMouseLeave={unhoverBg}
                          onMouseDown={(e) => { e.preventDefault(); insertColumn(ci, "left"); }}
                        >
                          <Plus size={14} /> Insert column left
                        </button>
                        <button type="button" style={menuItemStyles} onMouseEnter={hoverBg} onMouseLeave={unhoverBg}
                          onMouseDown={(e) => { e.preventDefault(); insertColumn(ci, "right"); }}
                        >
                          <Plus size={14} /> Insert column right
                        </button>
                        <div style={separatorStyle} />

                        {/* Color sub-menu */}
                        <div style={{ position: "relative" }}>
                          <button
                            type="button"
                            style={{ ...menuItemStyles, justifyContent: "space-between" }}
                            onMouseEnter={(e) => { hoverBg(e); setColMenuSub("color"); }}
                            onMouseLeave={unhoverBg}
                          >
                            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <Paintbrush size={14} /> Color
                            </span>
                            <ChevronRight size={14} />
                          </button>
                          {colMenuSub === "color" && (
                            <div
                              style={{
                                ...dropdownStyles,
                                position: "absolute",
                                top: 0,
                                left: "100%",
                                marginLeft: 2,
                              }}
                              onMouseEnter={() => setColMenuSub("color")}
                              onMouseLeave={() => setColMenuSub(null)}
                            >
                              <ColorPicker
                                currentColor={cellMeta[`0-${ci}`]?.bgColor}
                                onSelect={(color) => setColumnBgColor(ci, color)}
                              />
                            </div>
                          )}
                        </div>

                        {/* Alignment sub-menu */}
                        <div style={{ position: "relative" }}>
                          <button
                            type="button"
                            style={{ ...menuItemStyles, justifyContent: "space-between" }}
                            onMouseEnter={(e) => { hoverBg(e); setColMenuSub("alignment"); }}
                            onMouseLeave={unhoverBg}
                          >
                            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <AlignLeft size={14} /> Alignment
                            </span>
                            <ChevronRight size={14} />
                          </button>
                          {colMenuSub === "alignment" && (
                            <div
                              style={{
                                ...dropdownStyles,
                                position: "absolute",
                                top: 0,
                                left: "100%",
                                marginLeft: 2,
                                minWidth: 140,
                              }}
                              onMouseEnter={() => setColMenuSub("alignment")}
                              onMouseLeave={() => setColMenuSub(null)}
                            >
                              <button type="button" style={menuItemStyles} onMouseEnter={hoverBg} onMouseLeave={unhoverBg}
                                onClick={() => setColumnAlignment(ci, "left")}
                              >
                                <AlignLeft size={14} /> Left
                                {(columnAlignments[ci] ?? "left") === "left" && <span style={{ marginLeft: "auto", color: "rgba(37,99,235,0.8)" }}>✓</span>}
                              </button>
                              <button type="button" style={menuItemStyles} onMouseEnter={hoverBg} onMouseLeave={unhoverBg}
                                onClick={() => setColumnAlignment(ci, "center")}
                              >
                                <AlignCenter size={14} /> Center
                                {columnAlignments[ci] === "center" && <span style={{ marginLeft: "auto", color: "rgba(37,99,235,0.8)" }}>✓</span>}
                              </button>
                              <button type="button" style={menuItemStyles} onMouseEnter={hoverBg} onMouseLeave={unhoverBg}
                                onClick={() => setColumnAlignment(ci, "right")}
                              >
                                <AlignRight size={14} /> Right
                                {columnAlignments[ci] === "right" && <span style={{ marginLeft: "auto", color: "rgba(37,99,235,0.8)" }}>✓</span>}
                              </button>
                            </div>
                          )}
                        </div>
                        <div style={separatorStyle} />

                        {/* Sort */}
                        <button type="button" style={menuItemStyles} onMouseEnter={hoverBg} onMouseLeave={unhoverBg}
                          onMouseDown={(e) => { e.preventDefault(); sortByColumn(ci, "asc"); }}
                        >
                          <ArrowDownAZ size={14} /> Sort A → Z
                        </button>
                        <button type="button" style={menuItemStyles} onMouseEnter={hoverBg} onMouseLeave={unhoverBg}
                          onMouseDown={(e) => { e.preventDefault(); sortByColumn(ci, "desc"); }}
                        >
                          <ArrowUpAZ size={14} /> Sort Z → A
                        </button>
                        <div style={separatorStyle} />

                        {/* Other operations */}
                        <button type="button" style={menuItemStyles} onMouseEnter={hoverBg} onMouseLeave={unhoverBg}
                          onMouseDown={(e) => { e.preventDefault(); clearColumn(ci); }}
                        >
                          <XSquare size={14} /> Clear contents
                        </button>
                        <button type="button" style={menuItemStyles} onMouseEnter={hoverBg} onMouseLeave={unhoverBg}
                          onMouseDown={(e) => { e.preventDefault(); duplicateColumn(ci); }}
                        >
                          <Copy size={14} /> Duplicate
                        </button>
                        {numCols > 1 && (
                          <>
                            <div style={separatorStyle} />
                            <button type="button" style={menuItemDangerStyles} onMouseEnter={hoverBg} onMouseLeave={unhoverBg}
                              onMouseDown={(e) => { e.preventDefault(); deleteColumn(ci); }}
                            >
                              <Trash2 size={14} /> Delete column
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Table with row handles */}
          <div style={{ display: "flex" }}>
            {/* Row handle column */}
            {!readOnly && (
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "stretch" }}>
                {data.map((_row, ri) => {
                  const isRowDragOver = dragRow?.over === ri && dragRow?.from !== ri;
                  return (
                    <div
                      key={ri}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 28,
                        flex: 1,
                        position: "relative",
                        borderTop: isRowDragOver ? "2px solid rgba(37, 99, 235, 0.5)" : undefined,
                      }}
                      onDragOver={(e) => handleRowDragOver(e, ri)}
                      onDrop={(e) => handleRowDrop(e, ri)}
                    >
                      <button
                        type="button"
                        draggable
                        onDragStart={(e) => handleRowDragStart(e, ri)}
                        onDragEnd={handleRowDragEnd}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenu(
                            menu?.type === "row" && menu.index === ri
                              ? null
                              : { type: "row", index: ri },
                          );
                        }}
                        aria-label="Row options"
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "grab",
                          padding: "2px 4px",
                          borderRadius: 4,
                          color: "var(--text-muted, #999)",
                          fontSize: 14,
                          lineHeight: 1,
                          display: "flex",
                          alignItems: "center",
                          opacity:
                            activeCell?.row === ri ||
                            hoveredRow === ri ||
                            (menu?.type === "row" && menu.index === ri) ||
                            dragRow?.from === ri
                              ? 1
                              : 0,
                          transition: "opacity 150ms",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.opacity = "1";
                          (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-hover, #f0f0f0)";
                        }}
                        onMouseLeave={(e) => {
                          if (
                            activeCell?.row !== ri &&
                            hoveredRow !== ri &&
                            !(menu?.type === "row" && menu.index === ri)
                          ) {
                            (e.currentTarget as HTMLElement).style.opacity = "0";
                          }
                          (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                        }}
                        title="Drag to reorder or click for options"
                      >
                        <GripVertical size={14} />
                      </button>

                      {/* Row dropdown menu */}
                      {menu?.type === "row" && menu.index === ri && (
                        <div
                          ref={menuRef}
                          style={{
                            ...dropdownStyles,
                            top: "50%",
                            left: "100%",
                            transform: "translateY(-50%)",
                          }}
                        >
                          <button type="button" style={menuItemStyles} onMouseEnter={hoverBg} onMouseLeave={unhoverBg}
                            onClick={() => insertRow(ri, "above")}
                          >
                            <Plus size={14} /> Insert row above
                          </button>
                          <button type="button" style={menuItemStyles} onMouseEnter={hoverBg} onMouseLeave={unhoverBg}
                            onClick={() => insertRow(ri, "below")}
                          >
                            <Plus size={14} /> Insert row below
                          </button>
                          <div style={separatorStyle} />

                          {/* Row color */}
                          <div style={{ position: "relative" }}>
                            <button
                              type="button"
                              style={{ ...menuItemStyles, justifyContent: "space-between" }}
                              onMouseEnter={(e) => { hoverBg(e); setRowMenuSub("color"); }}
                              onMouseLeave={unhoverBg}
                            >
                              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <Paintbrush size={14} /> Color
                              </span>
                              <ChevronRight size={14} />
                            </button>
                            {rowMenuSub === "color" && (
                              <div
                                style={{
                                  ...dropdownStyles,
                                  position: "absolute",
                                  top: 0,
                                  left: "100%",
                                  marginLeft: 2,
                                }}
                                onMouseEnter={() => setRowMenuSub("color")}
                                onMouseLeave={() => setRowMenuSub(null)}
                              >
                                <ColorPicker
                                  currentColor={cellMeta[`${ri}-0`]?.bgColor}
                                  onSelect={(color) => setRowBgColor(ri, color)}
                                />
                              </div>
                            )}
                          </div>
                          <div style={separatorStyle} />

                          <button type="button" style={menuItemStyles} onMouseEnter={hoverBg} onMouseLeave={unhoverBg}
                            onClick={() => clearRow(ri)}
                          >
                            <XSquare size={14} /> Clear contents
                          </button>
                          <button type="button" style={menuItemStyles} onMouseEnter={hoverBg} onMouseLeave={unhoverBg}
                            onClick={() => duplicateRow(ri)}
                          >
                            <Copy size={14} /> Duplicate
                          </button>
                          {numRows > 1 && (
                            <>
                              <div style={separatorStyle} />
                              <button type="button" style={menuItemDangerStyles} onMouseEnter={hoverBg} onMouseLeave={unhoverBg}
                                onClick={() => deleteRow(ri)}
                              >
                                <Trash2 size={14} /> Delete row
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* The actual table */}
            <table
              ref={tableElRef}
              style={{
                borderCollapse: "collapse",
                border: showBorders ? "1px solid var(--border-primary, #e5e5e5)" : "1px solid transparent",
                width: compact ? "auto" : "100%",
                tableLayout: columnWidths.some((w) => w > 0) ? "fixed" : "auto",
              }}
            >
              {columnWidths.some((w) => w > 0) && (
                <colgroup>
                  {data[0]?.map((_c, ci) => (
                    <col key={ci} style={{ width: columnWidths[ci] || undefined }} />
                  ))}
                </colgroup>
              )}
              <tbody>
                {data.map((row, ri) => {
                  const isHeaderRow = hasHeader && ri === 0;
                  const isRowDragTarget = dragRow?.over === ri && dragRow?.from !== ri;
                  return (
                    <tr
                      key={ri}
                      onMouseEnter={() => setHoveredRow(ri)}
                      onMouseLeave={() => setHoveredRow(null)}
                      style={{
                        backgroundColor: isHeaderRow
                          ? "var(--bg-secondary, #f5f5f5)"
                          : hoveredRow === ri
                            ? "var(--bg-hover, #f8f8f8)"
                            : "transparent",
                        transition: "background-color 100ms",
                        outline: isRowDragTarget ? "2px solid rgba(37, 99, 235, 0.3)" : undefined,
                      }}
                    >
                      {row.map((cell, ci) => {
                        // Skip cells hidden by a merge
                        if (isCellHiddenByMerge(ri, ci)) return null;

                        const cellKey = `${ri}-${ci}`;
                        const meta = cellMeta[cellKey];
                        const colAlign = columnAlignments[ci] ?? "left";
                        const cellAlign = meta?.align ?? colAlign;
                        const cellBg = meta?.bgColor;
                        const isActive = activeCell?.row === ri && activeCell?.col === ci;
                        const inActiveRowOrCol =
                          activeCell && (activeCell.row === ri || activeCell.col === ci);
                        const isSelected = selectedCells.some((s) => s.row === ri && s.col === ci);
                        const merge = getMergeSpan(ri, ci);

                        return (
                          <td
                            key={ci}
                            rowSpan={merge?.rowSpan}
                            colSpan={merge?.colSpan}
                            onClick={(e) => {
                              if (e.shiftKey && !readOnly) {
                                // Multi-select for merging
                                e.preventDefault();
                                setSelectedCells((prev) => {
                                  const exists = prev.some((s) => s.row === ri && s.col === ci);
                                  if (exists) return prev.filter((s) => !(s.row === ri && s.col === ci));
                                  return [...prev, { row: ri, col: ci }];
                                });
                                return;
                              }
                              setSelectedCells([]);
                              const cellDiv = (e.currentTarget as HTMLElement).querySelector(
                                "[contenteditable]",
                              ) as HTMLElement;
                              if (cellDiv && e.target === e.currentTarget) {
                                cellDiv.focus();
                                setActiveCell({ row: ri, col: ci });
                              }
                            }}
                            style={{
                              border: (showBorders && !meta?.borderless)
                                ? "1px solid var(--border-primary, #e5e5e5)"
                                : "1px solid transparent",
                              padding: 0,
                              minWidth: 60,
                              verticalAlign: "top",
                              position: "relative",
                              backgroundColor: isSelected
                                ? "rgba(37, 99, 235, 0.12)"
                                : cellBg
                                  ? cellBg
                                  : inActiveRowOrCol
                                    ? "rgba(37, 99, 235, 0.06)"
                                    : undefined,
                              outline: isActive
                                ? "2px solid rgba(37, 99, 235, 0.4)"
                                : isSelected
                                  ? "1px dashed rgba(37, 99, 235, 0.4)"
                                  : undefined,
                              outlineOffset: -2,
                            }}
                          >
                            <TableCell
                              key={`${ri}-${ci}`}
                              value={cell}
                              isHeader={isHeaderRow}
                              readOnly={readOnly}
                              align={cellAlign}
                              onCommit={(text) => handleCellInput(ri, ci, text)}
                              onFocusCell={() => setActiveCell({ row: ri, col: ci })}
                              onTab={(forward) => {
                                const numCols2 = data[0]?.length ?? 0;
                                let nextRow = ri;
                                let nextCol = forward ? ci + 1 : ci - 1;
                                if (nextCol >= numCols2) {
                                  nextRow++;
                                  nextCol = 0;
                                }
                                if (nextCol < 0) {
                                  nextRow--;
                                  nextCol = numCols2 - 1;
                                }
                                if (nextRow >= 0 && nextRow < data.length) {
                                  setActiveCell({ row: nextRow, col: nextCol });
                                  setTimeout(() => {
                                    const cells = tableElRef.current?.querySelectorAll("td");
                                    const targetIdx = nextRow * numCols2 + nextCol;
                                    const targetTd = cells?.[targetIdx];
                                    const cellDiv = targetTd?.querySelector(
                                      "[contenteditable]",
                                    ) as HTMLElement;
                                    cellDiv?.focus();
                                  }, 0);
                                }
                              }}
                              onContextMenu={(e) => {
                                if (readOnly) return;
                                e.preventDefault();
                                e.stopPropagation();
                                const rect = tableRef.current?.getBoundingClientRect();
                                setCellMenu({
                                  row: ri,
                                  col: ci,
                                  x: e.clientX - (rect?.left ?? 0),
                                  y: e.clientY - (rect?.top ?? 0),
                                });
                              }}
                            />

                            {/* Resize handle on right edge of each cell in the header row */}
                            {!readOnly && isHeaderRow && (
                              <div
                                onMouseDown={(e) => handleResizeStart(e, ci)}
                                style={{
                                  position: "absolute",
                                  top: 0,
                                  right: -2,
                                  width: 4,
                                  height: "100%",
                                  cursor: "col-resize",
                                  zIndex: 10,
                                  backgroundColor: resizing?.colIndex === ci ? "rgba(37, 99, 235, 0.3)" : "transparent",
                                }}
                                onMouseEnter={(e) => {
                                  if (!resizing) (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(37, 99, 235, 0.2)";
                                }}
                                onMouseLeave={(e) => {
                                  if (!resizing) (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                                }}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Add column button */}
            {!readOnly && (
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
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.opacity = "1";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.opacity = "0.5";
                  }}
                >
                  <Plus size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Add row button */}
          {!readOnly && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                paddingLeft: 28,
                marginTop: 4,
              }}
            >
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
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.opacity = "1";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.opacity = "0.5";
                }}
              >
                <Plus size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Cell context menu (right-click on any cell) */}
      {cellMenu && (
        <div
          ref={cellMenuRef}
          style={{
            ...dropdownStyles,
            position: "absolute",
            top: cellMenu.y,
            left: cellMenu.x,
          }}
        >
          {/* Color sub-menu */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              style={{ ...menuItemStyles, justifyContent: "space-between" }}
              onMouseEnter={(e) => {
                hoverBg(e);
                setCellMenu((prev) => prev ? { ...prev, subMenu: "color" } : null);
              }}
              onMouseLeave={unhoverBg}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Paintbrush size={14} /> Background color
              </span>
              <ChevronRight size={14} />
            </button>
            {cellMenu.subMenu === "color" && (
              <div
                style={{
                  ...dropdownStyles,
                  position: "absolute",
                  top: 0,
                  left: "100%",
                  marginLeft: 2,
                }}
                onMouseEnter={() =>
                  setCellMenu((prev) => prev ? { ...prev, subMenu: "color" } : null)
                }
                onMouseLeave={() =>
                  setCellMenu((prev) => prev ? { ...prev, subMenu: undefined } : null)
                }
              >
                <ColorPicker
                  currentColor={cellMeta[`${cellMenu.row}-${cellMenu.col}`]?.bgColor}
                  onSelect={(color) => {
                    setCellBgColor(cellMenu.row, cellMenu.col, color);
                    setCellMenu(null);
                  }}
                />
              </div>
            )}
          </div>

          {/* Alignment sub-menu */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              style={{ ...menuItemStyles, justifyContent: "space-between" }}
              onMouseEnter={(e) => {
                hoverBg(e);
                setCellMenu((prev) => prev ? { ...prev, subMenu: "alignment" } : null);
              }}
              onMouseLeave={unhoverBg}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <AlignLeft size={14} /> Alignment
              </span>
              <ChevronRight size={14} />
            </button>
            {cellMenu.subMenu === "alignment" && (
              <div
                style={{
                  ...dropdownStyles,
                  position: "absolute",
                  top: 0,
                  left: "100%",
                  marginLeft: 2,
                  minWidth: 140,
                }}
                onMouseEnter={() =>
                  setCellMenu((prev) => prev ? { ...prev, subMenu: "alignment" } : null)
                }
                onMouseLeave={() =>
                  setCellMenu((prev) => prev ? { ...prev, subMenu: undefined } : null)
                }
              >
                {(["left", "center", "right"] as CellAlign[]).map((align) => {
                  const Icon = align === "left" ? AlignLeft : align === "center" ? AlignCenter : AlignRight;
                  const currentAlign = cellMeta[`${cellMenu.row}-${cellMenu.col}`]?.align ?? columnAlignments[cellMenu.col] ?? "left";
                  return (
                    <button
                      key={align}
                      type="button"
                      style={menuItemStyles}
                      onMouseEnter={hoverBg}
                      onMouseLeave={unhoverBg}
                      onClick={() => {
                        setCellAlignment(cellMenu.row, cellMenu.col, align);
                        setCellMenu(null);
                      }}
                    >
                      <Icon size={14} /> {align.charAt(0).toUpperCase() + align.slice(1)}
                      {currentAlign === align && (
                        <span style={{ marginLeft: "auto", color: "rgba(37,99,235,0.8)" }}>✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div style={separatorStyle} />

          {/* Merge / Unmerge */}
          {merges[`${cellMenu.row}-${cellMenu.col}`] ? (
            <button
              type="button"
              style={menuItemStyles}
              onMouseEnter={hoverBg}
              onMouseLeave={unhoverBg}
              onClick={() => {
                unmergeCells(cellMenu.row, cellMenu.col);
                setCellMenu(null);
              }}
            >
              <SplitSquareHorizontal size={14} /> Unmerge cells
            </button>
          ) : selectedCells.length >= 2 ? (
            <button
              type="button"
              style={menuItemStyles}
              onMouseEnter={hoverBg}
              onMouseLeave={unhoverBg}
              onClick={() => {
                mergeCells();
                setCellMenu(null);
              }}
            >
              <Merge size={14} /> Merge selected cells
            </button>
          ) : null}

          {/* Toggle border for this cell */}
          <button
            type="button"
            style={menuItemStyles}
            onMouseEnter={hoverBg}
            onMouseLeave={unhoverBg}
            onClick={() => {
              const key = `${cellMenu.row}-${cellMenu.col}`;
              const current = cellMeta[key]?.borderless;
              const newMeta = { ...cellMeta };
              newMeta[key] = { ...(newMeta[key] ?? {}), borderless: !current };
              setCellMeta(newMeta);
              cellMetaRef.current = newMeta;
              dispatchMetaUpdate({ cellMeta: newMeta });
              setCellMenu(null);
            }}
          >
            <SquareDashedBottom size={14} /> {cellMeta[`${cellMenu.row}-${cellMenu.col}`]?.borderless ? "Show border" : "Hide border"}
          </button>
          <div style={separatorStyle} />

          {/* Quick clear cell */}
          <button
            type="button"
            style={menuItemStyles}
            onMouseEnter={hoverBg}
            onMouseLeave={unhoverBg}
            onClick={() => {
              handleCellInput(cellMenu.row, cellMenu.col, "");
              const cells = tableElRef.current?.querySelectorAll("td");
              const idx = cellMenu.row * numCols + cellMenu.col;
              const cellDiv = cells?.[idx]?.querySelector("[contenteditable]") as HTMLElement;
              if (cellDiv) cellDiv.textContent = "";
              setCellMenu(null);
            }}
          >
            <XSquare size={14} /> Clear cell
          </button>
        </div>
      )}
    </div>
  );
}

// ---- Cell Meta Helpers ----
// These functions shift cell metadata keys when columns/rows are inserted or deleted.

function shiftCellMetaForInsertCol(
  meta: CellMetaMap,
  insertAt: number,
  numRows: number,
): CellMetaMap {
  const newMeta: CellMetaMap = {};
  for (const [key, val] of Object.entries(meta)) {
    const [r, c] = key.split("-").map(Number);
    const newCol = c >= insertAt ? c + 1 : c;
    newMeta[`${r}-${newCol}`] = val;
  }
  return newMeta;
}

function shiftCellMetaForDeleteCol(
  meta: CellMetaMap,
  deletedCol: number,
  numRows: number,
  numCols: number,
): CellMetaMap {
  const newMeta: CellMetaMap = {};
  for (const [key, val] of Object.entries(meta)) {
    const [r, c] = key.split("-").map(Number);
    if (c === deletedCol) continue;
    const newCol = c > deletedCol ? c - 1 : c;
    newMeta[`${r}-${newCol}`] = val;
  }
  return newMeta;
}

function shiftCellMetaForInsertRow(
  meta: CellMetaMap,
  insertAt: number,
  numCols: number,
): CellMetaMap {
  const newMeta: CellMetaMap = {};
  for (const [key, val] of Object.entries(meta)) {
    const [r, c] = key.split("-").map(Number);
    const newRow = r >= insertAt ? r + 1 : r;
    newMeta[`${newRow}-${c}`] = val;
  }
  return newMeta;
}

function shiftCellMetaForDeleteRow(
  meta: CellMetaMap,
  deletedRow: number,
  numCols: number,
  numRows: number,
): CellMetaMap {
  const newMeta: CellMetaMap = {};
  for (const [key, val] of Object.entries(meta)) {
    const [r, c] = key.split("-").map(Number);
    if (r === deletedRow) continue;
    const newRow = r > deletedRow ? r - 1 : r;
    newMeta[`${newRow}-${c}`] = val;
  }
  return newMeta;
}

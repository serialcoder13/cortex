import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Code,
  Quote,
  Lightbulb,
  ChevronRight,
  Palette,
  SquareDashedBottom,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { BlockType } from "../core/types";
import { COLOR_TEMPLATES, type ColorTemplate } from "../blocks/TableBlock";

export interface TableMenuState {
  showBorders: boolean;
  compact: boolean;
}

export interface BlockMenuProps {
  position: { x: number; y: number };
  blockId: string;
  blockType: BlockType;
  onClose: () => void;
  onDelete: (blockId: string) => void;
  onDuplicate: (blockId: string) => void;
  onTurnInto: (blockId: string, newType: BlockType) => void;
  onMoveUp: (blockId: string) => void;
  onMoveDown: (blockId: string) => void;
  /** Table-specific state — only present when blockType === "table" */
  tableState?: TableMenuState;
  onToggleBorders?: (blockId: string) => void;
  onToggleCompact?: (blockId: string) => void;
  onApplyColorTemplate?: (blockId: string, template: ColorTemplate) => void;
}

interface TurnIntoOption {
  type: BlockType;
  label: string;
  icon: React.ReactNode;
}

const TURN_INTO_OPTIONS: TurnIntoOption[] = [
  { type: "paragraph", label: "Text", icon: <Type size={15} /> },
  { type: "heading1", label: "Heading 1", icon: <Heading1 size={15} /> },
  { type: "heading2", label: "Heading 2", icon: <Heading2 size={15} /> },
  { type: "heading3", label: "Heading 3", icon: <Heading3 size={15} /> },
  { type: "bulletList", label: "Bullet List", icon: <List size={15} /> },
  { type: "numberedList", label: "Numbered List", icon: <ListOrdered size={15} /> },
  { type: "todo", label: "To-do", icon: <CheckSquare size={15} /> },
  { type: "codeBlock", label: "Code", icon: <Code size={15} /> },
  { type: "quote", label: "Quote", icon: <Quote size={15} /> },
  { type: "callout", label: "Callout", icon: <Lightbulb size={15} /> },
];

const styles = {
  overlay: {
    position: "fixed" as const,
    inset: 0,
    zIndex: 999,
  },
  menu: {
    position: "fixed" as const,
    zIndex: 1000,
    width: 200,
    backgroundColor: "var(--block-menu-bg, #ffffff)",
    border: "1px solid var(--block-menu-border, #e2e2e2)",
    borderRadius: 8,
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)",
    padding: "4px 0",
    fontFamily: "var(--block-menu-font, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)",
    userSelect: "none" as const,
  },
  divider: {
    height: 1,
    backgroundColor: "var(--block-menu-divider, #ebebeb)",
    margin: "4px 0",
  },
  item: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "6px 12px",
    cursor: "pointer",
    fontSize: 13,
    color: "var(--block-menu-text, #37352f)",
    backgroundColor: "transparent",
    border: "none",
    width: "100%",
    textAlign: "left" as const,
    lineHeight: 1.4,
    borderRadius: 0,
    position: "relative" as const,
  },
  itemHover: {
    backgroundColor: "var(--block-menu-hover, #f1f1f0)",
  },
  itemDelete: {
    color: "var(--block-menu-danger, #eb5757)",
  },
  submenuTrigger: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },
  submenuTriggerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  submenu: {
    position: "absolute" as const,
    left: "calc(100% - 4px)",
    top: -4,
    zIndex: 1001,
    width: 180,
    backgroundColor: "var(--block-menu-bg, #ffffff)",
    border: "1px solid var(--block-menu-border, #e2e2e2)",
    borderRadius: 8,
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)",
    padding: "4px 0",
  },
  activeIndicator: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    backgroundColor: "var(--block-menu-active, #2383e2)",
    marginLeft: "auto",
    flexShrink: 0,
  },
};

// ---- Color Template Preview Swatch ----

function TemplatePreview({ template }: { template: ColorTemplate }) {
  const { header, evenRow, oddRow } = template.preview;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 28,
        height: 20,
        borderRadius: 3,
        overflow: "hidden",
        border: "1px solid var(--border-primary, #e5e5e5)",
        flexShrink: 0,
      }}
    >
      <div style={{ flex: 1, backgroundColor: header || "var(--bg-primary, #fff)" }} />
      <div style={{ flex: 1, backgroundColor: oddRow || "var(--bg-primary, #fff)" }} />
      <div style={{ flex: 1, backgroundColor: evenRow || "var(--bg-primary, #fff)" }} />
    </div>
  );
}

export function BlockMenu({
  position,
  blockId,
  blockType,
  onClose,
  onDelete,
  onDuplicate,
  onTurnInto,
  onMoveUp,
  onMoveDown,
  tableState,
  onToggleBorders,
  onToggleCompact,
  onApplyColorTemplate,
}: BlockMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [showTurnInto, setShowTurnInto] = useState(false);
  const [showColorTemplates, setShowColorTemplates] = useState(false);
  const [hoveredSubItem, setHoveredSubItem] = useState<string | null>(null);

  const isTable = blockType === "table";

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleOverlayMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    onClose();
  };

  const closeSubmenus = () => {
    setShowTurnInto(false);
    setShowColorTemplates(false);
  };

  const itemStyle = (id: string, extra?: React.CSSProperties): React.CSSProperties => ({
    ...styles.item,
    ...(hoveredItem === id ? styles.itemHover : {}),
    ...(extra || {}),
  });

  return (
    <>
      {/* Invisible overlay to catch outside clicks */}
      <div style={styles.overlay} onMouseDown={handleOverlayMouseDown} />

      <div
        ref={menuRef}
        style={{
          ...styles.menu,
          left: position.x,
          top: position.y,
        }}
      >
        {/* Section 1: Move */}
        <div
          style={itemStyle("move-up")}
          onMouseEnter={() => {
            setHoveredItem("move-up");
            closeSubmenus();
          }}
          onMouseLeave={() => setHoveredItem(null)}
          onMouseDown={(e) => {
            e.preventDefault();
            onMoveUp(blockId);
            onClose();
          }}
        >
          <ArrowUp size={15} />
          <span>Move up</span>
        </div>

        <div
          style={itemStyle("move-down")}
          onMouseEnter={() => {
            setHoveredItem("move-down");
            closeSubmenus();
          }}
          onMouseLeave={() => setHoveredItem(null)}
          onMouseDown={(e) => {
            e.preventDefault();
            onMoveDown(blockId);
            onClose();
          }}
        >
          <ArrowDown size={15} />
          <span>Move down</span>
        </div>

        <div style={styles.divider} />

        {/* Table-specific section */}
        {isTable && tableState && (
          <>
            {/* Toggle Borders */}
            <div
              style={itemStyle("toggle-borders")}
              onMouseEnter={() => {
                setHoveredItem("toggle-borders");
                closeSubmenus();
              }}
              onMouseLeave={() => setHoveredItem(null)}
              onMouseDown={(e) => {
                e.preventDefault();
                onToggleBorders?.(blockId);
                onClose();
              }}
            >
              <SquareDashedBottom size={15} />
              <span>{tableState.showBorders ? "Hide Borders" : "Show Borders"}</span>
              {!tableState.showBorders && <div style={styles.activeIndicator} />}
            </div>

            {/* Toggle Full Width / Compact */}
            <div
              style={itemStyle("toggle-compact")}
              onMouseEnter={() => {
                setHoveredItem("toggle-compact");
                closeSubmenus();
              }}
              onMouseLeave={() => setHoveredItem(null)}
              onMouseDown={(e) => {
                e.preventDefault();
                onToggleCompact?.(blockId);
                onClose();
              }}
            >
              {tableState.compact ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
              <span>{tableState.compact ? "Full Width" : "Compact"}</span>
            </div>

            {/* Color Template submenu */}
            <div
              style={{
                ...itemStyle("color-template"),
                position: "relative" as const,
                paddingRight: showColorTemplates ? 20 : 12,
              }}
              onMouseEnter={() => {
                setHoveredItem("color-template");
                setShowTurnInto(false);
                setShowColorTemplates(true);
              }}
              onMouseLeave={() => {
                setHoveredItem(null);
                setShowColorTemplates(false);
              }}
            >
              <div style={styles.submenuTrigger}>
                <div style={styles.submenuTriggerLeft}>
                  <Palette size={15} />
                  <span>Color Theme</span>
                </div>
                <ChevronRight size={14} />
              </div>

              {showColorTemplates && (
                <div style={{ ...styles.submenu, width: 210 }}>
                  {COLOR_TEMPLATES.map((tmpl) => (
                    <div
                      key={tmpl.name}
                      style={{
                        ...styles.item,
                        ...(hoveredSubItem === tmpl.name ? styles.itemHover : {}),
                        gap: 8,
                      }}
                      onMouseEnter={() => setHoveredSubItem(tmpl.name)}
                      onMouseLeave={() => setHoveredSubItem(null)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onApplyColorTemplate?.(blockId, tmpl);
                        onClose();
                      }}
                    >
                      <TemplatePreview template={tmpl} />
                      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{tmpl.name}</span>
                        <span style={{ fontSize: 11, color: "var(--text-muted, #888)" }}>{tmpl.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={styles.divider} />
          </>
        )}

        {/* Turn into (submenu) — hide for tables since they can't turn into other types */}
        {!isTable && (
          <>
            <div
              style={{
                ...itemStyle("turn-into"),
                position: "relative" as const,
                paddingRight: showTurnInto ? 20 : 12,
              }}
              onMouseEnter={() => {
                setHoveredItem("turn-into");
                setShowTurnInto(true);
                setShowColorTemplates(false);
              }}
              onMouseLeave={() => {
                setHoveredItem(null);
                setShowTurnInto(false);
              }}
            >
              <div style={styles.submenuTrigger}>
                <div style={styles.submenuTriggerLeft}>
                  <Palette size={15} />
                  <span>Turn into</span>
                </div>
                <ChevronRight size={14} />
              </div>

              {showTurnInto && (
                <div style={styles.submenu}>
                  {TURN_INTO_OPTIONS.map((option) => (
                    <div
                      key={option.type}
                      style={{
                        ...styles.item,
                        ...(hoveredSubItem === option.type ? styles.itemHover : {}),
                        ...(blockType === option.type ? { backgroundColor: "var(--block-menu-active-bg, #e8f0fe)" } : {}),
                      }}
                      onMouseEnter={() => setHoveredSubItem(option.type)}
                      onMouseLeave={() => setHoveredSubItem(null)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onTurnInto(blockId, option.type);
                        onClose();
                      }}
                    >
                      {option.icon}
                      <span>{option.label}</span>
                      {blockType === option.type && <div style={styles.activeIndicator} />}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={styles.divider} />
          </>
        )}

        {/* Actions */}
        <div
          style={itemStyle("duplicate")}
          onMouseEnter={() => {
            setHoveredItem("duplicate");
            closeSubmenus();
          }}
          onMouseLeave={() => setHoveredItem(null)}
          onMouseDown={(e) => {
            e.preventDefault();
            onDuplicate(blockId);
            onClose();
          }}
        >
          <Copy size={15} />
          <span>Duplicate</span>
        </div>

        <div
          style={itemStyle("delete", styles.itemDelete)}
          onMouseEnter={() => {
            setHoveredItem("delete");
            closeSubmenus();
          }}
          onMouseLeave={() => setHoveredItem(null)}
          onMouseDown={(e) => {
            e.preventDefault();
            onDelete(blockId);
            onClose();
          }}
        >
          <Trash2 size={15} />
          <span>Delete</span>
        </div>
      </div>
    </>
  );
}

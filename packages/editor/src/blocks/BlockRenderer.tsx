// ============================================================
// BlockRenderer — renders a single block based on its type.
// Each block is a contentEditable container identified by
// data-block-id. The content area is marked with data-content.
// All colors use CSS variables for theme compatibility.
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Block } from "../core/types";
import { TextContent } from "./TextContent";
import { getRegisteredComponent } from "./component-registry";

interface BlockRendererProps {
  block: Block;
  onToggleTodo?: (blockId: string) => void;
  onToggleCollapse?: (blockId: string) => void;
}

export function BlockRenderer({ block, onToggleTodo, onToggleCollapse }: BlockRendererProps) {
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
      return <TodoBlock block={block} onToggle={onToggleTodo} />;
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
      return <ImageBlock block={block} />;
    case "table":
      return <TableBlock block={block} />;
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
    <div style={{ display: "flex", gap: 8, paddingLeft: 6 }}>
      <span
        style={{ marginTop: "0.35em", userSelect: "none", color: "var(--text-muted)" }}
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
    <div style={{ display: "flex", gap: 8, paddingLeft: 6 }}>
      <span
        style={{
          marginTop: "0.05em",
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

function TodoBlock({ block, onToggle }: { block: Block; onToggle?: (id: string) => void }) {
  const checked = block.props.checked ?? false;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onToggle?.(block.id);
    },
    [block.id, onToggle],
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

function ImageBlock({ block }: { block: Block }) {
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

function TableBlock({ block }: { block: Block }) {
  const tableData = block.props.tableData ?? [
    ["", "", ""],
    ["", "", ""],
    ["", "", ""],
  ];
  const hasHeader = block.props.tableHeader ?? false;

  const headerRow = hasHeader ? tableData[0] : null;
  const bodyRows = hasHeader ? tableData.slice(1) : tableData;

  return (
    <div style={{ margin: "8px 0" }} contentEditable={false}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          borderColor: "var(--border-primary)",
        }}
      >
        {headerRow && (
          <thead>
            <tr>
              {headerRow.map((cell, i) => (
                <th
                  key={i}
                  contentEditable={false}
                  style={{
                    border: "1px solid var(--border-primary)",
                    padding: "6px 12px",
                    textAlign: "left",
                    fontWeight: 600,
                    backgroundColor: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                  }}
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {bodyRows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  contentEditable={false}
                  style={{
                    border: "1px solid var(--border-primary)",
                    padding: "6px 12px",
                    textAlign: "left",
                    color: "var(--text-primary)",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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

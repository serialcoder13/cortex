// ============================================================
// BlockRenderer — renders a single block based on its type.
// Each block is a contentEditable container identified by
// data-block-id. The content area is marked with data-content.
// All colors use CSS variables for theme compatibility.
// ============================================================

import React, { useCallback, useRef, useState } from "react";
import { Lock, Unlock, Crop } from "lucide-react";
import type { Block } from "../core/types";
import { TextContent } from "./TextContent";
import { getRegisteredComponent } from "./component-registry";
import { TableBlock } from "./TableBlock";
import { ListBlock } from "./ListBlock";

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
    case "heading4":
      return <HeadingBlock block={block} level={4} />;
    case "heading5":
      return <HeadingBlock block={block} level={5} />;
    case "heading6":
      return <HeadingBlock block={block} level={6} />;
    case "list":
      return <ListBlock block={block} readOnly={readOnly} />;
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
    case "toc":
      return <TocBlock block={block} />;
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

function HeadingBlock({ block, level }: { block: Block; level: 1 | 2 | 3 | 4 | 5 | 6 }) {
  const styles: Record<1 | 2 | 3 | 4 | 5 | 6, React.CSSProperties> = {
    1: { fontSize: "1.875rem", fontWeight: 700, lineHeight: 1.25, marginTop: 40, marginBottom: 4 },
    2: { fontSize: "1.5rem", fontWeight: 600, lineHeight: 1.25, marginTop: 32, marginBottom: 4 },
    3: { fontSize: "1.25rem", fontWeight: 600, lineHeight: 1.375, marginTop: 24, marginBottom: 4 },
    4: { fontSize: "1.125rem", fontWeight: 600, lineHeight: 1.375, marginTop: 20, marginBottom: 2 },
    5: { fontSize: "1rem", fontWeight: 600, lineHeight: 1.5, marginTop: 16, marginBottom: 2 },
    6: { fontSize: "0.875rem", fontWeight: 600, lineHeight: 1.5, marginTop: 12, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.05em" },
  };

  return (
    <div data-content style={{ minHeight: "1.2em", ...styles[level] }}>
      <TextContent content={block.content} />
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
  const [mode, setMode] = useState<"upload" | "url">("upload");
  const [urlInput, setUrlInput] = useState("");

  const handleFileSelect = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        globalThis.dispatchEvent(
          new CustomEvent("cortex-image-upload", {
            detail: { blockId: block.id, dataUrl, fileName: file.name, file },
          }),
        );
      };
      reader.readAsDataURL(file);
    },
    [block.id],
  );

  const handleUrlSubmit = useCallback(() => {
    const url = urlInput.trim();
    if (!url) return;
    globalThis.dispatchEvent(
      new CustomEvent("cortex-image-upload", {
        detail: { blockId: block.id, dataUrl: url, fileName: "" },
      }),
    );
    setUrlInput("");
  }, [block.id, urlInput]);

  const handleClick = useCallback(() => {
    // Dispatch event to check if a custom browse handler is registered
    const event = new CustomEvent("cortex-image-browse", {
      detail: { blockId: block.id },
      cancelable: true,
    });
    const handled = !globalThis.dispatchEvent(event);
    // If the event was not preventDefault()'d, fall back to native file input
    if (!handled) {
      fileInputRef.current?.click();
    }
  }, [block.id]);

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

  // --- Image selection, resize, crop, and toolbar state ---
  const isInline = block.props.inline === true;
  const [selected, setSelected] = useState(false);
  const [imgW, setImgW] = useState<number>((block.props.width as number) || 0);
  const [imgH, setImgH] = useState<number>((block.props.height as number) || 0);
  const [naturalW, setNaturalW] = useState(0);
  const [naturalH, setNaturalH] = useState(0);
  const [editingAlt, setEditingAlt] = useState(false);
  const [altText, setAltText] = useState(alt as string);
  const [lockAspect, setLockAspect] = useState(true);
  const [cropMode, setCropMode] = useState(false);
  // Crop state: position and size of the visible window within the full image
  const [cropX, setCropX] = useState<number>((block.props.cropX as number) || 0);
  const [cropY, setCropY] = useState<number>((block.props.cropY as number) || 0);
  const [cropW, setCropW] = useState<number>((block.props.cropW as number) || 0);
  const [cropH, setCropH] = useState<number>((block.props.cropH as number) || 0);
  const isCropped = cropW > 0 && cropH > 0;
  const imgRef = useRef<HTMLImageElement>(null);
  const cropRef = useRef<HTMLDivElement>(null);

  const ratio = naturalW && naturalH ? naturalW / naturalH : 1;

  const handleImgLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    setNaturalW(img.naturalWidth);
    setNaturalH(img.naturalHeight);
    // Use the actual rendered size (respecting maxWidth) not the natural size
    if (!imgW) {
      // Wait a frame for layout to settle, then read the actual rendered width
      requestAnimationFrame(() => {
        if (img.offsetWidth) {
          setImgW(img.offsetWidth);
          setImgH(img.offsetHeight);
        }
      });
    }
  }, [imgW]);

  const dispatchImageUpdate = useCallback(
    (props: Record<string, unknown>) => {
      globalThis.dispatchEvent(
        new CustomEvent("cortex-image-update", { detail: { blockId: block.id, ...props } }),
      );
    },
    [block.id],
  );

  // Refs for drag closures
  const wRef = useRef(imgW); wRef.current = imgW;
  const hRef = useRef(imgH); hRef.current = imgH;
  const lockRef = useRef(lockAspect); lockRef.current = lockAspect;
  const ratioRef = useRef(ratio); ratioRef.current = ratio;
  const cropXRef = useRef(cropX); cropXRef.current = cropX;
  const cropYRef = useRef(cropY); cropYRef.current = cropY;
  const cropWRef = useRef(cropW); cropWRef.current = cropW;
  const cropHRef = useRef(cropH); cropHRef.current = cropH;

  // Resize: drag bottom-right handle
  // Locked: width drives height via aspect ratio
  // Unlocked: both W and H change independently
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = imgRef.current?.offsetWidth || 300;
      const startH = imgRef.current?.offsetHeight || 200;

      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const newW = Math.max(50, Math.round(startW + dx));
        if (lockRef.current) {
          setImgW(newW);
          setImgH(Math.round(newW / ratioRef.current));
        } else {
          const newH = Math.max(50, Math.round(startH + dy));
          setImgW(newW);
          setImgH(newH);
        }
      };
      const onMouseUp = () => {
        dispatchImageUpdate({ width: wRef.current, height: hRef.current });
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [dispatchImageUpdate],
  );

  // Crop: drag edges to adjust the visible crop window within the full image
  // cropX/cropY = offset of visible area from top-left of image
  // cropW/cropH = size of the visible crop window
  const handleCropStart = useCallback(
    (e: React.MouseEvent, edge: "right" | "bottom" | "left" | "top") => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const startCropX = cropXRef.current;
      const startCropY = cropYRef.current;
      const startCropW = cropWRef.current || wRef.current;
      const startCropH = cropHRef.current || hRef.current;
      const fullW = wRef.current;
      const fullH = hRef.current;

      // Initialize crop if first time
      if (!cropWRef.current) {
        setCropW(fullW);
        setCropH(fullH);
      }

      const onMouseMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (edge === "right") {
          // Shrink/grow from the right: change cropW
          setCropW(Math.max(50, Math.min(fullW - startCropX, Math.round(startCropW + dx))));
        } else if (edge === "left") {
          // Shrink/grow from the left: change cropX and cropW
          const newX = Math.max(0, Math.min(startCropX + startCropW - 50, Math.round(startCropX + dx)));
          setCropX(newX);
          setCropW(startCropW + (startCropX - newX));
        } else if (edge === "bottom") {
          setCropH(Math.max(50, Math.min(fullH - startCropY, Math.round(startCropH + dy))));
        } else if (edge === "top") {
          const newY = Math.max(0, Math.min(startCropY + startCropH - 50, Math.round(startCropY + dy)));
          setCropY(newY);
          setCropH(startCropH + (startCropY - newY));
        }
      };
      const onMouseUp = () => {
        dispatchImageUpdate({
          cropX: cropXRef.current, cropY: cropYRef.current,
          cropW: cropWRef.current, cropH: cropHRef.current,
        });
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [dispatchImageUpdate],
  );

  // Sync W/H state from actual DOM size when selected (fixes maxWidth mismatch)
  React.useEffect(() => {
    if (!selected) return;
    const el = imgRef.current || cropRef.current;
    if (el) {
      const renderedW = el.offsetWidth;
      const renderedH = el.offsetHeight;
      if (!isCropped && renderedW && renderedW !== imgW) setImgW(renderedW);
      if (!isCropped && renderedH && renderedH !== imgH) setImgH(renderedH);
    }
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deselect on click outside
  const containerRef = useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!selected) return;
    const onClick = (e: MouseEvent) => {
      const wrapper = containerRef.current;
      if (wrapper && !wrapper.contains(e.target as Node)) {
        setSelected(false);
        setCropMode(false);
        dispatchImageUpdate({
          width: wRef.current, height: hRef.current,
          cropX: cropXRef.current, cropY: cropYRef.current,
          cropW: cropWRef.current, cropH: cropHRef.current,
        });
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [selected, dispatchImageUpdate]);

  // Resize pip (blue, bottom-right only)
  const resizePipStyle: React.CSSProperties = {
    position: "absolute", width: 12, height: 12,
    backgroundColor: "white", border: "2px solid rgba(37, 99, 235, 0.7)",
    borderRadius: 2, cursor: "nwse-resize", zIndex: 10,
    bottom: -6, right: -6,
  };

  // Crop edge handles (dark red bars on each side)
  const cropEdgeBase: React.CSSProperties = {
    position: "absolute", backgroundColor: "#991b1b",
    borderRadius: 3, zIndex: 10, opacity: 0.8,
  };
  const cropEdges = {
    right:  { ...cropEdgeBase, top: "20%", right: -4, width: 6, height: "60%", cursor: "ew-resize" } as React.CSSProperties,
    left:   { ...cropEdgeBase, top: "20%", left: -4, width: 6, height: "60%", cursor: "ew-resize" } as React.CSSProperties,
    bottom: { ...cropEdgeBase, left: "20%", bottom: -4, height: 6, width: "60%", cursor: "ns-resize" } as React.CSSProperties,
    top:    { ...cropEdgeBase, left: "20%", top: -4, height: 6, width: "60%", cursor: "ns-resize" } as React.CSSProperties,
  };

  if (!src) {
    const tabStyle = (active: boolean): React.CSSProperties => ({
      padding: "4px 12px",
      fontSize: 12,
      fontWeight: active ? 600 : 400,
      border: "none",
      borderBottom: active ? "2px solid var(--accent, #2563eb)" : "2px solid transparent",
      background: "none",
      cursor: "pointer",
      color: active ? "var(--text-primary, #333)" : "var(--text-muted, #999)",
    });

    return (
      <div
        contentEditable={false}
        style={{
          borderRadius: 8,
          border: "1px dashed var(--border-secondary, #ddd)",
          overflow: "hidden",
        }}
      >
        {/* Tab switcher */}
        <div style={{ display: "flex", borderBottom: "1px solid var(--border-primary, #eee)", padding: "0 8px" }}>
          <button type="button" style={tabStyle(mode === "upload")} onClick={() => setMode("upload")}>
            Upload
          </button>
          <button type="button" style={tabStyle(mode === "url")} onClick={() => setMode("url")}>
            Embed link
          </button>
        </div>

        {mode === "upload" ? (
          <button
            type="button"
            style={{
              display: "flex",
              height: 160,
              width: "100%",
              cursor: "pointer",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              border: "none",
              backgroundColor: "transparent",
              color: "var(--text-muted)",
            }}
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
            <span style={{ fontSize: 13 }}>Click to upload or drag an image</span>
            <span style={{ fontSize: 11, color: "var(--text-muted, #bbb)" }}>PNG, JPG, GIF, SVG, WEBP</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleInputChange}
            />
          </button>
        ) : (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleUrlSubmit(); }
                  e.stopPropagation();
                }}
                placeholder="Paste image URL..."
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  fontSize: 13,
                  border: "1px solid var(--border-primary, #ddd)",
                  borderRadius: 6,
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
              <button
                type="button"
                onClick={handleUrlSubmit}
                style={{
                  padding: "6px 14px",
                  fontSize: 13,
                  fontWeight: 500,
                  border: "none",
                  borderRadius: 6,
                  backgroundColor: urlInput.trim() ? "var(--accent, #2563eb)" : "var(--bg-tertiary, #eee)",
                  color: urlInput.trim() ? "#fff" : "var(--text-muted, #999)",
                  cursor: urlInput.trim() ? "pointer" : "default",
                }}
              >
                Embed
              </button>
            </div>
            <span style={{ fontSize: 11, color: "var(--text-muted, #bbb)" }}>
              Works with any image URL (jpg, png, gif, svg)
            </span>
          </div>
        )}
      </div>
    );
  }

  // In crop mode, compute the active crop region for overlay positioning
  const activeCropX = cropW ? cropX : 0;
  const activeCropY = cropW ? cropY : 0;
  const activeCropW = cropW || imgW;
  const activeCropH = cropH || imgH;

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        margin: isInline ? "4px 4px 4px 0" : "8px 0",
        display: isInline ? "inline-block" : "block",
        verticalAlign: "top",
        maxWidth: isInline ? "48%" : undefined,
      }}
      contentEditable={false}
    >
      {/* Image container with selection + resize/crop */}
      <div
        style={{
          position: "relative",
          display: "inline-block",
          maxWidth: "100%",
          cursor: "pointer",
          outline: selected && !cropMode ? "2px solid rgba(37, 99, 235, 0.5)" : undefined,
          outlineOffset: 2,
          borderRadius: 8,
        }}
        onClick={() => setSelected(!selected)}
      >
        {/* Normal view when cropped: div with background-image showing only crop region */}
        {isCropped && !cropMode ? (
          <div
            ref={cropRef}
            style={{
              width: cropW,
              height: cropH,
              backgroundImage: `url(${src})`,
              backgroundSize: `${imgW}px ${imgH}px`,
              backgroundPosition: `-${cropX}px -${cropY}px`,
              backgroundRepeat: "no-repeat",
              borderRadius: 8,
              display: "block",
            }}
          />
        ) : !cropMode ? (
          /* Normal view, not cropped: plain img */
          <img
            ref={imgRef}
            src={src as string}
            alt={alt as string}
            onLoad={handleImgLoad}
            style={{
              width: imgW || undefined,
              height: !lockAspect ? (imgH || undefined) : "auto",
              maxWidth: "100%",
              borderRadius: 8,
              display: "block",
            }}
          />
        ) : (
          /* Crop mode: full image with darkened overlay outside crop region */
          <div style={{ position: "relative", display: "inline-block" }} onClick={(e) => e.stopPropagation()}>
            {/* Full image (dimmed) */}
            <img
              ref={imgRef}
              src={src as string}
              alt={alt as string}
              onLoad={handleImgLoad}
              style={{
                width: imgW || undefined,
                height: !lockAspect ? (imgH || undefined) : "auto",
                maxWidth: "none",
                display: "block",
                opacity: 0.4,
              }}
            />
            {/* Bright crop region overlay */}
            <div
              style={{
                position: "absolute",
                left: activeCropX,
                top: activeCropY,
                width: activeCropW,
                height: activeCropH,
                backgroundImage: `url(${src})`,
                backgroundSize: `${imgW}px ${imgH}px`,
                backgroundPosition: `-${activeCropX}px -${activeCropY}px`,
                backgroundRepeat: "no-repeat",
                border: "2px solid #991b1b",
                boxSizing: "border-box",
              }}
            >
              {/* Crop edge handles inside the crop region */}
              <div onMouseDown={(e) => handleCropStart(e, "right")} style={cropEdges.right} />
              <div onMouseDown={(e) => handleCropStart(e, "left")} style={cropEdges.left} />
              <div onMouseDown={(e) => handleCropStart(e, "bottom")} style={cropEdges.bottom} />
              <div onMouseDown={(e) => handleCropStart(e, "top")} style={cropEdges.top} />
            </div>
          </div>
        )}

        {/* Resize mode: single bottom-right handle */}
        {selected && !cropMode && (
          <div onMouseDown={handleResizeStart} style={resizePipStyle} />
        )}
      </div>

      {/* Toolbar — shown when selected, floats above content */}
      {selected && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: "100%",
            marginTop: 6,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: "8px 12px",
            borderRadius: 8,
            backgroundColor: "var(--bg-secondary, #f5f5f5)",
            border: "1px solid var(--border-primary, #e5e5e5)",
            fontSize: 13,
            maxWidth: 340,
            zIndex: 20,
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Row 1: W × H + lock + crop */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--text-secondary, #666)" }}>
              W
              <input
                type="number"
                value={imgW || ""}
                onChange={(e) => {
                  const w = parseInt(e.target.value) || 0;
                  setImgW(w);
                  if (lockAspect && ratio && w) setImgH(Math.round(w / ratio));
                }}
                onBlur={() => dispatchImageUpdate({ width: imgW, height: imgH })}
                onKeyDown={(e) => e.stopPropagation()}
                style={{ width: 70, padding: "4px 6px", border: "1px solid var(--border-primary, #ddd)", borderRadius: 6, fontSize: 13, textAlign: "center" }}
              />
            </label>
            <span style={{ color: "var(--text-muted, #bbb)", fontSize: 14 }}>×</span>
            <label style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--text-secondary, #666)" }}>
              H
              <input
                type="number"
                value={imgH || ""}
                onChange={(e) => {
                  const h = parseInt(e.target.value) || 0;
                  setImgH(h);
                  if (lockAspect && ratio && h) setImgW(Math.round(h * ratio));
                }}
                onBlur={() => dispatchImageUpdate({ width: imgW, height: imgH })}
                onKeyDown={(e) => e.stopPropagation()}
                style={{ width: 70, padding: "4px 6px", border: "1px solid var(--border-primary, #ddd)", borderRadius: 6, fontSize: 13, textAlign: "center" }}
              />
            </label>
            <button
              type="button"
              onClick={() => setLockAspect(!lockAspect)}
              title={lockAspect ? "Unlock aspect ratio" : "Lock aspect ratio"}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: lockAspect ? "rgba(37, 99, 235, 0.8)" : "var(--text-muted, #bbb)",
                padding: "2px 4px",
                display: "flex",
                alignItems: "center",
              }}
            >
              {lockAspect ? <Lock size={16} /> : <Unlock size={16} />}
            </button>
            <button
              type="button"
              onClick={() => {
                if (!cropMode && imgW && imgH) {
                  // Entering crop mode: initialize crop to full image if not already set
                  if (!cropW || !cropH) {
                    setCropX(0); setCropY(0);
                    setCropW(imgW); setCropH(imgH);
                  }
                }
                setCropMode(!cropMode);
              }}
              title={cropMode ? "Exit crop mode" : "Crop mode"}
              style={{
                background: cropMode ? "rgba(37, 99, 235, 0.1)" : "none",
                border: cropMode ? "1px solid rgba(37, 99, 235, 0.3)" : "none",
                borderRadius: 4,
                cursor: "pointer",
                color: cropMode ? "rgba(37, 99, 235, 0.8)" : "var(--text-muted, #bbb)",
                padding: "2px 4px",
                display: "flex",
                alignItems: "center",
              }}
            >
              <Crop size={16} />
            </button>
          </div>

          {/* Row 2: Alt text — full width */}
          {editingAlt ? (
            <input
              type="text"
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              onBlur={() => { dispatchImageUpdate({ alt: altText }); setEditingAlt(false); }}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") { dispatchImageUpdate({ alt: altText }); setEditingAlt(false); }
                if (e.key === "Escape") setEditingAlt(false);
              }}
              autoFocus
              placeholder="Alt text..."
              style={{ width: "100%", padding: "4px 8px", border: "1px solid var(--border-primary, #ddd)", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingAlt(true)}
              style={{
                background: "none",
                border: "1px solid var(--border-primary, #ddd)",
                borderRadius: 6,
                cursor: "pointer",
                padding: "4px 8px",
                fontSize: 13,
                color: altText ? "var(--text-secondary, #666)" : "var(--text-muted, #bbb)",
                textAlign: "left",
                width: "100%",
              }}
            >
              {altText || "Add alt text"}
            </button>
          )}
        </div>
      )}

      {/* Caption */}
      {caption && (
        <p style={{ marginTop: 4, textAlign: "center", fontSize: "0.875rem", color: "var(--text-muted)" }}>
          {caption}
        </p>
      )}
    </div>
  );
}

/** Table of Contents — reads headings from the DOM and renders clickable links */
function TocBlock({ block }: { block: Block }) {
  const maxLevel = (block.props.tocLevels as number) ?? 3;
  const [headings, setHeadings] = useState<{ id: string; text: string; level: number }[]>([]);
  const tocRef = useRef<HTMLDivElement>(null);

  // Scan headings from sibling blocks in the editor DOM
  const scan = useCallback(() => {
    const editor = tocRef.current?.closest(".cx-editor");
    if (!editor) return;
    const found: { id: string; text: string; level: number }[] = [];
    const blockEls = editor.querySelectorAll("[data-block-id]");
    const headingTypes: Record<string, number> = {
      heading1: 1, heading2: 2, heading3: 3,
      heading4: 4, heading5: 5, heading6: 6,
    };
    blockEls.forEach((el) => {
      const blockId = (el as HTMLElement).dataset?.blockId ?? "";
      const contentEl = el.querySelector("[data-content]");
      if (!contentEl) return;
      const doc = (globalThis as any).__editorDoc;
      if (!doc) return;
      const docBlock = doc.blocks.find((b: any) => b.id === blockId);
      if (!docBlock) return;
      const level = headingTypes[docBlock.type];
      if (level && level <= maxLevel) {
        const text = docBlock.content.map((s: any) => s.text).join("");
        if (text.trim()) found.push({ id: blockId, text, level });
      }
    });
    setHeadings(found);
  }, [maxLevel]);

  // Scan on mount with a small delay, then re-scan periodically
  React.useEffect(() => {
    const timeout = setTimeout(scan, 100);
    const interval = setInterval(scan, 2000);
    return () => { clearTimeout(timeout); clearInterval(interval); };
  }, [scan]);

  const handleClick = useCallback((blockId: string) => {
    const el = document.querySelector(`[data-block-id="${blockId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div
      ref={tocRef}
      contentEditable={false}
      style={{
        margin: "8px 0",
        padding: "12px 16px",
        borderRadius: 8,
        backgroundColor: "var(--bg-secondary, #f8f8f8)",
        border: "1px solid var(--border-primary, #e5e5e5)",
      }}
    >
      <div style={{
        fontSize: 13,
        fontWeight: 600,
        marginBottom: 8,
        color: "var(--text-primary, #333)",
      }}>
        Table of contents
      </div>
      {headings.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-muted, #999)", fontStyle: "italic" }}>
          No headings found. Add headings (H1–H{maxLevel}) to populate this.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {headings.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => handleClick(h.id)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                textAlign: "left",
                padding: "2px 0",
                paddingLeft: (h.level - 1) * 16,
                fontSize: 14,
                color: "var(--text-secondary, #555)",
                textDecoration: "underline",
                textDecorationColor: "var(--border-primary, #ddd)",
                textUnderlineOffset: 2,
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--accent, #2563eb)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary, #555)"; }}
            >
              {h.text}
            </button>
          ))}
        </div>
      )}
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

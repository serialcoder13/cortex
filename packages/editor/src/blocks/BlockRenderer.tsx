// ============================================================
// BlockRenderer — renders a single block based on its type.
// Each block is a contentEditable container identified by
// data-block-id. The content area is marked with data-content.
// All colors use CSS variables for theme compatibility.
// ============================================================

import React, { useCallback, useRef } from "react";
import type { Block } from "../core/types";
import { TextContent } from "./TextContent";

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
    default:
      return <ParagraphBlock block={block} />;
  }
}

// ---- Block Components ----

function ParagraphBlock({ block }: { block: Block }) {
  return (
    <div data-content className="cx-min-h-[1.5em] cx-leading-relaxed cx-py-[1px]">
      <TextContent content={block.content} />
    </div>
  );
}

function HeadingBlock({ block, level }: { block: Block; level: 1 | 2 | 3 }) {
  const styles = {
    1: "cx-text-3xl cx-font-bold cx-leading-tight cx-mt-10 cx-mb-1",
    2: "cx-text-2xl cx-font-semibold cx-leading-tight cx-mt-8 cx-mb-1",
    3: "cx-text-xl cx-font-semibold cx-leading-snug cx-mt-6 cx-mb-1",
  };

  return (
    <div data-content className={`cx-min-h-[1.2em] ${styles[level]}`}>
      <TextContent content={block.content} />
    </div>
  );
}

function BulletListBlock({ block }: { block: Block }) {
  return (
    <div className="cx-flex cx-gap-2 cx-pl-1.5">
      <span
        className="cx-mt-[0.35em] cx-select-none"
        style={{ color: "var(--text-muted)" }}
        contentEditable={false}
      >
        •
      </span>
      <div data-content className="cx-min-h-[1.5em] cx-flex-1 cx-leading-relaxed">
        <TextContent content={block.content} />
      </div>
    </div>
  );
}

function NumberedListBlock({ block }: { block: Block }) {
  const number = block.props.number ?? 1;
  return (
    <div className="cx-flex cx-gap-2 cx-pl-1.5">
      <span
        className="cx-mt-[0.05em] cx-min-w-[1.2em] cx-text-right cx-select-none"
        style={{ color: "var(--text-muted)" }}
        contentEditable={false}
      >
        {String(number)}.
      </span>
      <div data-content className="cx-min-h-[1.5em] cx-flex-1 cx-leading-relaxed">
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
    <div className="cx-flex cx-gap-2 cx-pl-1.5">
      <button
        type="button"
        className="cx-mt-[0.2em] cx-h-[18px] cx-w-[18px] cx-flex-shrink-0 cx-rounded-[3px] cx-border cx-flex cx-items-center cx-justify-center cx-transition-all"
        style={{
          borderColor: checked ? "var(--accent)" : "var(--border-secondary)",
          backgroundColor: checked ? "var(--accent)" : "transparent",
        }}
        contentEditable={false}
        onClick={handleClick}
        aria-checked={checked}
        role="checkbox"
      >
        {checked && (
          <svg className="cx-h-3 cx-w-3" viewBox="0 0 16 16" fill="white">
            <path d="M12.207 4.793a1 1 0 0 1 0 1.414l-5 5a1 1 0 0 1-1.414 0l-2-2a1 1 0 0 1 1.414-1.414L6.5 9.086l4.293-4.293a1 1 0 0 1 1.414 0z" />
          </svg>
        )}
      </button>
      <div
        data-content
        className={`cx-min-h-[1.5em] cx-flex-1 cx-leading-relaxed cx-transition-colors ${checked ? "cx-line-through" : ""}`}
        style={checked ? { color: "var(--text-muted)" } : undefined}
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
      className="cx-my-2 cx-rounded-lg cx-border"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--border-primary)",
      }}
    >
      {language && (
        <div
          className="cx-px-4 cx-py-1 cx-text-xs cx-border-b cx-select-none"
          style={{
            color: "var(--text-muted)",
            borderColor: "var(--border-primary)",
          }}
          contentEditable={false}
        >
          {language}
        </div>
      )}
      <pre className="cx-p-4 cx-overflow-x-auto">
        <code
          data-content
          className="cx-font-mono cx-text-sm cx-leading-relaxed"
          style={{ color: "var(--text-primary)" }}
        >
          <TextContent content={block.content} />
        </code>
      </pre>
    </div>
  );
}

function QuoteBlock({ block }: { block: Block }) {
  return (
    <div className="cx-flex">
      <div
        className="cx-mr-3 cx-w-1 cx-flex-shrink-0 cx-rounded-full"
        style={{ backgroundColor: "var(--accent)" }}
        contentEditable={false}
      />
      <div
        data-content
        className="cx-min-h-[1.5em] cx-flex-1 cx-italic cx-leading-relaxed"
        style={{ color: "var(--text-secondary)" }}
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
      className="cx-flex cx-gap-3 cx-rounded-lg cx-border cx-p-4"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--border-primary)",
      }}
    >
      <span className="cx-text-lg cx-select-none" contentEditable={false}>
        {emoji}
      </span>
      <div data-content className="cx-min-h-[1.5em] cx-flex-1 cx-leading-relaxed">
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
      <div className="cx-flex cx-gap-1">
        <button
          type="button"
          className="cx-mt-[0.25em] cx-h-5 cx-w-5 cx-flex-shrink-0 cx-transition-transform"
          contentEditable={false}
          onClick={handleClick}
          style={{ color: "var(--text-muted)", transform: collapsed ? "rotate(0deg)" : "rotate(90deg)" }}
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="cx-h-full cx-w-full">
            <path d="M6 4l4 4-4 4V4z" />
          </svg>
        </button>
        <div data-content className="cx-min-h-[1.5em] cx-flex-1 cx-font-medium cx-leading-relaxed">
          <TextContent content={block.content} />
        </div>
      </div>
      {!collapsed && block.children.length > 0 && (
        <div
          className="cx-ml-6 cx-mt-1 cx-border-l cx-pl-4"
          style={{ borderColor: "var(--border-primary)" }}
        >
          {/* Children rendered by parent editor */}
        </div>
      )}
    </div>
  );
}

function DividerBlock() {
  return (
    <div className="cx-py-3" contentEditable={false}>
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
        className="cx-flex cx-h-48 cx-w-full cx-cursor-pointer cx-flex-col cx-items-center cx-justify-center cx-gap-2 cx-rounded-lg cx-border cx-border-dashed cx-bg-transparent cx-transition-colors"
        style={{
          borderColor: "var(--border-secondary)",
          color: "var(--text-muted)",
        }}
        contentEditable={false}
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <svg className="cx-h-8 cx-w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
          />
        </svg>
        <span className="cx-text-sm">Click to upload or drag an image</span>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="cx-hidden"
          onChange={handleInputChange}
        />
      </button>
    );
  }

  return (
    <div className="cx-my-2" contentEditable={false}>
      <img src={src} alt={alt} className="cx-max-w-full cx-rounded-lg" />
      {caption && (
        <p className="cx-mt-1 cx-text-center cx-text-sm" style={{ color: "var(--text-muted)" }}>
          {caption}
        </p>
      )}
    </div>
  );
}

// ============================================================
// BlockRenderer — renders a single block based on its type.
// Each block is a contentEditable container identified by
// data-block-id. The content area is marked with data-content.
// ============================================================

import React, { useCallback } from "react";
import type { Block, BlockProps } from "../core/types";
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
    <div data-content className="cx-min-h-[1.5em] cx-leading-relaxed">
      <TextContent content={block.content} />
    </div>
  );
}

function HeadingBlock({ block, level }: { block: Block; level: 1 | 2 | 3 }) {
  const styles = {
    1: "cx-text-3xl cx-font-bold cx-leading-tight cx-mt-8 cx-mb-2",
    2: "cx-text-2xl cx-font-semibold cx-leading-tight cx-mt-6 cx-mb-2",
    3: "cx-text-xl cx-font-semibold cx-leading-snug cx-mt-4 cx-mb-1",
  };

  return (
    <div data-content className={`cx-min-h-[1.2em] ${styles[level]}`}>
      <TextContent content={block.content} />
    </div>
  );
}

function BulletListBlock({ block }: { block: Block }) {
  return (
    <div className="cx-flex cx-gap-2 cx-pl-1">
      <span className="cx-mt-[0.35em] cx-text-neutral-500 cx-select-none" contentEditable={false}>
        •
      </span>
      <div data-content className="cx-min-h-[1.5em] cx-flex-1 cx-leading-relaxed">
        <TextContent content={block.content} />
      </div>
    </div>
  );
}

function NumberedListBlock({ block }: { block: Block }) {
  // The number is passed as a prop or computed by the parent
  const number = block.props.number ?? 1;
  return (
    <div className="cx-flex cx-gap-2 cx-pl-1">
      <span
        className="cx-mt-[0.05em] cx-min-w-[1.2em] cx-text-right cx-text-neutral-500 cx-select-none"
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
    <div className="cx-flex cx-gap-2 cx-pl-1">
      <button
        type="button"
        className={`cx-mt-[0.25em] cx-h-4 cx-w-4 cx-flex-shrink-0 cx-rounded cx-border cx-transition-colors ${
          checked
            ? "cx-border-blue-500 cx-bg-blue-500"
            : "cx-border-neutral-600 cx-bg-transparent hover:cx-border-neutral-400"
        }`}
        contentEditable={false}
        onClick={handleClick}
        aria-checked={checked}
        role="checkbox"
      >
        {checked && (
          <svg className="cx-h-full cx-w-full cx-text-white" viewBox="0 0 16 16" fill="currentColor">
            <path d="M12.207 4.793a1 1 0 0 1 0 1.414l-5 5a1 1 0 0 1-1.414 0l-2-2a1 1 0 0 1 1.414-1.414L6.5 9.086l4.293-4.293a1 1 0 0 1 1.414 0z" />
          </svg>
        )}
      </button>
      <div
        data-content
        className={`cx-min-h-[1.5em] cx-flex-1 cx-leading-relaxed ${checked ? "cx-text-neutral-500 cx-line-through" : ""}`}
      >
        <TextContent content={block.content} />
      </div>
    </div>
  );
}

function CodeBlock({ block }: { block: Block }) {
  const language = block.props.language ?? "";
  return (
    <div className="cx-my-2 cx-rounded-lg cx-bg-neutral-900 cx-border cx-border-neutral-800">
      {language && (
        <div
          className="cx-px-4 cx-py-1 cx-text-xs cx-text-neutral-500 cx-border-b cx-border-neutral-800 cx-select-none"
          contentEditable={false}
        >
          {language}
        </div>
      )}
      <pre className="cx-p-4 cx-overflow-x-auto">
        <code data-content className="cx-font-mono cx-text-sm cx-leading-relaxed cx-text-neutral-200">
          <TextContent content={block.content} />
        </code>
      </pre>
    </div>
  );
}

function QuoteBlock({ block }: { block: Block }) {
  return (
    <div className="cx-flex">
      <div className="cx-mr-3 cx-w-1 cx-flex-shrink-0 cx-rounded-full cx-bg-neutral-600" contentEditable={false} />
      <div data-content className="cx-min-h-[1.5em] cx-flex-1 cx-italic cx-text-neutral-300 cx-leading-relaxed">
        <TextContent content={block.content} />
      </div>
    </div>
  );
}

function CalloutBlock({ block }: { block: Block }) {
  const emoji = block.props.emoji ?? "💡";
  const color = block.props.color ?? "neutral";

  const bgColors: Record<string, string> = {
    neutral: "cx-bg-neutral-900 cx-border-neutral-700",
    blue: "cx-bg-blue-950/50 cx-border-blue-800",
    yellow: "cx-bg-yellow-950/50 cx-border-yellow-800",
    red: "cx-bg-red-950/50 cx-border-red-800",
    green: "cx-bg-green-950/50 cx-border-green-800",
  };

  return (
    <div className={`cx-flex cx-gap-3 cx-rounded-lg cx-border cx-p-4 ${bgColors[color] ?? bgColors.neutral}`}>
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
          className="cx-mt-[0.25em] cx-h-5 cx-w-5 cx-flex-shrink-0 cx-text-neutral-500 cx-transition-transform hover:cx-text-neutral-300"
          contentEditable={false}
          onClick={handleClick}
          style={{ transform: collapsed ? "rotate(0deg)" : "rotate(90deg)" }}
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
        <div className="cx-ml-6 cx-mt-1 cx-border-l cx-border-neutral-800 cx-pl-4">
          {/* Children rendered by parent editor */}
        </div>
      )}
    </div>
  );
}

function DividerBlock() {
  return (
    <div className="cx-py-3" contentEditable={false}>
      <hr className="cx-border-neutral-700" />
    </div>
  );
}

function ImageBlock({ block }: { block: Block }) {
  const src = block.props.src;
  const alt = block.props.alt ?? "";
  const caption = block.props.caption;

  if (!src) {
    return (
      <div
        className="cx-flex cx-h-32 cx-items-center cx-justify-center cx-rounded-lg cx-border cx-border-dashed cx-border-neutral-700 cx-text-neutral-500"
        contentEditable={false}
      >
        Click to add an image
      </div>
    );
  }

  return (
    <div className="cx-my-2" contentEditable={false}>
      <img src={src} alt={alt} className="cx-max-w-full cx-rounded-lg" />
      {caption && <p className="cx-mt-1 cx-text-center cx-text-sm cx-text-neutral-500">{caption}</p>}
    </div>
  );
}

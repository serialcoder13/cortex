// ============================================================
// TextContent — renders an array of TextSpans as inline HTML
// with marks (bold, italic, code, link, etc.)
// This is the core rendering primitive used by all text blocks.
// ============================================================

import React from "react";
import type { TextSpan } from "../core/types";

interface TextContentProps {
  content: TextSpan[];
}

export function TextContent({ content }: TextContentProps) {
  if (content.length === 0) {
    // Render a zero-width space so the block is focusable
    return <>{"\u200B"}</>;
  }

  return (
    <>
      {content.map((span, i) => (
        <SpanRenderer key={i} span={span} />
      ))}
    </>
  );
}

function SpanRenderer({ span }: { span: TextSpan }) {
  const marks = span.marks ?? [];

  if (marks.length === 0) {
    return <>{span.text}</>;
  }

  let element: React.ReactNode = span.text;

  // Apply marks inside-out
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        element = <strong>{element}</strong>;
        break;
      case "italic":
        element = <em>{element}</em>;
        break;
      case "underline":
        element = <u>{element}</u>;
        break;
      case "strikethrough":
        element = <s>{element}</s>;
        break;
      case "code":
        element = (
          <code className="cx-rounded cx-bg-neutral-800 cx-px-1 cx-py-0.5 cx-font-mono cx-text-sm cx-text-amber-300">
            {element}
          </code>
        );
        break;
      case "link":
        element = (
          <a
            href={mark.attrs?.href}
            className="cx-text-blue-400 cx-underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {element}
          </a>
        );
        break;
    }
  }

  return <>{element}</>;
}

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

  // Check if the last span ends with "\n" — browsers collapse trailing newlines
  // in contentEditable, so we append a newline to make it visible
  const lastSpan = content[content.length - 1];
  const needsTrailingNewline = lastSpan && lastSpan.text.endsWith("\n");

  return (
    <>
      {content.map((span, i) => (
        <SpanRenderer key={i} span={span} />
      ))}
      {needsTrailingNewline && "\n"}
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
          <code
            style={{
              borderRadius: 4,
              padding: "2px 6px",
              fontFamily: "'SF Mono', 'Fira Code', Menlo, monospace",
              fontSize: "0.875em",
              backgroundColor: "var(--bg-tertiary, #eee)",
              color: "var(--accent, #2563eb)",
            }}
          >
            {element}
          </code>
        );
        break;
      case "link":
        element = (
          <a
            href={mark.attrs?.href}
            style={{ color: "var(--accent, #2563eb)", textDecoration: "underline" }}
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

// ============================================================
// Component Registry — a plugin system for custom block types.
//
// Each registered component provides:
// - A React component to render it
// - A markdown identifier (used to detect it during deserialization)
// - A serializer (block → markdown string)
// - A deserializer (markdown string → block props)
//
// Markdown format: <!-- cortex:componentName -->...content...<!-- /cortex:componentName -->
// Components can define their own content format within the markers.
// ============================================================

import type React from "react";
import type { BlockProps } from "../core/types";

/** The props passed to a custom component renderer */
export interface CustomComponentRenderProps {
  /** The block's props (includes componentName, componentProps, and any custom data) */
  props: BlockProps;
  /** Whether the editor is in read-only mode */
  readOnly: boolean;
  /** Callback to update the block's props */
  onUpdateProps?: (newProps: Partial<BlockProps>) => void;
}

/** Registration for a custom component */
export interface CustomComponentDefinition {
  /** Unique name used as the markdown identifier */
  name: string;
  /** Display label for the slash command menu */
  label: string;
  /** Description for the slash command menu */
  description: string;
  /** Keywords for slash command search */
  keywords?: string[];
  /** The React component to render */
  component: React.ComponentType<CustomComponentRenderProps>;
  /** Convert block props to markdown content (between the markers) */
  serialize: (props: BlockProps) => string;
  /** Parse markdown content (between the markers) into block props */
  deserialize: (content: string) => BlockProps;
  /** Optional: custom markdown marker pattern. Defaults to HTML comment style. */
  markerStart?: string;
  markerEnd?: string;
}

const registry = new Map<string, CustomComponentDefinition>();

/** Register a custom component */
export function registerComponent(def: CustomComponentDefinition): void {
  registry.set(def.name, def);
}

/** Unregister a custom component */
export function unregisterComponent(name: string): void {
  registry.delete(name);
}

/** Get a registered component by name */
export function getRegisteredComponent(name: string): CustomComponentDefinition | undefined {
  return registry.get(name);
}

/** Get all registered components */
export function getAllRegisteredComponents(): CustomComponentDefinition[] {
  return Array.from(registry.values());
}

/** Serialize a custom component block to markdown */
export function serializeCustomComponent(props: BlockProps): string {
  const name = props.componentName as string;
  if (!name) return "";
  const def = registry.get(name);
  if (!def) {
    // Fallback: serialize as JSON in comment
    return `<!-- cortex:${name} -->\n${JSON.stringify(props.componentProps ?? {})}\n<!-- /cortex:${name} -->`;
  }
  const content = def.serialize(props);
  const start = def.markerStart ?? `<!-- cortex:${name} -->`;
  const end = def.markerEnd ?? `<!-- /cortex:${name} -->`;
  return `${start}\n${content}\n${end}`;
}

/** Try to deserialize a markdown line as a custom component start marker.
 *  Returns the component name if matched, null otherwise. */
export function detectCustomComponentMarker(line: string): string | null {
  // Default pattern: <!-- cortex:componentName -->
  const defaultMatch = /^<!--\s*cortex:(\w+)\s*-->/.exec(line);
  if (defaultMatch) return defaultMatch[1]!;

  // Check registered components with custom markers
  for (const def of registry.values()) {
    if (def.markerStart && line.trim().startsWith(def.markerStart.trim())) {
      return def.name;
    }
  }
  return null;
}

/** Check if a line is a custom component end marker */
export function isCustomComponentEndMarker(line: string, name: string): boolean {
  const def = registry.get(name);
  const end = def?.markerEnd ?? `<!-- /cortex:${name} -->`;
  return line.trim() === end.trim();
}

/** Deserialize content between markers into block props */
export function deserializeCustomComponent(name: string, content: string): BlockProps {
  const def = registry.get(name);
  if (!def) {
    // Fallback: try parsing as JSON
    try {
      return { componentName: name, componentProps: JSON.parse(content) };
    } catch {
      return { componentName: name, componentProps: { raw: content } };
    }
  }
  const props = def.deserialize(content);
  return { ...props, componentName: name };
}

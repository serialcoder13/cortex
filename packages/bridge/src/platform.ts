declare global {
  interface Window {
    __TAURI__?: Record<string, unknown>;
  }
}

/**
 * Detect whether the app is running inside a Tauri webview.
 *
 * Tauri injects a `window.__TAURI__` object into the webview context.
 * This function safely checks for its existence, handling SSR
 * environments where `window` is not defined.
 */
export function isTauri(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.__TAURI__ !== undefined;
}

/**
 * Detect whether the app is running in a standard browser (not Tauri).
 */
export function isBrowser(): boolean {
  return typeof window !== "undefined" && !isTauri();
}

/**
 * Get the current platform type.
 */
export function getPlatform(): "tauri" | "browser" | "server" {
  if (typeof window === "undefined") {
    return "server";
  }
  return isTauri() ? "tauri" : "browser";
}

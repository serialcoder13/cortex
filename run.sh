#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DESKTOP_DIR="$SCRIPT_DIR/apps/desktop"
WEB_DIR="$SCRIPT_DIR/apps/web"

usage() {
  echo "Usage: ./run.sh <target> [--build]"
  echo ""
  echo "Targets:"
  echo "  desktop    Run desktop app (macOS/Windows/Linux)"
  echo "  ios        Run mobile app on iOS simulator"
  echo "  android    Run mobile app on Android emulator"
  echo "  web        Run web app in browser"
  echo ""
  echo "Options:"
  echo "  --build    Production build instead of dev mode"
  exit 1
}

if [ $# -lt 1 ]; then
  usage
fi

TARGET="$1"
MODE="dev"
if [ "${2:-}" = "--build" ]; then
  MODE="build"
fi

# Ensure packages are built before running
build_packages() {
  echo "Building workspace packages..."
  cd "$SCRIPT_DIR"
  pnpm --filter @cortex/editor build
  pnpm --filter @cortex/ui build
  pnpm --filter @cortex/store build
  pnpm --filter @cortex/bridge build
}

case "$TARGET" in
  desktop)
    build_packages
    cd "$DESKTOP_DIR"
    if [ "$MODE" = "build" ]; then
      echo "Building Cortex desktop app..."
      pnpm tauri build
    else
      echo "Starting Cortex desktop dev..."
      pnpm tauri dev
    fi
    ;;

  ios)
    build_packages
    cd "$DESKTOP_DIR"
    if [ "$MODE" = "build" ]; then
      echo "Building Cortex for iOS..."
      pnpm tauri ios build
    else
      echo "Starting Cortex dev for iOS..."
      pnpm tauri ios dev
    fi
    ;;

  android)
    build_packages
    cd "$DESKTOP_DIR"
    if [ "$MODE" = "build" ]; then
      echo "Building Cortex for Android..."
      pnpm tauri android build
    else
      echo "Starting Cortex dev for Android..."
      pnpm tauri android dev
    fi
    ;;

  web)
    build_packages
    cd "$WEB_DIR"
    if [ "$MODE" = "build" ]; then
      echo "Building Cortex web app..."
      pnpm build
      echo "Build output in $WEB_DIR/dist/"
      echo "Serve with: npx serve $WEB_DIR/dist"
    else
      echo "Starting Cortex web dev server..."
      pnpm dev
    fi
    ;;

  *)
    echo "Unknown target: $TARGET"
    usage
    ;;
esac

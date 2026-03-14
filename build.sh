#!/bin/bash
set -euo pipefail

APP_NAME="SessionCtl"
RELEASE_DIR="dist"
APP_BUNDLE="$RELEASE_DIR/$APP_NAME.app"

echo "=== Building $APP_NAME (native Swift) ==="

# Step 1: Build
echo "-> Compiling Swift..."
swift build -c release 2>&1

BINARY="$(swift build -c release --show-bin-path)/$APP_NAME"

# Step 2: Create app bundle
echo "-> Creating app bundle..."
rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources/shell"

# Copy binary
cp "$BINARY" "$APP_BUNDLE/Contents/MacOS/$APP_NAME"

# Copy Info.plist
cp Sources/SessionCtl/Info.plist "$APP_BUNDLE/Contents/Info.plist"

# Copy shell companion
cp shell/sessionctl.sh "$APP_BUNDLE/Contents/Resources/shell/" 2>/dev/null || true
cp shell/sessionctl-init.sh "$APP_BUNDLE/Contents/Resources/shell/" 2>/dev/null || true

# Copy icon if exists
if [ -f assets/icon.icns ]; then
    cp assets/icon.icns "$APP_BUNDLE/Contents/Resources/AppIcon.icns"
fi

# Set executable permission
chmod +x "$APP_BUNDLE/Contents/MacOS/$APP_NAME"

echo ""
echo "=== Build complete ==="
echo "App: $APP_BUNDLE"
echo ""
echo "  Run:     open $APP_BUNDLE"
echo "  Install: cp -r $APP_BUNDLE /Applications/"

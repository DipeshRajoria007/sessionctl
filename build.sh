#!/bin/bash
set -euo pipefail

APP_NAME="SessionCtl"
RELEASE_DIR="dist"
APP_BUNDLE="$RELEASE_DIR/$APP_NAME.app"
ENTITLEMENTS="Sources/SessionCtl/SessionCtl.entitlements"

echo "=== Building $APP_NAME (native Swift) ==="

# Step 1: Build
echo "-> Compiling Swift..."
swift build -c release 2>&1

BINARY="$(swift build -c release --show-bin-path)/$APP_NAME"

# Step 2: Create app bundle
echo "-> Creating app bundle..."
rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources"

# Copy binary
cp "$BINARY" "$APP_BUNDLE/Contents/MacOS/$APP_NAME"

# Copy Info.plist
cp Sources/SessionCtl/Info.plist "$APP_BUNDLE/Contents/Info.plist"

# Copy icon if exists
if [ -f assets/icon.icns ]; then
    cp assets/icon.icns "$APP_BUNDLE/Contents/Resources/AppIcon.icns"
fi

# Set executable permission
chmod +x "$APP_BUNDLE/Contents/MacOS/$APP_NAME"

# Step 3: Codesign with entitlements
echo "-> Codesigning..."
codesign --force --sign - --entitlements "$ENTITLEMENTS" "$APP_BUNDLE"

echo ""
echo "=== Build complete ==="
echo "App: $APP_BUNDLE"
echo ""
echo "  Run:     open $APP_BUNDLE"
echo "  Install: cp -r $APP_BUNDLE /Applications/"

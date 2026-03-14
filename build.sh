#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# SessionCtl Build Script
#
# Builds the complete macOS app (.app + .dmg) from source.
# Run this on your Mac: ./build.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "  ┌─────────────────────────────────────────────┐"
echo "  │  SessionCtl — Building macOS App             │"
echo "  │  Mission Control for AI Terminal Sessions    │"
echo "  └─────────────────────────────────────────────┘"
echo ""

# Check prerequisites
check_prereq() {
  if ! command -v "$1" &> /dev/null; then
    echo "❌ $1 is required but not installed."
    echo "   Install with: $2"
    exit 1
  fi
  echo "  ✓ $1 found"
}

echo "Checking prerequisites..."
check_prereq "node" "brew install node"
check_prereq "npm" "brew install node"
echo ""

# Step 1: Install root dependencies (Electron + electron-builder)
echo "Step 1/4: Installing Electron & build tools..."
npm install --ignore-scripts 2>&1 | tail -3
echo ""

# Step 2: Install server dependencies
echo "Step 2/4: Installing server dependencies..."
cd server
npm install 2>&1 | tail -3
cd ..
echo ""

# Step 3: Build TypeScript server
echo "Step 3/4: Compiling server..."
cd server
npx tsc
cd ..
echo ""

# Step 4: Generate .icns icon from PNG
echo "Step 4/4: Building macOS app..."

# Convert PNG to icns if sips is available (macOS only)
if command -v sips &> /dev/null && [ -f "assets/icon.png" ]; then
  echo "  Generating app icon..."
  ICONSET="assets/icon.iconset"
  mkdir -p "$ICONSET"
  sips -z 16 16     assets/icon.png --out "$ICONSET/icon_16x16.png"     > /dev/null 2>&1
  sips -z 32 32     assets/icon.png --out "$ICONSET/icon_16x16@2x.png"  > /dev/null 2>&1
  sips -z 32 32     assets/icon.png --out "$ICONSET/icon_32x32.png"     > /dev/null 2>&1
  sips -z 64 64     assets/icon.png --out "$ICONSET/icon_32x32@2x.png"  > /dev/null 2>&1
  sips -z 128 128   assets/icon.png --out "$ICONSET/icon_128x128.png"   > /dev/null 2>&1
  sips -z 256 256   assets/icon.png --out "$ICONSET/icon_128x128@2x.png" > /dev/null 2>&1
  sips -z 256 256   assets/icon.png --out "$ICONSET/icon_256x256.png"   > /dev/null 2>&1
  sips -z 512 512   assets/icon.png --out "$ICONSET/icon_256x256@2x.png" > /dev/null 2>&1
  sips -z 512 512   assets/icon.png --out "$ICONSET/icon_512x512.png"   > /dev/null 2>&1
  sips -z 1024 1024 assets/icon.png --out "$ICONSET/icon_512x512@2x.png" > /dev/null 2>&1
  iconutil -c icns "$ICONSET" -o "assets/icon.icns" 2>/dev/null || true
  rm -rf "$ICONSET"
fi

# Package with electron-builder
npx electron-builder --mac 2>&1 | grep -E "(target|file=|artifactName)" || true

echo ""
echo "  ┌─────────────────────────────────────────────┐"
echo "  │  ✅ Build complete!                          │"
echo "  └─────────────────────────────────────────────┘"
echo ""

# Show output location
if [ -d "dist/mac-arm64" ]; then
  echo "  App:  dist/mac-arm64/SessionCtl.app"
elif [ -d "dist/mac-universal" ]; then
  echo "  App:  dist/mac-universal/SessionCtl.app"
elif [ -d "dist/mac" ]; then
  echo "  App:  dist/mac/SessionCtl.app"
fi

DMG=$(find dist -name "*.dmg" 2>/dev/null | head -1)
if [ -n "$DMG" ]; then
  echo "  DMG:  $DMG"
fi

echo ""
echo "  To install:"
echo "    • Double-click the .dmg and drag SessionCtl to Applications"
echo "    • Or: cp -r dist/mac*/SessionCtl.app /Applications/"
echo ""
echo "  After launching, install the shell companion:"
echo "    echo 'source \"$(pwd)/shell/sessionctl.sh\"' >> ~/.zshrc"
echo ""

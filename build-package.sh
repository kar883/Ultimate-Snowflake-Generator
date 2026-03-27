#!/bin/bash
set -e

echo "================================"
echo "Snowflake Generator Build & Package"
echo "================================"
echo ""

# Check for node and npm
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not found. Please install Node.js first."
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "ERROR: npm not found. Please install npm first."
    exit 1
fi

echo "[1/5] Checking versions..."
node --version
npm --version
echo ""

echo "[2/5] Installing dependencies..."
npm install
echo ""

echo "[3/5] Building Vite frontend..."
npm run build
echo ""

echo "[4/5] Installing electron-builder if needed..."
npm list electron-builder 2>/dev/null || npm install electron-builder --save-dev
echo ""

echo "[5/5] Building Electron packages..."
npm run electron:build
echo ""

echo "================================"
echo "Build complete!"
echo "================================"
echo ""
echo "Output location: dist-electron/"
echo ""
echo "All files:"
ls -la dist-electron/
echo ""

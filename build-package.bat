@echo off
setlocal enabledelayedexpansion

echo ================================
echo Snowflake Generator Build & Package
echo ================================
echo.

REM Check for node and npm
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js not found. Please install Node.js first.
    exit /b 1
)

where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: npm not found. Please install npm first.
    exit /b 1
)

echo [1/5] Checking versions...
node --version
npm --version
echo.

echo [2/5] Installing dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: npm install failed
    exit /b 1
)
echo.

echo [3/5] Building Vite frontend...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Vite build failed
    exit /b 1
)
echo.

echo [4/5] Installing electron-builder if needed...
npm list electron-builder >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Installing electron-builder...
    call npm install electron-builder --save-dev
)
echo.

echo [5/5] Building Electron packages...
call npm run electron:build
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Electron build failed
    exit /b 1
)
echo.

echo ================================
echo Build complete!
echo ================================
echo.
echo Output location: dist-electron/
echo.
echo Windows installers and portable:
dir dist-electron\*.exe 2>nul
echo.
echo All files:
dir /s dist-electron\ 2>nul
echo.
pause

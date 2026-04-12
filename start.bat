@echo off
title TaxIQ
cd /d "%~dp0"

echo.
echo   TaxIQ - FBAR and FATCA Compliance
echo   ==================================
echo.

REM Check if Node.js is installed
where node >nul 2>&1
if errorlevel 1 goto :NO_NODE

REM Check if node_modules exists
if exist "node_modules" goto :DEPS_OK
echo   Installing dependencies - first run only...
call npm install
if errorlevel 1 goto :INSTALL_FAIL
echo.
:DEPS_OK

REM Check if dist exists, build if not
if exist "dist" goto :BUILD_OK
echo   Building app - first run only...
call npm run build
if errorlevel 1 goto :BUILD_FAIL
echo.
:BUILD_OK

echo   Starting server...
echo   Browser will open at http://localhost:3000
echo   Close this window to stop the server.
echo.

REM Open browser after a short delay
start "" cmd /c "ping -n 3 127.0.0.1 >nul & start http://localhost:3000"

REM Run server - keeps this window open
node server.cjs

echo.
echo   Server stopped unexpectedly.
pause
goto :EOF

:NO_NODE
echo   ERROR: Node.js is not installed or not in PATH.
echo   Please install Node.js from https://nodejs.org
pause
goto :EOF

:INSTALL_FAIL
echo   ERROR: npm install failed.
pause
goto :EOF

:BUILD_FAIL
echo   ERROR: Build failed.
pause
goto :EOF

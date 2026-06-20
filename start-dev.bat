@echo off
setlocal

cd /d "%~dp0"
title AI Novel Studio Dev Launcher

echo [AI Novel Studio] Checking environment...

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not added to PATH.
  echo Please install Node.js 18+ first, then run this script again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm is not available.
  echo Please reinstall Node.js, then run this script again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [AI Novel Studio] node_modules not found. Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

if not exist ".env" (
  if exist ".env.example" (
    echo [AI Novel Studio] .env not found. Copying from .env.example...
    copy /y ".env.example" ".env" >nul
  ) else (
    echo [WARN] .env not found. The app may fail if DATABASE_URL or AI config is required.
  )
)

echo [AI Novel Studio] Starting frontend and backend...
echo Frontend: http://localhost:5173
echo Backend : http://localhost:8787
echo.
echo Keep this window open while the app is running.
echo Press Ctrl+C to stop.
echo.

call npm run dev

if errorlevel 1 (
  echo.
  echo [ERROR] Startup failed.
  pause
  exit /b 1
)

endlocal

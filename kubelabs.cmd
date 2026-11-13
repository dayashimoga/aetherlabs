@echo off
setlocal
title KubeLabs - Cloud-Native Lab Platform
echo ==============================================================================
echo  Launching KubeLabs v3.0 (Cloud-Native ^& Kubernetes Learn-by-Doing Engine)
echo ==============================================================================

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] Node.js is required to run KubeLabs. Please install Node.js 22+ from https://nodejs.org
  pause
  exit /b 1
)

echo Starting KubeLabs server at http://127.0.0.1:4100 ...
start "" http://127.0.0.1:4100
node src/server.js

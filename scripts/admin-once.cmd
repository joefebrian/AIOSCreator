@echo off
:: Right-click THIS file → Run as administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo  Klik kanan file ini, pilih "Run as administrator"
  echo  Path: %~f0
  echo.
  pause
  exit /b 1
)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0admin-once.ps1"
echo.
pause

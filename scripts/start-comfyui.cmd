@echo off
:: Double-click: start ComfyUI hidden if :8188 is down.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-comfyui.ps1" -Detach

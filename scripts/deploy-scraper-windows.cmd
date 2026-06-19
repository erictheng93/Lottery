@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-scraper-windows.ps1" %*
set EXITCODE=%ERRORLEVEL%

echo.
if not "%CI%"=="true" pause
exit /b %EXITCODE%

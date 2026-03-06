@echo off
echo ========================================
echo Metro Cache Fix Script
echo ========================================
echo.
echo This script will:
echo 1. Clear Metro bundler cache
echo 2. Clear watchman cache (if available)
echo 3. Restart Metro with clean cache
echo.
echo Press Ctrl+C to cancel, or
pause

echo.
echo [1/3] Clearing Metro cache...
call npx expo start -c --clear

echo.
echo [2/3] Clearing watchman cache (if installed)...
call watchman watch-del-all 2>nul
if %errorlevel% neq 0 (
    echo Watchman not installed, skipping...
)

echo.
echo [3/3] Done!
echo.
echo Now rebuild your app:
echo   For Android: npx expo run:android
echo   For iOS: npx expo run:ios
echo.
pause

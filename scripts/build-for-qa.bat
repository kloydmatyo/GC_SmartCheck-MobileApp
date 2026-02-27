@echo off
REM Build script for QA testing (Windows)
REM This script builds both iOS and Android development clients

echo ================================
echo GC SmartCheck - QA Build Script
echo ================================
echo.

REM Check if EAS CLI is available
where eas >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Checking for npx eas-cli...
    npx eas-cli --version >nul 2>nul
    if %ERRORLEVEL% NEQ 0 (
        echo Installing EAS CLI...
        call npm install -g eas-cli
        if %ERRORLEVEL% NEQ 0 (
            echo Warning: Global install failed, using npx instead
            set EAS_CMD=npx eas-cli
        ) else (
            set EAS_CMD=eas
        )
    ) else (
        set EAS_CMD=npx eas-cli
    )
) else (
    set EAS_CMD=eas
)

echo Using: %EAS_CMD%
echo.

REM Check if logged in
echo Checking Expo authentication...
%EAS_CMD% whoami >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Not logged in. Please login:
    %EAS_CMD% login
    if %ERRORLEVEL% NEQ 0 (
        echo Login failed
        pause
        exit /b 1
    )
)

for /f "tokens=*" %%i in ('%EAS_CMD% whoami') do set EXPO_USER=%%i
echo Logged in as: %EXPO_USER%
echo.

REM Ask which platform to build
echo Which platform do you want to build?
echo 1) iOS only
echo 2) Android only
echo 3) Both iOS and Android
set /p platform_choice="Enter choice (1-3): "

set BUILD_IOS=false
set BUILD_ANDROID=false

if "%platform_choice%"=="1" set BUILD_IOS=true
if "%platform_choice%"=="2" set BUILD_ANDROID=true
if "%platform_choice%"=="3" (
    set BUILD_IOS=true
    set BUILD_ANDROID=true
)

if "%BUILD_IOS%"=="false" if "%BUILD_ANDROID%"=="false" (
    echo Invalid choice
    pause
    exit /b 1
)

echo.
echo ================================
echo Starting build process...
echo ================================
echo.

REM Build iOS
if "%BUILD_IOS%"=="true" (
    echo Building iOS development client...
    echo This will take 20-30 minutes...
    echo.
    
    %EAS_CMD% build --profile development --platform ios --non-interactive
    
    if %ERRORLEVEL% EQU 0 (
        echo.
        echo iOS build completed successfully!
        echo.
        echo To get the download link:
        echo   %EAS_CMD% build:list
        echo.
    ) else (
        echo.
        echo iOS build failed
        echo.
        echo Troubleshooting:
        echo 1. Check build logs: %EAS_CMD% build:list
        echo 2. View specific build: %EAS_CMD% build:view [BUILD_ID]
        echo 3. Try with clean cache: %EAS_CMD% build --profile development --platform ios --clear-cache
        echo.
    )
)

REM Build Android
if "%BUILD_ANDROID%"=="true" (
    echo Building Android development client...
    echo This will take 15-25 minutes...
    echo.
    
    %EAS_CMD% build --profile development --platform android --non-interactive
    
    if %ERRORLEVEL% EQU 0 (
        echo.
        echo Android build completed successfully!
        echo.
        echo To get the download link:
        echo   %EAS_CMD% build:list
        echo.
    ) else (
        echo.
        echo Android build failed
        echo.
        echo Troubleshooting:
        echo 1. Check build logs: %EAS_CMD% build:list
        echo 2. View specific build: %EAS_CMD% build:view [BUILD_ID]
        echo 3. Try with clean cache: %EAS_CMD% build --profile development --platform android --clear-cache
        echo.
    )
)

echo.
echo ================================
echo Build process complete!
echo ================================
echo.
echo Next steps:
echo 1. Get download links: %EAS_CMD% build:list
echo 2. Share links with QA team
echo 3. QA installs using Apple Configurator 2 (iOS) or direct APK install (Android)
echo.
echo For detailed QA instructions, see:
echo   - QA_QUICK_START.md
echo   - IOS_TESTING_GUIDE.md
echo.

pause

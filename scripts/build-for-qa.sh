#!/bin/bash

# Build script for QA testing
# This script builds both iOS and Android development clients

echo "================================"
echo "GC SmartCheck - QA Build Script"
echo "================================"
echo ""

# Check if EAS CLI is available
if ! command -v eas &> /dev/null && ! npx eas-cli --version &> /dev/null; then
    echo "❌ EAS CLI not found"
    echo "Installing EAS CLI..."
    npm install -g eas-cli
    if [ $? -ne 0 ]; then
        echo "⚠️  Global install failed, using npx instead"
        EAS_CMD="npx eas-cli"
    else
        EAS_CMD="eas"
    fi
else
    if command -v eas &> /dev/null; then
        EAS_CMD="eas"
    else
        EAS_CMD="npx eas-cli"
    fi
fi

echo "✅ Using: $EAS_CMD"
echo ""

# Check if logged in
echo "Checking Expo authentication..."
$EAS_CMD whoami &> /dev/null
if [ $? -ne 0 ]; then
    echo "Not logged in. Please login:"
    $EAS_CMD login
    if [ $? -ne 0 ]; then
        echo "❌ Login failed"
        exit 1
    fi
fi

EXPO_USER=$($EAS_CMD whoami)
echo "✅ Logged in as: $EXPO_USER"
echo ""

# Ask which platform to build
echo "Which platform do you want to build?"
echo "1) iOS only"
echo "2) Android only"
echo "3) Both iOS and Android"
read -p "Enter choice (1-3): " platform_choice

BUILD_IOS=false
BUILD_ANDROID=false

case $platform_choice in
    1)
        BUILD_IOS=true
        ;;
    2)
        BUILD_ANDROID=true
        ;;
    3)
        BUILD_IOS=true
        BUILD_ANDROID=true
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "================================"
echo "Starting build process..."
echo "================================"
echo ""

# Build iOS
if [ "$BUILD_IOS" = true ]; then
    echo "📱 Building iOS development client..."
    echo "This will take 20-30 minutes..."
    echo ""
    
    $EAS_CMD build --profile development --platform ios --non-interactive
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ iOS build completed successfully!"
        echo ""
        echo "To get the download link:"
        echo "  $EAS_CMD build:list"
        echo ""
    else
        echo ""
        echo "❌ iOS build failed"
        echo ""
        echo "Troubleshooting:"
        echo "1. Check build logs: $EAS_CMD build:list"
        echo "2. View specific build: $EAS_CMD build:view [BUILD_ID]"
        echo "3. Try with clean cache: $EAS_CMD build --profile development --platform ios --clear-cache"
        echo ""
    fi
fi

# Build Android
if [ "$BUILD_ANDROID" = true ]; then
    echo "🤖 Building Android development client..."
    echo "This will take 15-25 minutes..."
    echo ""
    
    $EAS_CMD build --profile development --platform android --non-interactive
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Android build completed successfully!"
        echo ""
        echo "To get the download link:"
        echo "  $EAS_CMD build:list"
        echo ""
    else
        echo ""
        echo "❌ Android build failed"
        echo ""
        echo "Troubleshooting:"
        echo "1. Check build logs: $EAS_CMD build:list"
        echo "2. View specific build: $EAS_CMD build:view [BUILD_ID]"
        echo "3. Try with clean cache: $EAS_CMD build --profile development --platform android --clear-cache"
        echo ""
    fi
fi

echo ""
echo "================================"
echo "Build process complete!"
echo "================================"
echo ""
echo "Next steps:"
echo "1. Get download links: $EAS_CMD build:list"
echo "2. Share links with QA team"
echo "3. QA installs using Apple Configurator 2 (iOS) or direct APK install (Android)"
echo ""
echo "For detailed QA instructions, see:"
echo "  - QA_QUICK_START.md"
echo "  - IOS_TESTING_GUIDE.md"
echo ""

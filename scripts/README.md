# Build Scripts

Automated scripts to help build the app for QA testing.

## Available Scripts

### build-for-qa.bat (Windows)

```bash
scripts\build-for-qa.bat
```

### build-for-qa.sh (Mac/Linux)

```bash
chmod +x scripts/build-for-qa.sh
./scripts/build-for-qa.sh
```

## What These Scripts Do

1. Check if EAS CLI is installed (install if needed)
2. Verify you're logged into Expo
3. Ask which platform to build (iOS, Android, or both)
4. Start the cloud build process
5. Show download instructions when complete

## Usage

### Windows

Double-click `build-for-qa.bat` or run from PowerShell:

```powershell
.\scripts\build-for-qa.bat
```

### Mac/Linux

```bash
# Make executable (first time only)
chmod +x scripts/build-for-qa.sh

# Run
./scripts/build-for-qa.sh
```

## What You'll See

```
================================
GC SmartCheck - QA Build Script
================================

Using: npx eas-cli
Logged in as: your-email@example.com

Which platform do you want to build?
1) iOS only
2) Android only
3) Both iOS and Android
Enter choice (1-3):
```

## Build Times

- iOS: 20-30 minutes
- Android: 15-25 minutes
- Both: 35-55 minutes (runs sequentially)

## After Build Completes

Get the download links:

```bash
npm run build:list
```

Or visit: https://expo.dev/accounts/[your-account]/projects/[project]/builds

## Troubleshooting

### Script won't run (Mac/Linux)

```bash
chmod +x scripts/build-for-qa.sh
```

### "command not found: eas"

The script will automatically use `npx eas-cli` instead.

### "Not logged in"

The script will prompt you to login:

```bash
eas login
```

### Build fails

Check the logs:

```bash
npm run build:list
npx eas-cli build:view [BUILD_ID]
```

## Alternative: Use npm Scripts

Instead of these scripts, you can use npm commands:

```bash
# Build iOS
npm run build:qa:ios

# Build Android
npm run build:qa:android

# Build both
npm run build:qa:both

# List builds
npm run build:list
```

## See Also

- `DEVELOPER_QA_HANDOFF.md` - Complete guide for sharing builds with QA
- `QA_QUICK_START.md` - Quick reference for QA testers
- `IOS_TESTING_GUIDE.md` - Detailed iOS troubleshooting

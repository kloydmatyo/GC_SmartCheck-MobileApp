# Developer to QA Handoff Guide

This document explains how to build and share the app with your QA team.

---

## Quick Summary

Your QA tester on Mac cannot use Xcode due to compatibility issues. The solution is to use **EAS Build** (cloud build service) which doesn't require local Xcode.

---

## Option 1: You Build, QA Installs (Recommended)

This is the fastest and most reliable approach.

### Step 1: Build the App (You - Developer)

```bash
# Login to Expo (first time only)
npm run eas:login

# Build iOS development client
npm run build:qa:ios

# Or build both iOS and Android
npm run build:qa:both
```

**Wait time:** 20-30 minutes for iOS, 15-25 minutes for Android

### Step 2: Get Download Link

```bash
# List all builds
npm run build:list

# Copy the download URL for the latest build
```

### Step 3: Share with QA

Send your QA tester:

1. The `.ipa` download link (for iOS)
2. The `QA_QUICK_START.md` file
3. Instructions to install using Apple Configurator 2

---

## Option 2: QA Builds Themselves

If your QA wants to build independently:

### Prerequisites (QA needs to do once)

1. **Install Node.js** (v18+)
2. **Clone the repository**
3. **Install dependencies:**
   ```bash
   npm install
   ```

### Building (QA does this)

```bash
# Login to Expo
npm run eas:login

# Build iOS
npm run build:qa:ios

# Wait 20-30 minutes
# Download the .ipa file from the link provided
```

**Give QA these files:**

- `QA_QUICK_START.md` - Quick reference
- `IOS_TESTING_GUIDE.md` - Detailed troubleshooting

---

## Installing on iPhone

### Method 1: Apple Configurator 2 (Easiest)

1. Install "Apple Configurator 2" from Mac App Store (free)
2. Connect iPhone via USB
3. Trust computer on iPhone
4. Open Apple Configurator 2
5. Double-click iPhone
6. Click "Add" → "Apps"
7. Select the `.ipa` file
8. Wait for installation
9. On iPhone: Settings → General → Device Management → Trust developer

### Method 2: TestFlight (Most Professional)

```bash
# After building, submit to TestFlight
npx eas-cli submit --platform ios

# QA receives email invitation
# QA installs TestFlight app
# QA installs your app through TestFlight
```

### Method 3: Diawi (Quick Share)

1. Go to https://www.diawi.com/
2. Upload the `.ipa` file
3. Share the generated link with QA
4. QA opens link on iPhone Safari
5. Tap "Install"
6. Trust developer profile in Settings

---

## Troubleshooting Common Issues

### "npm run build:qa:ios fails"

**Check if logged in:**

```bash
npm run eas:whoami
```

**If not logged in:**

```bash
npm run eas:login
```

### "Build fails with 'No development team'"

**Register QA's device:**

```bash
npx eas-cli device:create
# Send the registration link to QA
# QA opens link on their iPhone
```

### "Build fails with unknown error"

**Try with clean cache:**

```bash
npx eas-cli build --profile development --platform ios --clear-cache
```

**Check build logs:**

```bash
npm run build:list
npx eas-cli build:view [BUILD_ID]
```

### "QA can't install .ipa file"

**Make sure:**

1. QA is using Apple Configurator 2 (not Xcode)
2. iPhone is connected via USB (not WiFi)
3. iPhone is unlocked and trusted
4. Developer profile is trusted on iPhone after installation

---

## npm Scripts Reference

```bash
# Build commands
npm run build:qa:ios          # Build iOS only
npm run build:qa:android      # Build Android only
npm run build:qa:both         # Build both platforms

# Utility commands
npm run build:list            # List all builds
npm run eas:login            # Login to Expo
npm run eas:whoami           # Check who's logged in
```

---

## Alternative: Use Build Scripts

We've created automated scripts for you:

### Windows:

```bash
scripts\build-for-qa.bat
```

### Mac/Linux:

```bash
chmod +x scripts/build-for-qa.sh
./scripts/build-for-qa.sh
```

These scripts will:

1. Check if EAS CLI is installed
2. Login if needed
3. Ask which platform to build
4. Start the build
5. Show download instructions

---

## Cost Considerations

**EAS Build Free Tier:**

- iOS: 30 builds/month
- Android: 30 builds/month

This should be more than enough for QA testing.

If you need more, upgrade to EAS Production plan ($29/month).

---

## Testing Workflow

### For QA Testing Full Features (Scanner, etc.)

1. Developer builds with EAS
2. QA installs the development client
3. Developer runs: `npx expo start --dev-client`
4. QA opens the app on their iPhone
5. App connects to developer's Metro bundler
6. Hot reload works for quick iterations

### For QA Testing UI Only (No Scanner)

1. Developer runs: `npx expo start`
2. QA scans QR code with Expo Go app
3. Faster iteration, but scanner won't work

---

## Files for QA

Make sure QA has access to these files:

- ✅ `QA_QUICK_START.md` - Quick reference guide
- ✅ `IOS_TESTING_GUIDE.md` - Detailed troubleshooting
- ✅ `SETUP_GUIDE.md` - Complete setup documentation
- ✅ `eas.json` - EAS configuration (already in repo)

---

## Expected Timeline

| Task                   | Time              |
| ---------------------- | ----------------- |
| First-time EAS setup   | 5-10 minutes      |
| iOS cloud build        | 20-30 minutes     |
| Android cloud build    | 15-25 minutes     |
| Download .ipa file     | 2-5 minutes       |
| Install on iPhone      | 5 minutes         |
| **Total (first time)** | **30-45 minutes** |
| **Subsequent builds**  | **20-30 minutes** |

---

## When to Rebuild

You need to rebuild when:

- ✅ Native dependencies change (new npm packages)
- ✅ Native configuration changes (app.json, eas.json)
- ✅ Major feature additions

You DON'T need to rebuild for:

- ❌ JavaScript/TypeScript code changes
- ❌ UI changes
- ❌ Business logic changes

For code-only changes, just use: `npx expo start --dev-client`

---

## Support Checklist

If QA is stuck, ask them to provide:

```bash
# System info
node --version
npm --version
sw_vers  # Mac OS version

# EAS info
npx eas-cli --version
npx eas-cli whoami

# Error details
# - Screenshot of error
# - Exact command that failed
# - Full error message
```

---

## Quick Decision Tree

```
Does QA need to test scanner features?
├─ YES → Use development build (EAS)
│   ├─ Developer builds → Share .ipa → QA installs
│   └─ OR QA builds themselves
└─ NO → Use Expo Go
    └─ Developer runs: npx expo start
    └─ QA scans QR code
```

---

## Contact Points

If issues persist:

1. **Check build status:** https://expo.dev/accounts/[your-account]/projects/[project]/builds
2. **EAS Documentation:** https://docs.expo.dev/build/introduction/
3. **Expo Discord:** https://chat.expo.dev/

---

## Summary

**Recommended approach:**

1. You (developer) run: `npm run build:qa:ios`
2. Wait 20-30 minutes
3. Get download link: `npm run build:list`
4. Share link with QA
5. QA installs using Apple Configurator 2
6. Done!

This is faster and more reliable than having QA build themselves.

---

**Last Updated:** February 2026

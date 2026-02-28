# iOS Testing Guide - Mac without Xcode Compatibility

This guide is specifically for QA testers on Mac who cannot use Xcode due to compatibility issues.

---

## Problem

- Mac OS version is not compatible with latest Xcode
- `eas build -p ios` command is failing
- Need to test iOS version of the app

---

## Solutions (In Order of Recommendation)

### Solution 1: Use Pre-built Development Client (Fastest)

If the developer has already created an iOS build, you can install it directly.

#### Steps:

1. **Get the build from developer**
   - Ask developer to share the `.ipa` file or TestFlight link
   - Or download from EAS build dashboard

2. **Install via TestFlight (Easiest)**

   ```bash
   # Developer runs this once:
   eas build --profile development --platform ios
   eas submit --platform ios
   ```

   - You'll receive TestFlight invitation via email
   - Install TestFlight app on your iPhone
   - Accept invitation and install the app

3. **Or install via Apple Configurator 2**
   - Download Apple Configurator 2 from Mac App Store
   - Connect iPhone via USB
   - Drag the `.ipa` file onto your device in Configurator

---

### Solution 2: Fix EAS CLI Installation Issues

If `npm install -g eas-cli` is failing, try these alternatives:

#### Option A: Use npx (No installation needed)

```bash
# Instead of installing globally, use npx
npx eas-cli login
npx eas-cli build --profile development --platform ios
```

#### Option B: Fix npm permissions

```bash
# Check npm prefix
npm config get prefix

# If it's /usr/local, fix permissions
sudo chown -R $(whoami) /usr/local/lib/node_modules
sudo chown -R $(whoami) /usr/local/bin

# Try installing again
npm install -g eas-cli
```

#### Option C: Use Homebrew Node

```bash
# Uninstall current Node
# Install via Homebrew
brew install node

# Try installing EAS CLI again
npm install -g eas-cli
```

#### Option D: Install locally in project

```bash
# Navigate to project
cd /path/to/GC_SmartCheck-MobileApp

# Install as dev dependency
npm install --save-dev eas-cli

# Use via npx
npx eas login
npx eas build --profile development --platform ios
```

---

### Solution 3: Troubleshoot Specific EAS Build Errors

#### Error: "Xcode version not compatible"

**Solution:** Use EAS cloud build (doesn't require local Xcode)

```bash
# Make sure you're using cloud build, not local
eas build --profile development --platform ios --non-interactive
```

#### Error: "Apple Developer account required"

**Solution:**

1. Create free Apple Developer account at https://developer.apple.com
2. Login to EAS with Apple ID:
   ```bash
   eas device:create
   ```
3. Register your iPhone UDID
4. Build again

#### Error: "UDID not registered"

**Solution:**

```bash
# Register your iPhone
eas device:create

# Follow prompts to register device
# Then build again
eas build --profile development --platform ios
```

#### Error: "Build failed with unknown error"

**Solution:**

```bash
# Check build logs
eas build:list

# View specific build
eas build:view [BUILD_ID]

# Try with verbose logging
eas build --profile development --platform ios --clear-cache
```

---

### Solution 4: Use Expo Go for Non-Scanner Features

If you only need to test UI and non-scanner features:

```bash
# Start development server
npx expo start

# Scan QR code with Expo Go app on iPhone
```

**Limitations:**

- ❌ Scanner won't work
- ❌ Native modules won't work
- ✅ UI testing works
- ✅ Navigation works
- ✅ Firebase works

---

### Solution 5: Request Developer to Build for You

If all else fails, the developer can build and share:

#### Developer Steps:

```bash
# Build development client
eas build --profile development --platform ios

# After build completes, get the URL
# Share the .ipa download link with QA
```

#### QA Steps:

1. Download the `.ipa` file
2. Install using one of these methods:
   - **TestFlight** (if submitted)
   - **Apple Configurator 2** (Mac)
   - **Diawi** (https://www.diawi.com/) - Upload .ipa, get install link

---

## Detailed: Installing .ipa Without Xcode

### Method 1: Apple Configurator 2 (Mac)

1. **Install Apple Configurator 2**
   - Open Mac App Store
   - Search "Apple Configurator 2"
   - Install (free)

2. **Connect iPhone**
   - Use USB cable
   - Trust computer on iPhone

3. **Install App**
   - Open Apple Configurator 2
   - Double-click your device
   - Click "Add" → "Apps"
   - Select the `.ipa` file
   - Click "Add"

### Method 2: Diawi (Any Platform)

1. **Upload .ipa**
   - Go to https://www.diawi.com/
   - Drag `.ipa` file
   - Wait for upload

2. **Install on iPhone**
   - Open the Diawi link on iPhone Safari
   - Tap "Install"
   - Go to Settings → General → Device Management
   - Trust the developer profile
   - Open the app

### Method 3: TestFlight (Recommended)

1. **Developer submits to TestFlight**

   ```bash
   eas submit --platform ios
   ```

2. **QA receives email invitation**
   - Install TestFlight app from App Store
   - Open invitation email on iPhone
   - Tap "View in TestFlight"
   - Install the app

---

## Quick Diagnostic Commands

Run these to help identify the issue:

```bash
# Check Node version
node --version
# Should be v18 or higher

# Check npm version
npm --version

# Check if eas-cli is installed
eas --version
# Or try: npx eas-cli --version

# Check Expo account
npx eas whoami

# Check project configuration
npx eas build:configure

# List previous builds
npx eas build:list
```

---

## Common Error Messages and Solutions

### "command not found: eas"

```bash
# Use npx instead
npx eas-cli login
npx eas-cli build --profile development --platform ios
```

### "EACCES: permission denied"

```bash
# Fix npm permissions
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules
```

### "No development team found"

```bash
# Register device first
npx eas device:create

# Then build
npx eas build --profile development --platform ios
```

### "Build failed: Xcode version mismatch"

This is expected - EAS will use cloud Xcode, not your local one. Make sure you're not using `--local` flag.

```bash
# Correct (uses cloud):
eas build --profile development --platform ios

# Wrong (tries to use local Xcode):
eas build --profile development --platform ios --local
```

---

## What Information to Provide if Still Stuck

If none of these solutions work, provide this information:

```bash
# Run these commands and share output:
node --version
npm --version
npx eas-cli --version
npx eas whoami
sw_vers  # Mac OS version

# Also share:
# 1. Exact error message
# 2. Full command you ran
# 3. Screenshot of error
```

---

## Alternative: Use Android for Testing

If iOS testing is blocked, you can test on Android instead:

1. **Install Android Studio** (works on Mac)
2. **Create Android Emulator**
3. **Run app:**
   ```bash
   npx expo run:android
   ```

Most features are identical between iOS and Android in this app.

---

## Contact Developer

If you're completely stuck:

1. Share the exact error message
2. Share output of diagnostic commands above
3. Request a pre-built `.ipa` file
4. Request TestFlight invitation

---

**Last Updated:** February 2026

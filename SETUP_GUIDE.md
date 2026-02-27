# GC SmartCheck Mobile App - Complete Setup Guide

This guide covers setting up the development environment for both Android and iOS platforms.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Project Setup](#project-setup)
3. [Android Setup](#android-setup)
4. [iOS Setup](#ios-setup)
5. [Running the App](#running-the-app)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **Git** - [Download](https://git-scm.com/)
- **Code Editor** (VS Code recommended) - [Download](https://code.visualstudio.com/)

### Check Installations

```bash
node --version
npm --version
git --version
```

---

## Project Setup

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd GC_SmartCheck-MobileApp
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env.local` file in the project root:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

### 4. Generate Native Projects

```bash
npx expo prebuild
```

This creates the `android/` and `ios/` folders with native code.

---

## Android Setup

### Part A: Install Android Studio

#### 1. Download Android Studio

- Visit: https://developer.android.com/studio
- Download the Windows installer (~1GB)
- Run the installer

#### 2. Installation Options

During installation, ensure these are checked:

- ✅ Android SDK
- ✅ Android SDK Platform
- ✅ Android Virtual Device
- ✅ Performance (Intel HAXM)

#### 3. First Launch Setup

1. Open Android Studio
2. Choose **"Standard"** installation type
3. Select your preferred theme
4. Wait for SDK components to download (~5-10GB, 20-30 minutes)

### Part B: Configure SDK Components

#### 1. Open SDK Manager

- Click `Tools` → `SDK Manager`
- Or click the SDK Manager icon in the toolbar

#### 2. Install SDK Platforms

In the **"SDK Platforms"** tab:

- ✅ Android 13.0 (Tiramisu) - API Level 33
- ✅ Android 12.0 (S) - API Level 31
- Click "Show Package Details" (bottom right)
- Expand "Android 13.0 (Tiramisu)":
  - ✅ Android SDK Platform 33
  - ✅ Google APIs Intel x86_64 Atom System Image
- Click **"Apply"** → **"OK"**
- Wait for download

#### 3. Install SDK Tools

In the **"SDK Tools"** tab:

- ✅ Android SDK Build-Tools
- ✅ Android SDK Command-line Tools (latest)
- ✅ Android SDK Platform-Tools
- ✅ Android Emulator
- ✅ Intel x86 Emulator Accelerator (HAXM installer)
- Click **"Apply"** → **"OK"**

### Part C: Set Environment Variables

#### Windows (PowerShell as Administrator)

1. **Open PowerShell as Administrator**
   - Press `Win + X`
   - Click "Windows PowerShell (Admin)"

2. **Set ANDROID_HOME**

```powershell
[System.Environment]::SetEnvironmentVariable('ANDROID_HOME', 'C:\Users\Administrator\AppData\Local\Android\Sdk', 'User')
```

3. **Add Android Tools to PATH**

```powershell
$currentPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
$androidPaths = "$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:ANDROID_HOME\tools;$env:ANDROID_HOME\tools\bin;$env:ANDROID_HOME\cmdline-tools\latest\bin"
[System.Environment]::SetEnvironmentVariable('Path', "$currentPath;$androidPaths", 'User')
```

4. **Verify Installation**
   - Close PowerShell completely
   - Open a new PowerShell window
   - Run:

```powershell
adb --version
```

You should see: `Android Debug Bridge version X.X.X`

If you get an error, restart your computer.

### Part D: Setup Testing Device

#### Option 1: Physical Android Phone (Recommended)

##### 1. Enable Developer Mode

1. Open **Settings** on your Android phone
2. Go to **About Phone** (or System → About Phone)
3. Find **"Build Number"**
4. **Tap it 7 times rapidly**
5. You'll see: "You are now a developer!"

##### 2. Enable USB Debugging

1. Go back to **Settings**
2. Find **"Developer Options"** (usually under System)
3. Turn ON **"USB Debugging"**
4. Turn ON **"Install via USB"** (if available)

##### 3. Connect Phone

1. Use a **data-capable USB cable** (not charge-only)
2. Plug phone into computer
3. On your phone, you'll see: **"Allow USB debugging?"**
4. Check **"Always allow from this computer"**
5. Tap **"Allow"**

##### 4. Select USB Mode

- Swipe down from top of phone
- Tap USB notification
- Select **"Transfer files / Android Auto"**

##### 5. Verify Connection

```powershell
adb devices
```

You should see:

```
List of devices attached
ABC123XYZ    device
```

#### Option 2: Android Emulator

##### 1. Create Virtual Device

1. In Android Studio, click `Tools` → `Device Manager`
2. Click **"Create Device"**
3. Select **"Phone"** category
4. Choose **"Pixel 5"** → Click **"Next"**
5. Select **"Tiramisu"** (API Level 33)
   - If not downloaded, click "Download" and wait
6. Click **"Next"**
7. Name it (e.g., "Pixel_5_API_33")
8. Click **"Finish"**

##### 2. Start Emulator

1. In Device Manager, find your device
2. Click the **▶️ Play** button
3. Wait 2-5 minutes for emulator to boot

##### 3. Verify Emulator

```powershell
adb devices
```

You should see:

```
List of devices attached
emulator-5554    device
```

### Part E: Build and Run Android App

#### First Build (10-20 minutes)

```powershell
# Navigate to project
cd "C:\path\to\GC_SmartCheck-MobileApp"

# Build and run on physical phone
npx expo run:android --device

# OR build and run on emulator
npx expo run:android
```

#### Subsequent Runs (2-3 minutes)

After the first build, use development mode for faster updates:

```powershell
# Start Metro bundler
npx expo start --dev-client

# Then open the app manually on your phone/emulator
```

The app will connect automatically and support hot reload!

---

## iOS Setup

### Prerequisites

⚠️ **Important**: iOS development requires a Mac computer. If you're on Windows, see [Alternative: EAS Build](#alternative-eas-build-for-windows-users).

### Part A: Install Xcode (Mac Only)

#### 1. Install Xcode

1. Open **App Store** on Mac
2. Search for **"Xcode"**
3. Click **"Get"** (free, ~12GB download)
4. Wait for installation (30-60 minutes)

#### 2. Install Command Line Tools

```bash
xcode-select --install
```

Click "Install" when prompted.

#### 3. Accept Xcode License

```bash
sudo xcodebuild -license accept
```

#### 4. Install CocoaPods

```bash
sudo gem install cocoapods
```

### Part B: Setup Testing Device

#### Option 1: Physical iPhone (Recommended)

##### 1. Connect iPhone

1. Use a Lightning/USB-C cable
2. Plug iPhone into Mac
3. On iPhone, tap **"Trust This Computer"**
4. Enter your iPhone passcode

##### 2. Configure Signing

1. Open Xcode
2. Go to **Preferences** → **Accounts**
3. Click **"+"** → **"Apple ID"**
4. Sign in with your Apple ID (free account works)

##### 3. Verify Connection

```bash
xcrun xctrace list devices
```

You should see your iPhone listed.

#### Option 2: iOS Simulator

The simulator is automatically installed with Xcode.

To list available simulators:

```bash
xcrun simctl list devices
```

### Part C: Build and Run iOS App

#### First Build (15-30 minutes)

```bash
# Navigate to project
cd /path/to/GC_SmartCheck-MobileApp

# Install iOS dependencies
cd ios
pod install
cd ..

# Build and run on physical iPhone
npx expo run:ios --device

# OR build and run on simulator
npx expo run:ios
```

#### Subsequent Runs

```bash
# Start Metro bundler
npx expo start --dev-client

# Then open the app manually on your iPhone/simulator
```

### Alternative: EAS Build (For Windows Users)

If you don't have a Mac, you can build iOS apps in the cloud:

#### 1. Install EAS CLI

```powershell
npm install -g eas-cli
```

#### 2. Login to Expo

```powershell
eas login
```

Create an account at https://expo.dev if needed.

#### 3. Configure EAS

```powershell
eas build:configure
```

#### 4. Build for iOS

```powershell
# Development build
eas build --profile development --platform ios

# Production build
eas build --profile production --platform ios
```

The build happens in the cloud (20-30 minutes). You'll get a download link for the `.ipa` file.

#### 5. Install on iPhone

**Option A: Using TestFlight (Recommended)**

1. Submit the build to TestFlight
2. Install TestFlight app on your iPhone
3. Install your app through TestFlight

**Option B: Using Apple Configurator**

1. Download Apple Configurator 2 on Mac
2. Connect iPhone
3. Drag the `.ipa` file to install

---

## Running the App

### Quick Start Commands

#### For Development (Hot Reload)

```bash
# Start Metro bundler
npx expo start --dev-client

# Then open the app on your device
```

#### For Android

```bash
# Physical phone
npx expo run:android --device

# Emulator
npx expo run:android
```

#### For iOS (Mac only)

```bash
# Physical iPhone
npx expo run:ios --device

# Simulator
npx expo run:ios
```

### Testing Without Scanner (Expo Go)

For quick UI testing without native features:

```bash
npx expo start
```

Then scan the QR code with Expo Go app. Note: Scanner won't work in Expo Go.

---

## Troubleshooting

### Android Issues

#### "adb not found"

**Solution:**

1. Restart your computer
2. Verify environment variables are set
3. Run: `adb --version`

#### "No devices found"

**Solution:**

```powershell
# Restart ADB
adb kill-server
adb start-server
adb devices
```

#### "Unauthorized device"

**Solution:**

1. Unplug and replug USB cable
2. Check phone for USB debugging prompt
3. Select "Always allow from this computer"

#### Gradle build fails

**Solution:**

```powershell
cd android
.\gradlew clean
cd ..
npx expo run:android
```

#### Emulator won't start

**Solution:**

1. Enable virtualization in BIOS
2. Install Intel HAXM:
   ```powershell
   C:\Users\Administrator\AppData\Local\Android\Sdk\extras\intel\Hardware_Accelerated_Execution_Manager\intelhaxm-android.exe
   ```

### iOS Issues

#### "Command not found: xcode-select"

**Solution:**
Install Xcode from App Store first.

#### "No provisioning profile"

**Solution:**

1. Open Xcode
2. Go to Preferences → Accounts
3. Add your Apple ID
4. Let Xcode manage signing automatically

#### CocoaPods installation fails

**Solution:**

```bash
# Update Ruby gems
sudo gem update --system

# Install CocoaPods
sudo gem install cocoapods

# If still fails, use Homebrew
brew install cocoapods
```

#### Build fails with "Module not found"

**Solution:**

```bash
cd ios
pod deintegrate
pod install
cd ..
npx expo run:ios
```

### General Issues

#### Metro bundler port conflict

**Solution:**

```bash
# Kill process on port 8081
npx react-native start --reset-cache
```

#### Cache issues

**Solution:**

```bash
# Clear all caches
npx expo start --clear

# Or manually
rm -rf node_modules
npm install
npx expo prebuild --clean
```

#### OpenCV not working in Expo Go

**Expected behavior:** OpenCV requires native code and won't work in Expo Go. You must use a development build.

---

## Development Workflow

### Recommended Workflow

1. **For UI/non-scanner features:**

   ```bash
   npx expo start
   # Use Expo Go for fast iteration
   ```

2. **For scanner testing:**
   ```bash
   npx expo start --dev-client
   # Use development build with full features
   ```

### Making Changes

1. Edit your code
2. Save the file
3. App automatically reloads (hot reload)
4. If hot reload doesn't work, press `r` in Metro terminal

### Building for Production

#### Android APK

```bash
cd android
./gradlew assembleRelease
```

APK location: `android/app/build/outputs/apk/release/app-release.apk`

#### iOS IPA (Mac)

```bash
# Using EAS (recommended)
eas build --profile production --platform ios

# Or using Xcode
# Open ios/GCSmartCheckMobileApp.xcworkspace in Xcode
# Product → Archive → Distribute App
```

---

## Additional Resources

- **Expo Documentation:** https://docs.expo.dev/
- **React Native Documentation:** https://reactnative.dev/
- **Android Studio Guide:** https://developer.android.com/studio/intro
- **Xcode Guide:** https://developer.apple.com/xcode/
- **EAS Build:** https://docs.expo.dev/build/introduction/

---

## Support

For issues specific to this project, please contact the development team or create an issue in the repository.

---

**Last Updated:** February 2026

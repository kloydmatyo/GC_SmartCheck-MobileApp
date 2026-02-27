# QA Quick Start - iOS Testing on Mac

## TL;DR - Fastest Way to Test

### Option 1: Get Pre-built App from Developer (5 minutes)

**Ask developer to run:**

```bash
eas build --profile development --platform ios
```

**Then you:**

1. Get the download link from developer
2. Download `.ipa` file
3. Install using Apple Configurator 2 (see below)

---

### Option 2: Use npx (No Installation) (30 minutes)

```bash
# 1. Navigate to project
cd /path/to/GC_SmartCheck-MobileApp

# 2. Login to Expo
npx eas-cli login

# 3. Register your iPhone
npx eas-cli device:create
# Follow the prompts - you'll need to open a link on your iPhone

# 4. Build the app
npx eas-cli build --profile development --platform ios

# 5. Wait 20-30 minutes for cloud build
# You'll get a download link when done

# 6. Download and install the .ipa file
```

---

## Installing .ipa File on iPhone

### Using Apple Configurator 2 (Easiest)

1. **Install Apple Configurator 2**
   - Open Mac App Store
   - Search "Apple Configurator 2"
   - Click "Get" (it's free)

2. **Connect iPhone**
   - Plug iPhone into Mac with USB cable
   - Unlock iPhone
   - Tap "Trust" when prompted

3. **Install App**
   - Open Apple Configurator 2
   - You'll see your iPhone
   - Double-click your iPhone icon
   - Click "Add" button (top menu)
   - Select "Apps"
   - Choose the `.ipa` file you downloaded
   - Click "Add"
   - Wait for installation

4. **Trust Developer**
   - On iPhone: Settings → General → VPN & Device Management
   - Tap the developer profile
   - Tap "Trust"

5. **Open App**
   - Find the app on your home screen
   - Tap to open

---

## If npx eas-cli Doesn't Work

### Try These in Order:

#### 1. Check Node Version

```bash
node --version
# Should be v18 or higher
# If not, update Node.js
```

#### 2. Fix npm Permissions

```bash
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules
```

#### 3. Use Project-local Installation

```bash
cd /path/to/GC_SmartCheck-MobileApp
npm install eas-cli
npx eas login
npx eas build --profile development --platform ios
```

#### 4. Reinstall Node via Homebrew

```bash
# Install Homebrew if you don't have it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node
brew install node

# Try again
npx eas-cli --version
```

---

## Troubleshooting Specific Errors

### Error: "command not found: eas"

**Solution:** Use `npx eas-cli` instead of `eas`

### Error: "EACCES: permission denied"

**Solution:** Run the permission fix commands above

### Error: "No Apple Developer account"

**Solution:**

1. Go to https://developer.apple.com
2. Sign in with your Apple ID (free account is fine)
3. Accept terms
4. Try building again

### Error: "Device not registered"

**Solution:**

```bash
npx eas-cli device:create
# Follow the link on your iPhone to register
```

### Error: "Build failed"

**Solution:**

```bash
# Check what went wrong
npx eas-cli build:list
npx eas-cli build:view [BUILD_ID]

# Try again with clean cache
npx eas-cli build --profile development --platform ios --clear-cache
```

---

## Testing Without Full Build (Limited Features)

If you just need to test UI and non-scanner features:

```bash
# 1. Start development server
npx expo start

# 2. Install "Expo Go" app from App Store on iPhone

# 3. Scan the QR code shown in terminal

# Note: Scanner feature won't work in Expo Go
```

---

## What to Do If Completely Stuck

1. **Take screenshots** of any error messages

2. **Run diagnostic commands:**

   ```bash
   node --version
   npm --version
   npx eas-cli --version
   sw_vers
   ```

3. **Share with developer:**
   - Screenshots
   - Output from commands above
   - Exact command you ran

4. **Request pre-built .ipa:**
   - Developer can build and share the file
   - You just install it (much faster)

---

## Expected Timeline

- **Using pre-built .ipa:** 5 minutes
- **Building yourself (first time):** 30-40 minutes
  - Setup: 5-10 minutes
  - Cloud build: 20-30 minutes
  - Installation: 5 minutes
- **Building yourself (subsequent):** 20-30 minutes
  - Cloud build: 20-30 minutes
  - Installation: 5 minutes

---

## Need Help?

Contact the developer with:

1. Your Mac OS version: `sw_vers`
2. Your Node version: `node --version`
3. Screenshot of error
4. Exact command that failed

---

## Quick Command Reference

```bash
# Check versions
node --version
npm --version
npx eas-cli --version

# Login
npx eas-cli login

# Register device
npx eas-cli device:create

# Build
npx eas-cli build --profile development --platform ios

# Check build status
npx eas-cli build:list

# View build details
npx eas-cli build:view [BUILD_ID]
```

---

**Pro Tip:** Bookmark this page and the iOS_TESTING_GUIDE.md for detailed troubleshooting.

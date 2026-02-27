# How to Build iOS App for Your QA

Follow these steps exactly to build the iOS app and share it with your QA.

---

## Step 1: Create Expo Account (First Time Only)

1. Go to https://expo.dev/signup
2. Sign up with your email
3. Verify your email
4. Remember your username and password

---

## Step 2: Login to EAS

```powershell
npx eas-cli login
```

Enter your Expo username/email and password.

**Troubleshooting:**

- If you get "command not found", that's okay - npx will download it
- If login fails, double-check your password
- If you forgot password, reset it at https://expo.dev/forgot-password

---

## Step 3: Configure EAS (First Time Only)

```powershell
npx eas-cli build:configure
```

This creates the `eas.json` file (already done in your project).

---

## Step 4: Build iOS App

```powershell
npx eas-cli build --profile development --platform ios
```

**What happens:**

1. EAS uploads your code to the cloud
2. Cloud builds the iOS app (takes 20-30 minutes)
3. You get a download link when done

**During the build, you'll be asked:**

- "Generate a new Apple Distribution Certificate?" → Press `Y` (Yes)
- "Generate a new Apple Provisioning Profile?" → Press `Y` (Yes)

**Wait for the build to complete.** You'll see:

```
✔ Build finished
Download URL: https://expo.dev/artifacts/eas/...
```

---

## Step 5: Get the Download Link

After build completes:

```powershell
npx eas-cli build:list
```

Copy the download URL for the latest iOS build.

**Or visit:** https://expo.dev/accounts/[your-username]/projects/gc_smartcheck-mobileapp/builds

---

## Step 6: Share with QA

Send your QA:

1. The `.ipa` download link
2. The file `QA_QUICK_START.md`
3. Tell them to install using Apple Configurator 2

---

## Common Issues

### "Login failed"

- Check your username/password
- Create account at https://expo.dev/signup if you don't have one

### "No Apple Developer account"

- You need a free Apple ID
- Go to https://developer.apple.com
- Sign in with your Apple ID
- Accept terms

### "Build failed"

```powershell
# View error details
npx eas-cli build:view [BUILD_ID]

# Try again with clean cache
npx eas-cli build --profile development --platform ios --clear-cache
```

### "UDID not registered"

Your QA needs to register their iPhone:

```powershell
# Send this link to QA
npx eas-cli device:create
```

QA opens the link on their iPhone to register.

---

## Quick Commands Reference

```powershell
# Login
npx eas-cli login

# Check who's logged in
npx eas-cli whoami

# Build iOS
npx eas-cli build --profile development --platform ios

# List all builds
npx eas-cli build:list

# View specific build
npx eas-cli build:view [BUILD_ID]

# Register QA's device
npx eas-cli device:create
```

---

## Alternative: Use the Build Script

Instead of typing commands, you can run:

```powershell
.\scripts\build-for-qa.bat
```

This script will:

1. Check if you're logged in
2. Ask which platform to build
3. Start the build
4. Show download instructions

---

## Cost

**Free tier includes:**

- 30 iOS builds per month
- 30 Android builds per month

This should be enough for QA testing.

---

## After First Build

Once you've built once, subsequent builds are easier:

```powershell
# Just run this
npx eas-cli build --profile development --platform ios

# Wait 20-30 minutes
# Get download link
npx eas-cli build:list
```

---

## When to Rebuild

Rebuild when:

- ✅ You add new npm packages
- ✅ You change app.json or eas.json
- ✅ You want QA to test new features

Don't rebuild for:

- ❌ Code changes (use dev mode instead)
- ❌ UI tweaks
- ❌ Bug fixes

For code-only changes:

```powershell
# You run this
npx expo start --dev-client

# QA opens the already-installed app
# Changes appear automatically (hot reload)
```

---

## Need Help?

If you get stuck:

1. Check build status: https://expo.dev
2. View build logs: `npx eas-cli build:list`
3. Share error message with your team

---

**Next:** After building, give your QA the `QA_QUICK_START.md` file for installation instructions.

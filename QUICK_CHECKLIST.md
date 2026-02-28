# Quick Checklist - Build iOS for QA

## ☐ Step 1: Create Expo Account

- Go to: https://expo.dev/signup
- Sign up and verify email

## ☐ Step 2: Login

```powershell
npx eas-cli login
```

Enter your Expo credentials

## ☐ Step 3: Build

```powershell
npx eas-cli build --profile development --platform ios
```

Wait 20-30 minutes

## ☐ Step 4: Get Download Link

```powershell
npx eas-cli build:list
```

Copy the download URL

## ☐ Step 5: Share with QA

- Send QA the `.ipa` download link
- Send QA the `QA_QUICK_START.md` file
- QA installs using Apple Configurator 2

---

## That's it!

**Total time:** 30-40 minutes (mostly waiting for build)

**See detailed guide:** `BUILD_IOS_FOR_QA.md`

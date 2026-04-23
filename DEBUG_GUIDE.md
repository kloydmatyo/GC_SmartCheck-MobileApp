# 🐛 Debug Guide for Archive Error

## Step 1: View Errors on Android Phone
When you try to archive an exam and it fails:
- An **Alert popup** will appear on your phone
- It will show: `Archive Failed` with the error message
- Tap **"Copy Error"** to copy the full error details to clipboard
- Tap **"OK"** to dismiss

## Step 2: View Detailed Logs in PowerShell

### Option A: Using the PowerShell Script (Easiest)
```powershell
cd c:\GC_SmartCheck-MobileApp
.\view-android-logs.ps1
```

Then:
1. Use the app and trigger the archive error
2. The script will show filtered logs with errors
3. Press Ctrl+C to stop

### Option B: Manual adb logcat
```powershell
# View all logs
adb logcat

# View only our app's logs (with filtering)
adb logcat | Select-String -Pattern "ExamPreview|ExamService|Archive|FAILED|ERROR"

# Clear logs before testing
adb logcat -c
```

### Option C: Save logs to file
```powershell
# Capture logs to a file
adb logcat > C:\logs.txt

# View the file
Get-Content C:\logs.txt -Tail 100
```

## Step 3: Understanding the Error

When you see the error alert on your phone, it will tell you:
- **Error Message**: What went wrong (e.g., "Cannot read property X")
- **Stack Trace**: Where in the code it failed

### Common Errors:

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot read property '...' of undefined` | Variable is null/undefined | Check if cached exam exists |
| `Network error` | Lost connection | Automatic fallback to offline queue |
| `Permission denied` | Not authorized | Check user ID matches exam creator |
| `Exam not found` | Exam doesn't exist | Refresh exam list |

## Step 4: Reproduce the Error

To consistently reproduce and debug:
1. Go to an exam
2. Turn OFF internet (use dev tools or disable WiFi)
3. Tap the settings menu (gear icon)
4. Tap "Archive Exam"
5. Check the Alert popup for error message
6. Check PowerShell (run the script) for full stack trace

## Quick Tips

**On Phone:**
- Alert shows the error message
- Toast notifications appear at bottom
- Can copy errors to clipboard

**In PowerShell:**
- Run the script to see live logs
- Logs show exact line numbers where it fails
- Stack trace shows the call chain

**Still not working?**
- Make sure ADB is installed: `adb version`
- Make sure phone is connected: `adb devices`
- Check phone is in developer mode
- Try: `adb kill-server` then `adb start-server`

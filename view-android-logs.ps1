# View Android logs in PowerShell
# Usage: .\view-android-logs.ps1

Write-Host "📱 Connecting to Android device logs..." -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

# Check if adb is available
$adbPath = "adb"
if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
    Write-Host "❌ ADB not found in PATH" -ForegroundColor Red
    Write-Host "Make sure Android SDK is installed and adb is in your PATH" -ForegroundColor Yellow
    exit 1
}

# Clear previous logs
Write-Host "Clearing previous logs..." -ForegroundColor Gray
adb logcat -c

Write-Host "✅ Now use the app and trigger the error..." -ForegroundColor Green
Write-Host ""

# Show logs with filtering for our app and errors
adb logcat | Select-String -Pattern "ExamPreview|ExamService|Archive|FAILED|ERROR" -ErrorAction SilentlyContinue

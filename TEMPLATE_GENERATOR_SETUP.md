# Template Generator Setup - Complete

## ✅ What Was Implemented

### 1. Template PDF Generator Service
**File**: `services/templatePdfGenerator.ts`
- Generates PDFs for 20, 50, and 100 question templates
- Uses expo-print (HTML to PDF) for React Native compatibility
- Includes Gordon College logo
- Automatic file sharing after generation

### 2. Templates Management Screen
**File**: `app/(tabs)/templates.tsx`
- View all templates
- Search and filter functionality
- Archive/restore templates
- Delete templates
- Download PDFs with one tap
- Pagination support
- Dark mode support

### 3. Auto-Generation on Exam Creation
**File**: `app/(tabs)/create-quiz.tsx`
- Templates are automatically created when you create a new exam
- Template includes:
  - Exam name
  - Number of questions
  - Exam code
  - Class information
  - Instructor ID

### 4. Auto-Update on Exam Edit
**File**: `app/(tabs)/edit-exam.tsx`
- Templates are automatically updated when you edit an exam
- Updates template name and description if exam title changes

## 🧪 How to Test

### Step 1: Create a New Exam
1. Open your app
2. Go to **Create Quiz** or **Exams** screen
3. Create a new exam with:
   - Title: "Test Exam 1"
   - Number of questions: 20, 50, or 100
   - Select a class
   - Add an exam code (e.g., "EXAM001")
4. Save the exam

### Step 2: View the Template
1. Go to the **Generator** tab
2. Tap **"View Templates"**
3. You should see your newly created template:
   - Name: "Test Exam 1_Template"
   - Description: "Answer sheet template for Test Exam 1"
   - Number of questions: (whatever you selected)

### Step 3: Download the PDF
1. Find your template in the list
2. Tap the **"Download"** button
3. Wait for the PDF to generate (you'll see a toast notification)
4. The native share dialog will open
5. Choose to:
   - Save to Files
   - Share via email
   - Print directly
   - Send to cloud storage

### Step 4: Verify the PDF
Open the downloaded PDF and check:
- ✅ Gordon College logo (if available)
- ✅ Exam code displayed
- ✅ Name and Date fields
- ✅ Student ID bubble grid (10 digits, 0-9)
- ✅ Answer bubbles (A-E)
- ✅ Corner markers (black squares in all 4 corners)
- ✅ Correct number of questions

### Step 5: Test Edit Functionality
1. Edit the exam (change the title)
2. Save the changes
3. Go back to Templates screen
4. Verify the template name and description updated

### Step 6: Test Archive/Restore
1. In Templates screen, tap **"Archive"** on a template
2. Confirm the action
3. Toggle **"View Archived"** to see archived templates
4. Tap **"Restore"** to restore it
5. Toggle back to active templates to see it restored

## 📋 Template Types

### 20 Questions
- 4 mini sheets per page (2×2 grid)
- Perfect for short quizzes
- Each mini sheet is identical

### 50 Questions
- 2 sheets per page (side by side)
- Good for medium-length exams
- Each sheet is identical

### 100 Questions
- Full page single sheet
- For comprehensive exams
- ZipGrade-compatible layout

## 🔧 Troubleshooting

### No Templates Showing
**Problem**: Created an exam but don't see any templates

**Solution**:
1. Check console logs for errors during exam creation
2. Verify you're logged in with the same account
3. Make sure the exam has `instructorId` field set
4. Try creating a new exam and watch the console

### PDF Not Generating
**Problem**: Download button doesn't work or fails

**Solution**:
1. Check console logs for errors
2. Verify expo-print is installed: `npm list expo-print`
3. Check if logo exists at `assets/images/gordon-college-logo.png`
4. Try without logo (it should still work)

### Share Dialog Not Opening
**Problem**: PDF generates but share dialog doesn't appear

**Solution**:
1. Verify expo-sharing is installed: `npm list expo-sharing`
2. Check device permissions
3. Try on a different device/emulator

### Template Not Updating When Exam Edited
**Problem**: Changed exam title but template didn't update

**Solution**:
1. Check console logs for template update errors
2. Verify the template has `examId` field
3. Try refreshing the Templates screen

## 📱 Navigation

### Access Templates Screen:
1. **Via Generator Tab**: Generator → "View Templates" button
2. **Direct**: Navigate to `/(tabs)/templates`

### Add to Tab Navigation (Optional):
If you want templates as a separate tab, edit `app/(tabs)/_layout.tsx` and add:
```tsx
<Tabs.Screen
  name="templates"
  options={{
    title: 'Templates',
    tabBarIcon: ({ color }) => <Ionicons name="document-text" size={28} color={color} />,
  }}
/>
```

## 🎯 Key Features

- ✅ Automatic template creation on exam creation
- ✅ Automatic template update on exam edit
- ✅ Search templates by name, description, class, or exam
- ✅ Filter by class or exam
- ✅ Archive/restore functionality
- ✅ Delete archived templates
- ✅ One-tap PDF download
- ✅ Native file sharing
- ✅ Pagination (9 items per page)
- ✅ Dark mode support
- ✅ Responsive design

## 📦 Dependencies

All required dependencies are already installed:
- ✅ expo-print
- ✅ expo-file-system
- ✅ expo-sharing
- ✅ expo-asset
- ✅ firebase/firestore

## 🚀 Next Steps

1. Create a test exam
2. Download the template PDF
3. Print it
4. Test with your scanner
5. Verify scanning accuracy

## 📝 Notes

- Templates are stored in Firestore `templates` collection
- Each template is linked to an exam via `examId`
- Templates inherit class and instructor information from exams
- PDFs are generated on-demand (not stored in database)
- Logo is optional - PDFs work without it

---

**Status**: ✅ Complete and Ready to Use
**Last Updated**: March 8, 2026

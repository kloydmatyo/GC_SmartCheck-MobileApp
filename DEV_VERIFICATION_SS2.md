# Developer Verification Checklist — SS2 Yellow Fixes
> Self-check before returning to QA. Developer use only.

---

## SS2 2.3 — Bulk Student Import

---

### 1. Upload Valid CSV Successfully

**What to test:** A well-formed CSV with all required columns imports without error.

**Steps:**
1. Create a file `test_valid.csv`:
   ```
   student_id,first_name,last_name,section
   12345678,Juan,Dela Cruz,BSIT-1A
   87654321,Maria,Santos,BSIT-1B
   ```
2. Open the app → Students tab → tap the upload (cloud-up) icon.
3. Select `test_valid.csv`.
4. Tap **Import**.

**Expected:** Import completes. Summary shows `2 Imported`, `0 Errors`, `0 Duplicates`. Both students appear in the student list.

---

### 2. Validate Missing Required Columns

**What to test:** A CSV missing a required column (`student_id`, `first_name`, or `last_name`) is rejected immediately with a clear error — not an empty import.

**Steps:**
1. Create `test_missing_col.csv`:
   ```
   student_id,section
   12345678,BSIT-1A
   ```
2. Open import modal → select the file → tap **Import**.

**Expected:** Import is rejected before any rows are processed. Error message names the missing column(s) (e.g., "Missing required column: first_name"). `0 Imported`.

---

### 3. Prevent Upload of File with Duplicate IDs

**What to test:** Rows with IDs that duplicate each other in the same file, or that already exist in Firestore, are blocked.

**Steps (in-file duplicates):**
1. Create `test_dupes.csv`:
   ```
   student_id,first_name,last_name
   11111111,Ana,Reyes
   11111111,Ana,Reyes
   22222222,Bob,Cruz
   ```
2. Import the file.

**Expected:** Row 2 shows error "Duplicate student ID in import file". Only `22222222` is inserted (`1 Imported`, `1+ Errors`).

**Steps (existing in DB):**
1. Import `11111111` once successfully.
2. Try importing the same ID again in a new CSV.

**Expected:** Error "Student ID already exists in database". Not inserted again.

---

### 4. Restrict Upload of Oversized Files

**What to test:** A file larger than 5 MB is rejected at file selection — before any processing.

**Steps:**
1. Generate or obtain any file > 5 MB (e.g., rename a large image to `.csv`).
2. Open import modal → select the file.

**Expected:** Alert fires immediately: "File size exceeds maximum of 5MB". File is not staged. Import button remains disabled.

---

### 5. Verify Excel File Format Compatibility (.xlsx)

**What to test:** An `.xlsx` file with valid student data imports correctly (converted via SheetJS internally).

**Steps:**
1. Create an Excel file `test_students.xlsx` with Sheet1:
   ```
   student_id | first_name | last_name | section
   12345678   | Carlo      | Gomez     | BSIT-2A
   ```
2. Open import modal → select `test_students.xlsx`.
3. Tap **Import**.

**Expected:** Import completes. Summary shows `1 Imported`, `0 Errors`. Student appears in the list. No "Invalid file type" error.

---

## SS2 2.4 — Mobile Search & Filtering

> **Pre-condition for all 2.4 tests:** The student list must be seeded. Use the import from 2.3 test #1 above (or import any valid CSV with 5+ students across at least 2 sections). Pull-to-refresh once after import.

---

### 1. Search by Exact Student ID

**What to test:** Entering a full student ID returns exactly that student.

**Steps:**
1. Open Students tab.
2. In the search bar, type an exact student ID (e.g., `12345678`).

**Expected:** Only the matching student is shown. No duplicates. Result appears within ~600 ms (after debounce).

---

### 2. Search by Partial Name (Case-Insensitive)

**What to test:** Typing a partial first or last name matches all students with that substring, regardless of case.

**Steps:**
1. Type `dela` in the search bar (all lowercase).
2. Also try `DELA`, `Dela`.

**Expected:** All three return the same results. Students whose last name contains "dela" are shown.

---

### 3. Filter by Section

**What to test:** Selecting a section in the filter modal shows only students from that section.

**Steps:**
1. Tap the **Filters** button.
2. Under **Section**, select a specific section (e.g., `BSIT-1A`).
3. Tap **Apply Filters**.

**Expected:** Only students in `BSIT-1A` are listed. The section list should reflect the sections actually present in the imported data (not empty).

---

### 4. Sort Ascending / Descending by Name

**What to test:** Tapping **Name** sort toggles between A→Z and Z→A.

**Steps:**
1. Open Filters → Sort By → tap **Name** (first tap = ascending).
2. Tap **Apply Filters** → verify list is A→Z by last name.
3. Open Filters again → tap **Name** again (second tap = descending).
4. Tap **Apply Filters**.

**Expected:** First pass: last names in A→Z order. Second pass: Z→A order. No reorder flicker.

---

### 5. Pagination Loads 20 Per Page

**What to test:** With more than 20 students, the list shows exactly 20 per page and pagination controls appear.

**Steps:**
1. Import a CSV with 25+ students.
2. Pull-to-refresh. Go to Students tab.

**Expected:** First page shows 20 students. Pagination controls appear: "Page 1 of X (Y students)". Tapping next loads the next page.

---

### 6. Performance on 500+ Student Dataset

**What to test:** Searching and scrolling stay smooth with a large dataset (no crash, no ANR, scroll lag < ~2 sec).

**Steps:**
1. Import a CSV with 500+ rows.
2. Pull-to-refresh.
3. Type a partial name in the search bar.
4. Scroll rapidly through results.

**Expected:** Search results appear within ~1–2 sec. Scrolling is smooth. App does not crash.

---

### 7. No Duplicate Records in Search Results

**What to test:** Even if Firestore has duplicate documents with the same `student_id`, each student appears only once.

**Steps:**
1. (If possible) manually add a Firestore duplicate, OR import the same CSV twice and observe.
2. Open Students list — scroll through all results.

**Expected:** No student ID appears more than once. `Total Students` count matches unique IDs.

---

### 8. Debounced Search — No API Spam

**What to test:** Rapid keystrokes do NOT trigger a query per keystroke; only one query fires after 500 ms of inactivity.

**Steps:**
1. Open Metro / console logs.
2. In the search bar, type `a`, `b`, `c`, `d` rapidly (< 500 ms apart).
3. Stop typing and wait 600 ms.

**Expected:** Only one `[Students] SQLite query` or Firestore log entry appears. No log per keystroke.

---

### 9. "No Students Found" Empty State

**What to test:** When search or filter returns zero results, a clear empty state message is shown.

**Steps:**
1. Type a search term that matches no student (e.g., `ZZZZZZZZZ`).
2. Also try filtering by a section that has no students.

**Expected:** List shows "No students found" with the person icon. No blank white screen. No crash.

---

### 10. Reset Filters Clears Search and Reloads List

**What to test:** Tapping the **Clear** button removes all active filters and resets to the full list.

**Steps:**
1. Apply a section filter and a search query.
2. Tap the **Clear** button (visible in the controls row when filters are active).

**Expected:** Search bar clears, section filter resets to "All Sections", active-only resets to true, pagination returns to page 1, and the full student list reloads.

---

### 11. Offline Search Uses Cache (SQLite/AsyncStorage)

**What to test:** With network disabled, the search still returns results from the local cache.

**Steps:**
1. Ensure students have been loaded at least once (cache populated).
2. Enable **Airplane Mode** on the device/simulator.
3. Open Students tab → type a search query.

**Expected:** Search results appear from local cache. No network error. A "cached" or offline indicator may appear (CacheSyncIndicator). App does not crash.

---

### 12. Pull-to-Refresh Reloads Student List

**What to test:** Pulling down on the list triggers a Firestore sync and refreshes displayed data.

**Steps:**
1. Open Students tab.
2. Pull down (like a swipe-to-refresh gesture).
3. Watch for the loading spinner.

**Expected:** Spinner appears, data reloads from Firestore, new/updated students are reflected. Console shows `[Cache] Downloaded and cached X students`.

---

## Ready to Return to QA

All of the following must be true before marking fixes as done:

- [ ] All 5 SS2 2.3 items above pass without error
- [ ] All 12 SS2 2.4 items above pass (or are confirmed working end-to-end after seeding)
- [ ] No regression: green-passed items (summary report, stress test, DB integrity, import log) still pass
- [ ] No TypeScript errors in changed files (`studentImportService.ts`, `studentDatabaseService.ts`, `StudentImportModal.tsx`, `students.tsx`)
- [ ] App does not crash on any test scenario above
- [ ] Pull-to-refresh log confirms `[Cache] Downloaded and cached X students` (not 0)

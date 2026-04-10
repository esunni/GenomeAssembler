# JANUS UI Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve usability of the JANUS web page by enabling subitem appending/clearing, reordering via drag-and-drop, Start/End input fixes, autofill intervals, and better protocol table volume inputs.

**Architecture:** We will modify the existing `ReactionSetupSection.tsx` and `AspirationPlatesSection.tsx` React components. State updates will continue using the existing `updateProtocolComponent` and `setAspirationWell`/`handleFamilyAutofill` patterns. Since no drag-and-drop library exists, we will use native HTML5 Drag and Drop API for reordering subitem chips to avoid adding new dependencies.

**Tech Stack:** React, TypeScript, Tailwind CSS, Native HTML5 Drag & Drop.

---

### Task 1: Fix Transfer Settings Subitem Generation & Clearing

**Files:**
- Modify: `.worktrees/janus-github-pages/src/components/ReactionSetupSection.tsx`

**Step 1: Write failing test**
Create a test file `.worktrees/janus-github-pages/src/components/ReactionSetupSection.test.tsx` (or append to existing) that tests generating subitems appends them, and clearing removes them and resets inputs.

**Step 2: Run test to verify it fails**
Run: `cd .worktrees/janus-github-pages && npm run test`
Expected: FAIL

**Step 3: Write minimal implementation**
In `ReactionSetupSection.tsx`:
1. In `handlePatternGenerate`, change `subItems: newSubItems` to `subItems: [...(component.subItems || []), ...newSubItems]`.
2. Add a `handleClearSubitems(componentId)` function that calls `updateProtocolComponent` to set `subItems: []` and resets the `patternConfig` state for that component.
3. Update the JSX for the "Generate" button area to include a "Clear" button next to it.
4. Modify the Start/End inputs: remove `Number()` casting in `value`, use string state or handle empty strings so backspacing works.

**Step 4: Run test to verify it passes**
Run: `cd .worktrees/janus-github-pages && npm run test`
Expected: PASS

**Step 5: Commit**
```bash
git add src/components/ReactionSetupSection.tsx src/components/ReactionSetupSection.test.tsx
git commit -m "feat(janus): append generated subitems and add clear button"
```

### Task 2: Adjust Transfer Settings Column Widths

**Files:**
- Modify: `.worktrees/janus-github-pages/src/components/ReactionSetupSection.tsx`

**Step 1: Write minimal implementation**
Find the grid layout definition for the Transfer Settings table headers and rows. Reduce the width of the "Component" column (e.g., from `w-1/4` to `w-1/5` or via grid-cols) and increase the "Dead vol" column by the same amount.

**Step 2: Commit**
```bash
git add src/components/ReactionSetupSection.tsx
git commit -m "style(janus): adjust column widths in transfer settings"
```

### Task 3: Implement Subitem Drag-and-Drop Reordering

**Files:**
- Modify: `.worktrees/janus-github-pages/src/components/ReactionSetupSection.tsx`

**Step 1: Write failing test**
Add a test simulating drag events on subitem chips to verify reordering.

**Step 2: Run test to verify it fails**
Run: `cd .worktrees/janus-github-pages && npm run test`
Expected: FAIL

**Step 3: Write minimal implementation**
1. Add state `draggedSubitemIndex` to track which item is being dragged.
2. Update the chip rendering: add `draggable={true}`, `onDragStart`, `onDragOver` (with `e.preventDefault()`), and `onDrop`.
3. In `onDrop`, calculate the new array order and call `updateProtocolComponent` to save the reordered `subItems`.

**Step 4: Run test to verify it passes**
Run: `cd .worktrees/janus-github-pages && npm run test`
Expected: PASS

**Step 5: Commit**
```bash
git add src/components/ReactionSetupSection.tsx src/components/ReactionSetupSection.test.tsx
git commit -m "feat(janus): enable drag-and-drop reordering for subitems"
```

### Task 4: Fix Protocol Table Volume Input

**Files:**
- Modify: `.worktrees/janus-github-pages/src/components/ReactionSetupSection.tsx`

**Step 1: Write failing test**
Add a test verifying that typing after clearing the volume input results in the typed number (not prefixed with '0'), and deleting it results in an empty state.

**Step 2: Run test to verify it fails**
Run: `cd .worktrees/janus-github-pages && npm run test`
Expected: FAIL

**Step 3: Write minimal implementation**
1. Update the `onChange` handler for the protocol table volume input. If `e.target.value` is empty, set it to `undefined` or `""` instead of `0`.
2. Parse the value correctly (e.g., `value === '' ? '' : Number(value)`).
3. Find the input element and remove/override any `focus:bg-*` tailwind classes. Add `focus:bg-transparent` or similar if needed to prevent background color changes on focus.

**Step 4: Run test to verify it passes**
Run: `cd .worktrees/janus-github-pages && npm run test`
Expected: PASS

**Step 5: Commit**
```bash
git add src/components/ReactionSetupSection.tsx src/components/ReactionSetupSection.test.tsx
git commit -m "fix(janus): improve protocol table volume input handling and styling"
```

### Task 5: Implement Autofill Interval (Pass n wells)

**Files:**
- Modify: `.worktrees/janus-github-pages/src/components/AspirationPlatesSection.tsx`

**Step 1: Write failing test**
Create/update `AspirationPlatesSection.test.tsx` to verify autofill skips 'n' wells when an interval is provided.

**Step 2: Run test to verify it fails**
Run: `cd .worktrees/janus-github-pages && npm run test`
Expected: FAIL

**Step 3: Write minimal implementation**
1. Add an `interval` state (default 0) to track the "Interval" input.
2. Add a number input in the autofill UI labeled "Interval" bound to this state.
3. Update `handleFamilyAutofill`: where it currently increments the well index by 1 to place the next source, change it to increment by `1 + interval`.

**Step 4: Run test to verify it passes**
Run: `cd .worktrees/janus-github-pages && npm run test`
Expected: PASS

**Step 5: Commit**
```bash
git add src/components/AspirationPlatesSection.tsx
git commit -m "feat(janus): add interval setting for aspiration plate autofill"
```
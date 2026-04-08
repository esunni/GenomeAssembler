# Design Type IIS Site Finder Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Design placeholder with a real FASTA-based Type IIS enzyme site finder that reports site counts and renders site locations on a circular genome map.

**Architecture:** Keep the app fully static for GitHub Pages by parsing FASTA and detecting enzyme motifs entirely in the browser. Add a small design utility module for FASTA parsing and circular motif scanning, then render results through a dedicated Design page component and a lightweight SVG map component.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, SVG

---

### Task 1: Add failing Design feature tests

**Files:**
- Modify: `src/__tests__/App.integration.test.tsx`
- Create: `src/__tests__/designTools.test.ts`

**Step 1: Write the failing tests**
- Add a utility test for single-record FASTA parsing.
- Add a utility test for multi-record FASTA rejection.
- Add a utility test for forward, reverse, and circular-boundary Type IIS site detection.
- Add a UI test that uploads a FASTA file on Design, selects an enzyme, and expects a site count plus an accessible circular genome map.

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/__tests__/designTools.test.ts src/__tests__/App.integration.test.tsx`

Expected:
- import failure for missing `designTools` module
- missing Design-page upload controls

### Task 2: Implement FASTA parsing and enzyme scanning

**Files:**
- Create: `src/utils/designTools.ts`

**Step 1: Write minimal implementation**
- Define the enzyme list from the provided Type IIS reference.
- Add a single-record FASTA parser that normalizes sequence text.
- Add reverse-complement helpers.
- Add circular motif scanning that finds forward and reverse matches and returns 1-based positions, strand, and matched motif sequence.

**Step 2: Run utility tests**

Run: `npm test -- src/__tests__/designTools.test.ts`

Expected: PASS

### Task 3: Build the Design tool UI

**Files:**
- Create: `src/components/DesignPage.tsx`
- Create: `src/components/CircularGenomeMap.tsx`
- Modify: `src/App.tsx`
- Modify: `src/types.ts` only if shared interfaces are needed

**Step 1: Replace the placeholder Design page**
- Add FASTA upload for one circular sequence.
- Add an enzyme dropdown.
- Show sequence name, length, recognition sequence, selected enzyme, and total site count.
- Render a circular SVG map with site markers and a small results table below it.
- Show clear inline errors for invalid FASTA or multiple records.

**Step 2: Update navigation shell**
- Keep the submenu open across trigger and submenu hover.
- Keep click-to-pin behavior.
- Make the submenu smaller, rounded, and borderless.
- Ensure logo text is white.

**Step 3: Run app integration tests**

Run: `npm test -- src/__tests__/App.integration.test.tsx`

Expected: PASS

### Task 4: Final style pass and verification

**Files:**
- Modify: `src/styles.css`

**Step 1: Refine styling**
- Keep a white page background.
- Remove Design placeholder cards.
- Add section separators instead of heavy cards where possible.
- Use the dark purple accent palette for controls, highlights, and genome map markers.

**Step 2: Run full verification**

Run: `npm test -- src/__tests__/janusMath.test.ts src/__tests__/mapping.test.ts src/__tests__/designTools.test.ts src/__tests__/App.integration.test.tsx`

Expected: PASS

Run: `npm run build`

Expected: successful production build

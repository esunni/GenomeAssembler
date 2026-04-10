# JANUS Transfer Settings and Aspiration Plate Improvements

## Overview
Enhance the UI and logic in the JANUS Transfer Settings and Aspiration Plate sections to improve usability and add new capabilities like subitem reordering and autofill intervals.

## Architecture & Data Flow
- **State Management:** The global project state (`project.protocolComponents`, `project.aspirationPlates`) remains the source of truth.
- **Subitem Generation:** `handlePatternGenerate` in `ReactionSetupSection.tsx` will be modified to concatenate new subitems to `component.subItems` rather than overwriting.
- **Autofill Logic:** `handleFamilyAutofill` in `AspirationPlatesSection.tsx` will accept an `interval` parameter, advancing the target well index by `1 + interval` instead of `1`.

## Components

### Transfer Settings Table (`ReactionSetupSection.tsx`)
1. **Subitem Generation & Clearing:**
   - Modify the "Generate" button logic to append items.
   - Add a "Clear" button next to "Generate" that clears `component.subItems` and resets the `patternConfig` state for that row.
2. **Start/End Input Fix:**
   - Change the input handling for Start/End boxes to allow temporary empty states, preventing users from being unable to delete single digits.
3. **Column Layout:**
   - Adjust CSS grid/flex widths: reduce the "Component" column width by ~10% and increase the "Dead vol" column width accordingly.
4. **Subitem Reordering:**
   - Implement Drag and Drop for subitem chips within a row. When reordered, update the `component.subItems` array to reflect the new order.

### Protocol Table (`ReactionSetupSection.tsx`)
1. **Volume Input Fix:**
   - Update the `onChange` handler so clearing the field results in an empty string, not `0`. Typing "3" into an empty field should yield "3", not "03".
2. **Focus Styling:**
   - Remove or override `focus:bg-*` classes on the volume input so the background color remains static when focused.

### Aspiration Plate Section (`AspirationPlatesSection.tsx`)
1. **Source Order:**
   - Ensure the draggable source chips list respects the new `component.subItems` order defined in the Transfer Settings table.
2. **Autofill Interval:**
   - Add an "Interval" number input (default 0) next to the autofill family/direction selectors.
   - Update `handleFamilyAutofill` to respect the interval value when calculating the next well to fill.

## Error Handling & Edge Cases
- Ensure Drag and Drop handles single-item or empty lists gracefully.
- Validate the "Interval" input to prevent negative numbers.
- Ensure the volume input handles valid numerical parsing when switching from an empty string back to a number.

## Testing
- Verify subitems append correctly and "Clear" resets both chips and inputs.
- Test Start/End boxes for backspacing to empty.
- Verify Drag and Drop updates the state and reflects in the Aspiration Plate sources.
- Test "Interval" autofill with various values (0, 1, 2) and edge cases (hitting the end of the plate).
- Verify Protocol Table volume input behaviors (deleting to empty, no leading zeros, no focus background color).
# v0.7.0 Regression / Boundary Check

Date: 2026-09-06

## Scope

- Desktop 1280 px layout
- Mobile 320 px / 390 px layouts
- Japanese / English UI
- Empty selection and completed one-character workflow
- Pen-width endpoints: 28 / 100
- 180-character selection and 180-glyph TTF generation
- Project JSON import/export and autosave restore
- Long single-stroke restore (> 4,000 points)
- Duplicate characters / control characters in edited project JSON
- Project character and total-point upper bounds
- Invalid JSON handling
- TTF reload through FontFace and fontTools
- CSP / external runtime dependency scan
- Single HTML and self-extract payload equality

## Fixes made during the pass

1. Removed the per-stroke 4,000-point truncation during project restore. The project-wide 80,000-point cap remains the safety limit.
2. Deduplicate imported character arrays before font generation.
3. Reject project files that exceed 180 supported characters or 80,000 valid points instead of silently taking only a prefix.
4. Filter imported control characters and UTF-16 surrogate code points.
5. Use the same normalization for local autosave restore and explicit project-file import.
6. Refresh the setup character-count summary after project import.

## Result

All tested scenarios passed after the fixes above. The generated 180-character test font loaded through Chromium FontFace and was parsed by fontTools with all 180 requested cmap entries. No horizontal page overflow was observed at 320 px or 390 px in the tested setup/writing states.

The current execution environment does not include PowerShell, so the Windows `.ps1` wrappers themselves were not executed here. Their generated-output contracts were checked by reproducing the template substitutions, standalone verification, and self-extract round trip.

# Changelog

## 1.0.2 - 2026-10-09

- Normalize icon brand color and exact 25% background corner radii without changing artwork.
- Rebuild matching header, favicon, download alias, and self-extract representations.

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- An error-only Retry font preview action that preserves handwriting and editing state, prevents duplicate attempts, and keeps editable backup available.

- Save editable project directly from the writing screen with an editable filename, including while TTF generation is pending or has failed, using the existing `.handfont.json` schema.
- Shared All / Unfinished / Review character-list filters for desktop and the mobile drawer, with localized empty results and unchanged project/navigation order.
- Dependency-free Node.js handwriting and packaging regressions in the full repository checks used by CI.

### Fixed

- Failed font generation now marks glyph and size checks as unavailable instead of leaving them at Checking. Recovery guidance offers retry or backup rather than asking users to rewrite their strokes.

- Scope Clear Undo and active pointer strokes to their original project/glyph revisions so newer writing cannot be overwritten or assigned to another character.
- Enforce the project-wide point cap before Redo or Clear Undo restores points.
- Preserve off-list handwriting through selection changes, project backup/import, and autosave restore. Enforce combined active/stored character and point limits without silently discarding drawings, and include hidden or active handwriting in project-replacement confirmation.
- Invalidate old TTF export state immediately on font-affecting edits and project replacement; reject delayed obsolete FontFace results and regenerate after a font-name change.
- Automatically synchronize the root `handwriting-font-maker.html` download with verified `dist/index.html` output on normal builds. Add exact-byte verification that fails on stale or missing aliases while preserving custom-output isolation.

## [1.0.1] - 2026-10-07

### Fixed

- Standardize header target-language labels as EN / JA and localize the language tooltip and accessible name; retain localized Help controls.
- Keep the Japanese privacy badge consistent as 完全ローカル処理 and document the language controls in Help.
- Add header runtime regressions for both languages, repeated switching, stored preference restoration, and unchanged application data.

## [1.0.0] - 2026-09-06

### Changed

- Promoted the application from the v0.8.x release-candidate series to the first stable release.
- Refreshed Japanese/English README text, screenshots, help/version labels, and release documentation for the stable release.

### Fixed

- Rebuilt the distribution from `src/index.template.html` through the template replacement pipeline so release HTML contains no unresolved build placeholders.

### Verified

- Full desktop/mobile and Japanese/English workflow regression, generated TTF reload/export, project save/import validation, size-preview context, boundary limits, CSP/runtime-network isolation, favicon consistency, and single-HTML/self-extract integrity.

## [0.8.2] - 2026-09-06

### Fixed

- Small-size preview rows now always include the currently edited glyph once it has handwriting data.
- Preview context uses up to four immediately preceding completed glyphs instead of staying fixed on the first five completed characters.

## [0.8.1] - 2026-09-06

### Fixed

- Reduced false-positive small-size warnings for ordinary open glyphs such as `こ`.
- Switched the main review decision to actual rendered topology changes: merged components or lost enclosed spaces compared with 48px.
- Limited geometric gap warnings to conservative inter-stroke checks at 16px; same-stroke proximity no longer triggers spacing warnings.
- Made 12px advisory-only, so a 12px-only detail loss does not mark the glyph or project as needing review.
- Added a neutral `Reference` / `参考` badge for advisory-only 12px results.

## [0.8.0] - 2026-09-06

### Added

- Per-size generated-font checks at 12 / 16 / 24 / 48px.
- `OK` / `Review` status pills for every preview size.
- Warning detail that names the exact sizes needing review.

### Changed

- Small-gap risk is now evaluated against the approximate rendered clearance at each preview size instead of treating 16px as the only small-size threshold.
- Enclosed-space checks compare 12 / 16 / 24px against the 48px generated-font reference.
- Preview text is non-selectable so accidental blue text selection does not look like part of the font result UI.
- Refreshed README, help text, application specification, screenshots, and release metadata for v0.8.0.

## [0.7.0] - 2026-09-06

### Fixed

- Preserve legitimate project strokes longer than 4,000 points when saving and loading work data.
- Deduplicate project character lists before font generation so edited/corrupted JSON cannot create duplicate cmap entries.
- Reject project data that exceeds the 180-character or 80,000-point limits instead of silently truncating handwriting.
- Apply the same project-data validation to local autosave restoration and explicit JSON import.
- Refresh the character-selection summary immediately after explicit project import.
- Filter control characters and UTF-16 surrogate code points from imported project character lists.

### Verified

- Desktop and 320/390 px mobile layouts, Japanese/English UI, empty/completed workflows, pen-width endpoints, project save/load, invalid project data, max character selection, TTF generation/reload, CSP, runtime network isolation, and standalone/self-extract output.

## [0.6.0] - 2026-09-05

### Added

- Writing progress bar with completed count and percentage.
- Contextual shortcuts to the next unfinished glyph and the next glyph requiring review.
- End-of-sequence primary action that returns to unfinished work or advances to Review & save.

### Changed

- Inverted the `A + pencil` icon to a Browser Kitty primary-color tile with white marks.
- Kept `assets/favicon.svg`, the embedded favicon, and the header brand icon on the exact same SVG source.
- Refined mobile writing-header actions so the new navigation controls wrap without horizontal overflow.
- Updated Japanese / English help, README, and app specification for the v0.6.0 UX pass.

## [0.5.0] - 2026-09-05

### Added

- Explicit editable project export as `*.handfont.json`.
- Project import with schema validation, point/character limits, and replacement confirmation when handwriting already exists.
- Project-load entry points on both the initial setup screen and the export screen.

### Changed

- Rebuilt the application icon as one monochrome `A + pencil` SVG using only `#16624F`; the same SVG is embedded in `favicon.svg`, the HTML favicon, and the top-left brand mark.
- Enlarged the faint guide character substantially by removing the previous 640px fit ceiling and targeting most of the inner writing frame.
- Kept v0.4.0 glyph centering / width tuning and v0.3.0 small-size quality checks.

## [0.4.0] - 2026-09-05

### Added

- Monochrome `A + pencil` application icon using the Browser Kitty primary color direction.
- More pencil-like write icon for the mobile fixed workflow bar.
- Per-glyph horizontal centering for full-width characters plus simple advance-width tuning for Latin letters, digits, and symbols.

### Changed

- Enlarged the faint guide character slightly and recentered it using measured bounding boxes.
- Stored the generated font with matching left side bearings in `hmtx` and updated horizontal metrics in `hhea`.
- Refreshed README / spec text for the v0.4.0 spacing and guide updates.

## [0.3.0] - 2026-09-05

### Added

- Small-size glyph quality check for tight non-crossing stroke gaps.
- Actual generated-font comparison that detects enclosed spaces visible at 48px but closed at 16px.
- Per-glyph review marker, current-glyph explanation, and export review count with a shortcut to the first warning.

### Changed

- Fitted the faint guide character by its measured visual bounds instead of using one fixed font size.
- Reduced the guide weight and opacity so it remains a guide rather than dominating the writing surface.
- Redrew the application/favicon icon with a more recognisable pencil body, tip, and end bands next to the `A`.
- Updated Japanese/English help, README, specification, and screenshots for v0.3.0.

## [0.2.0] - 2026-09-05

### Added

- Faint target-character guide inside the writing canvas, enabled by default and switchable on/off.
- Autosave and restore of the guide visibility setting.
- New application/favicon icon combining an `A` and a pencil.
- Continuous per-stroke TrueType outline generation for simple stroke geometry.
- Self-intersection detection with automatic fallback to the v0.1.0 segmented rounded contours for complex strokes.
- Regression validation for `あ`, `の`, `8`, and `B` across the continuous/fallback paths.

### Changed

- Updated Japanese/English help, README, screenshots, and specification for the v0.2.0 outline pipeline.

## [0.1.0] - 2026-09-05

### Added

- Initial Browser Kitty implementation based on the current `htmlapps-template`.
- Character-set selection for basic hiragana, katakana, Latin letters, digits, common symbols, and custom text.
- Pointer-based handwriting input with pressure capture, pen width, Undo, Redo, and reversible Clear.
- Normalized vector stroke storage and local autosave.
- Dependency-free TrueType (`glyf`) generator.
- Actual generated-font preview through the FontFace API.
- Editable `.ttf` filename and local download.
- Japanese / English UI, responsive mobile workflow bar, help dialog, and destructive new-project confirmation.
- Fully local runtime with `connect-src 'none'` and no runtime dependencies.

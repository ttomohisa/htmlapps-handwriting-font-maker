# APP_SPEC.md

## 1. Product identity

- **Name:** Handwriting Font Maker / 手書きフォントメーカー
- **Version:** 1.0.0
- **One-sentence purpose:** Write selected characters in the browser and export them as a TrueType font without uploading handwriting data.
- **Primary users:** People who want a small personal handwriting font for documents, labels, prototypes, or web experiments.
- **Release artifacts:** `dist/index.html` and `dist/index.self-extract.html`

## 2. Problem and outcome

Existing handwriting-font tools can visually alter narrow gaps or small loops during image binarization, contour tracing, or aggressive outline simplification. This app keeps the original pen coordinates as vector data and generates filled TrueType contours directly from those strokes.

For v1.0.0, success means the released app is understandable before download: the actual generated TTF is shown at 12 / 16 / 24 / 48px, review warnings focus on rendered topology changes at 16 / 24px compared with 48px, 12px is advisory-only, and release documentation/distribution metadata match the implemented behavior:

1. Choose characters.
2. Write them with mouse, touch, or pen.
3. Keep stroke data as normalized vector points.
4. Build a real TTF locally.
5. Load that generated TTF back through `FontFace` for a real-font preview.
6. Download the TTF with an editable filename.

v1.0.0 is the first formal release. It keeps the dependency-free conversion core, the boundary-data fixes introduced during the release-candidate cycle, size-by-size review UX, explicit project backup, and single-HTML distribution.

## 3. Core user flow

1. Open the page directly or through a static host.
2. Enter a font name.
3. Choose one or more character sets or enter custom text; duplicates are removed.
4. Start writing.
5. Draw the current character in the square guide. A faint system-font reference character is shown by default and can be turned on or off. Use Undo, Redo, or Clear when needed.
6. Move between characters from Previous / Next or the character list. Show completion progress continuously; offer direct unfinished/review shortcuts when they are useful rather than constantly duplicating the next action.
7. At the final character, route to the next unfinished glyph when one remains; otherwise change the primary action to Review & save. Confirm that completed characters render using the generated TTF in the preview.
8. Open the Save step, edit the output filename, and download the `.ttf` file.
9. Reload the page and continue from local autosave when browser storage is available.

## 4. Functional requirements

### Character selection

- Font name input.
- Presets: basic hiragana, basic katakana, uppercase Latin, lowercase Latin, digits, common punctuation.
- Custom text field. Extract unique supported BMP characters while preserving first-seen order.
- Space is generated automatically and is not drawn.
- Limit the project to 180 drawable characters in v1.0.0 to keep the initial implementation responsive and local-storage friendly.
- Supplementary Unicode characters above U+FFFF are not supported in v1.0.0 and must be reported clearly instead of silently mis-encoding them.

### Drawing

- Pointer Events for mouse, touch, and pen.
- Logical drawing coordinates are normalized to 1000×1000 independent of device pixel ratio.
- Store x, y, pressure, and time for each point.
- Use coalesced pointer events when available.
- Constant-width fallback for mouse/touch; pen pressure influences width when meaningful pressure is available.
- Pen-width control with a useful default.
- Character-local Undo / Redo at stroke granularity.
- Clear current character is reversible through the canonical toast Undo action.
- Character list states: current, completed, empty.
- Show the current target character faintly behind the drawing area by default. The guide is visual-only, can be toggled on/off, and its state is autosaved.
- Show writing completion as both `done / total` and a percentage progress bar.
- Provide a direct jump to the next unfinished glyph only when it is meaningfully different from the ordinary Next action.
- Provide a direct jump to another glyph marked for review when review warnings exist.
- On the final glyph, the primary Next action must go to unfinished work if present, otherwise to Review & save.

### Font generation

- No raster image, thresholding, or image contour tracing is used.
- v1.0.0 uses an internal dependency-free stroke-outline generator. A simplified pen stroke becomes one continuous rounded outline when that contour is non-self-intersecting. If the contour would self-intersect or become degenerate, generation automatically falls back to the v0.1.0 capsule-per-segment representation. Inter-stroke overlaps are intentionally not force-unioned.
- Each output point is an on-curve TrueType point.
- Generate a standards-oriented TrueType font with `glyf`, `loca`, `cmap`, `head`, `hhea`, `hmtx`, `maxp`, `name`, `OS/2`, and `post` tables.
- `unitsPerEm` is 2048.
- Japanese-style full-width glyphs keep a full-width advance in v1.0.0, while Latin / digit glyphs use simple per-glyph advance widths and horizontal placement tuning.
- Generate `.notdef` and space automatically.
- Build a fresh TTF after a completed stroke or character edit with a short debounce.
- Load the generated binary via the `FontFace` API. The preview must show the actual generated font, not a canvas imitation.
- Check the loaded font at 12 / 16 / 24 / 48px. Use 48px as the reference topology; 16 / 24px report Review when separate rendered components merge or enclosed spaces disappear. A conservative inter-stroke clearance check may additionally flag 16px. The 12px row is advisory-only and never creates an overall warning by itself.

### Export

- `.ttf` download.
- Editable output filename before export.
- Invalid Windows filename characters are sanitized.
- Empty filename falls back to `handwriting-font`.
- Do not enable download until at least one drawable glyph exists and the generated TTF has successfully loaded.

### Persistence

- Autosave the project to localStorage when available.
- Save font name, selected set options, custom text, pen width, guide visibility, character order, and vector strokes.
- If saved data is invalid or too large, recover to a clean state and explain that autosave could not be restored.
- Preserve valid strokes longer than 4,000 points; the project-wide 80,000-point limit is the authoritative point cap.
- Deduplicate imported character lists before glyph generation.
- Explicit project import must reject data above the current character or point limits rather than silently truncating handwriting.
- "New project" is destructive and uses the canonical confirmation component.

### Language

- Japanese / English switch without reload.
- Font name and user-entered content are not modified by language switching.

## 5. Data and privacy

- Handwriting coordinates remain in browser memory and local browser storage only.
- Font generation happens entirely in the browser.
- No runtime network request, CDN, analytics, telemetry, remote font, or API request.
- CSP keeps `connect-src 'none'`.
- Download occurs only after the user presses the save button.

## 6. Non-goals for v1.0.0

- WOFF2 output.
- Contextual alternates / multiple variants per character.
- Ligatures and kerning editor.
- Raster-image or scanned-template import.
- AI handwriting correction.
- Forced inter-stroke polygon union / topology-changing simplification.
- Manual Bezier node editing.
- TrueType hinting generation.
- Supplementary Unicode cmap format 12.

## 7. UX and accessibility

- Desktop and smartphone are first-class.
- Desktop writing view uses character navigation + drawing area + actual-font preview.
- Smartphone does not simply stack the desktop columns. It shows one focused writing surface; the character list opens as a drawer/dialog-like panel and a bottom workflow bar keeps the three main steps reachable.
- Main touch targets are at least about 44 px tall.
- The drawing area disables touch scrolling only while drawing inside the canvas.
- Controls have visible labels and accessible names.
- Visible focus styles are required.
- Reduced-motion preference is respected.
- Status changes use `aria-live`.
- The help dialog remains scrollable within the viewport.

## 8. Performance expectations

- Initial UI is interactive with no network access.
- Drawing remains smooth for ordinary handwriting strokes on current desktop and mobile browsers.
- Downsample stored points by minimum logical distance while preserving endpoints.
- Font generation runs after stroke completion, not on every pointer move.
- v1.0.0 cap: 180 drawable characters and 80,000 stored points total. When exceeded, stop accepting additional points/characters and show a clear message.

## 9. Browser target

- Current Chromium desktop/mobile.
- Current Firefox desktop/mobile where APIs permit.
- Current Safari / iOS Safari where direct file storage and FontFace behavior permit.
- `dist/index.html` must open directly through `file://`.

## 10. States

- `setup`: select characters and font name.
- `writing-empty`: writing step active, current glyph empty.
- `writing-ready`: current glyph has strokes and preview generation is idle.
- `generating`: building and loading TTF preview.
- `font-ready`: generated font is loaded.
- `font-error`: generation or FontFace load failed; download disabled.
- `export-ready`: save step with a valid generated TTF.

Async font generations use a monotonically increasing generation id so a slower prior build never replaces a newer edit.

## 11. Acceptance criteria

- Template placeholders are replaced only by the builder.
- `dependencies.json` remains empty in v1.0.0.
- Direct `file://` open works with no external runtime request.
- CSP includes `connect-src 'none'`.
- Japanese and English UI fit at 360 px without horizontal page scrolling.
- Mouse/touch/pen can add strokes.
- The faint target-character guide is on by default, can be switched off/on, never enters font geometry, and its state is persisted.
- Undo / Redo work per current character.
- Clear offers Undo.
- At least the regression characters `あ`, `の`, `8`, and `B` can be generated, loaded with FontFace, previewed, and exported into one TTF. Simple strokes use continuous contours; self-intersecting cases fall back without invalidating the font.
- The preview rows show OK / Reference / Review after font generation. 12px can only be Reference; the warning summary names only 16 / 24px sizes that genuinely need review.
- The output filename is editable and sanitized.
- Download is disabled when the font is not valid.
- Reload restores autosaved work when localStorage is available.
- A legitimate single stroke with more than 4,000 points round-trips through project data without truncation.
- Duplicate characters in edited project JSON are deduplicated before TTF generation.
- Project data above 180 characters or 80,000 valid points is rejected instead of partially loaded.
- New project asks for confirmation.
- No starter text remains in visible UI or help.

## 12. Future candidates

- WOFF2 output.
- Alternate glyph variants.
- Finer spacing controls.

## 13. Explicit project backup

- Save the editable project as `*.handfont.json`.
- Include character selection, font name, pen width, guide visibility, current character, and raw stroke points.
- Validate imported JSON before changing the active project.
- If handwriting already exists, ask for confirmation before replacing it.
- Never upload the project file; reading and writing stay in the browser.

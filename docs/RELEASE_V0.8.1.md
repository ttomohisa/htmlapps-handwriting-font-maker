# v0.8.1 Release Finishing Check

Date: 2026-09-06

## What changed

- The generated TTF is displayed at 12 / 16 / 24 / 48 px. 48px is the reference; 16 / 24px trigger review mainly on actual rendered topology changes, while 12px is advisory-only.
- Each preview size displays `OK` or `Review`.
- The warning detail names the exact sizes that need review.
- Tight-gap checks ignore stroke pairs that already touch/overlap, so intended joins are not reported as tiny gaps.
- Preview text cannot be accidentally selected, avoiding a blue selection highlight that can look like part of the result.
- README, help text, APP_SPEC, screenshots, version metadata, and distribution files were refreshed.

## Browser checks performed

Chromium 144 headless, with the generated standalone HTML injected directly because the execution environment blocks ordinary local navigation.

- Desktop 1280×900: no JavaScript exceptions during the normal writing / preview flow.
- Mobile 390×844: `scrollWidth === innerWidth`.
- Mobile 320×700: setup and writing views have no horizontal page scrolling.
- Help dialog at 320 px stays inside the viewport and remains scrollable.
- Japanese / English switching works without reload.

## Size-check regression

Synthetic close parallel strokes:

- 12 px: Review
- 16 px: Review
- 24 px: Review
- 48 px: OK

Synthetic handwritten `A` with intentionally connected strokes:

- 12 px: Review because the enclosed counter disappears at that size
- 16 px: OK
- 24 px: OK
- 48 px: OK

The connected-stroke case confirms that touching/intersecting strokes are not misclassified as a narrow gap.

## Export / project checks

- Generated TTF loaded through `FontFace`.
- TTF download completed successfully.
- The downloaded TTF was reopened with fontTools.
- Required tables were present: `OS/2`, `cmap`, `glyf`, `head`, `hhea`, `hmtx`, `loca`, `maxp`, `name`, `post`.
- U+0041 (`A`) was present in cmap.
- Editable `.handfont.json` project data downloaded successfully.
- The saved project was loaded into a fresh app state and regenerated a valid preview font.

## Distribution checks

- `connect-src 'none'` remains in CSP.
- No external `<script src>` or stylesheet dependency.
- No `fetch`, `XMLHttpRequest`, `WebSocket`, or `EventSource` runtime path in the app HTML.
- `dependencies.json` / `dependencies.lock.json` remain empty.
- `assets/favicon.svg`, the embedded favicon, and the top-left brand SVG are identical.
- Icon colors remain `#16624F` and white only.
- Self-extracting HTML decompresses byte-for-byte to `dist/index.html`.
- No unresolved build placeholders remain in `dist/index.html` (the `window.__HANDWRITING_FONT_TEST__` regression hook is intentional code, not a placeholder).

## Environment note

PowerShell is not installed in this Linux execution environment, so the Windows `.ps1` scripts themselves were not executed here. The release output was generated with the same template substitutions and standalone/self-extract structure, and the runtime/distribution invariants above were verified independently.

## v0.8.1 warning calibration

- Open glyphs such as `こ` no longer warn merely because non-adjacent parts of the same stroke are close.
- 12px-only degradation is shown as `参考 / Reference` and does not increase the review count.
- 16px uses a conservative inter-stroke clearance fallback in addition to actual rendered topology changes.
- 24px review is based on rendered topology changes, not theoretical spacing alone.
- 48px remains the reference and is not marked Review by the small-size checker.

## Targeted regression results

- Ordinary open glyph test (`こ`-like two-stroke sample): 12 / 16 / 24 / 48px all `OK`.
- Advisory-only spacing sample: 12px `参考 / Reference`, 16 / 24 / 48px `OK`; project review count remains 0.
- Tighter spacing sample: 16px correctly reports `要確認 / Review`; 48px remains the reference and stays `OK`.
- Generated TTF downloaded successfully and was reopened with fontTools; `cmap` contained U+3053 and the expected TrueType tables.
- 320px and 390px viewport checks showed no horizontal page overflow.
- Self-extract payload restores byte-for-byte to `dist/index.html`.
- Runtime CSP still contains `connect-src 'none'`; no external script or stylesheet references were found in `dist/index.html`.

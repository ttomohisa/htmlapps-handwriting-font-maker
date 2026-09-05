# Handwriting Font Maker v1.0.0 release check

Date: 2026-09-06

## Release basis

- Base: `htmlapps-handwriting-font-maker-v0.8.2.zip`
- Formal version: `1.0.0`
- Runtime third-party dependencies: none
- Primary output: `dist/index.html`
- Self-extract output: `dist/index.self-extract.html`

## Fixed during final release regression

The v0.8.2 ZIP contained the correct application source in `src/index.template.html`, but its `dist/index.html` still contained the template placeholders `__APP_CONFIG_JSON__`, `__BUILD_MANIFEST_JSON__`, and `__EMBEDDED_ASSET_BUNDLE_JSON__`.

For v1.0.0, the distribution was regenerated through the same placeholder-replacement contract as `build-standalone.ps1`. The final `dist/index.html` contains no unresolved build placeholders.

## Browser workflow regression

Verified with Chromium using the final generated HTML content:

- Japanese desktop UI at 1280 x 900
- English desktop UI at 1280 x 900
- Japanese mobile UI at 390 x 844 and 320 x 844
- English mobile UI at 390 px width
- No horizontal page overflow in the checked desktop/mobile layouts
- Help dialog remains within the viewport
- Mobile character picker remains within the viewport
- Mobile fixed workflow bar remains usable on the writing screen
- Character-set selection and custom-text extraction
- Unsupported supplementary Unicode character warning
- 180-character selection cap and truncation feedback
- Guide character default ON and ON/OFF switching
- Pen-width endpoints: 28 / 100
- Pointer drawing with mouse
- Stroke Undo / Redo
- Clear + toast Undo
- Writing progress
- Previous / Next workflow
- Current character included in the 12 / 16 / 24 px context previews
- 48 px current-character preview
- Actual generated TTF loading through `FontFace`
- Project JSON download
- Project JSON import
- Invalid project JSON feedback
- Autosave restore behavior using localStorage-compatible browser storage
- Output filename sanitization including Windows reserved names
- Destructive New project confirmation
- TTF download

## Font regression

Generated TTF files were reopened with fontTools and checked for the expected tables:

- `glyf`
- `loca`
- `cmap`
- `head`
- `hhea`
- `hmtx`
- `maxp`
- `name`
- `OS/2`
- `post`

Additional generation checks:

- `A` and `B` generated through the normal UI flow and present in `cmap`
- Regression characters `あ`, `の`, `8`, and `B` generated together in one TTF and present in `cmap`
- 180 drawable characters generated into one TTF and all 180 mappings verified

## Project-data boundaries

Verified:

- A valid single stroke containing 5,001 points round-trips without truncation
- Duplicate characters in edited project JSON are deduplicated
- Project data above 80,000 valid points is rejected instead of partially loaded
- Project character lists above 180 characters are rejected by normalization

## Build / privacy / distribution

Verified:

- `app.config.json` version is `1.0.0`
- `dependencies.json` and `dependencies.lock.json` contain no runtime dependency
- `dist/index.html` contains no unresolved build placeholder
- CSP includes `connect-src 'none'`
- No external HTTP(S) script URL remains
- No external HTTP(S) stylesheet URL remains
- `assets/favicon.svg`, the embedded favicon, and the header brand SVG are identical
- Icon colors are limited to `#16624F` and white
- Self-extract loader is ASCII-only
- Self-extract payload restores byte-for-byte to `dist/index.html`
- Japanese, English, and mobile screenshots were regenerated from the v1.0.0 UI

Final generated-file hashes from this release check:

- `dist/index.html`: `282aaafa13ef8cb81b5c6ccb9d1f7ffe5a250bdf202cf1072925a9d008ddeb15`
- `dist/index.self-extract.html`: `c1343f96c501aa3fcbf3922afa0fe7e7829185e2c71d711da47ca259efff22fa`

## Environment notes

This execution environment blocks direct browser navigation to both `file://` and local HTTP URLs by administrator policy, so direct-navigation testing could not be performed here. Browser regression was run by loading the exact final generated HTML content into Chromium. The self-extract loader was also executed in Chromium and replaced itself with the restored application successfully.

PowerShell is not installed in this execution environment, so the Windows `.ps1` scripts themselves could not be executed. Their required template contracts and compatibility markers were statically checked, while the final distribution was generated using an equivalent local build procedure and then independently validated.

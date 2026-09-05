# Offline Verification

Handwriting Font Maker is intended to run without runtime network access after the HTML itself has been obtained.

## Readable standalone HTML

1. Run `build-standalone.bat` on Windows.
2. Open `dist/index.html` directly.
3. Open browser developer tools and clear the Network panel.
4. Enable offline mode or disconnect the device.
5. Reload the local HTML.
6. Select a small character set such as `あの8B` using the custom-character field.
7. Draw each character with the mouse, touch, or pen.
8. Confirm Undo, Redo, Clear, and Clear → Undo work.
9. Confirm the generated-font status becomes ready and the preview changes to the generated TTF.
10. Open **Review & save / 確認・保存** and type a sentence containing the completed characters.
11. Change the output filename, save the TTF, and confirm the filename is sanitized correctly.
12. Open the saved TTF in a font viewer or parser and confirm the completed characters are present.
13. Reload the page and confirm the project is restored from local browser storage when that browser permits storage for the current origin.
14. Confirm the Network panel contains no runtime request to an external origin.

## Smartphone checks

At a viewport around 360–390 CSS px wide:

- no horizontal page scrolling
- drawing canvas stays inside the viewport
- the desktop character sidebar is hidden
- the character-list button opens a scrollable dialog
- the bottom workflow bar does not cover the active drawing controls
- the Help dialog fits inside the viewport and can scroll to its final note
- Japanese and English labels fit without clipping

## Self-extracting variant

1. Open `dist/index.self-extract.html` directly.
2. Confirm the local unpacking screen appears briefly.
3. Confirm the normal Handwriting Font Maker UI replaces it.
4. Repeat the core write → preview → TTF save flow while offline.
5. Confirm there are no decompression or CSP errors.

`scripts/verify-self-extract.ps1` also checks that the loader is ASCII-only and restores the readable HTML byte-for-byte.

## Expected network policy

The release keeps:

```text
connect-src 'none'
```

No runtime CDN, API, analytics, telemetry, or remote font is required by v1.0.0.

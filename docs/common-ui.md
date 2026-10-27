# Shared UI 1.0.0

Canonical fixed JS/CSS and their hash lock are embedded at build time; explicit LF component attributes keep Windows checkout bytes stable. The dependency-free TrueType writer, Blob worker, geometry/quality checks, schema-v1 data and character/point limits are unchanged.

The work area shows dirty, saving, confirmed browser save time and persistent save failure. Only the project payload write determines save success; autosave no longer writes language preferences. Failure retains handwriting and offers Retry save and editable project export. Project download remains independent of browser autosave success.

Font TTF and editable project JSON delivery have separate persistent translated failure/retry notices. Attached download anchors report Download started after handoff, release Blob URLs after consumption time, and preserve current font/project data on failure. Existing editable sanitized filenames and extensions remain authoritative. TTF includes the selected drawn characters and space; project JSON includes retained off-list drawings too.

New project validates storage removal before replacing current work; removal failure retains handwriting with retry guidance. Existing import validation, generation invalidation and scoped Clear Undo remain authoritative. The existing app dialog translates while open with Cancel initially focused, Escape/backdrop cancellation and focus restoration. Focus pauses Undo toast expiration; existing revision checks prevent newer ink from being overwritten.

Language resolves URL, common key, original scalar preference, supported browser languages and English. Startup never writes a common language or changes the legacy key. Explicit switching alone chooses the common preference and shows a screen-only notice if unavailable. Title/lang/ARIA/help/status/dialog/toast translation preserves handwriting, selection, filenames, worker jobs and generated font bytes.

Selection-summary rendering is separate from input mutation and autosave scheduling. Language switching only renders that summary, so it cannot mark a failed save dirty, hide Retry/recovery or enqueue another project write before a successful retry.

Run `scripts/check-repository.ps1` for all three runtime variants, unchanged TTF/worker/quality tests, modal layout contracts and packaging parity. Native drawing latency, physical input, FontFace rasterization, touch layout, modal keyboard behavior and actual downloads remain human acceptance. Glyph/filter/step selection controls preserve domain styles; executable actions opt into shared variants.

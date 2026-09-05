# AGENTS.md — Single HTML App Contract

This file is the first instruction for any coding LLM or agent working in this repository.

## Read order

1. Read this file completely.
2. Read `APP_SPEC.md` completely.
3. Read `docs/ARCHITECTURE.md` and `docs/LLM_WORKFLOW.md`.
4. Inspect the current implementation before changing code.
5. Implement, build, verify, and update documentation in the same task.

## Non-negotiable product constraints

- Generate two one-file release variants: readable `dist/index.html` and gzip self-extracting `dist/index.self-extract.html`.
- Keep `scripts/build-self-extract.ps1` and the generated self-extract loader ASCII-only; encode loader UI text instead of placing non-ASCII literals in that PowerShell source.
- The self-extract loader must inherit the embedded favicon from `dist/index.html`; do not maintain a second favicon by hand.
- The app must work when `dist/index.html` is opened directly with `file://` unless `APP_SPEC.md` explicitly says otherwise.
- No runtime CDN, external font, analytics, telemetry, API request, or hidden network dependency.
- User-selected files and entered data must stay in the browser unless `APP_SPEC.md` explicitly defines an export initiated by the user.
- Keep a restrictive Content Security Policy with `connect-src 'none'` for the default template.
- Desktop and smartphone layouts are both first-class.
- Keyboard navigation, visible focus, labels, sufficient contrast, and reduced-motion behavior are required.
- Japanese and English should live in the same HTML when the app is intended for both languages.
- Do not use generic emoji as the main interface iconography. Prefer simple inline SVG icons.
- Do not edit `dist/index.html` or `dist/index.self-extract.html` manually. Edit `src/index.template.html`, config, and build scripts; then rebuild.

## Dependency rules

- Prefer browser-native APIs when they are reliable and reasonably small to implement.
- Add third-party packages only when they materially reduce risk or complexity.
- Add npm assets through `dependencies.json`; never paste minified third-party bundles into the source template.
- Pin exact versions. Do not use `latest`, ranges, tags, or unversioned URLs in `dependencies.json`.
- Keep `dependencies.lock.json` synchronized and committed. Builds must reject package tarballs whose SHA-256 differs from the lock. Never hand-edit a lock hash to make a failing build pass.
- Configure dependency update checks with `updates.policy` (`patch`, `minor`, `major`, or `manual`) when appropriate. The scheduled workflow may maintain an Issue, but it must not change versions, commit dependency updates, or open a dependency PR automatically.
- Use `scripts/update-dependency.ps1` for intentional upgrades so the target package, asset paths, lock, and standalone build are validated together. Review upstream release notes and notices before committing.
- Record the license and homepage in `dependencies.json` and update `THIRD_PARTY_NOTICES.md`.
- Imported module files must be self-contained. The generic loader does not rewrite relative imports.
- Workers, WASM, fonts, dictionaries, and support files must also be listed as embedded assets.
- Large or repetitive assets may set `compression` to `gzip` or `auto` in `dependencies.json`. Use the async `StandaloneAssets.*Async()` APIs for compressed assets.
- Do not wrap the complete embedded asset JSON bundle in Base64. Asset bytes are Base64-encoded exactly once; the bundle JSON is embedded directly to avoid systematic size inflation.
- Treat generated size information as part of the build review. `build-size-report.json` reports readable/self-extract sizes and per-asset storage; `app.config.json` may define warning-only size budgets.

## Source organization

The template intentionally keeps the app in one source HTML so that an LLM can understand the complete runtime without chasing a large module graph.

Inside `src/index.template.html`:

- Keep design tokens and responsive rules near the top.
- Keep reusable embedded-asset loading code generic.
- Keep application state explicit and serializable where practical.
- Mark the replaceable app area with `APP:BEGIN` and `APP:END` comments.
- Keep translations in one clearly named object.
- Avoid global mutable state except the documented `window.StandaloneAssets` API and reusable component APIs such as `window.AppConfirm`.
- Add comments for non-obvious algorithms, browser workarounds, and performance-sensitive paths.

If the application becomes too large for safe single-file source editing, split development source under `src/` and update the builder to concatenate it. The release must still be one HTML file.

## Reusable UI components

- Inspect `components/` before implementing common UI from scratch.
- `components/confirm-dialog.html` is the canonical confirmation UI for irreversible or high-risk actions. It is centered on desktop and becomes a safe-area-aware bottom sheet on smartphones.
- `components/toast.html` is the canonical transient status / Undo UI. Prefer immediate action + Undo for safely reversible operations instead of showing a confirmation dialog first.
- `components/popover-menu.html` is the canonical compact “Filter / Manage / More / Output settings” menu. It closes on outside click, `Esc`, resize, and when another menu opens.
- `components/setting-field.html` is the canonical preset + custom numeric field. Custom mode exposes min/max quietly, does not clamp while the user is typing, and normalizes on change/blur.
- `components/async-state.html` is the canonical source-generation and async-phase guard for file/media processing. Use it or an equivalent explicit generation token to reject stale results.
- `components/mobile-bottom-bar.html` is the canonical fixed smartphone navigation / workflow bar when an app benefits from 3-5 persistent destinations or actions. It supports safe areas, icons + labels, true mobile page tabs, backward-compatible section targets, disabled actions, and application actions.
- `components/webrtc-qr-pairing.html` is the canonical fully serverless WebRTC pairing pattern. Reuse its role chooser, chunked QR handoff, camera scanner, full ICE-gathering guard, diagnostics, delayed Answer creation, stale-attempt cleanup, and pre-connect retry behavior instead of rebuilding manual signaling ad hoc. It requires the pinned embedded assets in `examples/dependencies.webrtc-qr.json`.
- Component files are source snippets, not runtime bundles. Copy or adapt the needed CSS, HTML, and JavaScript into `src/index.template.html` so the final release remains one self-contained HTML file. Most components are dependency-free; dependency-aware components must use `dependencies.json` / `StandaloneAssets`, never runtime CDNs.
- Prefer `AppConfirm.ask()` over `window.confirm()` for irreversible deletion, overwrite, and other meaningful destructive actions. If the action is reliably reversible, prefer `AppToast.show()` with Undo instead of a pre-action confirmation.
- Use `tone: 'danger'` for destructive confirmation buttons.
- Pass localized title, message, and button labels from the application's translation object whenever practical.
- Preserve `Esc`, backdrop cancellation, visible focus, focus restoration, smartphone safe-area handling, and keyboard access when adapting a component.
- For mobile bottom bars, keep 3-5 concise icon + text items, reserve bottom body padding, use real `disabled` state for unavailable actions, and avoid a duplicate fixed primary CTA. For long multi-section smartphone tools, prefer `data-mobile-page-target` page switching so only the selected group is shown on mobile while desktop keeps all sections visible. Save / Share should stay disabled until a valid result exists.
- Avoid `window.alert()`, `window.confirm()`, and `window.prompt()` in finished product UI unless `APP_SPEC.md` explicitly requires native browser dialogs or there is a documented technical reason.
- See `docs/COMPONENTS.md` / `docs/COMPONENTS.ja.md` for usage and maintenance rules.


## Interaction and state rules

### Source replacement and stale async work

For apps that accept a file, image, video, audio track, PDF, database, or other primary source, changing that source is a state boundary:

- Invalidate all in-flight work from the previous source with a monotonically increasing generation/token or `AppAsyncState`.
- Revoke obsolete Blob URLs and release object references where practical.
- Clear old previews, detections, masks, timelines, derived metadata, errors, and export-ready state before showing the new source.
- Disable Save / Share / Download until a valid result exists for the current source.
- Before committing an async result to the UI, verify that its generation still matches the current source. Never let a late result from source A overwrite source B.
- Make phases explicit for heavy apps: `empty`, `ready`, `loading-runtime` when needed, `processing`, `result`, and `error`. Define transitions in `APP_SPEC.md`.

### Mobile control proximity

- Do not create a smartphone layout by simply stacking the desktop layout in source order. Re-evaluate the workflow at narrow widths.
- Controls that directly manipulate a preview (seek bar, transport, crop/range handles, frame navigation, overlay toggles) must remain immediately before or after that preview on smartphones. Do not separate them with unrelated settings cards.
- Keep primary actions reachable without forcing repeated long scrolls. When a smartphone app naturally divides into 3-5 groups, prefer bottom-tab page switching over a long stacked page; preserve the normal all-sections desktop layout. Use the mobile bottom bar only when persistent access materially helps.

### Numeric settings and advanced controls

- Prefer a small set of useful presets plus one custom input over many equal-weight buttons.
- Show units outside the editable numeric text.
- In custom mode, show the accepted min/max range as quiet helper text instead of a large permanent warning.
- Do not forcibly clamp on every keystroke. Let the user type an intermediate value; validate/normalize on blur, change, or execution and show field-local errors.
- Keep rarely changed or expert settings collapsed by default when the primary flow is clearer without them.

### File export naming

- If the app outputs a file, the user must be able to enter or edit the output filename before export. Do not hard-code the only filename.
- Provide a sensible default derived from the input name, app slug, or output purpose. Preserve the user's edited name while it remains relevant.
- Keep the extension visible and predictable; append/fix the required extension at export when the format is fixed.
- Remove path separators, control characters, and other characters that are invalid or unsafe as filenames. Fall back to a valid default when the entered name becomes empty.
- Test a user-edited filename as part of the main export flow.

### Media geometry and orientation

When drawing detections, points, masks, crops, annotations, or comparison overlays over images/video, never assume encoded dimensions equal displayed dimensions. Explicitly distinguish:

- encoded/file dimensions,
- intrinsic browser dimensions such as `videoWidth`/`videoHeight` or `naturalWidth`/`naturalHeight`,
- processing/canvas dimensions,
- CSS display dimensions and `object-fit`,
- rotation/orientation metadata, and
- `devicePixelRatio` where canvas pixels map to CSS pixels.

Define the coordinate transform once and reuse it. Test portrait smartphone media as well as landscape media.

## Required checks before completion

Run:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-repository.ps1
```

Then verify at minimum:

- Fresh load with empty local storage.
- Main happy path.
- Invalid, empty, and unusually large input.
- Undo/redo where destructive editing exists.
- Exported file contents and filename.
- Reload persistence where persistence exists.
- Japanese and English.
- Light-only visual behavior at desktop and mobile widths.
- Narrow smartphone width and desktop width.
- Keyboard-only operation.
- No console error.
- No runtime CDN/API/telemetry request after the initial HTML load on GitHub Pages. If `APP_SPEC.md` intentionally requires peer-to-peer WebRTC, use the canonical fully serverless QR pairing component, keep `iceServers: []`, and document that application data is sent directly to the paired browser.
- Direct local opening of both generated HTML variants.

## Documentation required with code changes

Update these when relevant:

- `APP_SPEC.md`: behavior and acceptance criteria.
- `README.md` and `README.ja.md`: user-facing capabilities and usage.
- `CHANGELOG.md`: notable changes.
- `THIRD_PARTY_NOTICES.md`: dependency additions, removals, or upgrades.
- `SECURITY.md`: changed trust boundaries or file handling.
- `docs/COMPONENTS.md` and `docs/COMPONENTS.ja.md`: reusable UI component behavior and API.


## README screenshot policy

Finished Browser Kitty tools should include a representative application screenshot
unless a screenshot would not meaningfully explain the tool.

- Store the primary screenshot at `assets/screenshot.png`.
- Target approximately 1360 x 900 pixels for the desktop screenshot.
- Capture the actual rendered application. Do not recreate the UI with image generation or mockups.
- Do not capture only the initial empty state. Prepare realistic sample data and show the primary workflow or result so the application's purpose is understandable at a glance.
- Do not include browser chrome, local file paths, personal information, debug UI, or unrelated desktop content.
- Prefer one strong representative screenshot over multiple weak screenshots.
- Add the screenshot to both `README.ja.md` and `README.md`, normally near the demo / introductory section.
- Temporary files or sample data created only for screenshot capture must not remain in the repository unless they are intentionally useful as examples.
- Screenshot work must not change application behavior or production UI merely to make the screenshot look better.


## Finished-app README shape

When this template becomes a real Browser-Kitty tool, rewrite the README for end users instead of leaving template-development prose. Unless the product has a strong reason to differ, use this compact order:

1. App name + one-sentence purpose.
2. Screenshot or short visual overview when useful.
3. Features.
4. How to use.
5. Privacy / local processing.
6. Supported browsers / devices.
7. Limitations.
8. Single-HTML / offline behavior.
9. Development / build.
10. License and third-party notices.

Remove starter-specific explanations that are no longer relevant to the finished tool. Keep README behavior, in-app help, and `APP_SPEC.md` synchronized.

## Completion report format

Return a concise report containing:

1. What changed.
2. Important design decisions.
3. Files changed.
4. Verification performed and result.
5. Known limitations or unverified items.

Do not claim a browser, device, build, or network test was performed unless it was actually performed.

## Help dialog

- Keep a compact help button in the upper-right header next to the language switcher.
- The button opens a native `<dialog>` titled “使い方と注意事項” / “How to use & notes”.
- Whenever application behavior changes, update the content between `APP:HELP:BEGIN` and `APP:HELP:END` in the same change.
- Include actual basic operations, privacy behavior, limitations, and data-loss risks. Do not leave starter-specific help in a finished app.
- The dialog must close with its close button, `Esc`, and a click on the backdrop.

## Build compatibility guardrails

- Do not depend on `Get-FileHash`; use .NET SHA-256 APIs.
- Avoid `::new()` in required PowerShell build and verification scripts.
- Verify only declared build placeholders, not arbitrary `__UPPERCASE__` runtime identifiers.

## WebRTC application-ready rule

For WebRTC DataChannel apps, never treat raw `RTCPeerConnection.connectionState === 'connected'` as application-ready. Use the reusable component's `onConnected`. When `createDefaultChannel:false`, set `readyChannelLabel` to a reliable control channel.

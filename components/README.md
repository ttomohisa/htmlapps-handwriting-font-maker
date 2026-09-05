# Reusable UI components

These files are source snippets for apps created from this template. They are **not automatically bundled** by the builder. Copy or adapt the component inside `src/index.template.html` so the final release remains one self-contained HTML file. Most are dependency-free; components that need embedded third-party assets explicitly point to a matching file under `examples/`.

- [`confirm-dialog.html`](confirm-dialog.html) — Promise-based confirmation dialog. Centered on desktop, bottom-sheet style on smartphones, safe-area aware, keyboard accessible, and suitable for destructive actions.
- [`toast.html`](toast.html) — Safe-area-aware transient status UI with optional action/Undo.
- [`popover-menu.html`](popover-menu.html) — Compact menu that closes on outside click, `Esc`, resize, or another menu opening.
- [`setting-field.html`](setting-field.html) — Preset + custom numeric input with unobtrusive range guidance and delayed normalization.
- [`async-state.html`](async-state.html) — Explicit async phase + source-generation guard that prevents stale results from a previous input.
- [`mobile-bottom-bar.html`](mobile-bottom-bar.html) — Fixed smartphone bottom navigation / workflow bar with icons, safe-area handling, true mobile page switching, backward-compatible section scrolling, disabled states, and an optional action API.
- [`webrtc-qr-pairing.html`](webrtc-qr-pairing.html) — Fully serverless WebRTC host/join pairing UI with chunked QR signaling, camera scanner, complete ICE gathering, diagnostics, stale-attempt cleanup, delayed Answer creation, and retry handling. Requires the pinned assets from `examples/dependencies.webrtc-qr.json`; after copying them, sync `dependencies.lock.json`.

Documentation: [English](../docs/COMPONENTS.md) / [日本語](../docs/COMPONENTS.ja.md)

WebRTC pairing details: [English](../docs/WEBRTC_QR_PAIRING.md) / [日本語](../docs/WEBRTC_QR_PAIRING.ja.md)

## WebRTC readiness note

The WebRTC pairing component waits for the designated readiness DataChannel to open before reporting application-ready. Custom DataChannel layouts use `readyChannelLabel` for a reliable control channel.

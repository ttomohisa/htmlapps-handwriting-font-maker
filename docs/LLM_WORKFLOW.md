# LLM Workflow

## Recommended request

Give the coding LLM the repository and this instruction:

> Read `AGENTS.md` first, then `APP_SPEC.md` and `docs/ARCHITECTURE.md`. Inspect `components/` before recreating common UI such as confirmation dialogs, Undo toasts, popover menus, preset/custom fields, async-state guards, smartphone bottom action bars, or manual WebRTC QR pairing. Implement the complete application described by the spec. Preserve the single-HTML and local-first constraints. Keep runtime CDN/API/telemetry access disabled; only allow peer-to-peer WebRTC when APP_SPEC.md explicitly requires it, and then reuse the canonical serverless QR pairing component with `iceServers: []`. Update source, configuration, notices, README files, changelog, and tests as needed. Build and verify the repository before reporting completion. Do not edit either generated file in `dist/` by hand.

## Recommended development loop

1. Rewrite `APP_SPEC.md` with the concrete product.
2. Inspect `components/` and reuse generic source snippets where they fit.
3. Update `app.config.json`.
4. Ask the LLM to inspect the existing source before replacing the sample.
5. Let the LLM add exact dependencies only when justified, then require it to sync `dependencies.lock.json`.
6. For dependency upgrades, use `scripts/update-dependency.ps1`; scheduled dependency Issues are notifications only.
7. Require the LLM to build after each meaningful implementation phase.
8. Review `dist/dependency-manifest.json` and `dist/build-size-report.json` for unexpected packages, assets, or size growth.
9. Open both generated HTML variants directly and test the core flow.
10. Publish only after the no-network check passes.

## Information that improves LLM output

Provide concrete details instead of style adjectives:

- Input examples and maximum sizes.
- Exact output format, default filename, user-editable filename behavior, and extension rules.
- Destructive actions and undo behavior.
- Smartphone gestures and scroll behavior, including keeping preview controls next to the preview.
- Explicit async phases such as empty / ready / loading-runtime / processing / result / error, plus stale-result invalidation after source changes.
- Data persistence and reset rules.
- Accessibility requirements.
- Browser and device targets.
- Visual references or screenshots when appearance matters.

## What the LLM should not do

- Replace the app with a framework that needs a runtime server.
- Add a CDN link “temporarily.”
- Add analytics, remote fonts, tracking pixels, or silent update checks.
- Claim complete offline behavior while a worker, WASM file, font, or dictionary remains external.
- Paste third-party minified source into the template.
- hide missing functionality behind non-working buttons.
- modify generated files in `dist/` instead of source.

## Review checkpoints

Ask for a review at these natural boundaries:

- Product state model is implemented.
- Main interaction is working on desktop.
- Touch and narrow-screen behavior is working.
- Export/import behavior is working.
- Dependencies and licenses are final.
- Build and no-network verification pass.

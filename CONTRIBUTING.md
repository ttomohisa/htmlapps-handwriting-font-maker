# Contributing

## Development principles

- Preserve a one-file release artifact.
- Keep runtime network access disabled unless the product specification explicitly changes the trust model.
- Prefer understandable browser-native code.
- Treat smartphone interaction, keyboard operation, and accessibility as core requirements.
- Keep dependencies exact, minimal, auditable, license-compatible, and synchronized with `dependencies.lock.json`.
- Prefer reversible action + Undo over pre-action confirmation when recovery is reliable.
- If the app exports files, expose a user-editable output filename with a sensible default and predictable extension.
- For file/media processing, invalidate stale async results when the primary source changes.

## Workflow

1. Update `APP_SPEC.md` before changing behavior.
2. Modify `src/index.template.html`, configuration, or build scripts.
3. Do not edit generated `dist/index.html`.
4. For dependency changes, use `scripts/sync-dependency-lock.ps1` / `scripts/update-dependency.ps1` and review upstream release notes. Scheduled dependency Issues are notifications, not approval to upgrade.
5. Run `scripts/check-repository.ps1`.
6. Review `dist/build-size-report.json` for unexpected size growth.
7. Test direct local opening and the main user flow, including a user-edited export filename when applicable.
8. Update README files, changelog, notices, and security documentation when relevant.

## Pull requests

Describe:

- User-visible behavior changed.
- Architecture or dependency changes.
- Desktop, mobile, keyboard, and language checks performed.
- Build and no-network verification results.
- Known limitations.

A pull request should not add a remote runtime resource, unpinned package, generated-only fix, or undocumented user-data flow.

## Help content checklist

When a pull request changes the user workflow, also update the in-app help section between `APP:HELP:BEGIN` and `APP:HELP:END`. Confirm the dialog opens from the upper-right button, follows the selected language, closes by button / `Esc` / backdrop click, and remains usable on a narrow mobile viewport.

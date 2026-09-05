## Summary

Describe the user-visible change.

## Specification

- [ ] `APP_SPEC.md` matches the implemented behavior.
- [ ] README and changelog are updated where needed.
- [ ] Third-party notices are updated where needed.

## Verification

- [ ] `scripts/check-repository.ps1` passes.
- [ ] `dist/index.html` opens directly.
- [ ] `dist/index.self-extract.html` expands and opens directly without mojibake.
- [ ] The self-extracting loader shows the same favicon as `dist/index.html`.
- [ ] Main flow tested on desktop.
- [ ] Narrow-screen/touch behavior tested.
- [ ] Keyboard-only flow tested.
- [ ] Japanese and English checked where applicable.
- [ ] The light-only interface was checked at desktop and mobile widths.
- [ ] Browser console checked.
- [ ] Runtime network panel checked after initial load; any intentional WebRTC peer traffic matches `APP_SPEC.md`.

## Notes

List unverified items, limitations, or follow-up work. Do not mark checks complete unless performed.

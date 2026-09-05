# Architecture

## Overview

The repository separates editable source from the release artifact:

```text
app.config.json              Product metadata
APP_SPEC.md                  Product behavior and acceptance contract
dependencies.json            Exact npm packages, assets, and update policy
dependencies.lock.json       Committed tarball SHA-256 lock
components/                   Reusable source snippets copied/adapted into apps
src/index.template.html      Editable application source
build-standalone.ps1         Dependency lock verification, embed, and build
scripts/check-dependency-updates.ps1  Update discovery/reporting
scripts/update-dependency.ps1          Reviewed upgrade helper
scripts/verify-standalone.ps1 Static release checks
dist/index.html              Generated readable release artifact
dist/index.self-extract.html Generated gzip self-extracting artifact
dist/build-size-report.json    Generated size and embedded-asset storage report
```

`dist/index.html` and `dist/index.self-extract.html` are generated and must not be edited manually.


## Reusable component layer

`components/` contains reusable source snippets for common UI and connection patterns. These files are not loaded at runtime and are not a separate bundle layer. An app copies or adapts the needed CSS, HTML, and JavaScript into `src/index.template.html`, preserving the one-file runtime model. Most components are dependency-free; dependency-aware components use the same pinned embedded-asset pipeline as the rest of the app.

The starter includes the canonical confirmation and toast APIs in the default source, while `components/` also carries the mobile bottom bar/page-tabs pattern, compact popover, preset/custom setting field, async source-state guard, and a fully serverless WebRTC QR-pairing component. Reversible operations should normally use Toast + Undo; irreversible/high-risk operations use `AppConfirm`. The WebRTC component is dependency-aware and uses the normal pinned embedded-asset pipeline rather than a runtime CDN. See `docs/COMPONENTS.md` and `docs/WEBRTC_QR_PAIRING.md`.

## Build pipeline

1. Read `app.config.json`, `dependencies.json`, and `dependencies.lock.json`.
2. Require one matching lock entry for every configured dependency.
3. Resolve each exact npm version through the npm registry when it is not already cached.
4. Verify the tarball SHA-256 against the committed lock before embedding anything.
5. Cache and extract each tarball.
6. Validate the package's own version.
7. Read only the explicitly listed asset files.
8. Calculate SHA-256 hashes for every original embedded asset.
9. Optionally gzip each declared asset (`gzip` / `auto`), then Base64-encode the stored bytes exactly once.
10. Embed the asset bundle JSON directly, avoiding a second Base64 wrapper around the whole bundle.
11. Replace the three source placeholders exactly once.
12. Write and verify `dist/index.html`.
13. Gzip that HTML, embed it into a small ASCII-only native `DecompressionStream` loader, inherit the readable HTML favicon, and write `dist/index.self-extract.html`.
14. Verify that the loader stays ASCII-only and embedded-only, the favicon matches the readable HTML, and the gzip payload restores byte-for-byte.
15. Write manifests, `build-size-report.json`, and `dist/.nojekyll`; emit warning-only size-budget messages when configured thresholds are exceeded.
16. Reject the declared unresolved build placeholders and common external runtime resource references.

## Dependency maintenance lifecycle

The runtime build stays deterministic while release discovery remains separate from source changes:

1. `scripts/check-dependency-updates.ps1` reads update policies and queries npm for newer versions.
2. `.github/workflows/dependency-updates.yml` runs weekly and creates/refreshes one open maintenance Issue when updates exist.
3. No dependency source file is changed by the scheduled workflow.
4. A human reviews release notes and chooses whether to run `scripts/update-dependency.ps1`.
5. The update helper refreshes the selected lock entry, verifies declared asset paths, runs the standalone build, and rolls config/lock files back if the process fails.

The update checker is a repository-maintenance network operation. It does not run inside the distributed browser app and does not weaken the app's runtime `connect-src 'none'` boundary.

## Build placeholders

The source template contains exactly one of each:

- `__APP_CONFIG_JSON__`
- `__BUILD_MANIFEST_JSON__`
- `__EMBEDDED_ASSET_BUNDLE_JSON__`

Do not rename or duplicate them without changing the builder and verifier. Other runtime identifiers that happen to use a `__NAME__` convention are allowed and must not be rejected as build placeholders.

## Embedded asset API

The generated page exposes `window.StandaloneAssets`:

```js
StandaloneAssets.list();
StandaloneAssets.has('library-id', 'asset-key');
StandaloneAssets.bytes('library-id', 'asset-key'); // uncompressed only
await StandaloneAssets.bytesAsync('library-id', 'asset-key'); // compressed or uncompressed
StandaloneAssets.text('library-id', 'asset-key'); // uncompressed only
await StandaloneAssets.textAsync('library-id', 'asset-key');
StandaloneAssets.blobUrl('library-id', 'asset-key'); // uncompressed only
await StandaloneAssets.blobUrlAsync('library-id', 'asset-key');
await StandaloneAssets.loadClassicScript('library-id', 'main', 'ExpectedGlobal');
const module = await StandaloneAssets.importModule('library-id', 'main');
```

Blob URLs are revoked after script/module loading and on page exit. Gzip assets are expanded with native `DecompressionStream` and cached in memory after first use.

### Important limitation

`importModule` does not rewrite relative imports inside a module. Choose a self-contained browser bundle, list every required file and implement a package-specific loader, or bundle the library before embedding.

## Runtime security boundary

The default Content Security Policy blocks ordinary fetch/XHR/WebSocket-style runtime connections with `connect-src 'none'`. It also blocks frames, objects, forms, and external base URLs. Inline CSS and JavaScript are allowed because the release is intentionally one HTML document. Embedded scripts and workers may be loaded through `blob:` URLs. An application that intentionally uses peer-to-peer WebRTC DataChannels may still keep this CSP and the fully serverless `iceServers: []` design; its privacy copy must distinguish “no server/cloud transfer” from “no data leaves this device.”

Static scanning is a guardrail, not a proof. Browser developer tools should still be used to verify that the generated app makes no unexpected request.

## Large applications

Keep source in one HTML while it remains understandable. When an app grows substantially, development files may be split under `src/` and assembled by the build script. Preserve these properties:

- Two generated one-file release variants.
- Pinned and auditable dependencies.
- No runtime external resource.
- Clear state ownership.
- A build that fails on missing input.

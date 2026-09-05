# Embedded Dependency Lifecycle

The template keeps third-party browser libraries fully embedded in the generated HTML while making upgrades explicit and reviewable.

The lifecycle has four parts:

1. `dependencies.json` declares the exact npm version, embedded assets, license metadata, and update policy.
2. `dependencies.lock.json` pins the downloaded package tarball by SHA-256 (and records npm integrity metadata when available).
3. `scripts/check-dependency-updates.ps1` checks for newer versions without changing source files.
4. `.github/workflows/dependency-updates.yml` runs weekly and maintains a GitHub Issue when updates are available. It never opens a pull request or changes dependency versions automatically.

## Add a dependency

Add the package and exact version to `dependencies.json`:

```json
{
  "dependencies": [
    {
      "id": "dayjs",
      "package": "dayjs",
      "version": "1.11.13",
      "license": "MIT",
      "homepage": "https://day.js.org/",
      "assets": [
        {
          "key": "main",
          "path": "dayjs.min.js",
          "mime": "text/javascript",
          "stripSourceMapComment": true,
          "compression": "auto"
        }
      ],
      "updates": {
        "enabled": true,
        "policy": "minor"
      }
    }
  ]
}
```

Then create or refresh the lock entry:

```powershell
.\scripts\sync-dependency-lock.ps1 -Id dayjs
```

Run without `-Id` to rebuild the lock for every configured dependency:

```powershell
.\scripts\sync-dependency-lock.ps1
```

The lock script resolves the exact npm version, validates npm integrity when provided, downloads and extracts the tarball, confirms `package.json` reports the expected version, checks that every configured asset path exists, and records the tarball SHA-256.

Commit both `dependencies.json` and `dependencies.lock.json`.

## Why the lock file matters

The generated `dist/dependency-manifest.json` records what was used in one build. `dependencies.lock.json` is different: it is committed input to future builds.

During a build, the downloaded or cached tarball must match the SHA-256 recorded in the lock file. A mismatch stops the build. This prevents a pinned version string from silently resolving to different package bytes later.

Do not edit tarball hashes manually. Refresh them with `sync-dependency-lock.ps1` after intentionally changing a dependency.

## Update policies

`updates` is optional. When omitted, the checker behaves as `enabled: true` with `policy: "manual"`.

| Policy | Suggested version checked |
| --- | --- |
| `patch` | Highest stable version with the same major and minor |
| `minor` | Highest stable version with the same major |
| `major` | npm `latest` tag (major changes allowed) |
| `manual` | npm `latest` tag, always presented for human review |

Set `enabled` to `false` only when a dependency should be excluded from scheduled update checks.

The policy controls what the checker reports. It does **not** authorize automatic version changes.

A practical default is to use `patch` for fragile WASM / parser stacks, `minor` for small utilities with reliable compatibility, and `manual` for dependencies where release notes and browser behavior must be reviewed carefully.

## Check updates locally

```powershell
.\scripts\check-dependency-updates.ps1
```

The script writes:

```text
dist/dependency-update-report.json
dist/dependency-update-report.md
```

The command exits successfully when updates exist; updates are maintenance information, not a build failure. Registry/network errors still fail the command so automation does not incorrectly close an Issue.

## Weekly GitHub Issue

`.github/workflows/dependency-updates.yml` runs every Monday and can also be started with `workflow_dispatch`.

When updates exist, it creates or refreshes an open Issue titled:

```text
chore(deps): dependency updates available
```

The workflow uses the labels `dependencies`, `maintenance`, and `automated`. If no updates remain under the configured policies, the open maintenance Issue is closed automatically.

The workflow deliberately does not modify `dependencies.json`, commit code, or create a pull request. Comments on the Issue remain available for decisions such as postponing a risky upgrade.

## Apply an update

To use the version suggested by the dependency's update policy:

```powershell
.\scripts\update-dependency.ps1 -Id dayjs
```

To choose an exact version explicitly:

```powershell
.\scripts\update-dependency.ps1 -Id dayjs -Version 1.11.18
```

The update command:

1. changes the exact version in `dependencies.json`;
2. downloads and validates the selected package;
3. refreshes only that dependency's lock entry;
4. checks that configured embedded asset paths still exist;
5. runs the normal standalone build and verification;
6. restores the previous `dependencies.json` and `dependencies.lock.json` if the update process fails.

Use `-SkipBuild` only when you intentionally want to prepare the config/lock change without running the full build immediately.

After a successful update, still review upstream release notes, license/notices, the affected feature, offline behavior, and `dist/build-size-report.json` before committing.

## Asset compression and bundle size

Each asset may set `compression` to:

- `none` (default): store the original bytes as one Base64 payload.
- `gzip`: always gzip before Base64 embedding.
- `auto`: gzip only when the compressed bytes are smaller.

Compressed assets require asynchronous expansion in the browser via native `DecompressionStream`:

```js
const wasmBytes = await StandaloneAssets.bytesAsync('library-id', 'wasm');
const workerUrl = await StandaloneAssets.blobUrlAsync('library-id', 'worker');
```

`bytes()`, `text()`, and `blobUrl()` remain available for uncompressed assets. `loadClassicScript()` and `importModule()` automatically use the async path and therefore work with compressed assets.

The build writes `dist/build-size-report.json` with readable HTML size, self-extract size, and original/stored bytes for every embedded asset. `app.config.json` can define warning-only budgets under `build.sizeBudget`.

## Runtime loading

For a classic browser bundle:

```js
await StandaloneAssets.loadClassicScript('dayjs', 'main', 'dayjs');
console.log(window.dayjs().format('YYYY-MM-DD'));
```

For a self-contained ES module:

```js
const library = await StandaloneAssets.importModule('library-id', 'main');
```

For a worker or WASM asset:

```js
const workerUrl = await StandaloneAssets.blobUrlAsync('library-id', 'worker');
const worker = new Worker(workerUrl, { type: 'module' });

const wasmBytes = await StandaloneAssets.bytesAsync('library-id', 'wasm');
const wasm = await WebAssembly.instantiate(wasmBytes, imports);
```

Revoke long-lived asset URLs after the consumer is finished:

```js
URL.revokeObjectURL(workerUrl);
```

## Release checklist

- Pin an exact package version in `dependencies.json`.
- Keep the matching lock entry in `dependencies.lock.json`.
- List every runtime support file.
- Confirm the chosen bundle has no unresolved relative import.
- Review release notes before accepting an update.
- Update `THIRD_PARTY_NOTICES.md` with required copyright and license text.
- Rebuild and inspect `dependency-manifest.json` and `build-size-report.json`.
- Test the affected feature with the network disabled.

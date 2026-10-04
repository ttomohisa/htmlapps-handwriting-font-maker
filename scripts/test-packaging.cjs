'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function option(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

const repositoryRoot = path.resolve(__dirname, '..');
const aliasName = 'handwriting-font-maker.html';

function verifyReadableAlias(root) {
  const readablePath = path.join(root, 'dist', 'index.html');
  const aliasPath = path.join(root, aliasName);
  assert.ok(fs.existsSync(readablePath), 'Readable release is missing: dist/index.html');
  assert.ok(fs.existsSync(aliasPath), `Readable download alias is missing: ${aliasName}`);
  assert.ok(fs.readFileSync(readablePath).equals(fs.readFileSync(aliasPath)),
    `Readable download alias is stale: ${aliasName} must match dist/index.html byte-for-byte`);
}

if (process.argv.includes('--verify-output')) {
  try {
    verifyReadableAlias(option('--root') || repositoryRoot);
    console.log('[OK] Root download alias matches dist/index.html byte-for-byte.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
} else {
  const { test } = require('node:test');
  const powershell = option('--powershell') || (process.platform === 'win32' ? 'powershell.exe' : 'pwsh');

  function runBuild(root, extraArguments = []) {
    const result = spawnSync(powershell, [
      '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
      path.join(root, 'build-standalone.ps1'), ...extraArguments
    ], { cwd: root, encoding: 'utf8' });
    assert.ifError(result.error);
    assert.equal(result.status, 0, `Build failed:\n${result.stdout}\n${result.stderr}`);
  }

  function runVerifier(root) {
    return spawnSync(process.execPath, [__filename, '--verify-output', '--root', root], { encoding: 'utf8' });
  }

  test('release builds maintain the downloadable readable alias', async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'handwriting-packaging-'));
    try {
      for (const relative of ['build-standalone.ps1', 'app.config.json', 'dependencies.json', 'dependencies.lock.json', 'src', 'scripts']) {
        fs.cpSync(path.join(repositoryRoot, relative), path.join(root, relative), { recursive: true });
      }

      await t.test('a normal build replaces a stale alias with the verified readable output', () => {
        fs.writeFileSync(path.join(root, aliasName), 'stale downloadable application');
        runBuild(root);
        verifyReadableAlias(root);
      });

      await t.test('a normal build recreates a missing alias', () => {
        fs.rmSync(path.join(root, aliasName), { force: true });
        runBuild(root, ['-SkipSelfExtract']);
        verifyReadableAlias(root);
      });

      await t.test('verification rejects a stale alias without rebuilding it', () => {
        fs.writeFileSync(path.join(root, aliasName), 'stale downloadable application');
        const result = runVerifier(root);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Readable download alias is stale/);
      });

      await t.test('verification rejects a missing alias without recreating it', () => {
        fs.rmSync(path.join(root, aliasName), { force: true });
        const result = runVerifier(root);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /Readable download alias is missing/);
      });

      await t.test('verification accepts exact readable output bytes', () => {
        fs.copyFileSync(path.join(root, 'dist', 'index.html'), path.join(root, aliasName));
        const result = runVerifier(root);
        assert.equal(result.status, 0, result.stderr);
      });

      await t.test('a custom output path does not replace the normal download alias', () => {
        const original = fs.readFileSync(path.join(root, aliasName));
        runBuild(root, ['-OutputPath', 'custom/preview.html']);
        assert.ok(fs.existsSync(path.join(root, 'custom', 'preview.html')));
        assert.ok(fs.existsSync(path.join(root, 'custom', 'preview.self-extract.html')));
        assert.ok(fs.readFileSync(path.join(root, aliasName)).equals(original));
        verifyReadableAlias(root);
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

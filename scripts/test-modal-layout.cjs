#!/usr/bin/env node
'use strict';
// Dependency-free source/CSS contracts, not a browser layout or native-input test.
// Run on the template, readable release, or gzip self-extracting release with --html.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { gunzipSync } = require('node:zlib');

const args = process.argv.slice(2);
const htmlIndex = args.indexOf('--html');
if (htmlIndex >= 0 && !args[htmlIndex + 1]) throw new Error('--html requires a path');
const htmlPath = path.resolve(htmlIndex >= 0 ? args[htmlIndex + 1] : path.join(__dirname, '../src/index.template.html'));
let html = fs.readFileSync(htmlPath, 'utf8');
const payload = html.match(/<script id="self-extract-payload"[^>]*>([A-Za-z0-9+/=\s]+)<\/script>/);
if (payload) html = gunzipSync(Buffer.from(payload[1], 'base64')).toString('utf8');
const css = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(match => match[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
  selectors: selectors.split(',').map(selector => selector.trim()),
  declarations: Object.fromEntries(body.split(';').map(declaration => declaration.trim()).filter(Boolean).map(declaration => {
    const colon = declaration.indexOf(':');
    return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim()];
  }))
}));
function declarations(selector) {
  const matches = rules.filter(rule => rule.selectors.includes(selector));
  assert.ok(matches.length, `Expected CSS rule for ${selector}`);
  return Object.assign({}, ...matches.map(rule => rule.declarations));
}

for (const selector of ['html:has(dialog:modal)', 'body:has(dialog:modal)']) {
  test(`${selector} locks background scrolling only while a native modal is open`, () => {
    const style = declarations(selector);
    assert.equal(style.overflow, 'hidden');
    assert.equal(style['overscroll-behavior'], 'none');
  });
}
for (const selector of ['.app-confirm-dialog[open]', '.glyph-picker-dialog[open]']) {
  test(`${selector} allocates a bounded column for header and scrolling content`, () => {
    const style = declarations(selector);
    assert.equal(style.display, 'flex');
    assert.equal(style['flex-direction'], 'column');
  });
}
for (const selector of ['.app-confirm-header', '.glyph-picker-dialog > .dialog-header']) {
  test(`${selector} does not shrink its Close control out of view`, () => {
    assert.equal(declarations(selector)['flex-shrink'], '0');
  });
}
for (const selector of ['.app-confirm-body', '.glyph-picker-body']) {
  test(`${selector} can shrink and scroll its last content within the dialog`, () => {
    const style = declarations(selector);
    assert.equal(style.flex, '1 1 auto');
    assert.equal(style['min-height'], '0');
    assert.equal(style.overflow, 'auto');
    assert.equal(style['overscroll-behavior'], 'contain');
  });
}
test('Glyph picker body uses allocated dialog space rather than its own viewport-height cap', () => {
  assert.ok([undefined, 'none'].includes(declarations('.glyph-picker-body')['max-height']));
});
test('Closed native dialogs stay hidden and the existing Help shell and shield are preserved', () => {
  for (const rule of rules.filter(rule => rule.declarations.display === 'flex')) {
    for (const selector of rule.selectors) {
      if (/^(dialog|#(?:helpDialog|appConfirmDialog|glyphPickerDialog)|\.(?:app-confirm-dialog|glyph-picker-dialog))(?:\[|$)/.test(selector)) {
        assert.match(selector, /\[open\]$/, `Only an open dialog may gain flex display: ${selector}`);
      }
    }
  }
  assert.equal(declarations('dialog')['max-height'], 'min(760px, calc(100dvh - 28px))');
  assert.equal(declarations('.dialog-body')['max-height'], 'calc(100dvh - 102px)');
  assert.equal(declarations('.dialog-body').overflow, 'auto');
  assert.equal(declarations('dialog::backdrop').background, 'rgba(15,17,14,.52)');
  assert.equal(declarations('dialog::backdrop')['backdrop-filter'], 'blur(4px)');
});
test('Confirmation actions and glyph list stay inside their respective scrolling bodies', () => {
  assert.match(html, /<div class="app-confirm-body">[\s\S]*?<div class="app-confirm-actions">\s*<button[^>]+id="appConfirmCancel"[^>]*>[\s\S]*?<button[^>]+id="appConfirmOk"[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/dialog>/);
  assert.match(html, /<div class="glyph-picker-body">[\s\S]*?id="glyphPickerFilters"[\s\S]*?id="glyphPickerGrid"[\s\S]*?id="glyphPickerEmpty"[^>]*>[\s\S]*?<\/div>\s*<\/dialog>/);
  assert.equal(declarations('.app-confirm-body').padding, '12px 18px calc(env(safe-area-inset-bottom) + 18px)');
  assert.equal(declarations('.app-confirm-actions')['grid-template-columns'], '1fr');
});
test('Repository checks run modal contracts on source and both release variants', () => {
  const checker = fs.readFileSync(path.join(__dirname, 'check-repository.ps1'), 'utf8');
  assert.match(checker, /"scripts\\test-modal-layout\.cjs"/);
  const loop = checker.match(/foreach \(\$relative in @\("src\\index\.template\.html", "dist\\index\.html", "dist\\index\.self-extract\.html"\)\) \{([\s\S]*?)\n\}/);
  assert.ok(loop, 'Keep the source/readable/self-extract regression loop');
  assert.match(loop[1], /& node \(Join-Path \$Root "scripts\\test-modal-layout\.cjs"\) --html \(Join-Path \$Root \$relative\)/);
  assert.match(loop[1], /if \(\$LASTEXITCODE -ne 0\) \{ throw "Modal layout regression tests failed: \$relative" \}/);
});

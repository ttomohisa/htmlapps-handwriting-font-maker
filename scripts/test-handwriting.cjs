#!/usr/bin/env node
'use strict';
// Dependency-free logic regression tests. Executes the whole shipped app script in a VM.
// DOM, Canvas rasterization, timers, and FontFace loading are controlled doubles: this
// is not a browser, visual, accessibility, real FontFace, or physical-device test.
// The real vector/TrueType/quality algorithms are unmodified. Test access is injected
// at load time; no additional production globals or dependency packages are needed.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const args = process.argv.slice(2);
const argIndex = args.indexOf('--html');
if (argIndex >= 0 && !args[argIndex + 1]) throw new Error('--html requires a path');
const htmlPath = path.resolve(argIndex >= 0 ? args[argIndex + 1] : path.join(__dirname, '../src/index.template.html'));
let html = fs.readFileSync(htmlPath, 'utf8');
if (!html.includes('function buildFont(')) {
  const candidates = [...html.matchAll(/[\"'`>]([A-Za-z0-9+/]{100,}={0,2})[\"'`<]/g)];
  for (const [, encoded] of candidates) {
    try { const decoded = zlib.gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8'); if (decoded.includes('function buildFont(')) { html = decoded; break; } } catch { /* not the gzip payload */ }
  }
}
const scriptMatch = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].find(match => match[1].includes('function buildFont('));
assert.ok(scriptMatch, 'HTML must contain the app runtime or its embedded gzip payload');
let source = scriptMatch[1].replace('__APP_CONFIG_JSON__', JSON.stringify(JSON.parse(fs.readFileSync(path.join(__dirname, '../app.config.json'), 'utf8')))).replace('__BUILD_MANIFEST_JSON__', '{"dependencies":[]}').replace('__EMBEDDED_ASSET_BUNDLE_JSON__', '{"dependencies":{}}');
assert.ok(/\n\s+initialize\(\);/.test(source), 'Known initialize boundary for test-only access');
source = source.replace(/\n(\s+)initialize\(\);/, '\n$1globalThis.__testAccess = expression => eval(expression);\n$1initialize();');
const clone = value => JSON.parse(JSON.stringify(value));
const point = (x = 100, y = 100) => ({ x, y, p: .5, pen: false });
const stroke = count => ({ points: Array.from({ length: count }, (_, i) => point(100 + i % 100, 100 + i % 200)) });
const actualPoints = state => Object.values(state.glyphs).reduce((total, glyph) => total + glyph.strokes.reduce((sum, item) => sum + item.points.length, 0), 0);
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function harness(options = {}) {
  let now = 0, nextTimer = 1, nextUrl = 1;
  const timers = new Map(), faces = [], downloads = [], urls = new Map(), logs = [];
  const storage = options.storage || new Map();
  class Target {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(callback); }
    dispatch(type, properties = {}) {
      const event = { type, target: this, currentTarget: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...properties };
      for (const listener of this.listeners.get(type) || []) listener(event);
      return event;
    }
  }
  class Element extends Target {
    constructor(tag = 'div') {
      super(); this.tagName = tag.toUpperCase(); this.children = []; this.parentElement = null; this.attributes = {}; this.dataset = {}; this.style = {}; this.value = ''; this.textContent = ''; this.hidden = false; this.disabled = false; this.checked = false; this.open = false; this.width = 1000; this.height = 1000; this.isConnected = true;
      const classes = new Set(); this.classList = { add: (...items) => items.forEach(item => classes.add(item)), remove: (...items) => items.forEach(item => classes.delete(item)), contains: item => classes.has(item), toggle(item, force) { const enabled = force === undefined ? !classes.has(item) : force; enabled ? classes.add(item) : classes.delete(item); return enabled; } };
      Object.defineProperty(this, 'className', { get: () => [...classes].join(' '), set: value => { classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach(item => classes.add(item)); } });
    }
    setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'id') this.id = String(value); if (name === 'class') this.className = value; if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value); if (name === 'value') this.value = String(value); if (['disabled', 'hidden', 'checked', 'open'].includes(name)) this[name] = true; }
    getAttribute(name) { if (name === 'class') return this.className; return this.attributes[name] ?? null; }
    hasAttribute(name) { return name in this.attributes; }
    removeAttribute(name) { delete this.attributes[name]; if (['disabled', 'hidden', 'checked', 'open'].includes(name)) this[name] = false; }
    append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
    appendChild(child) { this.append(child); return child; }
    replaceChildren(...children) { for (const child of this.children) child.parentElement = null; this.children = []; this.append(...children); }
    matches(selector) {
      return selector.split(',').some(part => {
        part = part.trim();
        if (!part) return false;
        if (part.includes(' ')) { const parts = part.split(/\s+/); const tail = parts.pop(); return this.matches(tail) && Boolean(this.parentElement?.closest(parts.join(' '))); }
        for (const [, excluded] of part.matchAll(/:not\(([^)]+)\)/g)) if (this.matches(excluded)) return false;
        part = part.replace(/:not\([^)]+\)/g, '');
        if (part.endsWith(':modal')) { if (!this.open) return false; part = part.slice(0, -6); }
        if (part.includes('[open]') && !this.open) return false;
        const tag = /^[a-zA-Z][\w-]*/.exec(part); if (tag && this.tagName !== tag[0].toUpperCase()) return false;
        for (const [, id] of part.matchAll(/#([\w-]+)/g)) if (this.id !== id) return false;
        for (const [, name] of part.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(name)) return false;
        for (const [, name, value] of part.matchAll(/\[([\w-]+)(?:=["']?([^\]"']+)["']?)?\]/g)) {
          const current = name.startsWith('data-') ? this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] : name === 'open' ? this.open ? '' : undefined : this.attributes[name];
          if (current === undefined || (value !== undefined && String(current) !== value)) return false;
        }
        return true;
      });
    }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    contains(child) { return this === child || this.children.some(element => element.contains(child)); }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatch('close'); }
    getBoundingClientRect() { return { left: 0, top: 0, right: 1000, bottom: 1000, width: 1000, height: 1000 }; }
    setPointerCapture(id) { this.captured = id; }
    hasPointerCapture(id) { return this.captured === id; }
    releasePointerCapture(id) { if (this.captured === id) { this.captured = null; this.dispatch('lostpointercapture', { pointerId: id }); } }
    getContext() {
      if (!this.context) this.context = new Proxy({ measureText: () => ({ width: 40, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 40, actualBoundingBoxAscent: 40, actualBoundingBoxDescent: 10 }), getImageData: () => ({ data: new Uint8ClampedArray(this.width * this.height * 4) }) }, { get: (object, key) => key in object ? object[key] : () => {} });
      return this.context;
    }
    click() { if (this.disabled) return; if (this.tagName === 'A') downloads.push({ name: this.download, blob: urls.get(this.href) }); this.dispatch('click'); }
  }
  const document = new Target(); const root = new Element('root');
  document.querySelectorAll = selector => root.querySelectorAll(selector);
  document.querySelector = selector => root.querySelector(selector);
  document.createElement = tag => new Element(tag);
  document.visibilityState = 'visible';
  document.fonts = new Set();
  // Minimal markup parser with ancestry, sufficient for the app's declarative controls.
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  const stack = [root];
  for (const token of markup.match(/<[^>]+>|[^<]+/g) || []) {
    if (/^<\//.test(token)) { const tag = /^<\/([\w-]+)/.exec(token)?.[1]?.toUpperCase(); const index = stack.map(item => item.tagName).lastIndexOf(tag); if (index > 0) stack.length = index; continue; }
    const match = /^<([\w-]+)([^>]*)>/.exec(token);
    if (!match) { if (!token.startsWith('<')) stack.at(-1).textContent += token; continue; }
    const element = new Element(match[1]);
    for (const [, key, a, b, c] of match[2].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) element.setAttribute(key, a ?? b ?? c ?? '');
    stack.at(-1).append(element);
    if (!/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(match[1])) stack.push(element);
  }
  document.documentElement = document.querySelector('html'); document.body = document.querySelector('body'); document.head = document.querySelector('head'); document.activeElement = document.body;
  const window = new Target(); window.devicePixelRatio = 1;
  const context = { document, window, HTMLElement: Element, HTMLDialogElement: Element, navigator: { language: 'en' }, Blob, URL: { createObjectURL(blob) { const url = `blob:test-${nextUrl++}`; urls.set(url, blob); return url; }, revokeObjectURL: url => urls.delete(url) }, TextEncoder, TextDecoder, Uint8Array, Uint8ClampedArray, Int32Array, DataView, ArrayBuffer, performance: { now: () => now }, atob: value => Buffer.from(value, 'base64').toString('binary'), console: { error: (...items) => logs.push(items), warn: (...items) => logs.push(items), log: (...items) => logs.push(items) }, setTimeout(callback, delay = 0) { const id = nextTimer++; timers.set(id, { callback, due: now + delay }); return id; }, clearTimeout: id => timers.delete(id), requestAnimationFrame: callback => context.setTimeout(callback, 0), cancelAnimationFrame: id => timers.delete(id), localStorage: { getItem: key => storage.get(key) ?? null, setItem(key, value) { if (options.storageFails) throw new Error('Storage quota test'); storage.set(key, value); }, removeItem: key => storage.delete(key) }, FontFace: class { constructor(family, bytes) { this.family = family; this.bytes = bytes; this.wait = deferred(); faces.push(this); } load() { return this.wait.promise; } resolve() { this.wait.resolve(this); } reject() { this.wait.reject(new Error('Controlled FontFace load failure')); } } };
  vm.createContext(context); vm.runInContext(source, context, { filename: htmlPath });
  const read = expression => context.__testAccess(expression);
  const $ = selector => { const element = document.querySelector(selector); assert.ok(element, `Expected control ${selector}`); return element; };
  const run = (name, ...values) => read(name)(...values);
  const h = { context, state: read('state'), $, run, read, document, window, timers, faces, downloads, logs, storage, clearTimers: () => timers.clear(), async advance(ms = 0) { const end = now + ms; let count = 0; while (true) { const entry = [...timers].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0]; if (!entry) break; assert.ok(count++ < 1000, 'Timer loop'); timers.delete(entry[0]); now = entry[1].due; entry[1].callback(); await tick(); } now = end; await tick(); }, pointer(type, properties = {}) { return $('#drawCanvas').dispatch(type, { pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, isPrimary: true, clientX: 100, clientY: 100, pressure: .5, ...properties }); }, draw() { h.pointer('pointerdown'); h.pointer('pointermove', { clientX: 200, clientY: 200 }); h.pointer('pointerup', { clientX: 300, clientY: 300, buttons: 0 }); }, async generate() { const before = faces.length; const pending = run('generatePreviewFont'); await h.advance(0); assert.equal(faces.length, before + 1, 'This generation creates a new FontFace'); faces.at(-1).resolve(); await pending; assert.ok(h.state.previewBytes, 'Successful generation yields usable bytes'); return h.state.previewBytes; }, async confirm(pending) { await tick(); assert.equal($('#appConfirmDialog').open, true, 'Expected confirmation'); $('#appConfirmOk').click(); await pending; } };
  h.clearTimers();
  return h;
}
function setup(h, chars = ['A', 'B'], glyphs = {}) {
  Object.assign(h.state, { fontName: 'Old Family', chars, customText: chars.join(''), selectedSets: { hiragana: false, katakana: false, upper: false, lower: false, digits: false, symbols: false }, currentIndex: 0, step: 'write', glyphs, quality: {}, previewBytes: null, totalPoints: 0 });
  h.state.totalPoints = actualPoints(h.state); h.run('syncSetupInputs'); h.run('rebuildGlyphLists'); h.run('updateWritingUi'); h.run('setStep', 'write'); h.clearTimers(); return h;
}
function familyNames(bytes) {
  const buffer = Buffer.from(bytes); const count = buffer.readUInt16BE(4); let table;
  for (let i = 0; i < count; i++) { const record = 12 + i * 16; if (buffer.toString('ascii', record, record + 4) === 'name') table = buffer.readUInt32BE(record + 8); }
  assert.notEqual(table, undefined, 'TTF name table'); const records = buffer.readUInt16BE(table + 2), strings = table + buffer.readUInt16BE(table + 4); const names = [];
  for (let i = 0; i < records; i++) { const offset = table + 6 + i * 12; if (buffer.readUInt16BE(offset + 6) !== 1) continue; const start = strings + buffer.readUInt16BE(offset + 10), length = buffer.readUInt16BE(offset + 8); let name = ''; for (let j = start; j < start + length; j += 2) name += String.fromCharCode(buffer.readUInt16BE(j)); names.push(name); }
  return names;
}
const cases = [];
function test(name, fn) { cases.push({ name, fn }); }
test('Clear → draw → toast Undo preserves the newer stroke and exact counter', () => { const h = setup(harness(), ['A', 'B'], { A: { strokes: [stroke(3)], redo: [] } }); h.run('clearCurrent'); h.draw(); const newer = clone(h.state.glyphs.A.strokes); h.$('#appToastAction').click(); assert.deepEqual(clone(h.state.glyphs.A.strokes), newer); assert.equal(h.state.totalPoints, actualPoints(h.state)); });
test('Redo refuses whole-stroke overflow and preserves its redo stack', () => { const h = setup(harness(), ['A', 'B'], { A: { strokes: [stroke(2)], redo: [] }, B: { strokes: [stroke(79998)], redo: [] } }); h.run('undoCurrent'); h.state.glyphs.B.strokes.push(stroke(2)); h.state.totalPoints += 2; h.run('redoCurrent'); assert.equal(h.state.totalPoints, 80000); assert.equal(h.state.glyphs.A.redo.length, 1); assert.equal(h.state.glyphs.A.strokes.length, 0); });
test('Active stroke commits to its original glyph at character navigation', () => { const h = setup(harness()); h.pointer('pointerdown'); h.pointer('pointermove', { clientX: 200 }); h.run('selectCharacter', 1); h.pointer('pointerup', { clientX: 900 }); assert.equal(h.state.glyphs.A?.strokes.length, 1); assert.equal(h.state.glyphs.B?.strokes.length || 0, 0); assert.equal(h.state.glyphs.A.strokes[0].points.length, 2); assert.equal(h.state.totalPoints, actualPoints(h.state)); });
test('Scheduling generation synchronously invalidates stale downloadable TTF', async () => { const h = setup(harness(), ['A'], { A: { strokes: [stroke(3)], redo: [] } }); await h.generate(); h.run('scheduleFontGeneration'); assert.equal(h.state.previewBytes, null); assert.equal(h.$('#downloadButton').disabled, true); });
test('Reset rejects late old FontFace success and stale quality', async () => { const h = setup(harness(), ['A'], { A: { strokes: [stroke(3)], redo: [] } }); const pending = h.run('generatePreviewFont'); await h.advance(0); const old = h.faces.at(-1); await h.confirm(h.run('resetProject')); old.resolve(); await pending; assert.equal(h.state.previewBytes, null); assert.equal(h.$('#downloadButton').disabled, true); assert.deepEqual(Object.keys(h.state.quality), []); });
test('Family rename regenerates the real TTF name table before export', async () => { const h = setup(harness(), ['A'], { A: { strokes: [stroke(3)], redo: [] } }); await h.generate(); assert.ok(familyNames(h.state.previewBytes).includes('Old Family')); h.$('#fontNameInput').value = 'New Family'; h.$('#fontNameInput').dispatch('input'); await h.advance(400); if (h.faces.length > 1) { h.faces.at(-1).resolve(); await tick(); } assert.ok(familyNames(h.state.previewBytes).includes('New Family'), 'Actual TTF family must match the edited name'); });

function payload(name = 'Imported Family', chars = ['C'], glyphs = {}) {
  return { format: 'browser-kitty-handwriting-font-project', schemaVersion: 1, fontName: name, customText: chars.join(''), chars, selectedSets: {}, currentIndex: 0, penWidth: 56, guideCharacter: true, glyphs, step: 'write' };
}
const file = value => ({ text: async () => JSON.stringify(value) });
function assertCounter(h) { assert.equal(h.state.totalPoints, actualPoints(h.state)); assert.ok(h.state.totalPoints <= 80000); }
function assertInvalid(h) { assert.equal(Boolean(h.state.previewBytes), false, 'Stale preview bytes are unusable'); assert.equal(h.$('#downloadButton').disabled, true); assert.equal(h.$('#stepTabExport').disabled, true); assert.equal(h.$('#mobileTabExport').disabled, true); }
function visibleGlyphs(h, selector = '#glyphList') { return h.$(selector).querySelectorAll('.glyph-button').filter(element => !element.hidden).map(element => element.textContent); }
function setFilter(h, filter, index = 0) { const buttons = h.document.querySelectorAll(`[data-glyph-filter="${filter}"]`); assert.equal(buttons.length, 2, 'Shared filter controls exist in desktop and mobile lists'); buttons[index].click(); }
function parseTtf(bytes) {
  const buffer = Buffer.from(bytes), tables = new Map(); assert.equal(buffer.readUInt32BE(0), 0x00010000);
  function sum(data) { let total = 0; for (let i = 0; i < data.length; i += 4) { let word = 0; for (let j = 0; j < 4; j++) word = ((word << 8) | (data[i + j] || 0)) >>> 0; total = (total + word) >>> 0; } return total; }
  assert.equal(sum(buffer), 0xb1b0afba, 'Whole TTF checksum');
  for (let i = 0; i < buffer.readUInt16BE(4); i++) {
    const index = 12 + i * 16, tag = buffer.toString('ascii', index, index + 4), checksum = buffer.readUInt32BE(index + 4), offset = buffer.readUInt32BE(index + 8), length = buffer.readUInt32BE(index + 12);
    assert.equal(offset % 4, 0, `${tag} alignment`); assert.ok(offset + length <= buffer.length, `${tag} bounds`);
    const table = Buffer.from(buffer.subarray(offset, offset + length)); if (tag === 'head') table.writeUInt32BE(0, 8);
    assert.equal(sum(table), checksum, `${tag} checksum`); tables.set(tag, { offset, length });
  }
  for (const tag of ['glyf','loca','cmap','head','hhea','hmtx','maxp','name','OS/2','post']) assert.ok(tables.has(tag), `${tag} table`);
  const cmap = tables.get('cmap').offset; let format4;
  for (let i = 0; i < buffer.readUInt16BE(cmap + 2); i++) { const offset = cmap + buffer.readUInt32BE(cmap + 8 + i * 8); if (buffer.readUInt16BE(offset) === 4) format4 = offset; }
  assert.notEqual(format4, undefined, 'BMP format 4 cmap');
  return { buffer, tables, glyphId(char) { const cp = char.codePointAt(0), count = buffer.readUInt16BE(format4 + 6) / 2, ends = format4 + 14, starts = ends + count * 2 + 2, deltas = starts + count * 2, ranges = deltas + count * 2; for (let i = 0; i < count; i++) if (cp <= buffer.readUInt16BE(ends + i * 2) && cp >= buffer.readUInt16BE(starts + i * 2)) { const delta = buffer.readInt16BE(deltas + i * 2), range = buffer.readUInt16BE(ranges + i * 2); if (!range) return (cp + delta) & 0xffff; const id = buffer.readUInt16BE(ranges + i * 2 + range + (cp - buffer.readUInt16BE(starts + i * 2)) * 2); return id ? (id + delta) & 0xffff : 0; } return 0; } };
}

test('Real TTF encodes あ, の, 8, B with checksums, cmap, outlines and family name', () => {
  const h = harness();
  const shapes = {
    'あ': [[[220,300],[780,300]],[[480,150],[420,800]],[[260,670],[450,440],[710,460],[790,680],[540,850]]],
    'の': [[[520,200],[250,350],[180,620],[400,800],[720,690],[810,390],[520,200],[450,600],[300,710]]],
    '8': [[[500,150],[260,300],[500,500],[750,690],[500,850],[260,690],[500,500],[750,300],[500,150]]],
    B: [[[240,150],[240,850]],[[240,150],[650,180],[750,330],[580,500],[240,500]],[[240,500],[700,520],[780,730],[620,850],[240,850]]]
  };
  const entries = Object.entries(shapes).map(([char, lines]) => ({ char, glyph: { strokes: lines.map(line => ({ points: line.map(([x,y]) => point(x,y)) })), redo: [] } }));
  const original = clone(entries), result = h.run('buildFont', 'Regression Family', entries), parsed = parseTtf(result.bytes);
  assert.deepEqual(clone(entries), original, 'Geometry inputs are never rewritten by font generation'); assert.ok(familyNames(result.bytes).includes('Regression Family'));
  assert.equal(parsed.buffer.readUInt16BE(parsed.tables.get('head').offset + 18), 2048);
  const maxp = parsed.tables.get('maxp').offset, loca = parsed.tables.get('loca').offset; assert.equal(parsed.buffer.readUInt16BE(maxp + 4), 6);
  for (const char of Object.keys(shapes)) { const id = parsed.glyphId(char); assert.ok(id > 1); const start = parsed.buffer.readUInt32BE(loca + id * 4), end = parsed.buffer.readUInt32BE(loca + (id + 1) * 4); assert.ok(end > start); assert.ok(parsed.buffer.readInt16BE(parsed.tables.get('glyf').offset + start) > 0, `${char} has contours`); }
  assert.equal(parsed.glyphId(' '), 1); assert.equal(parsed.glyphId('Z'), 0);
});
test('Clear → Undo restores untouched glyph exactly', () => { const h = setup(harness(), ['A'], { A: { strokes: [stroke(3), stroke(2)], redo: [] } }), original = clone(h.state.glyphs.A.strokes); h.$('#clearGlyphButton').click(); assert.equal(h.state.totalPoints, 0); h.$('#appToastAction').click(); assert.deepEqual(clone(h.state.glyphs.A.strokes), original); assertCounter(h); });
test('Clear → navigate → Undo restores original glyph without moving selection', () => { const h = setup(harness(), ['A','B'], { A: { strokes: [stroke(3)], redo: [] } }); h.$('#clearGlyphButton').click(); h.run('selectCharacter', 1); h.$('#appToastAction').click(); assert.equal(h.state.currentIndex, 1); assert.equal(h.state.glyphs.A.strokes.length, 1); assert.equal(h.state.glyphs.B?.strokes.length || 0, 0); assertCounter(h); });
test('Clear restoration is atomic at exact point cap and refuses overflow', () => {
  for (const added of [0,1]) { const h = setup(harness(), ['A','B'], { A: { strokes: [stroke(2)], redo: [] }, B: { strokes: [stroke(79998)], redo: [] } }); h.run('clearCurrent'); if (added) { h.state.glyphs.B.strokes.push(stroke(added)); h.state.totalPoints += added; } h.$('#appToastAction').click(); assertCounter(h); assert.equal(h.state.totalPoints, added ? 79999 : 80000); assert.equal(h.state.glyphs.A.strokes.length, added ? 0 : 1); }
});
test('Redo round-trips exact cap repeatedly and saved JSON is importable', () => { const h = setup(harness(), ['A','B'], { A: { strokes: [stroke(2)], redo: [] }, B: { strokes: [stroke(79998)], redo: [] } }); for (let i = 0; i < 3; i++) { h.run('undoCurrent'); assert.equal(h.state.totalPoints, 79998); h.run('redoCurrent'); assert.equal(h.state.totalPoints, 80000); assertCounter(h); } const normalized = h.run('normalizeImportedProject', clone(h.run('serializeProjectPayload'))); assert.equal(normalized.totalPoints, 80000); });
test('Point acquisition stops at exact cap without storing an empty stroke', () => { const h = setup(harness(), ['A'], { A: { strokes: [stroke(79999)], redo: [] } }); h.draw(); assert.equal(h.state.totalPoints, 80000); h.draw(); assert.equal(h.state.glyphs.A.strokes.length, 2); assertCounter(h); });
for (const boundary of ['setup','help','picker','confirm']) test(`Active stroke is committed before ${boundary} boundary and ignores stale release`, async () => {
  const h = setup(harness()); h.pointer('pointerdown'); h.pointer('pointermove', { clientX: 200 }); let pending;
  if (boundary === 'setup') h.$('#backToSetupButton').click(); else if (boundary === 'help') h.$('#helpButton').click(); else if (boundary === 'picker') h.$('#openGlyphPickerButton').click(); else { pending = h.run('resetProject'); await tick(); h.$('#appConfirmCancel').click(); await pending; }
  h.pointer('pointerup', { clientX: 900 }); assert.equal(h.state.glyphs.A?.strokes.length, 1); assert.equal(h.state.glyphs.A.strokes[0].points.length, 2); assertCounter(h);
});
for (const type of ['pointercancel','lostpointercapture']) test(`${type} retains captured points without inventing an endpoint`, () => { const h = setup(harness()); h.pointer('pointerdown'); h.pointer('pointermove', { clientX: 220, clientY: 330 }); h.pointer(type, { clientX: 0, clientY: 0 }); h.pointer('pointerup', { clientX: 800 }); const points = h.state.glyphs.A?.strokes[0]?.points; assert.equal(points?.length, 2); assert.equal(points[1].x, 220); assert.equal(points[1].y, 330); assertCounter(h); h.draw(); assert.equal(h.state.glyphs.A.strokes.length, 2, 'Drawing can resume after capture loss'); });
for (const button of [1,2]) test(`Mouse button ${button} does not create a stroke`, () => { const h = setup(harness()); h.pointer('pointerdown', { button }); h.pointer('pointerup', { button, clientX: 300 }); assert.equal(actualPoints(h.state), 0); });
test('A secondary pointer cannot start or finish the primary pointer stroke', () => { const h = setup(harness()); h.pointer('pointerdown', { pointerType: 'touch', isPrimary: false, pointerId: 2 }); h.pointer('pointerup', { pointerId: 2 }); assert.equal(actualPoints(h.state), 0); h.pointer('pointerdown', { pointerType: 'pen' }); h.pointer('pointerup', { pointerId: 2, clientX: 400 }); h.pointer('pointermove', { pointerType: 'pen', clientX: 200 }); h.pointer('pointerup', { pointerType: 'pen', clientX: 300 }); assert.equal(h.state.glyphs.A.strokes.length, 1); assert.equal(h.state.glyphs.A.strokes[0].points.length, 3); assert.ok(h.state.glyphs.A.strokes[0].points.every(item => item.pen)); });
test('Coalesced pen moves and touch strokes retain normal drawing behavior', () => { for (const pointerType of ['pen','touch']) { const h = setup(harness()); h.pointer('pointerdown', { pointerType }); h.pointer('pointermove', { pointerType, getCoalescedEvents: () => [200,300].map(x => ({ pointerType, clientX:x, clientY:100, pressure:.8 })) }); h.pointer('pointerup', { pointerType, clientX: 400 }); assert.equal(h.state.totalPoints, 4); assertCounter(h); } });
for (const edit of ['stroke-start','undo','redo','clear','pen-width','character-set']) test(`${edit} immediately removes old TTF download readiness`, async () => {
  const h = setup(harness(), ['A','B'], { A: { strokes: [stroke(3)], redo: [] } }); await h.generate();
  if (edit === 'stroke-start') h.pointer('pointerdown');
  else if (edit === 'pen-width') { h.$('#penWidthInput').value = '70'; h.$('#penWidthInput').dispatch('input'); }
  else if (edit === 'character-set') { h.$('#customTextInput').value = 'A'; h.$('#startWritingButton').click(); }
  else { if (edit === 'redo') { h.state.glyphs.A.strokes.push(stroke(2)); h.state.totalPoints += 2; h.run('undoCurrent'); await h.generate(); } h.run(edit === 'clear' ? 'clearCurrent' : `${edit}Current`); }
  assertInvalid(h); const before = h.downloads.length; h.run('downloadFont'); assert.equal(h.downloads.length, before);
});
test('Language switch and unchanged family input do not invalidate current TTF', async () => { const h = setup(harness(), ['A'], { A: { strokes: [stroke(3)], redo: [] } }); await h.generate(); const bytes = h.state.previewBytes; h.$('#languageButton').click(); assert.equal(h.state.language, 'ja'); assert.equal(h.state.previewBytes, bytes); h.$('#fontNameInput').dispatch('input'); assert.equal(h.state.previewBytes, bytes); h.$('#languageButton').click(); assert.equal(h.state.language, 'en'); assert.equal(h.state.previewBytes, bytes); });
test('Out-of-order FontFace success cannot replace newer bytes or quality', async () => { const h = setup(harness(), ['A'], { A: { strokes: [stroke(3)], redo: [] } }); const first = h.run('generatePreviewFont'); await h.advance(0); const old = h.faces.at(-1); h.$('#fontNameInput').value = 'Newest Family'; h.$('#fontNameInput').dispatch('input'); await h.advance(400); const latest = h.faces.at(-1); assert.notEqual(latest, old); latest.resolve(); await tick(); const bytes = h.state.previewBytes, quality = clone(h.state.quality), status = h.$('#fontStatusText').textContent; old.resolve(); await first; assert.equal(h.state.previewBytes, bytes); assert.deepEqual(clone(h.state.quality), quality); assert.equal(h.$('#fontStatusText').textContent, status); assert.ok(familyNames(bytes).includes('Newest Family')); });
test('Late old load error cannot remove a newer successful preview or status', async () => { const h = setup(harness(), ['A'], { A: { strokes: [stroke(3)], redo: [] } }); const oldTask = h.run('generatePreviewFont'); await h.advance(0); const old = h.faces.at(-1); h.$('#fontNameInput').value = 'Newest Family'; h.$('#fontNameInput').dispatch('input'); await h.advance(400); h.faces.at(-1).resolve(); await tick(); const bytes = h.state.previewBytes, status = h.$('#fontStatusText').textContent; old.reject(); await oldTask; assert.equal(h.state.previewBytes, bytes); assert.equal(h.$('#fontStatusText').textContent, status); assert.equal(h.$('#downloadButton').disabled, false); });
test('Reset rejects late old load errors without an error status', async () => { const h = setup(harness(), ['A'], { A: { strokes: [stroke(3)], redo: [] } }); const pending = h.run('generatePreviewFont'); await h.advance(0); const old = h.faces.at(-1); await h.confirm(h.run('resetProject')); const status = h.$('#fontStatusText').textContent; old.reject(); await pending; assert.equal(h.$('#fontStatusText').textContent, status); assertInvalid(h); });
for (const importedDrawn of [false,true]) test(`Import replacement rejects old generation with ${importedDrawn ? 'drawn' : 'empty'} new project`, async () => { const h = setup(harness(), ['A'], { A: { strokes: [stroke(3)], redo: [] } }); const pending = h.run('generatePreviewFont'); await h.advance(0); const old = h.faces.at(-1); const data = payload('Replacement', ['C'], importedDrawn ? { C: { strokes: [stroke(2)] } } : {}); await h.confirm(h.run('loadProjectFile', file(data))); old.resolve(); await pending; assertInvalid(h); assert.deepEqual(Object.keys(h.state.quality), []); if (importedDrawn) { await h.advance(0); h.faces.at(-1).resolve(); await tick(); assert.ok(familyNames(h.state.previewBytes).includes('Replacement')); assert.deepEqual(Object.keys(h.state.quality), ['C']); } });
test('Import cancels a pending debounced old build before empty replacement', async () => { const h = setup(harness(), ['A'], { A: { strokes: [stroke(3)], redo: [] } }); h.run('scheduleFontGeneration'); await h.confirm(h.run('loadProjectFile', file(payload('Empty')))); await h.advance(400); assert.equal(h.faces.length, 0); assertInvalid(h); });
test('Reset and import discard obsolete active pointer releases and Clear Undo', async () => { for (const operation of ['reset','import']) { const h = setup(harness(), ['A'], { A: { strokes: [stroke(3)], redo: [] } }); h.run('clearCurrent'); h.pointer('pointerdown'); h.pointer('pointermove', { clientX: 250 }); if (operation === 'reset') await h.confirm(h.run('resetProject')); else await h.confirm(h.run('loadProjectFile', file(payload('Replacement')))); h.pointer('pointerup', { clientX: 900 }); h.$('#appToastAction').click(); assert.equal(actualPoints(h.state), 0); assertCounter(h); } });
test('Writing backup is available pending/failed TTF and includes active stroke', async () => { const h = setup(harness()); const backup = h.$('#saveProjectFileButtonWrite'); assert.equal(backup.disabled, false); assert.ok(backup.closest('[data-panel="write"]'), 'Backup lives on writing step'); h.$('#projectFilenameWrite').value = 'My / edited.ttf'; h.$('#projectFilenameWrite').dispatch('input'); h.pointer('pointerdown'); h.pointer('pointermove', { clientX: 250 }); backup.click(); assert.equal(h.downloads.length, 1); const saved = JSON.parse(await h.downloads[0].blob.text()); assert.equal(saved.glyphs.A.strokes[0].points.length, 2); assert.equal(h.downloads[0].name, 'My - edited.handfont.json'); assert.equal(saved.schemaVersion, 1); assert.equal(saved.glyphFilter, undefined); const pending = h.run('generatePreviewFont'); await h.advance(0); assertInvalid(h); backup.click(); assert.equal(h.downloads.length, 2); h.faces.at(-1).reject(); await pending; assertInvalid(h); backup.click(); assert.equal(h.downloads.length, 3); const normalized = h.run('normalizeImportedProject', saved); assert.equal(normalized.totalPoints, 2); });
test('Backup survives unavailable localStorage and reload recovers a saved project', async () => { const blocked = setup(harness({ storageFails: true })); blocked.draw(); await blocked.advance(180); blocked.$('#saveProjectFileButtonWrite').click(); assert.equal(blocked.downloads.length, 1); const payload = JSON.parse(await blocked.downloads[0].blob.text()); assert.equal(payload.glyphs.A.strokes.length, 1); const storage = new Map(), h = setup(harness({ storage })); h.draw(); await h.advance(180); const reloaded = harness({ storage }); assert.equal(reloaded.state.glyphs.A.strokes.length, 1); assert.equal(reloaded.state.totalPoints, 3); });
test('Shared All/Unfinished/Review filters preserve selection, order and counts', () => { const h = setup(harness(), ['A','B','C'], { A: { strokes: [stroke(3)], redo: [] }, C: { strokes: [stroke(2)], redo: [] } }); h.state.quality.C = { warning:true, warningSizes:[16], sizes:[] }; h.run('refreshGlyphListState');
  const expected = { all: ['A','B','C'], unfinished:['B'], review:['C'] };
  for (const [filter, chars] of Object.entries(expected)) { setFilter(h, filter); assert.equal(h.state.currentIndex, 0); assert.deepEqual(visibleGlyphs(h), chars); assert.deepEqual(visibleGlyphs(h, '#glyphPickerGrid'), chars); for (const button of h.document.querySelectorAll(`[data-glyph-filter="${filter}"]`)) { assert.equal(button.getAttribute('aria-pressed'), 'true'); assert.match(button.textContent + button.children.map(child=>child.textContent).join(''), new RegExp(String(chars.length))); } }
  h.run('selectCharacter', 1); h.draw(); assert.deepEqual(visibleGlyphs(h), [], 'Editing invalidates stale review results'); assert.equal(h.state.currentIndex, 1); setFilter(h,'unfinished',1); assert.deepEqual(visibleGlyphs(h), []); assert.equal(h.$('#glyphListEmpty').hidden, false); assert.equal(h.$('#glyphPickerEmpty').hidden, false); setFilter(h,'all',1); assert.deepEqual(visibleGlyphs(h), ['A','B','C']); });
test('Filter updates after quality completion, clear, import and reset', async () => { const h = setup(harness(), ['A','B'], { A: { strokes: [stroke(3)], redo: [] } }); setFilter(h,'unfinished'); assert.deepEqual(visibleGlyphs(h), ['B']); h.run('clearCurrent'); assert.deepEqual(visibleGlyphs(h), ['A','B']); h.$('#appToastAction').click(); assert.deepEqual(visibleGlyphs(h), ['B']); setFilter(h,'review'); await h.generate(); assert.deepEqual(visibleGlyphs(h), []); assert.equal(h.$('#glyphListEmpty').hidden, false); await h.confirm(h.run('loadProjectFile',file(payload('New',['C','D'])))); assert.equal(h.state.currentIndex,0); assert.deepEqual(visibleGlyphs(h),['C','D']); assert.equal(h.state.glyphFilter,'all'); await h.confirm(h.run('resetProject')); assert.equal(h.state.glyphFilter,'all'); assert.equal(visibleGlyphs(h).length,h.state.chars.length); });
for (const guard of ['help','picker','confirm','composition','keyCode229','contenteditable','input']) test(`Global shortcuts leave state unchanged during ${guard}`, async () => { const h = setup(harness(), ['A','B'], { A:{strokes:[stroke(3)],redo:[]} }); let pending; if(guard==='help') h.$('#helpButton').click(); if(guard==='picker') h.$('#openGlyphPickerButton').click(); if(guard==='confirm') { pending=h.run('resetProject'); await tick(); } const target=guard==='input'?h.$('#fontNameInput'):h.document.body; if(guard==='contenteditable') { target.isContentEditable=true; target.setAttribute('contenteditable','true'); } const attributes={target,isComposing:guard==='composition',keyCode:guard==='keyCode229'?229:0}; h.document.dispatch('keydown',{...attributes,key:'ArrowRight'}); h.document.dispatch('keydown',{...attributes,key:'z',ctrlKey:true}); assert.equal(h.state.currentIndex,0); assert.equal(h.state.totalPoints,3); if(pending){h.$('#appConfirmCancel').click();await pending;} });
test('Ordinary keyboard navigation and undo/redo remain usable', () => { const h=setup(harness(),['A','B'],{A:{strokes:[stroke(3)],redo:[]}}); const key=(key,extra={})=>h.document.dispatch('keydown',{target:h.document.body,key,...extra}); key('z',{ctrlKey:true}); assert.equal(h.state.totalPoints,0); key('z',{ctrlKey:true,shiftKey:true}); assert.equal(h.state.totalPoints,3); key('ArrowRight'); assert.equal(h.state.currentIndex,1); key('ArrowLeft'); assert.equal(h.state.currentIndex,0); });
test('Imported currentIndex is integral, finite and within bounds',()=>{const h=harness();for(const index of [0.5,1.8,-3,Infinity,'1.7','garbage',99]){const result=h.run('normalizeImportedProject',{...payload('Imported',['A','B']),currentIndex:index});assert.ok(Number.isInteger(result.currentIndex));assert.ok(result.currentIndex>=0&&result.currentIndex<2);}});
test('Malformed and oversized imports preserve project; long strokes round-trip', async()=>{const h=setup(harness(),['A'],{A:{strokes:[stroke(3)],redo:[]}});const before=clone(h.run('serializeProjectPayload'));await h.run('loadProjectFile',{text:async()=>'{no'});assert.equal(h.state.fontName,before.fontName);assert.equal(h.state.totalPoints,3);assert.throws(()=>h.run('normalizeImportedProject',payload('Large',['A'],{A:{strokes:[stroke(80001)]}})),/point limit/);assert.throws(()=>h.run('normalizeImportedProject',payload('Large',Array.from({length:181},(_,i)=>String.fromCharCode(0x100+i)))),/character limit/);const restored=h.run('normalizeImportedProject',payload('Long',['A','A','😀'],{A:{strokes:[stroke(4001)]}}));assert.equal(restored.totalPoints,4001);assert.deepEqual(clone(restored.chars),['A']);});
test('Latest import intent wins when file reads finish out of order',async()=>{const h=setup(harness());const first=deferred(),second=deferred();const old=h.run('loadProjectFile',{text:()=>first.promise});const latest=h.run('loadProjectFile',{text:()=>second.promise});second.resolve(JSON.stringify(payload('Newest',['C'])));await latest;first.resolve(JSON.stringify(payload('Older',['D'])));await old;assert.equal(h.state.fontName,'Newest');assert.deepEqual(clone(h.state.chars),['C']);});
test('Invalid latest import does not permit an earlier file to replace work',async()=>{const h=setup(harness());const first=deferred(),old=h.run('loadProjectFile',{text:()=>first.promise});await h.run('loadProjectFile',{text:async()=>'{bad'});first.resolve(JSON.stringify(payload('Obsolete')));await old;assert.equal(h.state.fontName,'Old Family');});
test('Cancelling replacement keeps the current project and ignores old completion',async()=>{const h=setup(harness(),['A'],{A:{strokes:[stroke(3)],redo:[]}});const first=deferred(),old=h.run('loadProjectFile',{text:()=>first.promise});const latest=h.run('loadProjectFile',file(payload('Newest')));await tick();assert.equal(h.$('#appConfirmDialog').open,true);h.$('#appConfirmCancel').click();await latest;first.resolve(JSON.stringify(payload('Obsolete')));await old;assert.equal(h.state.fontName,'Old Family');assert.equal(h.state.totalPoints,3);});
for(const event of ['pagehide','visibilitychange'])test(`${event} flushes pending and active handwriting before reload`,()=>{const storage=new Map(),h=setup(harness({storage}));h.pointer('pointerdown');h.pointer('pointermove',{clientX:250});if(event==='pagehide')h.window.dispatch(event);else{h.document.visibilityState='hidden';h.document.hidden=true;h.document.dispatch(event);}const saved=storage.get(h.read('STORAGE_KEY'));assert.ok(saved,'Saved before debounce timer runs');const data=JSON.parse(saved);assert.equal(data.glyphs.A.strokes[0].points.length,2);const reloaded=harness({storage});assert.equal(reloaded.state.totalPoints,2);assert.equal(reloaded.state.glyphs.A.strokes.length,1);});

for (const tag of ['textarea','select','nested-editable']) test(`Global shortcuts ignore ${tag} descendants`, () => { const h=setup(harness(),['A','B'],{A:{strokes:[stroke(3)],redo:[]}}); const outer=h.document.createElement(tag==='nested-editable'?'div':tag), target=tag==='nested-editable'?h.document.createElement('span'):outer; if(tag==='nested-editable'){outer.setAttribute('contenteditable','true');outer.append(target);} h.document.body.append(outer); h.document.dispatch('keydown',{target,key:'ArrowRight'}); h.document.dispatch('keydown',{target,key:'z',metaKey:true});assert.equal(h.state.currentIndex,0);assert.equal(h.state.totalPoints,3); });
test('Explicitly noneditable target still permits global navigation',()=>{const h=setup(harness());const target=h.document.createElement('div');target.setAttribute('contenteditable','false');h.document.body.append(target);h.document.dispatch('keydown',{target,key:'ArrowRight'});assert.equal(h.state.currentIndex,1);});
test('Old load completion during a new active stroke cannot restore download readiness',async()=>{const h=setup(harness(),['A'],{A:{strokes:[stroke(3)],redo:[]}});const pending=h.run('generatePreviewFont');await h.advance(0);const old=h.faces.at(-1);h.pointer('pointerdown');old.resolve();await pending;assertInvalid(h);assert.deepEqual(Object.keys(h.state.quality),[]);h.pointer('pointerup',{clientX:250});await h.advance(400);h.faces.at(-1).resolve();await tick();assert.ok(h.state.previewBytes);assertCounter(h);});
test('A stale generation invalidated before its deferred build never creates a FontFace',async()=>{const h=setup(harness(),['A'],{A:{strokes:[stroke(3)],redo:[]}});const pending=h.run('generatePreviewFont');h.pointer('pointerdown');await h.advance(0);await pending;assert.equal(h.faces.length,0);assertInvalid(h);});
test('An empty old generation cannot suppress a new drawn imported project',async()=>{const h=setup(harness());const pending=h.run('generatePreviewFont');await h.run('loadProjectFile',file(payload('Drawn Import',['C'],{C:{strokes:[stroke(3)]}})));await pending;await h.advance(0);assert.equal(h.faces.length,1);h.faces[0].resolve();await tick();assert.ok(familyNames(h.state.previewBytes).includes('Drawn Import'));assert.deepEqual(Object.keys(h.state.quality),['C']);});
test('Latest import read error cannot be overwritten by an older success or stale failure toast',async()=>{const h=setup(harness()),oldRead=deferred();const old=h.run('loadProjectFile',{text:()=>oldRead.promise});await h.run('loadProjectFile',file(payload('Latest')));const text=h.$('#appToastMessage').textContent;oldRead.reject(new Error('old read failed'));await old;assert.equal(h.state.fontName,'Latest');assert.equal(h.$('#appToastMessage').textContent,text);});
test('Opening and cancelling a newer file picker invalidates an older outstanding read',async()=>{const h=setup(harness()),read=deferred();const pending=h.run('loadProjectFile',{text:()=>read.promise});h.$('#loadProjectButtonTop').click();read.resolve(JSON.stringify(payload('Obsolete')));await pending;assert.equal(h.state.fontName,'Old Family');});
test('Confirmed reset invalidates an outstanding file read',async()=>{const h=setup(harness()),read=deferred();const pending=h.run('loadProjectFile',{text:()=>read.promise});await h.confirm(h.run('resetProject'));read.resolve(JSON.stringify(payload('Obsolete')));await pending;assert.equal(h.state.fontName,'My Handwriting');assert.equal(h.state.totalPoints,0);assertInvalid(h);});
test('Unfinished filter keeps Previous/Next based on original character order',()=>{const h=setup(harness(),['A','B','C'],{B:{strokes:[stroke(3)],redo:[]}});setFilter(h,'unfinished');h.$('#nextCharButton').click();assert.equal(h.state.currentIndex,1);assert.deepEqual(visibleGlyphs(h),['A','C']);h.$('#previousCharButton').click();assert.equal(h.state.currentIndex,0);});
test('Hiding a focused glyph moves focus to the active filter without selecting a glyph',()=>{const h=setup(harness(),['A','B'],{A:{strokes:[stroke(3)],redo:[]}});h.$('#glyphList').querySelector('.glyph-button').focus();setFilter(h,'unfinished');assert.equal(h.document.activeElement.dataset.glyphFilter,'unfinished');assert.equal(h.state.currentIndex,0);});
test('Native confirmation cancel closes and restores focus without changing handwriting',async()=>{const h=setup(harness(),['A'],{A:{strokes:[stroke(3)],redo:[]}});h.$('#newProjectButton').focus();const pending=h.run('resetProject');await tick();const event=h.$('#appConfirmDialog').dispatch('cancel');await pending;assert.equal(event.defaultPrevented,true);assert.equal(h.$('#appConfirmDialog').open,false);assert.equal(h.document.activeElement,h.$('#newProjectButton'));assert.equal(h.state.totalPoints,3);});
test('Edited TTF filename is sanitized and downloadable bytes match current renamed family',async()=>{const h=setup(harness(),['A'],{A:{strokes:[stroke(3)],redo:[]}});h.$('#fontNameInput').value='Final Family';h.$('#fontNameInput').dispatch('input');await h.generate();h.$('#outputFilename').value='custom:/font.ttf';h.$('#downloadButton').click();assert.equal(h.downloads.length,1);assert.equal(h.downloads[0].name,'custom--font.ttf');const bytes=new Uint8Array(await h.downloads[0].blob.arrayBuffer());parseTtf(bytes);assert.ok(familyNames(bytes).includes('Final Family'));});

test('Drawing during a pending import read requires confirmation and Cancel preserves partial stroke',async()=>{const h=setup(harness()),read=deferred();const pending=h.run('loadProjectFile',{text:()=>read.promise});h.pointer('pointerdown');h.pointer('pointermove',{clientX:250});read.resolve(JSON.stringify(payload('Replacement')));await tick();assert.equal(h.$('#appConfirmDialog').open,true,'Writing acquired during file read must require replacement confirmation');h.$('#appConfirmCancel').click();await pending;assert.equal(h.state.fontName,'Old Family');assert.equal(h.state.glyphs.A.strokes[0].points.length,2);assertCounter(h);h.pointer('pointerup',{clientX:800});assert.equal(h.state.glyphs.A.strokes[0].points.length,2);});
test('Editable JSON round-trip preserves off-list handwriting and accurate total points',()=>{const h=setup(harness(),['A','B'],{A:{strokes:[stroke(3)],redo:[]},B:{strokes:[stroke(2)],redo:[]}});h.$('#customTextInput').value='B';h.$('#startWritingButton').click();assert.deepEqual(clone(h.state.chars),['B']);const saved=clone(h.run('serializeProjectPayload'));const imported=h.run('normalizeImportedProject',saved);assert.deepEqual(clone(imported.chars),['B']);assert.equal(imported.glyphs.A?.strokes[0].points.length,3,'Off-list A survives backup and import');assert.equal(imported.totalPoints,5);});
test('Import must confirm when handwriting exists only outside selected characters',async()=>{const h=setup(harness(),['A','B'],{A:{strokes:[stroke(3)],redo:[]}});h.$('#customTextInput').value='B';h.$('#startWritingButton').click();const pending=h.run('loadProjectFile',file(payload('Replacement')));await tick();assert.equal(h.$('#appConfirmDialog').open,true,'Stored off-list handwriting needs replacement confirmation');h.$('#appConfirmCancel').click();await pending;assert.equal(h.state.glyphs.A.strokes[0].points.length,3);assertCounter(h);});
test('Writing screen filename remains editable and synchronized without a valid TTF',async()=>{const h=setup(harness());const input=h.$('#projectFilenameWrite');assert.ok(input.closest('[data-panel="write"]'));assert.equal(input.disabled,false);input.value='resume:/draft';input.dispatch('input');assert.equal(h.$('#outputFilename').value,'resume:/draft');h.draw();h.$('#saveProjectFileButtonWrite').click();assert.equal(h.downloads.at(-1).name,'resume--draft.handfont.json');h.$('#outputFilename').value='changed-from-export';h.$('#outputFilename').dispatch('input');assert.equal(input.value,'changed-from-export');assertInvalid(h);});

test('Imported active plus off-list stored characters share the 180-character cap',()=>{const h=harness(),chars=Array.from({length:180},(_,i)=>String.fromCharCode(0x100+i));assert.throws(()=>h.run('normalizeImportedProject',payload('Over combined cap',chars,{A:{strokes:[stroke(3)]}})),/character limit/);const allowed=h.run('normalizeImportedProject',payload('Exact combined cap',chars.slice(0,179),{A:{strokes:[stroke(3)]}}));assert.equal(allowed.chars.length,179);assert.equal(allowed.glyphs.A.strokes[0].points.length,3);assert.equal(allowed.totalPoints,3);});
test('Stored off-list points share the 80000-point import cap',()=>{const h=harness();assert.throws(()=>h.run('normalizeImportedProject',payload('Too many points',['B'],{A:{strokes:[stroke(79999)]},B:{strokes:[stroke(2)]}})),/point limit/);const exact=h.run('normalizeImportedProject',payload('Exact point cap',['B'],{A:{strokes:[stroke(79998)]},B:{strokes:[stroke(2)]}}));assert.equal(exact.totalPoints,80000);assert.equal(exact.glyphs.A.strokes[0].points.length,79998);});
test('Character selection exceeding combined stored-character cap is rejected without deletion',()=>{const h=setup(harness(),['A'],{A:{strokes:[stroke(3)],redo:[]}});h.$('#customTextInput').value=Array.from({length:180},(_,i)=>String.fromCharCode(0x100+i)).join('');h.$('#startWritingButton').click();assert.deepEqual(clone(h.state.chars),['A']);assert.equal(h.state.glyphs.A.strokes[0].points.length,3);assertCounter(h);});
test('Reload preserves hidden handwriting while generated font includes only selected glyphs',async()=>{const storage=new Map(),h=setup(harness({storage}),['A','B'],{A:{strokes:[stroke(3)],redo:[]},B:{strokes:[stroke(2)],redo:[]}});h.$('#customTextInput').value='B';h.$('#startWritingButton').click();await h.advance(180);const reloaded=harness({storage});assert.deepEqual(clone(reloaded.state.chars),['B']);assert.equal(reloaded.state.glyphs.A?.strokes[0].points.length,3);assertCounter(reloaded);await reloaded.generate();const parsed=parseTtf(reloaded.state.previewBytes);assert.equal(parsed.glyphId('A'),0);assert.ok(parsed.glyphId('B')>1);});

for(const [typed,expected] of [['folder\\draft','folder-draft'],['folder/draft','folder-draft'],['my-font.handfont.json','my-font'],['my-font.ttf','my-font']])test(`Writing filename sanitizes ${JSON.stringify(typed)} consistently for backup`,async()=>{const h=setup(harness());const input=h.$('#projectFilenameWrite');input.value=typed;input.dispatch('input');h.$('#saveProjectFileButtonWrite').click();assert.equal(h.downloads[0].name,`${expected}.handfont.json`);assert.equal(input.value,expected);assert.equal(h.$('#outputFilename').value,expected);const saved=JSON.parse(await h.downloads[0].blob.text());assert.equal(saved.schemaVersion,1);assert.equal(saved.filename,undefined);});
for(const reserved of ['CON','CON.txt'])test(`Writing backup makes reserved Windows stem ${reserved} safe`,()=>{const h=setup(harness());h.$('#projectFilenameWrite').value=reserved;h.$('#projectFilenameWrite').dispatch('input');h.$('#saveProjectFileButtonWrite').click();assert.equal(h.downloads.length,1);const name=h.downloads[0].name;assert.ok(name.endsWith('.handfont.json'));assert.doesNotMatch(name,/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i);assert.equal(h.$('#outputFilename').value,h.$('#projectFilenameWrite').value);});
// Recovery changes presentation and scheduling only, not the project or font algorithms.
async function failFontPreview(h) {
  const task = h.run('generatePreviewFont');
  await h.advance(0);
  h.faces.at(-1).reject();
  await task;
  assert.equal(h.state.fontStatusMode, 'error');
}
function captureProject(h) {
  const { savedAt, ...payload } = h.run('serializeProjectPayload'); // Export time is not editing state.
  return JSON.stringify({ payload, glyphs: h.state.glyphs, totalPoints: h.state.totalPoints, filter: h.state.glyphFilter, filename: h.$('#outputFilename').value });
}
for (const language of ['en', 'ja']) {
  test(`${language}: failed preview shows unavailable quality and four not-checked badges`, async () => {
    const h = setup(harness(), ['A', 'B'], { A: { strokes: [stroke(3)], redo: [] } });
    h.state.language = language; h.run('applyLanguage');
    const before = captureProject(h);
    await failFontPreview(h);
    assert.equal(h.$('#qualityResultTitle').textContent, language === 'en' ? 'Glyph check unavailable' : '字形を確認できません');
    assert.equal(h.$('#qualityResult').classList.contains('unavailable'), true);
    assert.equal(h.$('#qualityResult').classList.contains('warning'), false);
    assert.match(h.$('#fontStatusText').textContent, language === 'en' ? /retry|backup/i : /再試行|保存/);
    assert.doesNotMatch(h.$('#fontStatusText').textContent, /rewrit|書き直/i);
    for (const size of [12, 16, 24, 48]) {
      const badge = h.$('#previewStatus' + size), label = language === 'en' ? 'Not checked' : '未確認';
      assert.equal(badge.textContent, label);
      assert.equal(badge.getAttribute('aria-label'), `${size}px ${label}`);
      for (const tone of ['ok', 'advisory', 'warning']) assert.equal(badge.classList.contains(tone), false);
    }
    assertInvalid(h); assert.deepEqual(Object.keys(h.state.quality), []);
    assert.equal(h.$('#qualityMetric').classList.contains('warning'), false);
    h.$('#saveProjectFileButtonWrite').click();
    const backup = JSON.parse(await h.downloads.at(-1).blob.text());
    assert.equal(backup.schemaVersion, 1); assert.deepEqual(backup.glyphs.A.strokes, clone(h.state.glyphs.A.strokes));
    assert.equal(captureProject(h), before);
    h.run('selectCharacter', 1);
    assert.equal(h.$('#qualityResult').hidden, true);
    assert.ok([12, 16, 24, 48].every(size => h.$('#previewStatus' + size).textContent === '—'));
    assert.equal(h.$('#retryFontButton').hidden, false, 'Retry is project-wide even on an empty current glyph');
    h.run('selectCharacter', 0);
    assert.equal(h.$('#qualityResultTitle').textContent, language === 'en' ? 'Glyph check unavailable' : '字形を確認できません');
    h.$('#languageButton').click();
    assert.equal(h.$('#retryFontButton').textContent, language === 'en' ? 'フォント表示を再試行' : 'Retry font preview');
    assert.equal(h.$('#qualityResultTitle').textContent, language === 'en' ? '字形を確認できません' : 'Glyph check unavailable');
  });
  test(`${language}: retry preserves all work, synchronously blocks repeats, and recovers real TTF`, async () => {
    const h = setup(harness(), ['A', 'B'], { A: { strokes: [stroke(3)], redo: [stroke(2)] }, C: { strokes: [stroke(4)], redo: [] } });
    h.state.language = language; h.run('applyLanguage');
    h.$('#projectFilenameWrite').value = 'my-retry-font'; h.$('#projectFilenameWrite').dispatch('input');
    setFilter(h, 'review');
    await failFontPreview(h);
    const before = captureProject(h), generation = h.state.fontGeneration, faces = h.faces.length;
    const button = h.$('#retryFontButton');
    assert.equal(button.hidden, false); assert.equal(button.disabled, false);
    assert.equal(button.textContent, language === 'en' ? 'Retry font preview' : 'フォント表示を再試行');
    button.focus(); button.click();
    assert.equal(h.state.fontStatusMode, 'generating'); assert.equal(h.state.fontGeneration, generation + 1);
    assert.equal(button.hidden, true); assert.equal(button.disabled, true);
    assert.equal(h.document.activeElement, h.$('#fontStatus'));
    assert.equal(h.$('#fontStatus').getAttribute('tabindex'), '-1');
    button.dispatch('click'); button.dispatch('click');
    assert.equal(h.state.fontGeneration, generation + 1, 'Handler guard also prevents queued repeated activation');
    assert.equal(h.$('#qualityResultTitle').textContent, h.run('t', 'qualityChecking'));
    assert.equal(h.$('#qualityResult').classList.contains('unavailable'), false);
    assert.ok([12, 16, 24, 48].every(size => h.$('#previewStatus' + size).textContent === h.run('t', 'sizeChecking')));
    assertInvalid(h); assert.equal(captureProject(h), before);
    await h.advance(0); assert.equal(h.faces.length, faces + 1);
    h.faces.at(-1).resolve(); await tick();
    assert.equal(h.state.fontStatusMode, 'ready'); assert.equal(button.hidden, true);
    assert.equal(h.$('#downloadButton').disabled, false);
    const parsed = parseTtf(h.state.previewBytes);
    assert.ok(parsed.glyphId('A') > 1); assert.equal(parsed.glyphId('B'), 0); assert.equal(parsed.glyphId('C'), 0);
    assert.equal(parsed.buffer.readUInt16BE(parsed.tables.get('head').offset + 18), 2048);
    assert.ok(familyNames(h.state.previewBytes).includes('Old Family'));
    assert.equal(captureProject(h), before);
    h.$('#downloadButton').click(); assert.equal(h.downloads.at(-1).name, 'my-retry-font.ttf');
    parseTtf(new Uint8Array(await h.downloads.at(-1).blob.arrayBuffer()));
  });
}
test('Retry stays unavailable for initial, empty, pending and successful states, including off-list-only handwriting', async () => {
  const h = setup(harness(), ['B'], { A: { strokes: [stroke(3)], redo: [] } });
  const button = h.$('#retryFontButton');
  assert.equal(button.hidden, true); assert.equal(button.disabled, true);
  button.dispatch('click'); await h.advance(1000); assert.equal(h.faces.length, 0);
  h.run('setFontStatus', 'error', 'fontStatusError');
  assert.equal(button.hidden, true); button.dispatch('click'); await h.advance(1000); assert.equal(h.faces.length, 0);
  h.draw(); assert.equal(button.hidden, true); button.dispatch('click');
  await h.advance(400); assert.equal(h.faces.length, 1);
  h.faces[0].resolve(); await tick(); assert.equal(h.state.fontStatusMode, 'ready');
  assert.equal(button.hidden, true); button.dispatch('click'); await h.advance(1000); assert.equal(h.faces.length, 1);
});
test('A second retry failure returns a usable action without automatic retries or stealing focus', async () => {
  const h = setup(harness(), ['A'], { A: { strokes: [stroke(3)], redo: [] } });
  await failFontPreview(h); h.$('#projectFilenameWrite').focus(); h.$('#retryFontButton').click();
  assert.equal(h.document.activeElement, h.$('#projectFilenameWrite'));
  await h.advance(0); h.faces.at(-1).reject(); await tick();
  assert.equal(h.state.fontStatusMode, 'error'); assert.equal(h.$('#retryFontButton').hidden, false);
  assert.equal(h.document.activeElement, h.$('#projectFilenameWrite'));
  const faces = h.faces.length; await h.advance(10000); assert.equal(h.faces.length, faces);
  assertInvalid(h); assert.equal(h.$('#qualityResult').classList.contains('unavailable'), true);
});
for (const result of ['resolve', 'reject']) test(`A ${result} from a superseded retry cannot replace a newer font`, async () => {
  const h = setup(harness(), ['A'], { A: { strokes: [stroke(3)], redo: [] } });
  await failFontPreview(h); h.$('#retryFontButton').click(); await h.advance(0); const older = h.faces.at(-1);
  h.$('#fontNameInput').value = 'Newest Family'; h.$('#fontNameInput').dispatch('input');
  await h.advance(400); h.faces.at(-1).resolve(); await tick(); const bytes = h.state.previewBytes;
  older[result](); await tick(); assert.equal(h.state.previewBytes, bytes); assert.equal(h.state.fontStatusMode, 'ready');
  assert.equal(h.$('#retryFontButton').hidden, true); parseTtf(bytes); assert.ok(familyNames(bytes).includes('Newest Family'));
});
test('Reset during retry keeps late success unavailable and hides retry', async () => {
  const h = setup(harness(), ['A'], { A: { strokes: [stroke(3)], redo: [] } });
  await failFontPreview(h); h.$('#retryFontButton').click(); await h.advance(0); const older = h.faces.at(-1);
  await h.confirm(h.run('resetProject')); older.resolve(); await tick();
  assert.equal(h.$('#retryFontButton').hidden, true); assert.equal(h.state.totalPoints, 0); assertInvalid(h);
});

test('Retry from an empty current glyph regenerates the drawn active glyph without moving selection', async () => {
  const h = setup(harness(), ['A', 'B'], { A: { strokes: [stroke(3)], redo: [] } });
  await failFontPreview(h); h.run('selectCharacter', 1);
  const before = captureProject(h); h.$('#retryFontButton').click(); await h.advance(0);
  h.faces.at(-1).resolve(); await tick();
  assert.equal(h.state.currentIndex, 1); assert.equal(h.$('#qualityResult').hidden, true);
  assert.ok([12, 16, 24, 48].every(size => h.$('#previewStatus' + size).textContent === '—'));
  assert.equal(captureProject(h), before); assert.equal(h.state.fontStatusMode, 'ready');
  const parsed = parseTtf(h.state.previewBytes); assert.ok(parsed.glyphId('A') > 1); assert.equal(parsed.glyphId('B'), 0);
});
test('Retry preserves a pending Clear Undo operation on another active glyph', async () => {
  const h = setup(harness(), ['A', 'B'], { A: { strokes: [stroke(3)], redo: [] }, B: { strokes: [stroke(2)], redo: [] } });
  const original = clone(h.state.glyphs.A.strokes); h.run('clearCurrent');
  await failFontPreview(h); h.$('#retryFontButton').click(); await h.advance(0);
  h.faces.at(-1).resolve(); await tick(); h.$('#appToastAction').click();
  assert.deepEqual(clone(h.state.glyphs.A.strokes), original); assertCounter(h); assertInvalid(h);
});
for (const result of ['resolve', 'reject']) test(`A late retry ${result} cannot change an imported replacement project`, async () => {
  const h = setup(harness(), ['A'], { A: { strokes: [stroke(3)], redo: [] } });
  await failFontPreview(h); h.$('#retryFontButton').click(); await h.advance(0); const older = h.faces.at(-1);
  await h.confirm(h.run('loadProjectFile', file(payload('Replacement', ['C'], { C: { strokes: [stroke(2)] } }))));
  await h.advance(0); h.faces.at(-1).resolve(); await tick(); const bytes = h.state.previewBytes;
  older[result](); await tick(); assert.equal(h.state.previewBytes, bytes); assert.equal(h.state.fontStatusMode, 'ready');
  assert.equal(h.$('#retryFontButton').hidden, true); const parsed = parseTtf(bytes);
  assert.equal(parsed.glyphId('A'), 0); assert.ok(parsed.glyphId('C') > 1); assert.ok(familyNames(bytes).includes('Replacement'));
});

for (const stage of ['build', 'constructor', 'analysis']) test(`Retry recovers from an injected ${stage} failure without changing project data`, async () => {
  const h = setup(harness(), ['A', 'B'], { A: { strokes: [stroke(3)], redo: [stroke(2)] } });
  const before = captureProject(h), functionName = stage === 'build' ? 'buildFont' : 'analyzeAllGlyphQuality';
  const original = stage === 'constructor' ? h.context.FontFace : h.read(functionName);
  // Inject only the fault boundary; successful retry uses the real generator and analysis.
  if (stage === 'constructor') h.context.FontFace = class { constructor() { throw new Error('Injected constructor failure'); } };
  else h.read(`${functionName} = () => { throw new Error('Injected failure'); }`);
  const pending = h.run('generatePreviewFont'); await h.advance(0);
  if (stage === 'analysis') h.faces.at(-1).resolve();
  await pending;
  assert.equal(h.state.fontStatusMode, 'error'); assert.equal(h.$('#retryFontButton').hidden, false);
  assert.equal(h.$('#qualityResultTitle').textContent, 'Glyph check unavailable');
  assert.equal(captureProject(h), before); assertInvalid(h); assert.equal(h.document.fonts.size, 0);
  if (stage === 'constructor') h.context.FontFace = original;
  else { h.context.__original = original; h.read(`${functionName} = globalThis.__original`); }
  h.$('#retryFontButton').click(); await h.advance(0); h.faces.at(-1).resolve(); await tick();
  assert.equal(h.state.fontStatusMode, 'ready'); assert.equal(captureProject(h), before); parseTtf(h.state.previewBytes);
});
for (const result of ['resolve', 'reject']) test(`A retry ${result} during active drawing stays stale`, async () => {
  const h = setup(harness(), ['A'], { A: { strokes: [stroke(3)], redo: [] } });
  await failFontPreview(h); h.$('#retryFontButton').click(); await h.advance(0); const old = h.faces.at(-1);
  h.pointer('pointerdown'); h.pointer('pointermove', { clientX: 400 }); old[result](); await tick();
  assertInvalid(h); assert.equal(h.$('#retryFontButton').hidden, true);
  h.pointer('pointercancel'); await h.advance(400); h.faces.at(-1).resolve(); await tick();
  assert.equal(h.state.fontStatusMode, 'ready'); assert.equal(h.state.glyphs.A.strokes.length, 2); assertCounter(h);
});
test('Clear before retry starts cancels it and Clear Undo recovers the font', async () => {
  const h = setup(harness(), ['A'], { A: { strokes: [stroke(3)], redo: [] } });
  await failFontPreview(h); h.$('#retryFontButton').click(); h.run('clearCurrent'); await h.advance(400);
  assert.equal(h.$('#retryFontButton').hidden, true); assert.equal(h.$('#qualityResult').hidden, true);
  assertInvalid(h); assert.equal(h.faces.length, 1);
  h.$('#appToastAction').click(); await h.advance(400); h.faces.at(-1).resolve(); await tick();
  assert.equal(h.state.fontStatusMode, 'ready'); assert.equal(h.state.totalPoints, 3); parseTtf(h.state.previewBytes);
});

(async () => { let failed = 0; for (const item of cases) { try { let deadline; try { await Promise.race([item.fn(), new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Test did not settle (unanswered async state boundary)')), 4000); })]); } finally { clearTimeout(deadline); } console.log(`ok - ${item.name}`); } catch (error) { failed++; console.error(`not ok - ${item.name}\n  ${String(error.stack).slice(0, 3000)}`); } } console.log(`\n${cases.length - failed}/${cases.length} passed (${path.relative(process.cwd(), htmlPath)}). VM logic and binary checks only; browser/device QA is separate.`); process.exitCode = failed ? 1 : 0; })();

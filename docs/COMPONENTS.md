# Reusable UI components

`components/` contains UI snippets that can be reused when creating a new single-HTML app from this template.

They are not automatically loaded by the builder. Copy or adapt the component into `src/index.template.html` so the release remains one self-contained HTML file. Most components are dependency-free; the WebRTC QR pairing component is dependency-aware and uses pinned assets through the existing standalone asset pipeline.

## Fully serverless WebRTC QR pairing

`components/webrtc-qr-pairing.html` is the canonical pattern when a Browser Kitty-style app needs to connect two browsers directly without a signaling server, STUN, TURN, WebSocket, or runtime API. It includes the UI and connection state machine rather than only a low-level helper.

It provides:

- Host / joining-device role selection.
- Chunked QR Offer/Answer transfer plus copy/paste fallback.
- Native `BarcodeDetector` with embedded `jsQR` fallback.
- Low-resolution camera-friendly QR pages and camera selection.
- `RTCPeerConnection({ iceServers: [] })`.
- Complete ICE gathering before QR data is exposed; incomplete SDP is never used after timeout.
- Candidate diagnostics grouped by IPv4 / IPv6 / mDNS without exposing IP addresses.
- Stale-attempt guards and full retry cleanup.
- Delayed joining-side Answer creation: prepare the host reply scanner first, then start Answer/ICE work.
- Automatic fresh-Answer generation after pre-connect ICE failures.
- Default reliable DataChannel plus hooks for application-specific channel layouts.

It requires the pinned QR assets from `examples/dependencies.webrtc-qr.json`. Do not paste the third-party minified bundles into the application source.

See [WebRTC QR Pairing Component](WEBRTC_QR_PAIRING.md) for the complete integration contract, limitations, protocol-prefix options, and release tests.

## Confirmation dialog

`components/confirm-dialog.html` is the preferred replacement for `window.confirm()` when an action is irreversible or high-risk. The starter keeps the API available, while its reversible Clear action demonstrates Toast + Undo instead.

- Centered modal on desktop
- Bottom-sheet presentation on smartphones
- Safe-area aware
- Cancel with `Esc`, the close button, or a backdrop tap
- Restores focus to the previous control
- `tone: 'danger'` for destructive actions
- Dependency-free and offline
- Returns `Promise<boolean>`

### Example

```js
const ok = await AppConfirm.ask({
  title: language === 'ja' ? '確認' : 'Confirm',
  message: language === 'ja'
    ? 'この履歴を削除しますか？'
    : 'Delete this history item?',
  confirmLabel: language === 'ja' ? '削除する' : 'Delete',
  cancelLabel: language === 'ja' ? 'キャンセル' : 'Cancel',
  tone: 'danger'
});

if (!ok) return;
deleteHistoryItem();
```

Finished apps should normally pass localized labels from their own translation object. Preserve `Esc`, backdrop cancellation, focus restoration, keyboard access, and smartphone safe-area handling when adapting the component. For a reliably reversible delete/clear, prefer the Toast + Undo pattern below.

## Toast / Undo

`components/toast.html` is the standard transient status component. It supports a short message, optional tone, and one optional action. Use that action for Undo when an operation is safely reversible.

```js
AppToast.show({
  message: 'Deleted',
  actionLabel: 'Undo',
  duration: 5000,
  onAction: () => restoreDeletedItem()
});
```

Do not stack many toasts. Replace the current toast with the newest relevant status. Keep irreversible/high-risk operations on `AppConfirm` instead of pretending every destructive action is undoable.

## Compact popover menu

`components/popover-menu.html` is the standard compact menu for controls such as Filter, Manage, More, and Output settings. The helper keeps only one menu open and closes it on outside click, `Esc`, or viewport resize. It restores focus after `Esc` and shifts the panel when needed to stay inside the viewport.

Use `data-popover-trigger` with `aria-controls`, plus a matching `data-popover-panel`. Keep menu actions concise; do not hide the single most important primary action inside a popover.

## Preset + custom numeric setting

`components/setting-field.html` implements the common preset/custom pattern used by width, FPS, quality, duration, and similar settings. Custom mode exposes min/max helper text only when needed. The helper deliberately allows intermediate typing and normalizes on change/blur instead of fighting every keystroke.

Listen for the bubbling `settingchange` event or pass an `onChange` callback to `AppSettingField.init()`. Keep units outside the editable value.

## Async source state guard

`components/async-state.html` provides `AppAsyncState.create()`. It models explicit phases and a monotonically increasing source generation. Capture the generation before async work; check `isCurrent(token)` before committing a result. Calling `invalidateSource()` makes all older work stale immediately.

```js
const jobState = AppAsyncState.create({ onChange: renderState });

function onNewFile(file) {
  jobState.invalidateSource();
  clearOldPreviewAndResult();
  jobState.setPhase(file ? 'ready' : 'empty');
}

async function run() {
  const token = jobState.captureGeneration();
  jobState.setPhase('processing', { progress: 0 });
  const result = await processCurrentFile();
  if (!jobState.isCurrent(token)) return;
  showResult(result);
  jobState.setPhase('result', { progress: 1 });
}
```

Use the same principle even if you do not copy this helper. A late result from an old file must never overwrite the UI for a newer file.

## Mobile bottom navigation / page tabs / action bar

`components/mobile-bottom-bar.html` is the canonical fixed smartphone bottom bar for apps that benefit from persistent access to **3-5 meaningful groups or workflow actions**. It is hidden above `600px` by default and is safe-area aware.

For long tools, the preferred mode is now **true mobile page switching**: tapping a bottom tab shows only that group on smartphones, while desktop keeps every section visible in normal document flow. This avoids turning the mobile layout into one very long stacked desktop page.

Use it for patterns such as:

- `Overview / Camera & Audio / Input / Screen & Device` in a device utility.
- `Source / Edit / Preview / Export` in a media workflow.
- `Scan / Pages / PDF` in a document workflow.
- A hybrid bar where some items are pages and another item is a workflow action.

Do not add a bottom bar only because it exists in the template. If the app has one short flow and one obvious primary action, an in-flow button is usually clearer.

### Recommended: true mobile page switching

Add both classes to `<body>`:

```html
<body class="has-mobile-bottom-bar has-mobile-page-tabs">
```

Wrap each mobile group with `app-mobile-page`. Mark the initial page with `is-mobile-active`:

```html
<section id="overviewPage" class="app-mobile-page is-mobile-active">…</section>
<section id="mediaPage" class="app-mobile-page">…</section>
<section id="inputPage" class="app-mobile-page">…</section>
<section id="devicePage" class="app-mobile-page">…</section>
```

Connect each bottom item with `data-mobile-page-target`:

```html
<nav class="app-mobile-bottom-bar" id="mobileBottomBar" style="--app-mobile-bottom-items: 4" aria-label="Mobile navigation">
  <button class="app-mobile-bottom-item is-active" data-mobile-key="overview" data-mobile-page-target="overviewPage" aria-current="page">…</button>
  <button class="app-mobile-bottom-item" data-mobile-key="media" data-mobile-page-target="mediaPage">…</button>
  <button class="app-mobile-bottom-item" data-mobile-key="input" data-mobile-page-target="inputPage">…</button>
  <button class="app-mobile-bottom-item" data-mobile-key="device" data-mobile-page-target="devicePage">…</button>
</nav>
```

At widths above `600px`, `.app-mobile-page` remains `display: block`, so desktop is unchanged. At smartphone widths, `has-mobile-page-tabs` hides all pages except `.is-mobile-active`.

Mount the helper as usual:

```js
const mobileBar = AppMobileBottomBar.mount(
  document.getElementById('mobileBottomBar')
);
```

Application flows can move the user to another tab without faking a click:

```js
mobileBar.showPage('media');
console.log(mobileBar.currentPage()); // "media"
```

This is useful when a guided workflow completes one step and should reveal the next relevant group.

### Backward-compatible section scrolling

For apps where all mobile sections should remain visible and the bottom bar only jumps around the document, use `data-mobile-target` instead:

```html
<button class="app-mobile-bottom-item" data-mobile-key="source" data-mobile-target="sourceSection">…</button>
```

The helper scrolls to the section and can track the visible section with `IntersectionObserver`. Do **not** combine section scrolling and page-tab switching just to add complexity; choose the model that matches the mobile workflow.

### Workflow actions

A button can run application code with `data-mobile-action`:

```html
<button class="app-mobile-bottom-item primary" data-mobile-key="run" data-mobile-action="run">…</button>
<button class="app-mobile-bottom-item" data-mobile-key="save" data-mobile-action="save" disabled>…</button>
```

```js
const mobileBar = AppMobileBottomBar.mount(
  document.getElementById('mobileBottomBar'),
  {
    actions: {
      run: () => runJob(),
      save: () => saveResult()
    }
  }
);

mobileBar.setEnabled('save', false);
// After a valid result exists:
mobileBar.setEnabled('save', true);
```

### Helper API

- `showPage(keyOrId, options?)` — activate a page-tab destination and optionally scroll it into view.
- `currentPage()` — return the current page key.
- `setActive(key)` — update active bottom-item styling.
- `setEnabled(key, enabled)` — set the native disabled state.
- `button(key)` — get one bottom button.
- `destroy()` — remove listeners and observers.

Useful mount options include `initialPage`, `pageTopTarget`, `pageTopOffset`, `onPageChange`, `actions`, and `observeSections`.

### UX rules

- Prefer **3-5 items**; four is a strong default.
- Use a clear icon **and** a short text label. Do not rely on icons alone.
- For a long smartphone tool that naturally has 3-5 groups, prefer **page switching** over one long stacked page.
- Keep the desktop layout in normal document flow; page tabs are a smartphone navigation treatment, not a reason to fragment desktop UX.
- Keep each mobile page internally scrollable through the normal document, not a nested scroll container.
- Preserve the user's current work when switching tabs. A tab change is navigation, not reset.
- Keep unavailable actions actually `disabled`, not merely dimmed.
- Enable Save / Share only after a valid result exists.
- Avoid duplicate fixed CTAs. If the bar contains the primary fixed mobile action, do not add another fixed full-width button.
- Keep `env(safe-area-inset-bottom)` and enough body bottom padding so content cannot hide behind the bar.
- Preserve visible focus, `aria-current`, semantic buttons, and native `disabled` behavior.
- Test at 320, 360, 390/393, and 430px widths and confirm there is no page-level horizontal scrolling.

## WebRTC application-ready rule

For `webrtc-qr-pairing.html`, PeerConnection `connected` alone is not application-ready. The designated readiness DataChannel must also be `open`. Custom channel layouts set `readyChannelLabel` to a reliable control channel.

# WebRTC QR Pairing Component

`components/webrtc-qr-pairing.html` is the reusable Browser Kitty / single-HTML pattern for **fully serverless WebRTC pairing between two browsers**.

It generalizes the connection flow hardened in Wireless Sensor v1.0.0, including the UI: role selection, QR display, camera scanning, low-resolution camera handling, ICE diagnostics, cleanup, and retry behavior.

## Design boundary

The component intentionally does not use:

- a signaling server
- STUN
- TURN
- WebSocket
- a runtime API

Every peer connection is created as:

```js
new RTCPeerConnection({ iceServers: [] });
```

It is therefore intended for devices that are directly reachable on the same Wi-Fi / LAN. Guest isolation, enterprise networks, client isolation, VPNs, firewalls, or mDNS reachability can prevent a connection.

This is not a “connect across any network” WebRTC helper. It prioritizes a fully serverless design.

## Included behavior

- Host / joining-device role selection
- Automatic host Offer QR generation
- QR chunking at roughly 175 characters per page
- Automatic QR cycling plus previous / next / fullscreen controls
- Copy/paste fallback when the camera cannot be used
- Automatic camera start on the joining device
- Reply-QR camera on the host
- Native `BarcodeDetector` when available
- Embedded `jsQR` fallback when `BarcodeDetector` is unavailable
- 1920×1080 requested as an `ideal`, without rejecting lower-resolution cameras
- Rear-camera preference on the joining device
- Camera selector when multiple devices are available
- Out-of-order QR-chunk collection
- gzip signal compression when `CompressionStream` is available
- Wait for ICE gathering to reach `complete` before exposing Offer/Answer data
- Discard incomplete ICE attempts after the timeout instead of using partial SDP
- Reject local or remote signaling data that contains zero host candidates
- Diagnostics grouped by IPv4 / IPv6 / mDNS and UDP / TCP host candidates
- Selected candidate-pair summary without displaying IP addresses
- Attempt guards so stale asynchronous work cannot overwrite a newer attempt
- Cleanup of old PeerConnections, DataChannels, camera tracks, and timers
- **Do not create the joining-side Answer immediately after reading the Offer**
- Prepare the host reply scanner first, then create the Answer
- Automatically regenerate the joining-side Answer up to three times after pre-connect ICE failure
- DataChannel callbacks for the application

## Embedded dependencies

The component does not paste third-party minified code into the snippet. Add the following through the template asset pipeline:

| Library | Version | Purpose |
| --- | ---: | --- |
| `qrcode-generator` | 1.4.4 | Offer / Answer QR generation |
| `jsqr` | 1.4.0 | QR decoding fallback when `BarcodeDetector` is unavailable |

Copy the two dependency entries from `examples/dependencies.webrtc-qr.json` into the target application's `dependencies.json`. Then run `scripts/sync-dependency-lock.ps1` so the copied package versions receive matching tarball lock entries.

If the application already has dependencies, append the entries instead of replacing the existing array. Update that application's `THIRD_PARTY_NOTICES.md` as required.

## Minimal integration

Copy the `<style>` and `<script>` from `components/webrtc-qr-pairing.html` into `src/index.template.html`, then add a mount point:

```html
<div id="peerPairing"></div>
```

Mount it:

```js
const pairing = AppWebRtcQrPairing.mount(
  document.getElementById('peerPairing'),
  {
    language: 'en',
    onConnected({ role, channel }) {
      console.log('connected', role, channel.label);
    },
    onMessage({ data }) {
      console.log('received', data);
    }
  }
);
```

The user can choose the host or joining role inside the component.

To start a role from the application:

```js
await pairing.startHost();
await pairing.startJoin();
```

## Pairing flow

### Host

1. Choose the host role.
2. Create and set the Offer.
3. Wait for ICE gathering to complete.
4. Require at least one host candidate.
5. Compress signaling data when supported and turn it into chunked QR pages.
6. Let the other device scan the Offer.
7. **Open the host reply-QR camera first.**
8. Let the joining device generate its Answer only after that camera preview is ready.
9. Scan and apply the Answer.
10. Use the DataChannel once a candidate pair is established.

### Joining device

1. Choosing the joining role opens its camera automatically.
2. Scan the host Offer.
3. Validate and retain the Offer. **Do not create a PeerConnection yet.**
4. Tell the user to prepare the reply scanner on the host.
5. Once the host camera preview is visible, the user presses “create reply QR”.
6. Only now create the PeerConnection, Answer, and local ICE candidates.
7. Show the completed Answer QR to the host camera.
8. If ICE fails before the host applies the Answer, create a fresh PeerConnection and Answer QR automatically.

Delaying Answer creation is intentional. In manual QR signaling, starting ICE before the user has prepared the host camera can leave a several-second gap in which the joining side reaches `failed` before the Answer is delivered.

## API

`AppWebRtcQrPairing.mount(root, options)` returns a controller:

```js
pairing.setLanguage('ja');
await pairing.startHost();
await pairing.startJoin();
pairing.send('hello');
pairing.channel();
pairing.peerConnection();
pairing.role();
pairing.showRoleChooser();
pairing.close();
pairing.destroy();
```

### Main options

| Option | Default | Purpose |
| --- | --- | --- |
| `language` | `'ja'` | `'ja'` or `'en'` |
| `iceGatherTimeoutMs` | `15000` | Maximum wait for complete ICE gathering |
| `answerAutoRetryLimit` | `3` | Pre-connect Answer regeneration attempts |
| `qrChunkSize` | `175` | Characters per QR page |
| `payloadPrefix` | `'bkrtc1'` | Signal-code namespace |
| `qrPrefix` | `'bkrtcq1'` | Chunked-QR namespace |
| `dataChannelLabel` | `'app-data'` | Default DataChannel label |
| `dataChannelInit` | `{ ordered: true }` | Default channel options |
| `createDefaultChannel` | `true` | Disable when the app creates custom channels |
| `autoStartJoinScanner` | `true` | Open camera immediately for the joining role |
| `notify(message, tone)` | `null` | Hook into the application's Toast UI |
| `onConnected(ctx)` | `null` | Connection callback |
| `onDisconnected(ctx)` | `null` | Temporary/permanent disconnect callback |
| `onMessage(ctx)` | `null` | Default DataChannel messages |
| `onChannel(ctx)` | `null` | Any DataChannel opening |
| `onStateChange(ctx)` | `null` | Pairing phase changes |
| `onPeerCreated(api)` | `null` | Extension hook immediately after PeerConnection creation |

## Custom DataChannels

The default host creates one ordered/reliable `app-data` channel.

For an application such as Wireless Sensor, use separate unreliable streaming and reliable control channels:

```js
const pairing = AppWebRtcQrPairing.mount(root, {
  createDefaultChannel: false,
  onPeerCreated({ role, createDataChannel }) {
    if (role !== 'host') return;
    createDataChannel('sensor', {
      ordered: false,
      maxRetransmits: 0
    });
    createDataChannel('control', {
      ordered: true
    });
  },
  onChannel({ channel }) {
    if (channel.label === 'sensor') {
      // stream channel
    }
  }
});
```

Incoming channels on the joining device are automatically passed through `onChannel` and `onMessage`.

## Protocol prefixes

The generic defaults are:

```js
payloadPrefix: 'bkrtc1'
qrPrefix: 'bkrtcq1'
```

Applications can keep compatibility with an existing signaling format by changing the options. Wireless Sensor compatibility, for example:

```js
{
  payloadPrefix: 'ws1',
  qrPrefix: 'wsq1'
}
```

## QR and camera behavior

Long SDP in one QR is difficult for low-resolution laptop cameras. The default component therefore chunks signaling data into roughly 175-character QR pages.

Camera constraints use `ideal`, not `exact`, 1920×1080. A 480p or 720p camera can still be used.

`BarcodeDetector` is preferred where available, but the component never depends on it exclusively. The embedded `jsQR` asset is loaded from `StandaloneAssets` when needed, so no runtime CDN is required.

Keep the copy/paste fallback. It is important when camera access is unavailable because of `file://`, secure-context rules, permissions, enterprise policy, or camera contention.

## ICE gathering

Manual QR signaling cannot use Trickle ICE because there is no later signaling channel for newly discovered candidates.

The component therefore waits for full gathering before encoding the SDP:

```text
setLocalDescription
    ↓
ICE gathering
    ↓
complete
    ↓
require at least one host candidate
    ↓
encode / display QR
```

If gathering times out, the component does not use partial SDP. The attempt must be recreated with a new PeerConnection.

## Diagnostics

The UI reports:

- ICE gathering state
- local candidate count
- remote candidate count
- UDP / TCP
- host candidate type
- IPv4 / IPv6 / mDNS grouping
- ICE connection state
- PeerConnection state
- selected candidate-pair summary

It intentionally does not display the candidate IP addresses.

## Retry rules

- Never reuse a failed PeerConnection for a new attempt.
- Close stale DataChannels.
- Stop QR timers.
- Stop camera tracks.
- Guard asynchronous work with an attempt identity so an old error cannot overwrite a newer UI.
- Joining-side automatic Answer regeneration uses the retained Offer but a fresh PeerConnection and new QR session.
- Stop automatic regeneration at the configured limit and return control to the user.
- A host-side route failure normally starts again with a fresh Offer.

## CSP and privacy copy

The component is compatible with the template's default:

```text
connect-src 'none'
```

You do not need to permit a CDN or API for the WebRTC DataChannel.

Do not describe a two-device app as if all data stays on one device. A better statement is:

> No signaling server or cloud service receives the connection data. Signaling is exchanged directly by QR/copy, and application data is sent directly to the paired browser over the established WebRTC DataChannel.

## Limitations

- The same SSID does not guarantee direct device-to-device reachability.
- Mesh Wi-Fi, guest networks, enterprise WLANs, and client isolation can block pairing.
- mDNS host candidates are unusable if the peer cannot resolve them across the local network.
- Without STUN/TURN, Internet/NAT traversal is out of scope.
- WebRTC, camera, and QR APIs differ across browsers and operating systems.
- `connectionState === 'disconnected'` can be temporary; do not immediately destroy application data solely because of that state.

## Release testing

At minimum, test on real devices:

1. Complete PC → phone → PC pairing using QR only.
2. Connect, disconnect, and reconnect the same device three times.
3. Pair a second phone model.
4. Read the reply QR with a 480p/720p-class laptop camera.
5. Confirm slow human QR handoff does not itself time out.
6. Change roles during ICE gathering and confirm stale errors do not overwrite the new attempt.
7. Trigger a pre-connect failure and confirm the joining-side Answer QR refreshes.
8. Force failure with a VPN / guest network and inspect the diagnostics.
9. Deny camera permission and confirm the manual code path still works.
10. Inspect DevTools and confirm no runtime CDN/API request is made.

## Connection readiness contract

`RTCPeerConnection.connectionState === 'connected'` means ICE/DTLS transport is established, but it does not guarantee that the application's control DataChannel is usable.

Application-ready requires both:

1. the current PeerConnection is `connected`;
2. the designated readiness DataChannel is `readyState === 'open'`.

The default readiness channel is `app-data`. For custom channels, use a reliable control channel:

```js
const pairing = AppWebRtcQrPairing.mount(root, {
  createDefaultChannel: false,
  readyChannelLabel: 'control',
  onPeerCreated({ role, createDataChannel }) {
    if (role !== 'host') return;
    createDataChannel('control', { ordered: true });
  }
});
```

Do not close pairing UI, switch to the live application state, or tear down the PeerConnection from raw `connectionstatechange` / `iceconnectionstatechange`. Use `onConnected` as the application-ready signal.

`requireReadyChannelOpen: false` is reserved for unusual WebRTC flows that intentionally use no DataChannel.

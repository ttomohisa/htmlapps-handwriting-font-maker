# WebRTC QRペアリングコンポーネント

`components/webrtc-qr-pairing.html` は、Browser Kitty / 単一HTMLアプリで **2台のブラウザーを完全サーバーレスにWebRTC接続する**ための再利用コンポーネントです。

Wireless Sensor v1.0.0で実機調整した接続フローを汎用化しています。接続ロジックだけでなく、役割選択、QR表示、カメラスキャン、低解像度カメラ対策、ICE診断、再試行UIまで含みます。

## 重要な前提

この部品は次を意図的に使いません。

- シグナリングサーバー
- STUN
- TURN
- WebSocket
- 外部API

`RTCPeerConnection` は常に次の構成です。

```js
new RTCPeerConnection({ iceServers: [] });
```

そのため、基本的には **同じWi-Fi / LAN上で端末同士が直接到達できる環境**向けです。会社・学校・ゲストWi-Fi、AP isolation / client isolation、VPN、ファイアウォール、mDNSが端末間で届かない構成では接続できないことがあります。

「どのネットワークでもつながるWebRTC部品」ではありません。完全サーバーレスを優先した設計です。

## 何をテンプレート化しているか

- ホスト / 参加端末の役割選択
- ホスト側Offer QRの自動生成
- 約175文字単位の分割QR
- QRページの自動切替、前/次、全画面表示
- QRを使えない場合のコピー＆ペースト
- 参加端末側のカメラ自動起動
- PC側の返答QRカメラ
- `BarcodeDetector` が使える場合はネイティブQR認識
- Windows等で `BarcodeDetector` が使えない場合は内包 `jsQR` へフォールバック
- カメラは1920×1080を `ideal` として要求し、低解像度カメラを拒否しない
- 背面カメラ優先（参加端末）
- 複数カメラ選択
- QR断片の順不同収集
- `CompressionStream` が使える場合はSDPをgzipしてQR密度を低減
- ICE gatheringが `complete` になるまでOffer/Answerを出さない
- 15秒以内にICE収集が完了しなければ不完全SDPを使わず破棄
- ローカル/相手候補が0件の場合は接続情報を採用しない
- IPv4 / IPv6 / mDNS、UDP / TCP host候補の概要診断
- 選択candidate pairの概要表示（IPアドレスそのものは表示しない）
- 古い接続試行のイベントを無視するattempt guard
- 再試行前に古いPeerConnection/DataChannel/カメラ/タイマーを破棄
- **参加端末はOffer読取直後にAnswerを作らない**
- ホストの返答QRスキャナーを先に準備してからAnswerを作る
- 接続前ICE失敗時にAnswer QRを最大3回自動再生成
- 接続後のDataChannel callback

## 必要な依存ライブラリ

このコンポーネント本体はnpmコードを直接貼り付けません。テンプレートのAsset Pipelineから次の2つを内包します。

| ライブラリ | バージョン | 用途 |
| --- | ---: | --- |
| `qrcode-generator` | 1.4.4 | Offer / Answer QR生成 |
| `jsqr` | 1.4.0 | `BarcodeDetector` が使えない環境のQR読取fallback |

`examples/dependencies.webrtc-qr.json` の2エントリを、対象アプリの `dependencies.json` へコピーしてください。その後 `scripts/sync-dependency-lock.ps1` を実行し、コピーした固定バージョンに対応するtarball lockを生成します。

既に別の依存がある場合は `dependencies` 配列を置き換えず、2項目を追加します。

追加したアプリではライセンス表記も `THIRD_PARTY_NOTICES.md` へ反映してください。

## 最小実装

1. `components/webrtc-qr-pairing.html` の `<style>` と `<script>` を `src/index.template.html` へコピーします。
2. 画面内にマウント先を置きます。

```html
<div id="peerPairing"></div>
```

3. 初期化します。

```js
const pairing = AppWebRtcQrPairing.mount(
  document.getElementById('peerPairing'),
  {
    language: 'ja',
    onConnected({ role, channel }) {
      console.log('connected', role, channel.label);
    },
    onMessage({ data }) {
      console.log('received', data);
    }
  }
);
```

ユーザーが部品内の「ホスト」「参加端末」を選べば接続フローが始まります。

アプリ側から直接始める場合：

```js
await pairing.startHost();
// または
await pairing.startJoin();
```

## 接続フロー

### ホスト

1. ホストを選ぶ。
2. `createOffer()` → `setLocalDescription()`。
3. ICE gatheringが完全に終わるまで待つ。
4. host candidateが1件以上あることを確認。
5. SDPを圧縮可能ならgzipし、分割QRへ変換。
6. 相手端末にOffer QRを読ませる。
7. **返答QRカメラを先に起動する。**
8. 相手のAnswer QRを読み取る。
9. `setRemoteDescription(answer)`。
10. candidate pairが確立したらDataChannelを利用する。

### 参加端末

1. 参加端末を選ぶとカメラを自動起動。
2. ホストのOffer QRを読む。
3. Offerを検証して保持する。**この時点ではPeerConnectionを作らない。**
4. 画面で「ホスト側の返答QRスキャナーを先に開く」と案内する。
5. ホストのカメラ映像が出た後、ユーザーが「返答QRを作る」を押す。
6. ここで初めてPeerConnectionを作成してAnswer/ICE収集を開始。
7. 完成したAnswer QRをホストカメラへ見せる。
8. Answer提示中に接続前ICEが `failed` になった場合、新しいPeerConnection + Answer QRへ自動更新する。

このAnswer生成遅延は重要です。手動QRシグナリングでは、Answerを作ってからPCカメラを準備する数秒〜十数秒の間に参加端末側ICEが先に失敗するケースがあったため、この順番を標準にしています。

## API

`AppWebRtcQrPairing.mount(root, options)` はコントローラーを返します。

### 返り値

```js
pairing.setLanguage('en');
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

### 主なoptions

| option | デフォルト | 内容 |
| --- | --- | --- |
| `language` | `'ja'` | `'ja'` / `'en'` |
| `iceGatherTimeoutMs` | `15000` | ICE gathering完了待ち上限 |
| `answerAutoRetryLimit` | `3` | 接続前Answer自動再生成回数 |
| `qrChunkSize` | `175` | QR 1ページあたりの文字数 |
| `payloadPrefix` | `'bkrtc1'` | Offer/Answerコード識別子 |
| `qrPrefix` | `'bkrtcq1'` | 分割QR識別子 |
| `dataChannelLabel` | `'app-data'` | 標準DataChannel名 |
| `dataChannelInit` | `{ ordered: true }` | 標準DataChannel設定 |
| `createDefaultChannel` | `true` | falseならアプリ側でchannel作成 |
| `autoStartJoinScanner` | `true` | 参加端末選択時にカメラ自動起動 |
| `notify(message, tone)` | `null` | Toast等への接続口 |
| `onConnected(ctx)` | `null` | DataChannel接続完了 |
| `onDisconnected(ctx)` | `null` | 一時切断/失敗 |
| `onMessage(ctx)` | `null` | 標準DataChannel受信 |
| `onChannel(ctx)` | `null` | channel open時 |
| `onStateChange(ctx)` | `null` | 接続フェーズ変更 |
| `onPeerCreated(api)` | `null` | PeerConnection生成直後の拡張hook |

## 独自DataChannel

標準ではホストがordered/reliableな `app-data` を1本作ります。

Wireless Sensorのように、

- センサーストリーム：`ordered:false, maxRetransmits:0`
- 制御：reliable ordered

と分ける場合は次のようにします。

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

参加端末側で届いた任意DataChannelも自動的に `onChannel` / `onMessage` へ流れます。

## 既存アプリとのプロトコル互換

デフォルト識別子は汎用名です。

```js
payloadPrefix: 'bkrtc1'
qrPrefix: 'bkrtcq1'
```

既存アプリが別プレフィックスを使っている場合はoptionsで合わせられます。

Wireless Sensor互換にする例：

```js
{
  payloadPrefix: 'ws1',
  qrPrefix: 'wsq1'
}
```

## QRとカメラ

### 低解像度カメラ

1枚に長いSDPを詰めるとPC内蔵カメラで読みにくいため、デフォルトでは175文字単位に分割します。

カメラ要求は `exact: 1920x1080` ではなく `ideal` です。480p / 720pしか出せないカメラでも接続フロー自体を拒否しません。

### BarcodeDetector

利用できる場合はネイティブ `BarcodeDetector` を使います。OS / Browserによって利用できないことがあるため、それだけには依存しません。

利用できない場合は `jsQR` を `StandaloneAssets.loadClassicScript()` でHTML内部から読み込みます。実行時CDNはありません。

### カメラを使えない場合

コピー＆ペーストの接続コードを必ず残してください。

特に `file://`、ブラウザーのSecure Context制約、権限拒否、企業ポリシー等で `getUserMedia()` が使えない場合のfallbackになります。

## ICE収集

完全サーバーレス + QRシグナリングではTrickle ICEを使えません。後から見つかったcandidateを相手へ送るシグナリング経路がないからです。

そのため、Offer / AnswerをQR化する前に必ずICE gathering完了を待ちます。

```text
setLocalDescription
    ↓
ICE gathering
    ↓
complete
    ↓
host candidateが1件以上あることを確認
    ↓
初めてQR化
```

タイムアウトした場合は「途中までのSDP」を使いません。新しいPeerConnectionで再試行します。

## 診断UI

診断欄には次を表示します。

- ICE gathering state
- ローカルcandidate数
- 相手candidate数
- UDP / TCP
- host candidate
- IPv4 / IPv6 / mDNS
- ICE connection state
- PeerConnection state
- 選択candidate pair概要

プライバシーのため、candidateのIPアドレスそのものは画面へ表示しません。

## 再試行ルール

- 再試行では古いPeerConnectionを再利用しない。
- DataChannelも閉じる。
- QRタイマーを止める。
- カメラTrackを止める。
- 古い非同期処理にはattempt番号を持たせ、新しい試行のUIを上書きさせない。
- 参加端末のAnswer QR自動再生成では、同じ保存済みOfferを使って新しいPeerConnectionを作る。
- 自動再生成上限に達したらユーザー操作へ戻す。
- ホスト側で接続自体が失敗した場合は、基本的に新しいOfferからやり直す。

## CSP / プライバシー

この部品はテンプレート標準の次のCSPを維持できます。

```text
connect-src 'none'
```

WebRTC DataChannelの直接接続を許可するために、CDNやAPI接続をCSPへ追加する必要はありません。

ただし「完全ローカル処理」という表現には注意してください。2台接続時、アプリデータは同じ端末内だけではなく **接続したもう一方のブラウザーへ送信されます**。

適切な説明例：

> シグナリングサーバーやクラウドへは送信しません。接続情報はQRで直接受け渡し、アプリデータは確立したWebRTC DataChannelで接続相手へ直接送ります。

## 制限事項

- 同じSSIDでも端末間通信が保証されるわけではありません。
- Mesh Wi-Fi、ゲストネットワーク、AP isolation、企業LANなどでは失敗することがあります。
- mDNS host candidateを相手側が解決できないネットワークでは接続できないことがあります。
- NATを越えるためのSTUN/TURNを使わないので、インターネット越し接続は対象外です。
- WebRTC/カメラ/QR対応はブラウザー・OS差があります。
- `connectionState === 'disconnected'` は一時状態の可能性があるため、アプリ側で即データ破棄しないでください。

## 公開前テスト

最低限、次を実機で確認してください。

1. PC → スマホ → PC をQRだけで接続。
2. 同じ端末で接続 → 切断 → 再接続を3回。
3. 別スマホでも接続。
4. 480p / 720p程度のPCカメラでも返答QRを読める。
5. QRをゆっくり読み取ってもユーザー操作待ちでタイムアウトしない。
6. ICE収集中に役割変更しても古いエラーが現在UIへ出ない。
7. Answer提示中の接続前ICE失敗でQRが自動更新される。
8. VPN / ゲストWi-Fi等で失敗させ、診断が意味のある内容になる。
9. カメラ権限拒否時に手動コードへ逃げられる。
10. DevToolsで実行時CDN/APIアクセスがない。

## 接続成立の契約

`RTCPeerConnection.connectionState === 'connected'` はICE/DTLSの経路成立を示しますが、アプリが使うControl DataChannelまで利用可能になったことは保証しません。

アプリ接続済みとする条件は次の2つです。

1. 現在のPeerConnectionが `connected`
2. 準備完了判定に指定したDataChannelが `readyState === 'open'`

標準構成では `app-data` が準備完了Channelです。独自Channel構成ではreliableな制御Channelを指定します。

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

生の `connectionstatechange` / `iceconnectionstatechange` を見て接続UIを閉じたり、ライブ画面へ切り替えたり、PeerConnectionを破棄したりしないでください。アプリが利用可能になった合図は `onConnected` を使います。

DataChannelを使わない特殊用途だけ `requireReadyChannelOpen: false` を指定できます。

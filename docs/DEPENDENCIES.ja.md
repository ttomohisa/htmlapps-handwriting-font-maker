# 内包依存ライブラリの更新・固定

このテンプレートでは、第三者ライブラリを配布HTMLへ完全内包しつつ、ライブラリ更新を「自動で適用」せず「自動で検知して人が判断」する運用を標準にしています。

依存管理は次の4段階です。

1. `dependencies.json` に固定バージョン、内包asset、ライセンス情報、更新ポリシーを記載する。
2. `dependencies.lock.json` にpackage tarballのSHA-256とnpm integrity情報を固定する。
3. `scripts/check-dependency-updates.ps1` が新版を検知する。ソースは変更しない。
4. `.github/workflows/dependency-updates.yml` が週1回チェックし、更新があればGitHub Issueを作成・更新する。PRやバージョン変更は自動実行しない。

## 依存ライブラリを追加する

`dependencies.json` に固定バージョンで追加します。

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

追加後、lockを生成します。

```powershell
.\scripts\sync-dependency-lock.ps1 -Id dayjs
```

全依存を作り直す場合：

```powershell
.\scripts\sync-dependency-lock.ps1
```

lock生成時には、指定バージョンのnpm metadata取得、npm integrity検証、tarball取得・展開、`package.json` のバージョン確認、`assets` に指定したファイルの存在確認、tarball SHA-256記録まで行います。

`dependencies.json` と `dependencies.lock.json` はセットでコミットしてください。

## lockファイルの役割

`dist/dependency-manifest.json` は「そのビルドで実際に使ったもの」の記録です。一方、`dependencies.lock.json` は次回以降のビルドにも使う入力ファイルです。

ビルド時には、取得済みまたは新規取得したtarballのSHA-256がlockと一致しなければ停止します。そのため、`version` 文字列だけは同じなのにpackage内容が別物へ変わる状況を検知できます。

tarball hashは手作業で書き換えず、意図的に依存を変更したときだけ `sync-dependency-lock.ps1` で更新してください。

## 更新ポリシー

`updates` は省略可能です。省略時は `enabled: true` / `policy: "manual"` として扱います。

| policy | チェック対象 |
| --- | --- |
| `patch` | 現在と同じmajor/minor内の最新安定版 |
| `minor` | 現在と同じmajor内の最新安定版 |
| `major` | npmの `latest`（major変更を許容） |
| `manual` | npmの `latest` を候補として表示し、人が判断 |

更新監視から完全に外したい場合だけ `enabled: false` にします。

このポリシーは**通知する候補の範囲**です。自動更新の許可ではありません。

WASMやparserなど影響範囲が大きい依存は `patch` または `manual`、小さく互換性が安定しているutilityは `minor` など、依存の性質に合わせて設定する想定です。

## ローカルで更新チェック

```powershell
.\scripts\check-dependency-updates.ps1
```

結果は次に出力されます。

```text
dist/dependency-update-report.json
dist/dependency-update-report.md
```

更新があること自体ではエラー終了しません。一方、npm registryへ接続できないなどチェック自体が失敗した場合はエラーにします。これによりGitHub Actionsが誤ってIssueをcloseすることを防ぎます。

## GitHub Issueによる週次通知

`.github/workflows/dependency-updates.yml` は毎週月曜日に実行され、Actions画面から手動実行もできます。

更新がある場合は次のopen Issueを作成または更新します。

```text
chore(deps): dependency updates available
```

`dependencies` / `maintenance` / `automated` ラベルを付けます。更新対象が0件になったら、そのopen Issueは自動closeします。

workflowは `dependencies.json` の変更、commit、Pull Request作成を行いません。更新を見送る理由などはIssueコメントへ残せます。

## 実際にバージョンを上げる

Issueに出た推奨バージョンへ更新する場合：

```powershell
.\scripts\update-dependency.ps1 -Id dayjs
```

特定バージョンを明示する場合：

```powershell
.\scripts\update-dependency.ps1 -Id dayjs -Version 1.11.18
```

更新スクリプトは次を行います。

1. `dependencies.json` の固定バージョンを変更。
2. 選択バージョンを取得し、integrityを検証。
3. 対象依存の `dependencies.lock.json` を更新。
4. 設定済みasset pathが新版にも存在するか確認。
5. 通常の単一HTMLビルド・検証を実行。
6. 途中で失敗した場合は `dependencies.json` と `dependencies.lock.json` を元へ戻す。

意図的にビルドを後回しにする場合のみ `-SkipBuild` を使用できます。

成功後も、release notes、ライセンス・`THIRD_PARTY_NOTICES.md`、影響機能、オフライン動作、`dist/build-size-report.json` は人が確認してください。

## asset圧縮

各assetの `compression` は次から選べます。

- `none`：元bytesをそのままBase64化。
- `gzip`：必ずgzipしてからBase64化。
- `auto`：小さくなる場合だけgzip。

圧縮assetは `DecompressionStream` を使う非同期APIで展開します。

```js
const wasmBytes = await StandaloneAssets.bytesAsync('library-id', 'wasm');
const workerUrl = await StandaloneAssets.blobUrlAsync('library-id', 'worker');
```

`loadClassicScript()` と `importModule()` は圧縮有無を自動処理します。

## リリース前チェック

- `dependencies.json` はexact versionにする。
- `dependencies.lock.json` と一致させる。
- 実行時に必要なファイルをすべて `assets` へ列挙する。
- unresolved relative importがないbundleを使う。
- 更新前にupstream release notesを確認する。
- 必要なライセンス表記を `THIRD_PARTY_NOTICES.md` へ反映する。
- `dependency-manifest.json` と `build-size-report.json` を確認する。
- ネットワークを切った状態で影響機能をテストする。

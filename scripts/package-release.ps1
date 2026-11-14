[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$appConfigPath = Join-Path $root "app.config.json"
$app = Get-Content -LiteralPath $appConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$app.version
if ($version -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') {
  throw "app.config.json must contain a stable SemVer version (major.minor.patch)."
}
$tag = "v$version"
$baseName = "htmlapps-handwriting-font-maker-$tag"
$output = [System.IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $output) {
  Remove-Item -LiteralPath $output -Recurse -Force
}
New-Item -ItemType Directory -Path $output -Force | Out-Null

$readable = Join-Path $root "dist/index.html"
$selfExtract = Join-Path $root "dist/index.self-extract.html"
$downloadAlias = Join-Path $root "handwriting-font-maker.html"
foreach ($path in @($readable, $selfExtract, $downloadAlias)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Missing generated and verified release HTML: $path"
  }
}
$sourceHash = (Get-FileHash -LiteralPath $readable -Algorithm SHA256).Hash
$aliasHash = (Get-FileHash -LiteralPath $downloadAlias -Algorithm SHA256).Hash
if ($sourceHash -ne $aliasHash) { throw "Readable HTML and root download alias differ." }
$embeddedVersion = '"version":"' + $version + '"'
$readableText = Get-Content -LiteralPath $readable -Raw -Encoding UTF8
if (-not $readableText.Contains($embeddedVersion)) {
  throw "Generated HTML does not contain app version $version."
}
if ($readableText.Contains("__APP_CONFIG_JSON__") -or $readableText.Contains("__BUILD_MANIFEST_JSON__")) {
  throw "Generated HTML contains unresolved build placeholders."
}

$readableAsset = Join-Path $output "$baseName.html"
$selfExtractAsset = Join-Path $output "$baseName.self-extract.html"
Copy-Item -LiteralPath $readable -Destination $readableAsset
Copy-Item -LiteralPath $selfExtract -Destination $selfExtractAsset

# Keep the ZIP useful independently of GitHub's generated source archive.
$bundleName = $baseName
$bundleRoot = Join-Path (Join-Path $output "bundle") $bundleName
New-Item -ItemType Directory -Path $bundleRoot -Force | Out-Null
Copy-Item -LiteralPath $readable -Destination (Join-Path $bundleRoot "handwriting-font-maker.html")
Copy-Item -LiteralPath $selfExtract -Destination (Join-Path $bundleRoot "handwriting-font-maker.self-extract.html")

$distributionFiles = @(
  "README.ja.md", "README.md", "LICENSE",
  "THIRD_PARTY_NOTICES.md", "CHANGELOG.md", "APP_SPEC.md", "VERIFY_OFFLINE.md",
  "app.config.json", "dependencies.json", "dependencies.lock.json",
  "build-standalone.ps1", "build-standalone.bat",
  "dist/dependency-manifest.json", "dist/self-extract-manifest.json",
  "dist/build-size-report.json"
)
foreach ($relative in $distributionFiles) {
  $source = Join-Path $root $relative
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "Missing required distribution file: $relative"
  }
  $destination = Join-Path $bundleRoot ([System.IO.Path]::GetFileName($relative))
  Copy-Item -LiteralPath $source -Destination $destination
}
foreach ($directory in @("src", "scripts", "schemas", "components", "docs", "assets")) {
  $source = Join-Path $root $directory
  if (-not (Test-Path -LiteralPath $source -PathType Container)) {
    throw "Missing required distribution directory: $directory"
  }
  Copy-Item -LiteralPath $source -Destination (Join-Path $bundleRoot $directory) -Recurse
}

$zipPath = Join-Path $output "$baseName.zip"
Compress-Archive -LiteralPath $bundleRoot -DestinationPath $zipPath -CompressionLevel Optimal -Force
Add-Type -AssemblyName System.IO.Compression
$archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  $entries = @($archive.Entries | ForEach-Object { $_.FullName })
  foreach ($required in @(
    "$bundleName/handwriting-font-maker.html",
    "$bundleName/handwriting-font-maker.self-extract.html",
    "$bundleName/README.ja.md",
    "$bundleName/README.md",
    "$bundleName/LICENSE",
    "$bundleName/THIRD_PARTY_NOTICES.md"
  )) {
    if ($entries -notcontains $required) {
      throw "Release ZIP is missing: $required"
    }
  }
} finally {
  $archive.Dispose()
}

$assets = @($readableAsset, $selfExtractAsset, $zipPath)
foreach ($asset in $assets) {
  if ((Get-Item -LiteralPath $asset).Length -lt 1000) {
    throw "Unexpectedly small release asset: $asset"
  }
}
$checksumLines = foreach ($asset in $assets) {
  $hash = (Get-FileHash -LiteralPath $asset -Algorithm SHA256).Hash.ToLowerInvariant()
  "$hash  $([System.IO.Path]::GetFileName($asset))"
}
$checksumFile = Join-Path $output "SHA256SUMS.txt"
$newline = [string][char]10
[System.IO.File]::WriteAllText(
  $checksumFile,
  ($checksumLines -join $newline) + $newline,
  [System.Text.UTF8Encoding]::new($false)
)
Remove-Item -LiteralPath (Join-Path $output "bundle") -Recurse -Force
Write-Host "Prepared release assets for $tag at $output"
foreach ($asset in @($assets + $checksumFile)) {
  Write-Host "  $([System.IO.Path]::GetFileName($asset))"
}

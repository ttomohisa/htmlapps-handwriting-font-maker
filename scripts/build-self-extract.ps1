param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,
  [Parameter(Mandatory = $true)]
  [string]$OutputPath,
  [string]$AppName = "Standalone app",
  [string]$AppNameJa = "Standalone app"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path $InputPath)) { throw "Input HTML was not found: $InputPath" }
if (-not [System.IO.Path]::IsPathRooted($InputPath)) { $InputPath = [System.IO.Path]::GetFullPath($InputPath) }
if (-not [System.IO.Path]::IsPathRooted($OutputPath)) { $OutputPath = [System.IO.Path]::GetFullPath($OutputPath) }

$inputBytes = [System.IO.File]::ReadAllBytes($InputPath)
if ($inputBytes.Length -eq 0) { throw "Input HTML is empty: $InputPath" }
$inputHtml = [System.Text.Encoding]::UTF8.GetString($inputBytes)

function Get-Sha256Hex([byte[]]$Bytes) {
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try {
    return (($algorithm.ComputeHash($Bytes) | ForEach-Object { $_.ToString("x2") }) -join "")
  } finally {
    $algorithm.Dispose()
  }
}

function ConvertTo-AsciiHtmlFragment([string]$Value) {
  $builder = New-Object System.Text.StringBuilder
  for ($index = 0; $index -lt $Value.Length; $index += 1) {
    $character = $Value[$index]
    $codePoint = [int][char]$character
    if ([char]::IsHighSurrogate($character) -and ($index + 1) -lt $Value.Length -and [char]::IsLowSurrogate($Value[$index + 1])) {
      $codePoint = [char]::ConvertToUtf32($character, $Value[$index + 1])
      $index += 1
    }

    if ($codePoint -le 0x7f) {
      [void]$builder.Append([char]$codePoint)
    } else {
      [void]$builder.Append(("&#x{0:X};" -f $codePoint))
    }
  }
  return $builder.ToString()
}

function ConvertTo-AsciiHtmlText([string]$Value) {
  return ConvertTo-AsciiHtmlFragment ([System.Net.WebUtility]::HtmlEncode($Value))
}

function Get-EmbeddedFaviconTag([string]$Html) {
  $linkMatches = [regex]::Matches(
    $Html,
    '<link\b[^>]*>',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
  )

  foreach ($linkMatch in $linkMatches) {
    $tag = $linkMatch.Value
    $relMatch = [regex]::Match(
      $tag,
      '\brel\s*=\s*(["''])(?<rel>.*?)\1',
      [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
    )
    if (-not $relMatch.Success) { continue }

    $relTokens = @($relMatch.Groups["rel"].Value -split '\s+' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    $hasIconRel = $false
    foreach ($token in $relTokens) {
      if ($token.Equals("icon", [StringComparison]::OrdinalIgnoreCase)) {
        $hasIconRel = $true
        break
      }
    }
    if (-not $hasIconRel) { continue }

    $hrefMatch = [regex]::Match(
      $tag,
      '\bhref\s*=\s*(["''])(?<href>.*?)\1',
      [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
    )
    if (-not $hrefMatch.Success) { continue }

    $href = [System.Net.WebUtility]::HtmlDecode($hrefMatch.Groups["href"].Value)
    if (-not $href.StartsWith("data:", [StringComparison]::OrdinalIgnoreCase)) {
      throw "The source favicon must be embedded as a data: URL for a standalone build."
    }

    return ConvertTo-AsciiHtmlFragment $tag
  }

  throw 'The source HTML must contain an embedded <link rel="icon" href="data:..."> favicon.'
}

$compressedBuffer = New-Object System.IO.MemoryStream
try {
  $gzip = New-Object System.IO.Compression.GZipStream -ArgumentList @(
    $compressedBuffer,
    [System.IO.Compression.CompressionMode]::Compress,
    $true
  )
  try {
    $gzip.Write($inputBytes, 0, $inputBytes.Length)
  } finally {
    $gzip.Dispose()
  }
  $compressedBytes = $compressedBuffer.ToArray()
} finally {
  $compressedBuffer.Dispose()
}

$sourceSha256 = Get-Sha256Hex $inputBytes
$gzipSha256 = Get-Sha256Hex $compressedBytes
$payloadBase64 = [Convert]::ToBase64String($compressedBytes)
$encodedAppName = ConvertTo-AsciiHtmlText $AppName
$encodedAppNameJa = ConvertTo-AsciiHtmlText $AppNameJa
$faviconTag = Get-EmbeddedFaviconTag $inputHtml
$sourceBytes = $inputBytes.Length
$gzipBytes = $compressedBytes.Length

$wrapper = @"
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data: blob:; media-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'">
  <meta name="robots" content="noindex,nofollow">
  <meta name="generator" content="single-html-app-template self-extract builder">
  <meta name="self-extract-source-sha256" content="$sourceSha256">
  <meta name="self-extract-gzip-sha256" content="$gzipSha256">
  <meta name="self-extract-source-bytes" content="$sourceBytes">
  <meta name="self-extract-gzip-bytes" content="$gzipBytes">
  <title>$encodedAppNameJa / $encodedAppName</title>
  $faviconTag
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; color: #24342f; background: #f6f8f7; }
    main { width: min(32rem, calc(100% - 2rem)); text-align: center; }
    .spinner { width: 2rem; height: 2rem; margin: 0 auto 1rem; border: .2rem solid #d8dfdc; border-top-color: #47685d; border-radius: 50%; animation: spin .8s linear infinite; }
    h1 { margin: 0 0 .5rem; font-size: 1rem; }
    p { margin: .35rem 0; font-size: .875rem; line-height: 1.6; color: #66736e; }
    pre { display: none; margin-top: 1rem; padding: .75rem; overflow: auto; text-align: left; white-space: pre-wrap; border: 1px solid #d8dfdc; border-radius: .5rem; background: #fff; color: #9b2c2c; }
    body.failed .spinner { display: none; }
    body.failed pre { display: block; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <main>
    <div class="spinner" aria-hidden="true"></div>
    <h1>&#x30A2;&#x30D7;&#x30EA;&#x3092;&#x5C55;&#x958B;&#x3057;&#x3066;&#x3044;&#x307E;&#x3059; / Unpacking the app</h1>
    <p>&#x3053;&#x306E;&#x51E6;&#x7406;&#x306F;&#x7AEF;&#x672B;&#x5185;&#x3067;&#x884C;&#x308F;&#x308C;&#x3001;&#x5916;&#x90E8;&#x901A;&#x4FE1;&#x306F;&#x767A;&#x751F;&#x3057;&#x307E;&#x305B;&#x3093;&#x3002;</p>
    <p>The compressed single-file app is being restored locally.</p>
    <p>&#x5916;&#x90E8;&#x901A;&#x4FE1;&#x306F;&#x3042;&#x308A;&#x307E;&#x305B;&#x3093;&#x3002; / No network request is made.</p>
    <pre id="error" role="alert"></pre>
  </main>
  <script id="self-extract-payload" type="application/octet-stream">$payloadBase64</script>
  <script>
  (() => {
    "use strict";

    const fail = (error) => {
      document.body.classList.add("failed");
      const detail = error instanceof Error ? error.name + ": " + error.message : String(error);
      document.getElementById("error").textContent =
        "\u5c55\u958b\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002\u5bfe\u5fdc\u30d6\u30e9\u30a6\u30b6\u30fc\u3067\u958b\u3044\u3066\u304f\u3060\u3055\u3044\u3002\n" +
        "Failed to unpack the application. Open this file in a browser that supports DecompressionStream.\n\n" + detail;
      console.error(error);
    };

    const decodeBase64 = (base64) => {
      const clean = base64.replace(/\s+/g, "");
      const byteChunks = [];
      const base64ChunkSize = 32768;
      for (let offset = 0; offset < clean.length; offset += base64ChunkSize) {
        const binary = atob(clean.slice(offset, offset + base64ChunkSize));
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        byteChunks.push(bytes);
      }
      return new Blob(byteChunks, { type: "application/gzip" });
    };

    const unpack = async () => {
      if (!("DecompressionStream" in window)) {
        throw new Error("DecompressionStream is not supported by this browser.");
      }

      const payload = document.getElementById("self-extract-payload").textContent;
      const compressedBlob = decodeBase64(payload);
      const decompressedStream = compressedBlob.stream().pipeThrough(new DecompressionStream("gzip"));
      const html = await new Response(decompressedStream).text();

      if (!/^\s*<!doctype html>/i.test(html)) {
        throw new Error("The restored payload is not an HTML document.");
      }

      document.open("text/html", "replace");
      document.write(html);
      document.close();
    };

    unpack().catch(fail);
  })();
  </script>
  <noscript>JavaScript is required to unpack this self-extracting HTML file.</noscript>
</body>
</html>
"@

$wrapperBytes = [System.Text.Encoding]::UTF8.GetBytes($wrapper)
foreach ($byte in $wrapperBytes) {
  if ($byte -gt 0x7f) {
    throw "The generated self-extracting wrapper must remain ASCII-only. Encode non-ASCII loader text before writing the file."
  }
}

$outputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
[System.IO.File]::WriteAllBytes($OutputPath, $wrapperBytes)

$manifestPath = Join-Path $outputDirectory "self-extract-manifest.json"
$manifest = [ordered]@{
  schemaVersion = 1
  generatedAtUtc = [DateTime]::UtcNow.ToString("o")
  source = [ordered]@{
    path = [System.IO.Path]::GetFileName($InputPath)
    bytes = $sourceBytes
    sha256 = $sourceSha256
  }
  compressedPayload = [ordered]@{
    format = "gzip"
    bytes = $gzipBytes
    sha256 = $gzipSha256
    encoding = "base64"
  }
  output = [ordered]@{
    path = [System.IO.Path]::GetFileName($OutputPath)
    bytes = (Get-Item $OutputPath).Length
    sha256 = (Get-Sha256Hex $wrapperBytes)
    loaderEncoding = "ascii"
    faviconInherited = $true
  }
  runtime = [ordered]@{
    decompressor = "DecompressionStream"
    networkRequired = $false
  }
}
[System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 10), (New-Object System.Text.UTF8Encoding($false)))

& (Join-Path $PSScriptRoot "verify-self-extract.ps1") -Path $OutputPath -ExpectedSourcePath $InputPath

$ratio = if ($sourceBytes -eq 0) { 0 } else { [Math]::Round(((Get-Item $OutputPath).Length / $sourceBytes) * 100, 1) }
Write-Host "[OK] Self-extracting HTML: $OutputPath" -ForegroundColor Green
Write-Host "[OK] Wrapper size is $ratio% of the original HTML size."

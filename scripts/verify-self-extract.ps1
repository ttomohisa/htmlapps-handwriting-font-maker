param(
  [Parameter(Mandatory = $true)]
  [string]$Path,
  [string]$ExpectedSourcePath = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-FaviconHref([string]$Html) {
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
    if ($hrefMatch.Success) {
      return [System.Net.WebUtility]::HtmlDecode($hrefMatch.Groups["href"].Value)
    }
  }

  return ""
}

if (-not (Test-Path $Path)) { throw "Self-extracting HTML was not found: $Path" }
$wrapperBytes = [System.IO.File]::ReadAllBytes($Path)
foreach ($byte in $wrapperBytes) {
  if ($byte -gt 0x7f) {
    throw "The self-extracting loader must be ASCII-only to avoid Windows PowerShell 5.1 source-encoding regressions."
  }
}
$html = [System.Text.Encoding]::ASCII.GetString($wrapperBytes)

$checks = @(
  @{ Message = "HTML document marker is missing"; Failed = -not $html.TrimStart().StartsWith("<!doctype html>", [StringComparison]::OrdinalIgnoreCase) },
  @{ Message = "UTF-8 charset metadata is missing"; Failed = $html -notmatch '<meta\s+charset=["'']utf-8["'']' },
  @{ Message = "Viewport metadata is missing"; Failed = $html -notmatch '<meta\s+name=["'']viewport["'']' },
  @{ Message = "The inherited favicon is missing"; Failed = [string]::IsNullOrWhiteSpace((Get-FaviconHref $html)) },
  @{ Message = "The inherited favicon is not embedded"; Failed = -not (Get-FaviconHref $html).StartsWith("data:", [StringComparison]::OrdinalIgnoreCase) },
  @{ Message = "The self-extract payload is missing"; Failed = $html -notmatch '<script\s+id=["'']self-extract-payload["'']\s+type=["'']application/octet-stream["'']>' },
  @{ Message = "The gzip decompressor is missing"; Failed = $html -notmatch 'new\s+DecompressionStream\(["'']gzip["'']\)' },
  @{ Message = "connect-src 'none' is missing"; Failed = $html -notmatch "connect-src\s+'none'" },
  @{ Message = "An external script URL remains"; Failed = $html -match '<script[^>]+src\s*=\s*["'']https?://' },
  @{ Message = "An external stylesheet URL remains"; Failed = $html -match '<link[^>]+href\s*=\s*["'']https?://' },
  @{ Message = "An external frame URL remains"; Failed = $html -match '<(?:iframe|frame)[^>]+src\s*=\s*["'']https?://' }
)

foreach ($check in $checks) {
  if ($check.Failed) { throw $check.Message }
}

$payloadMatch = [regex]::Match(
  $html,
  '<script\s+id=["'']self-extract-payload["'']\s+type=["'']application/octet-stream["'']>(?<payload>[A-Za-z0-9+/=\r\n]+)</script>',
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)
if (-not $payloadMatch.Success) { throw "The embedded Base64 payload could not be parsed." }

try {
  $compressedBytes = [Convert]::FromBase64String(($payloadMatch.Groups["payload"].Value -replace '\s+', ''))
} catch {
  throw "The embedded payload is not valid Base64: $($_.Exception.Message)"
}

$input = New-Object System.IO.MemoryStream -ArgumentList (, $compressedBytes)
$output = New-Object System.IO.MemoryStream
try {
  $gzip = New-Object System.IO.Compression.GZipStream -ArgumentList $input, ([System.IO.Compression.CompressionMode]::Decompress)
  try {
    $gzip.CopyTo($output)
  } finally {
    $gzip.Dispose()
  }
  $restoredBytes = $output.ToArray()
} finally {
  $output.Dispose()
  $input.Dispose()
}

$restoredHtml = [System.Text.Encoding]::UTF8.GetString($restoredBytes)
if (-not $restoredHtml.TrimStart().StartsWith("<!doctype html>", [StringComparison]::OrdinalIgnoreCase)) {
  throw "The restored payload is not an HTML document."
}

if (-not [string]::IsNullOrWhiteSpace($ExpectedSourcePath)) {
  if (-not (Test-Path $ExpectedSourcePath)) { throw "Expected source HTML was not found: $ExpectedSourcePath" }
  $expectedBytes = [System.IO.File]::ReadAllBytes($ExpectedSourcePath)
  if ($expectedBytes.Length -ne $restoredBytes.Length) {
    throw "Restored payload length does not match the source HTML."
  }
  for ($index = 0; $index -lt $expectedBytes.Length; $index += 1) {
    if ($expectedBytes[$index] -ne $restoredBytes[$index]) {
      throw "Restored payload differs from the source HTML at byte $index."
    }
  }

  $expectedHtml = [System.Text.Encoding]::UTF8.GetString($expectedBytes)
  $sourceFavicon = Get-FaviconHref $expectedHtml
  $wrapperFavicon = Get-FaviconHref $html
  if ([string]::IsNullOrWhiteSpace($sourceFavicon)) {
    throw "The source HTML does not contain a favicon."
  }
  if (-not $sourceFavicon.Equals($wrapperFavicon, [StringComparison]::Ordinal)) {
    throw "The self-extracting loader favicon does not match the source HTML favicon."
  }
}

Write-Host "[OK] Self-extract verification passed: $Path" -ForegroundColor Green

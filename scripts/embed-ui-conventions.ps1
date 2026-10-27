# Browser Kitty UI v1 build-time embedding. Dot-source, then call Expand-BrowserKittyUI.
function Expand-BrowserKittyUI {
  param(
    [Parameter(Mandatory = $true)][string]$Template,
    [Parameter(Mandatory = $true)][string]$ComponentsPath
  )
  $pin = Get-Content -Raw -Encoding UTF8 (Join-Path $ComponentsPath 'ui-conventions.lock.json') | ConvertFrom-Json
  if ([string]$pin.version -ne '1.0.0') { throw 'Unsupported Browser Kitty UI version.' }
  $assets = @(
    @{ Name = 'ui-conventions.js'; Token = '__BK_UI_JS__' },
    @{ Name = 'ui-conventions.css'; Token = '__BK_UI_CSS__' }
  )
  foreach ($asset in $assets) {
    $assetPath = Join-Path $ComponentsPath $asset.Name
    $bytes = [System.IO.File]::ReadAllBytes($assetPath)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { $hash = (($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) -join '') } finally { $sha.Dispose() }
    $expected = [string]$pin.files.($asset.Name)
    if ($expected -notmatch '^[a-f0-9]{64}$' -or $hash -cne $expected) { throw "Browser Kitty UI hash mismatch: $($asset.Name)" }
    $count = ([regex]::Matches($Template, [regex]::Escape($asset.Token))).Count
    if ($count -ne 1) { throw "Browser Kitty UI placeholder $($asset.Token) must occur exactly once; found $count." }
    $Template = $Template.Replace($asset.Token, [System.Text.Encoding]::UTF8.GetString($bytes))
  }
  return $Template
}

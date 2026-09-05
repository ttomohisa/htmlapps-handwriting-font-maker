Set-StrictMode -Version Latest
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Script:DependencyToolsUserAgent = "single-html-app-template/1.2"

function Read-DependencyJson([string]$Path) {
  if (-not (Test-Path $Path)) { throw "Required file not found: $Path" }
  $value = Get-Content -Raw -Encoding UTF8 $Path | ConvertFrom-Json
  return $value
}

function Write-DependencyJson([string]$Path, [object]$Value, [int]$Depth = 30) {
  $json = $Value | ConvertTo-Json -Depth $Depth
  [System.IO.File]::WriteAllText($Path, $json + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
}

function Get-NpmMetadata([string]$PackageName, [string]$Version = "") {
  if ([string]::IsNullOrWhiteSpace($PackageName)) { throw "Package name cannot be empty." }
  $encodedPackage = [Uri]::EscapeDataString($PackageName)
  $url = "https://registry.npmjs.org/$encodedPackage"
  if (-not [string]::IsNullOrWhiteSpace($Version)) {
    $url += "/" + [Uri]::EscapeDataString($Version)
  }
  $metadata = Invoke-RestMethod -Uri $url -UseBasicParsing -Headers @{ "User-Agent" = $Script:DependencyToolsUserAgent }
  return $metadata
}

function ConvertTo-SemVerRecord([string]$Version) {
  if ([string]::IsNullOrWhiteSpace($Version)) { return $null }
  $match = [regex]::Match($Version, '^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$')
  if (-not $match.Success) { return $null }
  return [pscustomobject]@{
    Version = $Version
    Major = [int]$match.Groups[1].Value
    Minor = [int]$match.Groups[2].Value
    Patch = [int]$match.Groups[3].Value
    Prerelease = [string]$match.Groups[4].Value
  }
}

function Compare-SemVerRecord([object]$Left, [object]$Right) {
  foreach ($name in @("Major", "Minor", "Patch")) {
    if ([int]$Left.$name -lt [int]$Right.$name) { return -1 }
    if ([int]$Left.$name -gt [int]$Right.$name) { return 1 }
  }
  if ([string]::IsNullOrWhiteSpace([string]$Left.Prerelease) -and -not [string]::IsNullOrWhiteSpace([string]$Right.Prerelease)) { return 1 }
  if (-not [string]::IsNullOrWhiteSpace([string]$Left.Prerelease) -and [string]::IsNullOrWhiteSpace([string]$Right.Prerelease)) { return -1 }
  return [string]::CompareOrdinal([string]$Left.Prerelease, [string]$Right.Prerelease)
}

function Get-DependencyUpdatePolicy([object]$Dependency) {
  $enabled = $true
  $policy = "manual"
  if ($Dependency.PSObject.Properties.Name -contains "updates" -and $null -ne $Dependency.updates) {
    if ($Dependency.updates.PSObject.Properties.Name -contains "enabled") { $enabled = [bool]$Dependency.updates.enabled }
    if ($Dependency.updates.PSObject.Properties.Name -contains "policy") {
      $configuredPolicy = ([string]$Dependency.updates.policy).ToLowerInvariant()
      if (-not [string]::IsNullOrWhiteSpace($configuredPolicy)) { $policy = $configuredPolicy }
    }
  }
  if ($policy -notin @("patch", "minor", "major", "manual")) {
    throw "Unsupported dependency update policy '$policy' for '$([string]$Dependency.id)'."
  }
  return [pscustomobject]@{ Enabled = $enabled; Policy = $policy }
}

function Get-ChangeType([string]$CurrentVersion, [string]$TargetVersion) {
  $current = ConvertTo-SemVerRecord $CurrentVersion
  $target = ConvertTo-SemVerRecord $TargetVersion
  if ($null -eq $current -or $null -eq $target) { return "unknown" }
  if ($target.Major -ne $current.Major) { return "major" }
  if ($target.Minor -ne $current.Minor) { return "minor" }
  if ($target.Patch -ne $current.Patch -or $target.Prerelease -ne $current.Prerelease) { return "patch" }
  return "none"
}

function Get-DependencyUpdateCandidate([object]$Dependency, [object]$Metadata) {
  $settings = Get-DependencyUpdatePolicy $Dependency
  if (-not $settings.Enabled) { return $null }

  $currentVersion = [string]$Dependency.version
  $current = ConvertTo-SemVerRecord $currentVersion
  $policy = [string]$settings.Policy
  $targetVersion = ""

  if ($policy -in @("manual", "major") -or $null -eq $current -or -not [string]::IsNullOrWhiteSpace([string]$current.Prerelease)) {
    if ($Metadata.PSObject.Properties.Name -contains "dist-tags" -and $Metadata.'dist-tags'.PSObject.Properties.Name -contains "latest") {
      $targetVersion = [string]$Metadata.'dist-tags'.latest
    }
  } else {
    $best = $null
    if ($Metadata.PSObject.Properties.Name -contains "versions" -and $null -ne $Metadata.versions) {
      foreach ($versionName in @($Metadata.versions.PSObject.Properties.Name)) {
        $candidate = ConvertTo-SemVerRecord ([string]$versionName)
        if ($null -eq $candidate) { continue }
        if (-not [string]::IsNullOrWhiteSpace([string]$candidate.Prerelease)) { continue }
        if ((Compare-SemVerRecord $candidate $current) -le 0) { continue }
        if ($policy -eq "patch" -and ($candidate.Major -ne $current.Major -or $candidate.Minor -ne $current.Minor)) { continue }
        if ($policy -eq "minor" -and $candidate.Major -ne $current.Major) { continue }
        if ($null -eq $best -or (Compare-SemVerRecord $candidate $best) -gt 0) { $best = $candidate }
      }
    }
    if ($null -ne $best) { $targetVersion = [string]$best.Version }
  }

  if ([string]::IsNullOrWhiteSpace($targetVersion) -or $targetVersion -eq $currentVersion) { return $null }
  $target = ConvertTo-SemVerRecord $targetVersion
  if ($null -ne $current -and $null -ne $target -and (Compare-SemVerRecord $target $current) -le 0) { return $null }

  return [pscustomobject]@{
    Id = [string]$Dependency.id
    Package = [string]$Dependency.package
    CurrentVersion = $currentVersion
    TargetVersion = $targetVersion
    ChangeType = (Get-ChangeType $currentVersion $targetVersion)
    Policy = $policy
    ManualReview = ($policy -eq "manual")
  }
}

function Get-Sha256FileHex([string]$Path) {
  if (-not (Test-Path $Path)) { throw "File not found for SHA-256: $Path" }
  $stream = [System.IO.File]::OpenRead($Path)
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hashBytes = $algorithm.ComputeHash($stream)
    return (($hashBytes | ForEach-Object { $_.ToString("x2") }) -join "")
  } finally {
    $algorithm.Dispose()
    $stream.Dispose()
  }
}

function Get-FileHashBase64([string]$Path, [string]$AlgorithmName) {
  $algorithm = $null
  switch ($AlgorithmName.ToLowerInvariant()) {
    "sha512" { $algorithm = [System.Security.Cryptography.SHA512]::Create() }
    "sha256" { $algorithm = [System.Security.Cryptography.SHA256]::Create() }
    "sha1" { $algorithm = [System.Security.Cryptography.SHA1]::Create() }
    default { return $null }
  }
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    return [Convert]::ToBase64String($algorithm.ComputeHash($stream))
  } finally {
    $algorithm.Dispose()
    $stream.Dispose()
  }
}

function Test-NpmIntegrity([string]$Path, [string]$Integrity) {
  if ([string]::IsNullOrWhiteSpace($Integrity)) { return $true }
  $supportedTokenFound = $false
  foreach ($token in ($Integrity -split '\s+')) {
    if ([string]::IsNullOrWhiteSpace($token)) { continue }
    $separator = $token.IndexOf('-')
    if ($separator -le 0) { continue }
    $algorithmName = $token.Substring(0, $separator)
    $expected = $token.Substring($separator + 1)
    $actual = Get-FileHashBase64 $Path $algorithmName
    if ($null -eq $actual) { continue }
    $supportedTokenFound = $true
    if ($actual -eq $expected) { return $true }
  }
  if (-not $supportedTokenFound) { throw "npm integrity uses no supported hash algorithm: $Integrity" }
  return $false
}

function Get-DependencyCacheRoot([string]$Root, [string]$PackageName, [string]$Version) {
  $packageKey = (($PackageName -replace "[^A-Za-z0-9._-]", "-") + "-" + $Version)
  return Join-Path (Join-Path $Root ".cache") $packageKey
}

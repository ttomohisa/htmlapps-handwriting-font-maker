param(
  [string[]]$Id = @(),
  [switch]$ForceDownload
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
Set-StrictMode -Version Latest
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
. (Join-Path $Root "scripts\dependency-tools.ps1")

$DependenciesPath = Join-Path $Root "dependencies.json"
$LockPath = Join-Path $Root "dependencies.lock.json"
$CacheRoot = Join-Path $Root ".cache"
New-Item -ItemType Directory -Force -Path $CacheRoot | Out-Null

if (-not (Get-Command tar.exe -ErrorAction SilentlyContinue)) {
  throw "tar.exe was not found. Use a current Windows 10/11 environment, or install bsdtar and expose it as tar.exe."
}

$config = Read-DependencyJson $DependenciesPath
$dependencies = @($config.dependencies)
$selectedIds = @{}
foreach ($value in @($Id)) {
  if (-not [string]::IsNullOrWhiteSpace([string]$value)) { $selectedIds[[string]$value] = $true }
}
$syncAll = ($selectedIds.Count -eq 0)

$existingById = @{}
if (Test-Path $LockPath) {
  $existingLock = Read-DependencyJson $LockPath
  if ($existingLock.PSObject.Properties.Name -contains "dependencies" -and $existingLock.dependencies) {
    foreach ($entry in @($existingLock.dependencies)) { $existingById[[string]$entry.id] = $entry }
  }
}

$dependencyIds = @($dependencies | ForEach-Object { [string]$_.id })
foreach ($selectedId in @($selectedIds.Keys)) {
  if ($dependencyIds -notcontains $selectedId) { throw "Dependency id '$selectedId' was not found in dependencies.json." }
}

function Get-ValidatedLockEntry([object]$Dependency) {
  $id = [string]$Dependency.id
  $packageName = [string]$Dependency.package
  $version = [string]$Dependency.version
  Write-Host "[Dependency Lock] Resolving $packageName@$version" -ForegroundColor Cyan
  $metadata = Get-NpmMetadata $packageName $version
  if (-not ($metadata.PSObject.Properties.Name -contains "dist") -or $null -eq $metadata.dist -or [string]::IsNullOrWhiteSpace([string]$metadata.dist.tarball)) {
    throw "npm metadata did not contain a tarball URL for $packageName@$version."
  }
  $integrity = ""
  if ($metadata.dist.PSObject.Properties.Name -contains "integrity") { $integrity = [string]$metadata.dist.integrity }

  $packageRoot = Get-DependencyCacheRoot $Root $packageName $version
  $archivePath = Join-Path $packageRoot "package.tgz"
  $extractRoot = Join-Path $packageRoot "extracted"
  $packageDir = Join-Path $extractRoot "package"
  if ($ForceDownload -and (Test-Path $packageRoot)) { Remove-Item -Recurse -Force $packageRoot }
  New-Item -ItemType Directory -Force -Path $packageRoot | Out-Null

  $downloadNeeded = -not (Test-Path $archivePath)
  if (-not $downloadNeeded -and -not [string]::IsNullOrWhiteSpace($integrity)) {
    if (-not (Test-NpmIntegrity $archivePath $integrity)) {
      Write-Warning "Cached archive failed npm integrity verification; downloading it again."
      $downloadNeeded = $true
    }
  }

  if ($downloadNeeded) {
    $partialPath = "$archivePath.part"
    Remove-Item -Force -ErrorAction SilentlyContinue $partialPath
    Write-Host "[Dependency Lock] Downloading $packageName@$version" -ForegroundColor Cyan
    Invoke-WebRequest -Uri ([string]$metadata.dist.tarball) -OutFile $partialPath -UseBasicParsing -Headers @{ "User-Agent" = $Script:DependencyToolsUserAgent } | Out-Null
    Move-Item -Force $partialPath $archivePath
  }

  if (-not [string]::IsNullOrWhiteSpace($integrity) -and -not (Test-NpmIntegrity $archivePath $integrity)) {
    throw "Downloaded tarball failed npm integrity verification for $packageName@$version."
  }

  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $extractRoot
  New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
  & tar.exe -xzf $archivePath -C $extractRoot | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "tar.exe failed while extracting $archivePath" }

  $packageJsonPath = Join-Path $packageDir "package.json"
  if (-not (Test-Path $packageJsonPath)) { throw "package.json was not found in $packageDir" }
  $packageJson = Read-DependencyJson $packageJsonPath
  if ([string]$packageJson.version -ne $version) {
    throw "Expected $packageName@$version but the archive contains $([string]$packageJson.version)."
  }

  $rootFull = [System.IO.Path]::GetFullPath($packageDir).TrimEnd([char[]]@([char]92, [char]47))
  foreach ($asset in @($Dependency.assets)) {
    $configuredPath = [string]$asset.path
    $assetFull = [System.IO.Path]::GetFullPath((Join-Path $packageDir $configuredPath))
    if (-not $assetFull.StartsWith($rootFull + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Dependency asset path escapes the package root: $configuredPath"
    }
    if (-not (Test-Path $assetFull)) { throw "Dependency asset not found in $packageName@$version: $configuredPath" }
  }

  $entry = [ordered]@{
    id = $id
    package = $packageName
    version = $version
    tarballSha256 = (Get-Sha256FileHex $archivePath)
  }
  if (-not [string]::IsNullOrWhiteSpace($integrity)) { $entry["integrity"] = $integrity }
  return $entry
}

$newEntries = @()
foreach ($dependency in $dependencies) {
  $id = [string]$dependency.id
  $shouldSync = $syncAll -or $selectedIds.ContainsKey($id)
  if ($shouldSync) {
    $newEntries += Get-ValidatedLockEntry $dependency
    continue
  }

  if (-not $existingById.ContainsKey($id)) {
    throw "dependencies.lock.json has no entry for '$id'. Run .\\scripts\\sync-dependency-lock.ps1 -Id $id (or without -Id to sync all dependencies)."
  }
  $existing = $existingById[$id]
  if ([string]$existing.package -ne [string]$dependency.package -or [string]$existing.version -ne [string]$dependency.version) {
    throw "Lock entry for '$id' does not match dependencies.json. Sync that dependency before continuing."
  }
  $newEntries += $existing
}

$lock = [ordered]@{
  '$schema' = "./schemas/dependencies-lock.schema.json"
  schemaVersion = 1
  dependencies = $newEntries
}
Write-DependencyJson $LockPath $lock 20
Write-Host "[Dependency Lock] Updated $LockPath" -ForegroundColor Green

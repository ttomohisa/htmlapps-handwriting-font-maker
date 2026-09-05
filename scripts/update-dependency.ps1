param(
  [Parameter(Mandatory = $true)]
  [string]$Id,
  [string]$Version = "",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
Set-StrictMode -Version Latest
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
. (Join-Path $Root "scripts\dependency-tools.ps1")

$DependenciesPath = Join-Path $Root "dependencies.json"
$LockPath = Join-Path $Root "dependencies.lock.json"
$config = Read-DependencyJson $DependenciesPath
$dependencies = @($config.dependencies)
$matches = @($dependencies | Where-Object { [string]$_.id -eq $Id })
if ($matches.Count -ne 1) { throw "Dependency id '$Id' was not found exactly once in dependencies.json." }
$dependency = $matches[0]
$currentVersion = [string]$dependency.version
$targetVersion = $Version

if ([string]::IsNullOrWhiteSpace($targetVersion)) {
  Write-Host "[Dependency Update] Checking $([string]$dependency.package)" -ForegroundColor Cyan
  $metadata = Get-NpmMetadata ([string]$dependency.package)
  $candidate = Get-DependencyUpdateCandidate $dependency $metadata
  if ($null -eq $candidate) {
    throw "No newer version is available for '$Id' under its configured update policy. Use -Version to choose an explicit version."
  }
  $targetVersion = [string]$candidate.TargetVersion
}

if ([string]::IsNullOrWhiteSpace($targetVersion)) { throw "Target version cannot be empty." }
Write-Host "[Dependency Update] $Id: $currentVersion -> $targetVersion" -ForegroundColor Yellow

$dependenciesBackup = [System.IO.File]::ReadAllBytes($DependenciesPath)
$lockExisted = Test-Path $LockPath
$lockBackup = $null
if ($lockExisted) { $lockBackup = [System.IO.File]::ReadAllBytes($LockPath) }

try {
  $dependency.version = $targetVersion
  Write-DependencyJson $DependenciesPath $config 30

  & (Join-Path $Root "scripts\sync-dependency-lock.ps1") -Id $Id -ForceDownload

  if (-not $SkipBuild) {
    Write-Host "[Dependency Update] Building and verifying standalone output" -ForegroundColor Cyan
    & (Join-Path $Root "build-standalone.ps1")
  }

  Write-Host ""
  Write-Host "[OK] Dependency update prepared: $Id $currentVersion -> $targetVersion" -ForegroundColor Green
  Write-Host "[Review] Check upstream release notes, THIRD_PARTY_NOTICES.md, the affected feature, and build-size-report.json before committing."
} catch {
  [System.IO.File]::WriteAllBytes($DependenciesPath, $dependenciesBackup)
  if ($lockExisted) {
    [System.IO.File]::WriteAllBytes($LockPath, $lockBackup)
  } else {
    Remove-Item -Force -ErrorAction SilentlyContinue $LockPath
  }
  Write-Warning "Dependency update failed. dependencies.json and dependencies.lock.json were restored."
  throw
}

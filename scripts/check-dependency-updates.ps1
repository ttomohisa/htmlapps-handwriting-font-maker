param(
  [string]$DependenciesPath = "",
  [string]$JsonOutput = "",
  [string]$MarkdownOutput = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
Set-StrictMode -Version Latest
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
. (Join-Path $Root "scripts\dependency-tools.ps1")

if ([string]::IsNullOrWhiteSpace($DependenciesPath)) { $DependenciesPath = Join-Path $Root "dependencies.json" }
if (-not [System.IO.Path]::IsPathRooted($DependenciesPath)) { $DependenciesPath = Join-Path $Root $DependenciesPath }
if ([string]::IsNullOrWhiteSpace($JsonOutput)) { $JsonOutput = Join-Path $Root "dist\dependency-update-report.json" }
if (-not [System.IO.Path]::IsPathRooted($JsonOutput)) { $JsonOutput = Join-Path $Root $JsonOutput }
if ([string]::IsNullOrWhiteSpace($MarkdownOutput)) { $MarkdownOutput = Join-Path $Root "dist\dependency-update-report.md" }
if (-not [System.IO.Path]::IsPathRooted($MarkdownOutput)) { $MarkdownOutput = Join-Path $Root $MarkdownOutput }

$config = Read-DependencyJson $DependenciesPath
$dependencies = @($config.dependencies)
$updates = @()
$checkedCount = 0
$disabledCount = 0

foreach ($dependency in $dependencies) {
  $settings = Get-DependencyUpdatePolicy $dependency
  if (-not $settings.Enabled) {
    $disabledCount += 1
    continue
  }
  $checkedCount += 1
  $packageName = [string]$dependency.package
  Write-Host "[Dependency Check] $packageName@$([string]$dependency.version)" -ForegroundColor Cyan
  $metadata = Get-NpmMetadata $packageName
  $candidate = Get-DependencyUpdateCandidate $dependency $metadata
  if ($null -ne $candidate) { $updates += $candidate }
}

$report = [ordered]@{
  schemaVersion = 1
  checkedAtUtc = [DateTime]::UtcNow.ToString("o")
  dependencyCount = $dependencies.Count
  checkedCount = $checkedCount
  disabledCount = $disabledCount
  updateCount = $updates.Count
  updates = @($updates | ForEach-Object {
    [ordered]@{
      id = $_.Id
      package = $_.Package
      currentVersion = $_.CurrentVersion
      targetVersion = $_.TargetVersion
      changeType = $_.ChangeType
      policy = $_.Policy
      manualReview = $_.ManualReview
    }
  })
}

$jsonDirectory = Split-Path -Parent $JsonOutput
$markdownDirectory = Split-Path -Parent $MarkdownOutput
New-Item -ItemType Directory -Force -Path $jsonDirectory, $markdownDirectory | Out-Null
Write-DependencyJson $JsonOutput $report 20

$lines = @()
$lines += ("<!-- single-html-template:dependency-update-report:v1 -->")
$lines += ("## Dependency updates")
$lines += ("")
$lines += ("Checked: $([DateTime]::UtcNow.ToString('yyyy-MM-dd')) (UTC)")
$lines += ("")
if ($updates.Count -eq 0) {
  $lines += ("No updates are currently available for the enabled dependency policies.")
} else {
  $lines += ("| Dependency | Current | Suggested | Type | Policy |")
  $lines += ("| --- | ---: | ---: | --- | --- |")
  foreach ($update in $updates) {
    $review = if ($update.ManualReview) { "manual review" } else { [string]$update.Policy }
    $lines += ("| ``$($update.Package)`` | ``$($update.CurrentVersion)`` | ``$($update.TargetVersion)`` | $($update.ChangeType) | $review |")
  }
  $lines += ("")
  $lines += ("### Review checklist")
  $lines += ("")
  $lines += ("- [ ] Review upstream release notes and breaking changes.")
  $lines += ("- [ ] Run ``.\\scripts\\update-dependency.ps1 -Id <dependency-id>`` or choose an explicit ``-Version``.")
  $lines += ("- [ ] Confirm ``dependencies.json`` and ``dependencies.lock.json`` changed as expected.")
  $lines += ("- [ ] Review ``THIRD_PARTY_NOTICES.md`` and license information.")
  $lines += ("- [ ] Confirm the standalone build, offline verification, affected feature, and output size.")
  $lines += ("")
  $lines += ("> This workflow only reports updates. It never changes dependency versions or opens a pull request automatically.")
}
$lines += ("")
$lines += ("Policy notes: ``patch`` stays within the current major/minor, ``minor`` stays within the current major, ``major`` may move to a new major, and ``manual`` reports the npm ``latest`` tag for human review.")
[System.IO.File]::WriteAllLines($MarkdownOutput, $lines, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
if ($updates.Count -gt 0) {
  Write-Host "[Dependency Check] $($updates.Count) update(s) available." -ForegroundColor Yellow
  foreach ($update in $updates) {
    Write-Host "  $($update.Id): $($update.CurrentVersion) -> $($update.TargetVersion) [$($update.ChangeType), $($update.Policy)]"
  }
} else {
  Write-Host "[Dependency Check] No updates available." -ForegroundColor Green
}
Write-Host "[Dependency Check] JSON: $JsonOutput"
Write-Host "[Dependency Check] Markdown: $MarkdownOutput"

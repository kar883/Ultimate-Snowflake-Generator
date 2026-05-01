$ErrorActionPreference = 'Stop'

$tempDir = [System.IO.Path]::GetTempPath().TrimEnd('\\')
$sentinelPath = Join-Path $tempDir 'snowflake-legacy-uninstall-invoked.txt'

$legacyKeys = @(
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Ultimate Snowflake Generator',
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Snowflake Generator',
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\com.snowflake.generator'
)

foreach ($key in $legacyKeys) {
  if (Test-Path $key) {
    Remove-Item -Path $key -Recurse -Force
  }
}

if (Test-Path $sentinelPath) {
  Remove-Item $sentinelPath -Force
}

Write-Host 'Legacy uninstall test stubs cleaned up.'
Write-Host "Removed sentinel file: $sentinelPath"

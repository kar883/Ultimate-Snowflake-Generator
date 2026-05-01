$ErrorActionPreference = 'Stop'

$tempDir = [System.IO.Path]::GetTempPath().TrimEnd('\\')
$sentinelPath = Join-Path $tempDir 'snowflake-legacy-uninstall-invoked.txt'

$legacyKeys = @(
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Ultimate Snowflake Generator',
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Snowflake Generator',
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\com.snowflake.generator'
)

foreach ($key in $legacyKeys) {
  if (-not (Test-Path $key)) {
    New-Item -Path $key -Force | Out-Null
  }

  # This command is what the installer will invoke if you click Yes on the prompt.
  # It writes a sentinel file so you can prove the prompt path executed.
  $uninstallCmd = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Set-Content -Path ''{0}'' -Value ''legacy-uninstall-invoked'' -Force"' -f $sentinelPath

  New-ItemProperty -Path $key -Name 'DisplayName' -Value 'Legacy Snowflake Generator (Test Stub)' -PropertyType String -Force | Out-Null
  New-ItemProperty -Path $key -Name 'UninstallString' -Value $uninstallCmd -PropertyType String -Force | Out-Null
}

if (Test-Path $sentinelPath) {
  Remove-Item $sentinelPath -Force
}

Write-Host 'Legacy uninstall test stubs created.'
Write-Host "Sentinel file will be created at: $sentinelPath"
Write-Host 'Now run the installer and click Yes on the legacy uninstall prompt.'

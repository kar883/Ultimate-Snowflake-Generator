# Installer + Menu Smoke Check (Windows)

## Goal
Verify:
1. Help menu actions affect the app (About + update check path)
2. Installer detects legacy installs and prompts to uninstall

## Prerequisites
- Built artifacts exist in dist-electron/
- Installer exists: dist-electron/Snowflake Generator Setup 1.0.7.exe
- Optional: packaged app folder exists: dist-electron/win-unpacked/

## A) Help Menu / About / Update Check
1. Launch dist-electron/win-unpacked/Snowflake Generator.exe
2. Trigger Help -> Check for Updates (or press Ctrl+U)
3. Confirm About modal opens
4. Confirm update status text appears (any one is valid):
   - Checking for updates...
   - Update available: ...
   - You are up to date ...
   - Unable to check for updates ...

## B) Installer Legacy-Uninstall Prompt
1. In PowerShell (repo root), run:
   - ./scripts/test-legacy-uninstall-setup.ps1
2. Run installer:
   - dist-electron/Snowflake Generator Setup 1.0.7.exe
3. When prompted that an older install was found, click Yes
4. Verify sentinel file exists:
   - $env:TEMP\snowflake-legacy-uninstall-invoked.txt
5. Optional negative case:
   - Delete sentinel file
   - Re-run installer and click No
   - Confirm sentinel file is not recreated
6. Cleanup test stubs:
   - ./scripts/test-legacy-uninstall-cleanup.ps1

## Pass Criteria
- A) About modal + update status appear from Help update action
- B) Prompt appears when stubs exist, and clicking Yes creates sentinel file
- B) Clicking No does not create sentinel file

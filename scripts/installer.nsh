; Custom NSIS installer hooks for Snowflake Generator
; Prompts users to remove legacy installs before continuing.

!macro customInit
  StrCpy $0 ""

  ; Legacy product display names from earlier builds/releases.
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Ultimate Snowflake Generator" "UninstallString"
  StrCmp $0 "" 0 found

  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Ultimate Snowflake Generator" "UninstallString"
  StrCmp $0 "" 0 found

  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Snowflake Generator" "UninstallString"
  StrCmp $0 "" 0 found

  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Snowflake Generator" "UninstallString"
  StrCmp $0 "" 0 found

  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.snowflake.generator" "UninstallString"
  StrCmp $0 "" 0 found

  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.snowflake.generator" "UninstallString"
  StrCmp $0 "" 0 found

  Goto done

found:
  MessageBox MB_ICONQUESTION|MB_YESNO "A previous Snowflake Generator installation was found.$\n$\nIt must be uninstalled before this update can continue.$\n$\nWould you like to uninstall it now?" IDNO abortInstall
  ExecWait '$0'
  Goto done

abortInstall:
  Abort

done:
!macroend

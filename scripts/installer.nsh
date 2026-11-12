; Custom NSIS installer hooks for Snowflake Generator
; Silently removes any other copy of the app (older builds registered under a different
; uninstall key) so an update replaces the existing install instead of sitting beside it.
; The current GUID's install is handled by electron-builder's own upgrade logic.

!macro _SnowflakeScanLegacy ROOT
  StrCpy $R0 0
  scan_${ROOT}_loop:
    EnumRegKey $R1 ${ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall" $R0
    StrCmp $R1 "" scan_${ROOT}_done
    IntOp $R0 $R0 + 1
    StrCmp $R1 "{B7E2A1C4-9F3B-4D2A-8C1E-2F3A4B5C6D7E}" scan_${ROOT}_loop

    ReadRegStr $R2 ${ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "DisplayName"
    StrCpy $R3 $R2 19
    StrCmp $R3 "Snowflake Generator" scan_${ROOT}_match
    StrCpy $R3 $R2 28
    StrCmp $R3 "Ultimate Snowflake Generator" scan_${ROOT}_match
    Goto scan_${ROOT}_loop

  scan_${ROOT}_match:
    ReadRegStr $R4 ${ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "QuietUninstallString"
    StrCmp $R4 "" 0 scan_${ROOT}_parse
    ReadRegStr $R4 ${ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "UninstallString"
    StrCmp $R4 "" scan_${ROOT}_loop
    StrCpy $R4 "$R4 /S"

  scan_${ROOT}_parse:
    ; $R4 looks like: "C:\dir\Uninstall X.exe" <args>
    StrCpy $R5 $R4 1
    StrCmp $R5 '"' 0 scan_${ROOT}_loop
    StrCpy $R5 ""
    StrCpy $R6 1
  scan_${ROOT}_exe:
    StrCpy $R7 $R4 1 $R6
    StrCmp $R7 "" scan_${ROOT}_loop
    StrCmp $R7 '"' scan_${ROOT}_exe_done
    StrCpy $R5 "$R5$R7"
    IntOp $R6 $R6 + 1
    Goto scan_${ROOT}_exe
  scan_${ROOT}_exe_done:
    IntOp $R6 $R6 + 1
    StrCpy $R6 $R4 "" $R6
    ; $R5 = uninstaller path, $R6 = remaining args

    StrLen $R7 $R5
  scan_${ROOT}_dir:
    IntOp $R7 $R7 - 1
    IntCmp $R7 0 scan_${ROOT}_loop scan_${ROOT}_loop 0
    StrCpy $R8 $R5 1 $R7
    StrCmp $R8 "\" 0 scan_${ROOT}_dir
    StrCpy $R8 $R5 $R7

    IfFileExists "$R5" 0 scan_${ROOT}_loop
    ExecWait '"$R5"$R6 _?=$R8'
    Delete "$R5"
    RMDir "$R8"

    ReadRegStr $R2 ${ROOT} "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R1" "DisplayName"
    StrCmp $R2 "" 0 scan_${ROOT}_loop
    IntOp $R0 $R0 - 1
    Goto scan_${ROOT}_loop
  scan_${ROOT}_done:
!macroend

!macro customInit
  Push $R0
  Push $R1
  Push $R2
  Push $R3
  Push $R4
  Push $R5
  Push $R6
  Push $R7
  Push $R8
  !insertmacro _SnowflakeScanLegacy HKCU
  !insertmacro _SnowflakeScanLegacy HKLM
  Pop $R8
  Pop $R7
  Pop $R6
  Pop $R5
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
  Pop $R0
!macroend

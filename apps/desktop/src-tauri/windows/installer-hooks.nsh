; Tauri NSIS installer hooks — architecture §4.2, the Windows half of the
; update handover.
;
; Only `NSIS_HOOK_PREINSTALL` is defined. It runs before any v2 file is written
; and its single job is to remove the *Electron* Shiranami, so a user who
; crosses over does not end up with two Shiranamis in Add/Remove Programs.
;
; # Why a registry lookup and not a fixed path
;
; v1 ships electron-builder NSIS with `oneClick: false` and
; `allowToChangeInstallationDirectory: true`, so the install directory is
; whatever the user picked. The uninstaller's own path is the only thing
; recorded, and it is recorded under a key electron-builder derives — not the
; appId as §4.2's shorthand says.
;
; electron-builder computes `UUIDv5(appId, 50e065bc-3134-11e6-9bab-38c9862bdaf3)`
; and uses that GUID as the Uninstall subkey name (`NsisTarget.js`, `APP_GUID` /
; `UNINSTALL_APP_KEY`). For `com.shironex.shiranami` that is the constant below.
; It is stable — it is a pure function of the appId, which §3.1 pins because the
; app directories derive from it too. The literal appId is tried second in case
; a future v1.x sets `nsis.guid` explicitly, which would switch the key name to
; that value instead.
;
; # What that key actually holds
;
; Read off a real v1.0.1 install (2026-09-22, #412), not the source:
;
;   UninstallString  "C:\...\Programs\Shiranami\Uninstall Shiranami.exe" /currentuser
;   InstallLocation  (absent)
;
; The first draft of this file assumed the opposite on both counts: a value that
; was *only* a quoted path, and an `InstallLocation` beside it. It stripped the
; last character as a closing quote — eating the `r` of `/currentuser` — so
; `IfFileExists` never matched and v1 was never removed. So the command line is
; now split properly (`ShiranamiSplitCommand`), its own arguments are kept, and
; the install directory is taken from the uninstaller's location, which is
; where electron-builder always writes it.
;
; # Why the user's data survives this
;
; electron-builder's uninstaller only removes `%APPDATA%\Shiranami` when it is
; passed `--delete-app-data` (or the user ticks the box in the interactive
; flow). `/S` alone leaves it, which is load-bearing: §3.1's first-run
; continuity copies that tree, and §4's whole safety net is that v1 stays
; reinstallable. Never add that flag here.
;
; # Failure is never fatal
;
; Every branch falls through to `done`. A missing key, a deleted uninstaller, a
; refused UAC prompt on a per-machine install — none of them may stop the v2
; install. The worst case is a stale Add/Remove Programs entry, which is a
; cosmetic problem; a failed install is not.

!include "FileFunc.nsh"

!define V1_UNINSTALL_ROOT "Software\Microsoft\Windows\CurrentVersion\Uninstall"

; UUIDv5 of "com.shironex.shiranami" in electron-builder's namespace.
!define V1_UNINSTALL_GUID "9bc71796-dfb5-5190-a5bb-18e27e535d9a"

; The appId itself, for a v1.x that pins `nsis.guid` to it.
!define V1_UNINSTALL_APPID "com.shironex.shiranami"

; Splits the command line in $R0 into the executable ($R0) and whatever follows
; it ($R4, leading spaces trimmed, possibly empty).
;
; electron-builder always quotes the path, because the default install
; directory has a space in it ("Uninstall Shiranami.exe"). An unquoted value is
; taken whole rather than split on the first space, which would cut exactly
; such a path in half; `IfFileExists` then decides whether it was usable.
Function ShiranamiSplitCommand
  StrCpy $R4 ""
  StrCpy $R2 $R0 1
  StrCmp $R2 '"' 0 split_done

  ; $R5 walks forward from the character after the opening quote.
  StrCpy $R5 1
  split_scan:
    StrCpy $R2 $R0 1 $R5
    StrCmp $R2 "" split_unterminated
    StrCmp $R2 '"' split_close
    IntOp $R5 $R5 + 1
    Goto split_scan

  split_close:
    IntOp $R6 $R5 + 1
    StrCpy $R4 $R0 "" $R6
    IntOp $R5 $R5 - 1
    StrCpy $R0 $R0 $R5 1
    Goto split_trim

  split_unterminated:
    StrCpy $R0 $R0 "" 1
    Goto split_done

  split_trim:
    StrCpy $R2 $R4 1
    StrCmp $R2 " " 0 split_done
    StrCpy $R4 $R4 "" 1
    Goto split_trim

  split_done:
FunctionEnd

; Finds v1's uninstaller. On return $R0 is its path (empty when there is no v1
; to remove), $R1 its directory, and $R4 the arguments the registry recorded.
Function ShiranamiResolveV1
  StrCpy $R1 ""
  StrCpy $R4 ""

  ; HKCU first: v1's electron-builder config sets neither `perMachine` nor
  ; `oneClick`, which installs per-user, so this is the expected hit.
  ReadRegStr $R0 HKCU "${V1_UNINSTALL_ROOT}\${V1_UNINSTALL_GUID}" "UninstallString"
  StrCmp $R0 "" 0 resolve_found
  ReadRegStr $R0 HKCU "${V1_UNINSTALL_ROOT}\${V1_UNINSTALL_APPID}" "UninstallString"
  StrCmp $R0 "" 0 resolve_found

  ; HKLM, both registry views, for an install that was elevated at some point.
  SetRegView 64
  ReadRegStr $R0 HKLM "${V1_UNINSTALL_ROOT}\${V1_UNINSTALL_GUID}" "UninstallString"
  StrCmp $R0 "" 0 resolve_found_view
  SetRegView 32
  ReadRegStr $R0 HKLM "${V1_UNINSTALL_ROOT}\${V1_UNINSTALL_GUID}" "UninstallString"
  resolve_found_view:
  SetRegView lastused
  StrCmp $R0 "" resolve_done

  resolve_found:
    Call ShiranamiSplitCommand
    IfFileExists "$R0" 0 resolve_missing
    ${GetParent} "$R0" $R1
    Goto resolve_done

  ; A key pointing at an uninstaller that is gone: nothing to run.
  resolve_missing:
    StrCpy $R0 ""
    StrCpy $R4 ""

  resolve_done:
FunctionEnd

Function ShiranamiUninstallElectron
  ; This runs inside Tauri's install section, whose own code may hold values in
  ; the same registers; hand them back untouched.
  Push $R0
  Push $R1
  Push $R2
  Push $R3
  Push $R4
  Push $R5
  Push $R6

  Call ShiranamiResolveV1
  StrCmp $R0 "" done
  DetailPrint "Removing the previous Shiranami (Electron) installation..."

  ; `_?=` keeps the uninstaller from relocating itself to %TEMP%, which is what
  ; makes ExecWait actually wait — without it the uninstaller returns
  ; immediately and v2 starts writing files while v1 is still deleting them.
  ; It has to be the last argument, and the recorded ones (`/currentuser`)
  ; go before it: they tell electron-builder which hive the install lives in.
  ExecWait '"$R0" $R4 /S _?=$R1' $R3
  ; With `_?=` the uninstaller cannot delete itself; the shell it left behind is
  ; ours to clean up, and so is the directory once it is empty.
  Delete "$R0"
  RMDir "$R1"
  DetailPrint "Previous installation removed (exit code $R3)."

  done:
  Pop $R6
  Pop $R5
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
  Pop $R0
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  Call ShiranamiUninstallElectron
!macroend

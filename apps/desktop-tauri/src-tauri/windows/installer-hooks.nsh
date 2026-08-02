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
;
; # This has never run
;
; There is no Windows machine in the loop that produced this file, and NSIS is
; not exercised by `cargo test` or by any CI job we have. It is written against
; electron-builder 26.15.3's generated installer and the Tauri v2 NSIS hook
; contract, and it needs a real before/after check on the user's Windows PC:
; install v1, install v2 over it, confirm one entry in Add/Remove Programs and a
; populated library after first run.

!define V1_UNINSTALL_ROOT "Software\Microsoft\Windows\CurrentVersion\Uninstall"

; UUIDv5 of "com.shironex.shiranami" in electron-builder's namespace.
!define V1_UNINSTALL_GUID "9bc71796-dfb5-5190-a5bb-18e27e535d9a"

; The appId itself, for a v1.x that pins `nsis.guid` to it.
!define V1_UNINSTALL_APPID "com.shironex.shiranami"

; Strips one layer of surrounding double quotes from $R0, if present.
; electron-builder stores `UninstallString` quoted; re-quoting it in the
; `ExecWait` below would produce `""C:\...""` and fail to launch.
!macro SHIRANAMI_UNQUOTE
  StrCpy $R2 $R0 1
  StrCmp $R2 '"' 0 +3
    StrCpy $R0 $R0 "" 1
    StrCpy $R0 $R0 -1
!macroend

; Reads UninstallString/InstallLocation for one Uninstall subkey into $R0/$R1.
; $R0 is empty when the key is absent.
!macro SHIRANAMI_READ_V1 ROOT KEY
  ReadRegStr $R0 ${ROOT} "${V1_UNINSTALL_ROOT}\${KEY}" "UninstallString"
  ReadRegStr $R1 ${ROOT} "${V1_UNINSTALL_ROOT}\${KEY}" "InstallLocation"
!macroend

Function ShiranamiUninstallElectron
  ; HKCU first: v1's electron-builder config sets neither `perMachine` nor
  ; `oneClick`, which installs per-user, so this is the expected hit.
  !insertmacro SHIRANAMI_READ_V1 HKCU "${V1_UNINSTALL_GUID}"
  StrCmp $R0 "" 0 found
  !insertmacro SHIRANAMI_READ_V1 HKCU "${V1_UNINSTALL_APPID}"
  StrCmp $R0 "" 0 found

  ; HKLM, both registry views, for an install that was elevated at some point.
  SetRegView 64
  !insertmacro SHIRANAMI_READ_V1 HKLM "${V1_UNINSTALL_GUID}"
  StrCmp $R0 "" 0 found
  SetRegView 32
  !insertmacro SHIRANAMI_READ_V1 HKLM "${V1_UNINSTALL_GUID}"
  SetRegView lastused
  StrCmp $R0 "" done found

  found:
    !insertmacro SHIRANAMI_UNQUOTE
    IfFileExists "$R0" 0 done
    DetailPrint "Removing the previous Shiranami (Electron) installation..."

    ; `_?=` keeps the uninstaller from relocating itself to %TEMP%, which is what
    ; makes ExecWait actually wait — without it the uninstaller returns
    ; immediately and v2 starts writing files while v1 is still deleting them.
    ; It needs the install directory, so the no-InstallLocation path below is a
    ; deliberate best-effort fallback rather than an equivalent.
    StrCmp $R1 "" noloc
      ExecWait '"$R0" /S _?=$R1' $R3
      ; With `_?=` the uninstaller cannot delete itself; the shell it left
      ; behind is ours to clean up.
      Delete "$R0"
      Goto reported
    noloc:
      ExecWait '"$R0" /S' $R3
    reported:
      DetailPrint "Previous installation removed (exit code $R3)."

  done:
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  Call ShiranamiUninstallElectron
!macroend

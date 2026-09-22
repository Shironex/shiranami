; Exercises the parsing half of installer-hooks.nsh without uninstalling anything.
;
;   makensis installer-hooks.test.nsi && %TEMP%\installer-hooks-test.exe
;
; Builds into %TEMP% so nothing lands in the tree. Writes one line per case to
; OUT (default %TEMP%\installer-hooks-test.txt): `PASS|FAIL <name>: <got>`, then the
; resolution against this machine's registry as `INFO`. Not run by CI, because
; NSIS only runs on Windows and no CI job builds the installer; run it by hand
; after touching the hook.

Unicode true
Name "installer-hooks test"
OutFile "$%TEMP%\installer-hooks-test.exe"
RequestExecutionLevel user
SilentInstall silent

!ifndef OUT
  !define OUT "$TEMP\installer-hooks-test.txt"
!endif

!include "installer-hooks.nsh"

Var fh

!macro EXPECT_SPLIT NAME INPUT WANT_EXE WANT_ARGS
  StrCpy $R0 `${INPUT}`
  Call ShiranamiSplitCommand
  StrCmp $R0 `${WANT_EXE}` 0 +3
  StrCmp $R4 `${WANT_ARGS}` 0 +2
  Goto +3
  FileWrite $fh `FAIL ${NAME}: exe=[$R0] args=[$R4]$\r$\n`
  Goto +2
  FileWrite $fh `PASS ${NAME}$\r$\n`
!macroend

Section
  FileOpen $fh "${OUT}" w

  !insertmacro EXPECT_SPLIT "v1.0.1 as recorded" \
    `"C:\Users\x\AppData\Local\Programs\Shiranami\Uninstall Shiranami.exe" /currentuser` \
    `C:\Users\x\AppData\Local\Programs\Shiranami\Uninstall Shiranami.exe` `/currentuser`
  !insertmacro EXPECT_SPLIT "quoted, no arguments" `"C:\a b\u.exe"` `C:\a b\u.exe` ``
  !insertmacro EXPECT_SPLIT "extra spaces before arguments" `"C:\a\u.exe"   /a /b` `C:\a\u.exe` `/a /b`
  !insertmacro EXPECT_SPLIT "unquoted is taken whole" `C:\a\u.exe /x` `C:\a\u.exe /x` ``
  !insertmacro EXPECT_SPLIT "unterminated quote" `"C:\a b\u.exe` `C:\a b\u.exe` ``

  Call ShiranamiResolveV1
  FileWrite $fh `INFO resolved exe=[$R0] dir=[$R1] args=[$R4]$\r$\n`

  FileClose $fh
SectionEnd

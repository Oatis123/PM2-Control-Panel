; =============================================================================
; Force install into ...\<APP_FILENAME>
; e.g. user selects D:\Apps  →  D:\Apps\PM2 Control Panel
;
; Hidden section is declared early (this file is !include'd near the top of the
; generated script) so it runs BEFORE the main "install" section — after the
; directory page has set $INSTDIR to whatever the user typed/browsed.
; =============================================================================

!macro EnsureProductInstallDir
  ; strip trailing backslash
  StrCpy $R9 $INSTDIR 1 -1
  StrCmp $R9 "\" 0 +2
    StrCpy $INSTDIR $INSTDIR -1

  ; already ends with APP_FILENAME?
  StrLen $R7 "${APP_FILENAME}"
  IntOp $R8 0 - $R7
  StrCpy $R9 $INSTDIR "" $R8
  StrCmp $R9 "${APP_FILENAME}" 0 ensure_do_append

  ; require '\' right before the name
  StrLen $R6 $INSTDIR
  IntOp $R6 $R6 - $R7
  IntOp $R6 $R6 - 1
  IntCmp $R6 0 ensure_sep_ok ensure_done ensure_sep_ok

  ensure_sep_ok:
    StrCpy $R9 $INSTDIR 1 $R6
    StrCmp $R9 "\" ensure_done ensure_do_append

  ensure_do_append:
    StrCpy $INSTDIR "$INSTDIR\${APP_FILENAME}"

  ensure_done:
!macroend


!ifndef BUILD_UNINSTALLER

  ; Hidden section ("-" = not shown). Defined early → runs first.
  Section "-EnsureProductInstallDirectory"
    !insertmacro EnsureProductInstallDir
  SectionEnd

  ; Silent /D=path and default path at startup
  !macro customInit
    !insertmacro EnsureProductInstallDir
  !macroend

!endif

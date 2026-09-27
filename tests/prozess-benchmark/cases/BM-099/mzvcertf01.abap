*----------------------------------------------------------------------*
***INCLUDE MZVCERTF01 - Unterroutinen
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form CHECK_VENDOR
*&---------------------------------------------------------------------*
*& Kreditor muss existieren und darf weder zentral gesperrt noch zum
*& Löschen vorgemerkt sein.
*&---------------------------------------------------------------------*
FORM check_vendor.
  SELECT SINGLE * FROM lfa1
    WHERE lifnr = zvcert-lifnr.
  IF sy-subrc <> 0.
    MESSAGE e001 WITH zvcert-lifnr.
  ENDIF.
  IF lfa1-sperr = 'X' OR lfa1-loevm = 'X'.
    MESSAGE e002 WITH zvcert-lifnr.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form CHECK_AUTHORITY
*&---------------------------------------------------------------------*
*& Aktivität aus dem Modus: A -> 03, C -> 01, sonst 02
*&---------------------------------------------------------------------*
FORM check_authority USING pv_mode TYPE c.
  DATA lv_actvt TYPE activ_auth.

  CASE pv_mode.
    WHEN gc_display.
      lv_actvt = '03'.
    WHEN gc_create.
      lv_actvt = '01'.
    WHEN OTHERS.
      lv_actvt = '02'.
  ENDCASE.

  AUTHORITY-CHECK OBJECT 'Z_VCERT'
    ID 'ACTVT'  FIELD lv_actvt
    ID 'ZCTYPE' FIELD zvcert-ctype.
  IF sy-subrc <> 0.
    MESSAGE e005 WITH zvcert-ctype.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form LOCK_CERT
*&---------------------------------------------------------------------*
FORM lock_cert.
  CALL FUNCTION 'ENQUEUE_EZVCERT'
    EXPORTING
      lifnr          = zvcert-lifnr
      ctype          = zvcert-ctype
    EXCEPTIONS
      foreign_lock   = 1
      system_failure = 2
      OTHERS         = 3.
  IF sy-subrc <> 0.
    MESSAGE e006 WITH sy-msgv1.
  ENDIF.
  gv_locked = 'X'.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form UNLOCK_CERT
*&---------------------------------------------------------------------*
FORM unlock_cert.
  CHECK gv_locked = 'X'.
  CALL FUNCTION 'DEQUEUE_EZVCERT'
    EXPORTING
      lifnr = zvcert-lifnr
      ctype = zvcert-ctype.
  CLEAR gv_locked.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form VALIDATE_CERT
*&---------------------------------------------------------------------*
*& Zeitraum plausibel, Zertifikatsart im Customizing ZVCERT_TYPE
*&---------------------------------------------------------------------*
FORM validate_cert.
  DATA lv_ctype TYPE zvcert_type-ctype.

  IF zvcert-valid_to < zvcert-valid_from.
    MESSAGE e007.
  ENDIF.

  SELECT SINGLE ctype FROM zvcert_type INTO lv_ctype
    WHERE ctype = zvcert-ctype.
  IF sy-subrc <> 0.
    MESSAGE e008 WITH zvcert-ctype.
  ENDIF.

* ISO-Zertifikate max. 3 Jahre gültig - 2016 ins Customizing (MAXYEARS)
* verlagert, dort aber nie ausgewertet
*  IF zvcert-ctype(3) = 'ISO'
*     AND zvcert-valid_to - zvcert-valid_from > 1095.
*    MESSAGE e009.
*  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form SAVE_CERT
*&---------------------------------------------------------------------*
*& Status: E = abgelaufen, G = gültig (Stichtag heute)
*& Protokoll: alter/neuer Gültig-bis-Wert und alte/neue Nummer
*&---------------------------------------------------------------------*
FORM save_cert.
  DATA ls_log TYPE zvcert_log.

  zvcert-aenam = sy-uname.
  zvcert-aedat = sy-datum.
  IF zvcert-valid_to < sy-datum.
    zvcert-status = 'E'.
  ELSE.
    zvcert-status = 'G'.
  ENDIF.
  MODIFY zvcert.

  ls_log-lifnr      = zvcert-lifnr.
  ls_log-ctype      = zvcert-ctype.
  ls_log-udate      = sy-datum.
  ls_log-utime      = sy-uzeit.
  ls_log-uname      = sy-uname.
  ls_log-mode       = gv_mode.
  ls_log-old_valid  = gs_old-valid_to.
  ls_log-new_valid  = zvcert-valid_to.
  ls_log-old_certno = gs_old-certno.
  ls_log-new_certno = zvcert-certno.
  INSERT zvcert_log FROM ls_log.

* Änderungsbelege über Objekt ZVCERT - 2011 durch ZVCERT_LOG ersetzt (UH)
*  CALL FUNCTION 'CHANGEDOCUMENT_OPEN'
*    EXPORTING
*      objectclass             = 'ZVCERT'
*      objectid                = lv_objid
*      planned_change_number   = space
*      planned_or_real_changes = 'R'.
*  CALL FUNCTION 'CHANGEDOCUMENT_SINGLE_CASE'
*    EXPORTING
*      tablename        = 'ZVCERT'
*      workarea_old     = gs_old
*      workarea_new     = zvcert
*      change_indicator = gv_mode.
*  CALL FUNCTION 'CHANGEDOCUMENT_CLOSE'
*    EXPORTING
*      objectclass    = 'ZVCERT'
*      objectid       = lv_objid
*      date_of_change = sy-datum
*      tcode          = sy-tcode
*      time_of_change = sy-uzeit
*      username       = sy-uname.

  COMMIT WORK.
  MESSAGE s011 WITH zvcert-lifnr zvcert-ctype.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form DELETE_CERT
*&---------------------------------------------------------------------*
*& Sicherheitsabfrage mit Vorschlag "Nein"; gelöscht wird der Satz
*& aus dem Dynpro-Arbeitsbereich ZVCERT (Kreditor + Zertifikatsart).
*&---------------------------------------------------------------------*
FORM delete_cert.
  CALL FUNCTION 'POPUP_TO_CONFIRM'
    EXPORTING
      titlebar       = 'Zertifikat löschen'(t01)
      text_question  = 'Zertifikat wirklich löschen?'(t02)
      text_button_1  = 'Ja'(t03)
      text_button_2  = 'Nein'(t04)
      default_button = '2'
    IMPORTING
      answer         = gv_answer
    EXCEPTIONS
      text_not_found = 1
      OTHERS         = 2.
  IF gv_answer <> '1'.
    RETURN.
  ENDIF.

  DELETE zvcert.
* Info-Mail an QM bei Löschung - auf Wunsch QM 2012 abgeschaltet
*  PERFORM send_qm_mail USING zvcert-lifnr zvcert-ctype.
*  FORM send_qm_mail lag im Include MZVCERTF02 (gelöscht 2015)
  COMMIT WORK.
  MESSAGE s012 WITH zvcert-lifnr zvcert-ctype.
ENDFORM.

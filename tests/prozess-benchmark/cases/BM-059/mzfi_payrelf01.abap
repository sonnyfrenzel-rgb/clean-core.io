*&---------------------------------------------------------------------*
*& Include MZFI_PAYRELF01 - FORM-Routinen Zahlungsfreigabe
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form LOCK_RUN
*& Sperrt den Zahllauf gegen parallele Freigabe und liest den Vorschlag
*&---------------------------------------------------------------------*
FORM lock_run.
* PERFORM unlock_run.     "Wechsel des Laufs - raus 2013, Dump bei leerem Lauf

  gv_laufd = gs_screen-laufd.
  gv_laufi = gs_screen-laufi.

* _SCOPE 1: Sperre bleibt beim Dialog, auch ueber COMMIT WORK hinweg
  CALL FUNCTION 'ENQUEUE_EZFI_PAYREL'
    EXPORTING
      mode_zfi_payrel = 'E'
      mandt           = sy-mandt
      laufd           = gv_laufd
      laufi           = gv_laufi
      _scope          = '1'
    EXCEPTIONS
      foreign_lock    = 1
      system_failure  = 2
      OTHERS          = 3.
  IF sy-subrc <> 0.
*   Sperre belegt: anderer Freigeber bearbeitet den Lauf (sy-msgv1 = Benutzer)
    CLEAR: gt_pay, gv_laufd, gv_laufi.
    gv_locked = abap_false.
    MESSAGE s010 WITH gs_screen-laufd gs_screen-laufi sy-msgv1 DISPLAY LIKE 'E'.
  ELSE.
    gv_locked = abap_true.
    PERFORM read_proposal.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form UNLOCK_RUN
*&---------------------------------------------------------------------*
FORM unlock_run.
  CALL FUNCTION 'DEQUEUE_EZFI_PAYREL'
    EXPORTING
      mode_zfi_payrel = 'E'
      mandt           = sy-mandt
      laufd           = gv_laufd
      laufi           = gv_laufi
      _scope          = '1'.
  CLEAR gv_locked.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form READ_PROPOSAL
*& Zahlungsvorschlag (REGUH/REGUP) und bisherige Freigaben lesen
*&---------------------------------------------------------------------*
FORM read_proposal.
  DATA: lt_reguh TYPE STANDARD TABLE OF reguh,
        ls_reguh TYPE reguh,
        lt_rel   TYPE SORTED TABLE OF zfi_payrel
                 WITH UNIQUE KEY zbukr vblnr,
        ls_rel   TYPE zfi_payrel,
        lv_lines TYPE i.

  CLEAR: gt_pay, gt_regup, gv_creator, gv_changed.

* Ersteller des Vorschlags - wird im Exit zum Vorschlagslauf (ZF110_EXIT)
* in ZFI_PAYRUN_LOG protokolliert
  SELECT SINGLE ernam FROM zfi_payrun_log INTO gv_creator
    WHERE laufd = gv_laufd
      AND laufi = gv_laufi.

* Zahlungen des Vorschlags; Zeilen ohne Belegnummer = Ausnahmeliste
  SELECT * FROM reguh INTO TABLE lt_reguh
    WHERE laufd = gv_laufd
      AND laufi = gv_laufi
      AND xvorl = 'X'
      AND vblnr <> space.
  IF sy-subrc <> 0.
    MESSAGE s013 WITH gv_laufd gv_laufi DISPLAY LIKE 'W'.
    RETURN.
  ENDIF.

* bezahlte Posten je Zahlung (Anzahl fuer die Anzeige)
  SELECT * FROM regup INTO TABLE gt_regup
    WHERE laufd = gv_laufd
      AND laufi = gv_laufi
      AND xvorl = 'X'.

* bereits gesicherte Freigaben / Ablehnungen
  SELECT * FROM zfi_payrel INTO TABLE lt_rel
    WHERE laufd = gv_laufd
      AND laufi = gv_laufi.

  LOOP AT lt_reguh INTO ls_reguh.
    CLEAR gs_pay.
    gs_pay-zbukr = ls_reguh-zbukr.
    gs_pay-vblnr = ls_reguh-vblnr.
    gs_pay-lifnr = ls_reguh-lifnr.
    gs_pay-kunnr = ls_reguh-kunnr.
    gs_pay-znme1 = ls_reguh-znme1.
    gs_pay-rzawe = ls_reguh-rzawe.
    gs_pay-rwbtr = ls_reguh-rwbtr.
    gs_pay-waers = ls_reguh-waers.
*   gs_pay-rbetr = ls_reguh-rbetr.   "Hauswaehrung - 2013 auf Zahlwaehrung
    gs_pay-anzpo = REDUCE i( INIT n = 0
                             FOR ls_up IN gt_regup
                             WHERE ( zbukr = ls_reguh-zbukr AND vblnr = ls_reguh-vblnr )
                             NEXT n = n + 1 ).
    READ TABLE lt_rel INTO ls_rel
         WITH TABLE KEY zbukr = ls_reguh-zbukr
                        vblnr = ls_reguh-vblnr.
    IF sy-subrc = 0.
      gs_pay-status    = ls_rel-status.
      gs_pay-rel1_user = ls_rel-rel1_user.
      gs_pay-rel2_user = ls_rel-rel2_user.
      gs_pay-reason    = ls_rel-reason.
    ENDIF.
    APPEND gs_pay TO gt_pay.
  ENDLOOP.

  SORT gt_pay BY zbukr vblnr.
  lv_lines = lines( gt_pay ).
  MESSAGE s014 WITH lv_lines gv_laufd gv_laufi.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form RELEASE_MARKED
*& Markierte Zahlungen freigeben (Betragsgrenze, Vier-Augen-Prinzip)
*&---------------------------------------------------------------------*
FORM release_marked.
  DATA: lv_tabix TYPE sy-tabix,
        lv_limit TYPE zfi_payrel_lim-maxbt,
        lv_betr  TYPE rwbtr,
        lv_cnt   TYPE i,
        lv_skip  TYPE i.

* Vier-Augen-Prinzip: Ersteller des Vorschlags darf nicht freigeben
  IF gv_creator = sy-uname.
    MESSAGE s021 WITH gv_laufd gv_laufi DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.

  LOOP AT gt_pay INTO gs_pay
       WHERE mark   = 'X'
         AND status <> gc_status_final
         AND status <> gc_status_reject.
    lv_tabix = sy-tabix.

*   Freigabeberechtigung im zahlenden Buchungskreis
    AUTHORITY-CHECK OBJECT 'Z_PAYREL'
      ID 'BUKRS' FIELD gs_pay-zbukr
      ID 'ACTVT' FIELD gc_actvt_release.
    IF sy-subrc <> 0.
      lv_skip = lv_skip + 1.
      CONTINUE.
    ENDIF.

*   Betragsgrenze des Freigebers je Buchungskreis und Waehrung
*   kein Eintrag -> Grenze 0, d. h. jede Zahlung braucht zweite Freigabe
    CLEAR lv_limit.
    SELECT SINGLE maxbt FROM zfi_payrel_lim INTO lv_limit
      WHERE bname = sy-uname
        AND bukrs = gs_pay-zbukr
        AND waers = gs_pay-waers.
    lv_betr = abs( gs_pay-rwbtr ).   " Ausgangszahlungen sind negativ

    IF gs_pay-status = gc_status_first.
*     Zweitfreigabe - nicht durch den Erstfreigeber
      IF gs_pay-rel1_user = sy-uname.
        MESSAGE i024 WITH gs_pay-vblnr gs_pay-rel1_user.
        CONTINUE.
      ENDIF.
      gs_pay-status    = gc_status_final.
      gs_pay-rel2_user = sy-uname.
    ELSEIF lv_betr > lv_limit.
*     ueber der Grenze: nur Erstfreigabe, zweiter Freigeber erforderlich
      gs_pay-status    = gc_status_first.
      gs_pay-rel1_user = sy-uname.
    ELSE.
      gs_pay-status    = gc_status_final.
      gs_pay-rel1_user = sy-uname.
    ENDIF.
*   IF lv_betr > 250000.     "Konzernvorgabe 2012, ersetzt durch ZFI_PAYREL_LIM
*     gs_pay-status = gc_status_first.
*   ENDIF.
    MODIFY gt_pay FROM gs_pay INDEX lv_tabix
           TRANSPORTING status rel1_user rel2_user.
    gv_changed = abap_true.
    lv_cnt = lv_cnt + 1.
  ENDLOOP.

  MESSAGE s025 WITH lv_cnt lv_skip.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form REJECT_MARKED
*& Markierte Zahlungen mit Grund ablehnen
*&---------------------------------------------------------------------*
FORM reject_marked.
  DATA: lt_fields TYPE STANDARD TABLE OF sval,
        ls_field  TYPE sval,
        lv_rc     TYPE c LENGTH 1,
        lv_reason TYPE zfi_payrel-reason.

  ls_field-tabname   = 'ZFI_PAYREL'.
  ls_field-fieldname = 'REASON'.
  ls_field-field_obl = 'X'.
  APPEND ls_field TO lt_fields.

  CALL FUNCTION 'POPUP_GET_VALUES'
    EXPORTING
      popup_title     = 'Ablehnungsgrund'(t04)
    IMPORTING
      returncode      = lv_rc
    TABLES
      fields          = lt_fields
    EXCEPTIONS
      error_in_fields = 1
      OTHERS          = 2.
  READ TABLE lt_fields INTO ls_field INDEX 1.
  lv_reason = ls_field-value.

* ohne Grund keine Ablehnung
  IF lv_rc <> 'A' AND lv_reason IS NOT INITIAL.
    LOOP AT gt_pay INTO gs_pay WHERE mark = 'X' AND status <> gc_status_final.
      gs_pay-status    = gc_status_reject.
      gs_pay-reason    = lv_reason.
      gs_pay-rel1_user = sy-uname.
      MODIFY gt_pay FROM gs_pay TRANSPORTING status reason rel1_user.
      gv_changed = abap_true.
    ENDLOOP.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form SAVE_RELEASES
*& Freigaben verbuchen, Workflow-Ereignisse ausloesen
*&---------------------------------------------------------------------*
FORM save_releases.
  DATA lv_objkey TYPE sweinstcou-objkey.

  CHECK gv_changed = abap_true.

  CALL FUNCTION 'POPUP_TO_CONFIRM'
    EXPORTING
      titlebar              = 'Zahlungsfreigabe sichern'(t01)
      text_question         = 'Freigaben und Ablehnungen jetzt verbindlich sichern?'(q01)
      text_button_1         = 'Sichern'(b01)
      text_button_2         = 'Abbrechen'(b02)
      default_button        = '2'
      display_cancel_button = space
    IMPORTING
      answer                = gv_answer
    EXCEPTIONS
      text_not_found        = 1
      OTHERS                = 2.
  IF gv_answer <> '1'.
    RETURN.
  ENDIF.

* Fortschreibung ZFI_PAYREL + Historie im Verbucher (V1)
  CALL FUNCTION 'Z_FI_PAYREL_UPDATE' IN UPDATE TASK
    EXPORTING
      iv_laufd = gv_laufd
      iv_laufi = gv_laufi
      iv_uname = sy-uname
    TABLES
      it_pay   = gt_pay.

* Workflow: Objektschluessel = Laufdatum + Identifikation
  lv_objkey      = gv_laufd.
  lv_objkey+8(6) = gv_laufi.

* Zweitfreigeber benachrichtigen (Rolle ZFI_PAYREL2 im Workflow)
  READ TABLE gt_pay TRANSPORTING NO FIELDS WITH KEY status = gc_status_first.
  IF sy-subrc = 0.
    CALL FUNCTION 'SWE_EVENT_CREATE' IN UPDATE TASK
      EXPORTING
        objtype = gc_objtype
        objkey  = lv_objkey
        event   = 'SECONDRELEASEREQUIRED'.
  ENDIF.

* Zahllauf-Verantwortliche: es liegen endgueltige Freigaben vor
  READ TABLE gt_pay TRANSPORTING NO FIELDS WITH KEY status = gc_status_final.
  IF sy-subrc = 0.
    CALL FUNCTION 'SWE_EVENT_CREATE' IN UPDATE TASK
      EXPORTING
        objtype = gc_objtype
        objkey  = lv_objkey
        event   = 'RELEASED'.
  ENDIF.

  COMMIT WORK.
* COMMIT WORK AND WAIT.   "2014 zurueckgenommen - Laufzeit bei 3000 Zahlungen
  CLEAR gv_changed.
  MESSAGE s031 WITH gv_laufd gv_laufi.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form START_PAYMENT_RUN
*& Zahllauf zum freigegebenen Vorschlag per Batch-Input F110 einplanen
*&---------------------------------------------------------------------*
FORM start_payment_run.
  DATA: lv_open  TYPE i,
        lv_datum TYPE c LENGTH 10.

* nur wenn jede Zahlung endgueltig freigegeben ist; abgelehnte Zahlungen
* muessen vorher im Vorschlag gesperrt und neu freigegeben werden
  lv_open = REDUCE i( INIT n = 0
                      FOR ls_p IN gt_pay
                      WHERE ( status <> gc_status_final )
                      NEXT n = n + 1 ).
  IF lv_open > 0.
    MESSAGE s041 WITH lv_open DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.

  CALL FUNCTION 'POPUP_TO_CONFIRM'
    EXPORTING
      titlebar              = 'Zahllauf einplanen'(t02)
      text_question         = 'Zahllauf zum freigegebenen Vorschlag jetzt einplanen?'(q02)
      text_button_1         = 'Einplanen'(b05)
      text_button_2         = 'Abbrechen'(b02)
      default_button        = '2'
      display_cancel_button = space
    IMPORTING
      answer                = gv_answer
    EXCEPTIONS
      text_not_found        = 1
      OTHERS                = 2.
  IF gv_answer <> '1'.
    RETURN.
  ENDIF.

* Batch-Input F110 (Aufzeichnung SHDB 11/2019): Parameter -> Einplanen sofort
  WRITE gv_laufd TO lv_datum DD/MM/YYYY.
  REFRESH: gt_bdcdata, gt_bdcmsg.
  bdc_dynpro 'SAPF110V'    '0200'.
  bdc_field  'F110V-LAUFD' lv_datum.
  bdc_field  'F110V-LAUFI' gv_laufi.
  bdc_field  'BDC_OKCODE'  '=EINP'.
  bdc_dynpro 'SAPF110V'    '0300'.
  bdc_field  'F110V-XSTRF' 'X'.
  bdc_field  'BDC_OKCODE'  '=ENTR'.
* SUBMIT sapf110s WITH ... AND RETURN.   "bis 2019 - durch Batch-Input ersetzt

  CALL TRANSACTION 'F110' USING gt_bdcdata
       MODE   'E'
       UPDATE 'S'
       MESSAGES INTO gt_bdcmsg.
  IF sy-subrc <> 0.
    MESSAGE s043 WITH gv_laufd gv_laufi sy-subrc DISPLAY LIKE 'E'.
  ELSE.
    MESSAGE s044 WITH gv_laufd gv_laufi.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Include MZFM_MVB_F01 - Unterprogramme
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form VERFUEGBARKEIT_PRUEFEN - verfügbare Mittel gegen Antragsbetrag
*&---------------------------------------------------------------------*
*& Setzt GV_GEPRUEFT; nur ein geprüfter Antrag kann eingereicht werden.
*& Die Prüfung ist eine Momentaufnahme, bis zur Genehmigung wird
*& nicht erneut geprüft.
*&---------------------------------------------------------------------*
FORM verfuegbarkeit_pruefen.
  SELECT SINGLE verfuegbar FROM zfm_v_verfuegbar INTO gv_verfuegbar
    WHERE fikrs = gs_kopf-fikrs
      AND gjahr = gs_kopf-gjahr
      AND fistl = gs_kopf-fistl
      AND fipex = gs_kopf-fipex.

  IF gv_verfuegbar < gs_kopf-betrag.
    gv_geprueft = abap_false.
    MESSAGE s024 WITH gv_verfuegbar gs_kopf-waers DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.

  gv_geprueft = abap_true.
  MESSAGE s025 WITH gv_verfuegbar gs_kopf-waers.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form ANTRAG_SICHERN - Nummer ziehen, verbuchen, Workflow anstoßen
*&---------------------------------------------------------------------*
FORM antrag_sichern.
  CALL FUNCTION 'NUMBER_GET_NEXT'
    EXPORTING
      nr_range_nr = '01'
      object      = gc_nrobj
    IMPORTING
      number      = gv_antrag
    EXCEPTIONS
      OTHERS      = 1.
  IF sy-subrc <> 0.
    MESSAGE e026.
  ENDIF.

  gs_kopf-antrag = gv_antrag.
  gs_kopf-status = 'O'.
  gs_kopf-ernam  = sy-uname.
  gs_kopf-erdat  = sy-datum.

  CALL FUNCTION 'Z_FM_MVB_VERBUCHEN' IN UPDATE TASK
    EXPORTING
      is_kopf  = gs_kopf
      iv_modus = 'I'.

  PERFORM workflow_ereignis USING gv_antrag 'CREATED'.
  COMMIT WORK.
  MESSAGE s027 WITH gv_antrag.
  CLEAR: gs_kopf, gv_geprueft.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form ENTSCHEIDEN - Genehmigung (G) oder Ablehnung (R)
*&---------------------------------------------------------------------*
*& - nur offene Anträge
*& - Vier-Augen-Prinzip: Antragsteller darf nicht selbst entscheiden
*& - Sperre je Antrag (Sperrobjekt EZFM_MVB), gilt bis zur Verbuchung
*& - bei Genehmigung zuerst die Mittelvormerkung anlegen; scheitert sie,
*&   bleibt der Antrag offen
*& - Ablehnung nur nach Rückfrage
*& - Status, Entscheider und Datum über die Verbuchung schreiben,
*&   danach Workflow-Ereignis APPROVED bzw. REJECTED
*&---------------------------------------------------------------------*
FORM entscheiden USING iv_entscheid TYPE char1.
  DATA: lv_event TYPE swo_event,
        ls_kblk  TYPE kblk,
        lt_kblp  TYPE STANDARD TABLE OF kblp,
        lv_belnr TYPE kblk-belnr,
        lv_answer TYPE c LENGTH 1.

  IF gs_kopf-status <> 'O'.
    MESSAGE e028 WITH gs_kopf-antrag gs_kopf-status.
  ENDIF.
* Vier-Augen-Prinzip
  IF gs_kopf-ernam = sy-uname.
    MESSAGE e029.
  ENDIF.

  CALL FUNCTION 'ENQUEUE_EZFM_MVB'
    EXPORTING
      antrag         = gs_kopf-antrag
    EXCEPTIONS
      foreign_lock   = 1
      system_failure = 2
      OTHERS         = 3.
  IF sy-subrc <> 0.
    MESSAGE e030 WITH sy-msgv1.
  ENDIF.

  IF iv_entscheid = 'G'.
    ls_kblk-blart = gc_blart.
    ls_kblk-ktext = gs_kopf-text.
    lt_kblp = VALUE #( ( fistl = gs_kopf-fistl
                         fipex = gs_kopf-fipex
                         wtges = gs_kopf-betrag
                         ptext = gs_kopf-text ) ).
    CALL FUNCTION 'FMFR_CREATE_FROM_DATA'
      EXPORTING
        i_kblk         = ls_kblk
      IMPORTING
        e_belnr        = lv_belnr
      TABLES
        t_kblp         = lt_kblp
      EXCEPTIONS
        error_occurred = 1
        OTHERS         = 2.
    IF sy-subrc <> 0.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      MESSAGE e034 WITH gs_kopf-antrag.
    ENDIF.
    gs_kopf-belnr = lv_belnr.
    lv_event      = 'APPROVED'.
  ELSE.
*   Ablehnung nur nach Rückfrage
    CALL FUNCTION 'POPUP_TO_CONFIRM'
      EXPORTING
        titlebar       = 'Antrag ablehnen'
        text_question  = 'Antrag wirklich ablehnen?'
        text_button_1  = 'Ablehnen'
        text_button_2  = 'Abbrechen'
      IMPORTING
        answer         = lv_answer
      EXCEPTIONS
        text_not_found = 1
        OTHERS         = 2.
    IF lv_answer <> '1'.
      RETURN.
    ENDIF.
    lv_event      = 'REJECTED'.
  ENDIF.

  gs_kopf-status     = iv_entscheid.
  gs_kopf-genehm_von = sy-uname.
  gs_kopf-genehm_am  = sy-datum.

  CALL FUNCTION 'Z_FM_MVB_VERBUCHEN' IN UPDATE TASK
    EXPORTING
      is_kopf  = gs_kopf
      iv_modus = 'U'.

  PERFORM workflow_ereignis USING gs_kopf-antrag lv_event.
  COMMIT WORK.
  MESSAGE s031 WITH gs_kopf-antrag.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form WORKFLOW_EREIGNIS - Ereignis am Objekttyp ZFMMVB auslösen
*&---------------------------------------------------------------------*
FORM workflow_ereignis USING iv_antrag TYPE zfm_mvb_nr
                             iv_event  TYPE swo_event.
  DATA lv_objkey TYPE swo_typeid.

  lv_objkey = iv_antrag.
  CALL FUNCTION 'SWE_EVENT_CREATE'
    EXPORTING
      objtype           = gc_objtype
      objkey            = lv_objkey
      event             = iv_event
    EXCEPTIONS
      objtype_not_found = 1
      OTHERS            = 2.
  IF sy-subrc <> 0.
    MESSAGE i032 WITH iv_event.
  ENDIF.
ENDFORM.


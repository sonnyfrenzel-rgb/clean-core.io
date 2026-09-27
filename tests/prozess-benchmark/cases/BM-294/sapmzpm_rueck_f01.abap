*&---------------------------------------------------------------------*
*&  Include           SAPMZPM_RUECK_F01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  AUFTRAG_LADEN
*&---------------------------------------------------------------------*
FORM auftrag_laden.

  DATA lv_anz TYPE i.

  IF gv_aufnr_alt IS NOT INITIAL.
    PERFORM entsperren.
  ENDIF.

  SELECT SINGLE * FROM aufk INTO gs_aufk
    WHERE aufnr = gv_aufnr
      AND autyp = '30'.                         "Instandhaltungsauftrag
  IF sy-subrc <> 0.
    MESSAGE e010 WITH gv_aufnr.
  ENDIF.

* Berechtigung I_IWERK prueft IW41-Startberechtigung (Rolle), hier nicht

  CALL FUNCTION 'STATUS_CHECK'
    EXPORTING
      objnr             = gs_aufk-objnr
      status            = gc_stat_frei
    EXCEPTIONS
      object_not_found  = 1
      status_not_active = 2
      OTHERS            = 3.
  IF sy-subrc <> 0.
    MESSAGE e012 WITH gv_aufnr.                  "Auftrag nicht freigegeben
  ENDIF.

  CALL FUNCTION 'ENQUEUE_ESORDER'
    EXPORTING
      aufnr          = gv_aufnr
    EXCEPTIONS
      foreign_lock   = 1
      system_failure = 2
      OTHERS         = 3.
  IF sy-subrc <> 0.
    MESSAGE e013 WITH gv_aufnr sy-msgv1.         "gesperrt durch &
  ENDIF.

  SELECT v~vornr v~ltxa1 w~arbei w~ismnw w~arbeh
    FROM afko AS k
    INNER JOIN afvc AS v ON v~aufpl = k~aufpl
    INNER JOIN afvv AS w ON w~aufpl = v~aufpl
                        AND w~aplzl = v~aplzl
    INTO CORRESPONDING FIELDS OF TABLE gt_vorg
    WHERE k~aufnr = gv_aufnr.

  SELECT rsnum rspos matnr werks lgort bdmng enmng meins
    FROM resb
    INTO CORRESPONDING FIELDS OF TABLE gt_komp
    WHERE aufnr = gv_aufnr
      AND xloek = space
      AND kzear = space.

  gv_aufnr_alt = gv_aufnr.
  CLEAR: gv_changed, gt_protokoll.
  lv_anz = lines( gt_vorg ).
  MESSAGE s014 WITH gv_aufnr lv_anz.

ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  SICHERN
*&---------------------------------------------------------------------*
FORM sichern.

  DATA: lv_ok_rm TYPE abap_bool,
        lv_ok_wa TYPE abap_bool.

  IF line_exists( gt_vorg[ endrm = abap_true ] ).
    CALL FUNCTION 'POPUP_TO_CONFIRM'
      EXPORTING
        titlebar              = 'Endrueckmeldung'(t02)
        text_question         = 'Markierte Vorgaenge werden abgeschlossen. Weiter?'(q02)
        default_button        = '2'
        display_cancel_button = space
      IMPORTING
        answer                = gv_answer.
    CHECK gv_answer = '1'.
  ENDIF.

  PERFORM rueckmelden CHANGING lv_ok_rm.
  PERFORM warenausgang CHANGING lv_ok_wa.

* beides oder nichts (Absprache Controlling 2020)
  IF lv_ok_rm = abap_true AND lv_ok_wa = abap_true.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.
    MESSAGE s021 WITH gv_aufnr.
    PERFORM entsperren.
    CLEAR: gv_aufnr, gv_aufnr_alt, gt_vorg, gt_komp, gv_changed.
  ELSE.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    READ TABLE gt_protokoll INTO DATA(ls_prot) INDEX 1.
    MESSAGE ls_prot-message TYPE 'I' DISPLAY LIKE 'E'.
  ENDIF.

ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  RUECKMELDEN   - Arbeitszeit je Vorgang
*&---------------------------------------------------------------------*
FORM rueckmelden CHANGING cv_ok TYPE abap_bool.

  DATA: lt_tt     TYPE STANDARD TABLE OF bapi_alm_timeconfirmation,
        lt_detret TYPE STANDARD TABLE OF bapi_alm_return,
        ls_return TYPE bapiret2.

  cv_ok = abap_true.

  lt_tt = VALUE #( FOR ls_v IN gt_vorg WHERE ( ismnw_neu > 0 OR endrm = abap_true )
                   ( orderid         = gv_aufnr
                     operation       = ls_v-vornr
                     act_work        = ls_v-ismnw_neu
                     un_work         = ls_v-arbeh
                     fin_conf        = ls_v-endrm
                     exec_start_date = sy-datum ) ).
  IF lt_tt IS INITIAL.
    RETURN.
  ENDIF.

  CALL FUNCTION 'BAPI_ALM_CONF_CREATE'
    IMPORTING
      return        = ls_return
    TABLES
      timetickets   = lt_tt
      detail_return = lt_detret.
  IF ls_return-type CA 'EA'.
    cv_ok = abap_false.
    PERFORM protokoll USING ls_return-message.
  ENDIF.

ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  WARENAUSGANG  - Entnahme zur Reservierung (261)
*&---------------------------------------------------------------------*
FORM warenausgang CHANGING cv_ok TYPE abap_bool.

  DATA: ls_head   TYPE bapi2017_gm_head_01,
        lt_item   TYPE STANDARD TABLE OF bapi2017_gm_item_create,
        lt_return TYPE STANDARD TABLE OF bapiret2,
        lv_mblnr  TYPE mblnr,
        lv_mjahr  TYPE mjahr.

  cv_ok = abap_true.

  lt_item = VALUE #( FOR ls_k IN gt_komp WHERE ( menge_neu > 0 )
                     ( material  = ls_k-matnr
                       plant     = ls_k-werks
                       stge_loc  = ls_k-lgort
                       move_type = gc_bwart_ent
                       entry_qnt = ls_k-menge_neu
                       entry_uom = ls_k-meins
                       orderid   = gv_aufnr
                       reserv_no = ls_k-rsnum
                       res_item  = ls_k-rspos ) ).
  IF lt_item IS INITIAL.
    RETURN.
  ENDIF.

  ls_head-pstng_date = sy-datum.
  ls_head-doc_date   = sy-datum.
  ls_head-header_txt = |RUECK { gv_aufnr ALPHA = OUT }|.

  CALL FUNCTION 'BAPI_GOODSMVT_CREATE'
    EXPORTING
      goodsmvt_header  = ls_head
      goodsmvt_code    = '03'
    IMPORTING
      materialdocument = lv_mblnr
      matdocumentyear  = lv_mjahr
    TABLES
      goodsmvt_item    = lt_item
      return           = lt_return.

  LOOP AT lt_return INTO DATA(ls_ret) WHERE type CA 'EA'.
    cv_ok = abap_false.
    PERFORM protokoll USING ls_ret-message.
  ENDLOOP.

ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  ENTSPERREN
*&---------------------------------------------------------------------*
FORM entsperren.
  CALL FUNCTION 'DEQUEUE_ESORDER'
    EXPORTING
      aufnr = gv_aufnr_alt.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  PROTOKOLL  - sammelt nur Meldungstexte fuer die Anzeige
*&---------------------------------------------------------------------*
FORM protokoll USING iv_text TYPE bapi_msg.
  APPEND iv_text TO gt_protokoll.
ENDFORM.

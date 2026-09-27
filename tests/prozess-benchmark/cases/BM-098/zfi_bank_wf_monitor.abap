*&---------------------------------------------------------------------*
*& Report ZFI_BANK_WF_MONITOR
*&---------------------------------------------------------------------*
*& Überwachung offener Freigaben von Bankverbindungsänderungen
*& - Erinnerung an die Bearbeiter nach p_days Tagen
*& - Weiterleitung an den Leiter Kreditorenbuchhaltung nach p_esc Tagen
*& Einplanung täglich 06:00
*&---------------------------------------------------------------------*
REPORT zfi_bank_wf_monitor.

PARAMETERS: p_days TYPE i DEFAULT 2,
            p_esc  TYPE i DEFAULT 5,
            p_escu TYPE syuname DEFAULT 'KREDITOR_LEAD'.

DATA: gt_hist TYPE STANDARD TABLE OF zwf_bank_hist,
      gs_hist TYPE zwf_bank_hist,
      gv_age  TYPE i,
      gv_rem  TYPE i,
      gv_esc  TYPE i,
      gv_done TYPE abap_bool.

START-OF-SELECTION.
  SELECT * FROM zwf_bank_hist INTO TABLE gt_hist
    WHERE action = 'BLOCK'.

  LOOP AT gt_hist INTO gs_hist.
*   schon entschieden (Freigabe oder Ablehnung seit der Sperre)?
    SELECT SINGLE @abap_true FROM zwf_bank_hist
      WHERE lifnr  = @gs_hist-lifnr
        AND bukrs  = @gs_hist-bukrs
        AND action IN ('APPROVE', 'REJECT')
        AND datum  >= @gs_hist-datum
      INTO @gv_done.
    IF sy-subrc = 0.
      CONTINUE.
    ENDIF.

    gv_age = sy-datum - gs_hist-datum.
    IF gv_age >= p_esc.
      PERFORM remind USING gs_hist p_escu.
      gv_esc = gv_esc + 1.
    ELSEIF gv_age >= p_days.
      PERFORM remind USING gs_hist space.
      gv_rem = gv_rem + 1.
    ENDIF.
  ENDLOOP.
  COMMIT WORK.

  WRITE: / 'Erinnerungen:', gv_rem.
  WRITE: / 'Eskalationen:', gv_esc.

*&---------------------------------------------------------------------*
*& Form REMIND - ohne Benutzer: erinnern, mit Benutzer: weiterleiten
*&---------------------------------------------------------------------*
FORM remind USING ps_hist TYPE zwf_bank_hist
                  pv_user TYPE syuname.
  DATA: lt_wi     TYPE STANDARD TABLE OF swr_wihdr,
        ls_wi     TYPE swr_wihdr,
        lv_objkey TYPE swo_typeid.

  lv_objkey = ps_hist-lifnr && ps_hist-bukrs.
  CALL FUNCTION 'SAP_WAPI_WORKITEMS_TO_OBJECT'
    EXPORTING
      objtype         = 'ZCL_WF_VENDOR_BANK'
      objkey          = lv_objkey
      top_level_items = space
    TABLES
      worklist        = lt_wi.

  LOOP AT lt_wi INTO ls_wi WHERE wi_type = 'W' AND wi_stat = 'READY'.
    IF pv_user IS NOT INITIAL.
      CALL FUNCTION 'SAP_WAPI_FORWARD_WORKITEM'
        EXPORTING
          workitem_id = ls_wi-wi_id
          user_id     = pv_user
          do_commit   = space.
    ELSE.
      CALL FUNCTION 'Z_WF_SEND_REMINDER'
        EXPORTING
          iv_wi_id = ls_wi-wi_id.
    ENDIF.
  ENDLOOP.
ENDFORM.

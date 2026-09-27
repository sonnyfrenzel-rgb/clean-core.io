*&---------------------------------------------------------------------*
*& Include ZQM_CHARGE_FREIGABE_F01 - Selektion und Ablauf je Prueflos
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Prueflose ohne VE mit Charge
*&---------------------------------------------------------------------*
FORM prueflose_lesen.
  SELECT prueflos werk matnr charg ktextmat losmenge
    FROM qals
    INTO TABLE gt_lose
    WHERE werk      =  p_werk
      AND art       IN s_art
      AND matnr     IN s_matnr
      AND enstehdat IN s_datum
      AND charg     <> space
      AND stat35    =  space.
  SORT gt_lose BY prueflos.
ENDFORM.

*&---------------------------------------------------------------------*
*& Ein Prueflos: bewerten, entscheiden, Charge fortschreiben
*&---------------------------------------------------------------------*
FORM los_verarbeiten USING is_los TYPE ty_los.
  DATA: ls_prot  TYPE ty_prot,
        lv_text  TYPE string,
        lv_entsch TYPE c LENGTH 1,
        lv_ok    TYPE abap_bool.

  ls_prot-prueflos = is_los-prueflos.
  ls_prot-matnr    = is_los-matnr.
  ls_prot-charg    = is_los-charg.

  CALL FUNCTION 'ENQUEUE_EQQALS1'
    EXPORTING
      prueflos       = is_los-prueflos
    EXCEPTIONS
      foreign_lock   = 1
      system_failure = 2
      OTHERS         = 3.
  IF sy-subrc <> 0.
    ls_prot-ampel = '2'.
    ls_prot-text  = |Prueflos gesperrt durch { sy-msgv1 }|.
    APPEND ls_prot TO gt_prot.
    RETURN.
  ENDIF.

  lv_entsch = go_bew->bewerten( EXPORTING iv_prueflos = is_los-prueflos
                                IMPORTING ev_text     = lv_text ).
  ls_prot-entsch = lv_entsch.
  ls_prot-text   = lv_text.

  CASE lv_entsch.
    WHEN gc_offen.
      ls_prot-ampel = '2'.
      APPEND ls_prot TO gt_prot.
      PERFORM entsperren USING is_los-prueflos.
      RETURN.
    WHEN gc_annahme.
      ls_prot-vcode = gc_code_ok.
    WHEN gc_rueckw.
      ls_prot-vcode = gc_code_nok.
  ENDCASE.

  IF p_test = abap_true.
    ls_prot-ampel = '3'.
    ls_prot-text  = |Testlauf: VE { ls_prot-vcode } - { lv_text }|.
    APPEND ls_prot TO gt_prot.
    PERFORM entsperren USING is_los-prueflos.
    RETURN.
  ENDIF.

  PERFORM ve_setzen USING is_los ls_prot-vcode CHANGING lv_ok lv_text.
  IF lv_ok = abap_false.
    ls_prot-ampel = '1'.
    ls_prot-text  = lv_text.
    APPEND ls_prot TO gt_prot.
    PERFORM entsperren USING is_los-prueflos.
    RETURN.
  ENDIF.

  PERFORM klassifizierung USING is_los lv_entsch CHANGING lv_ok.
  IF lv_ok = abap_false.
    ls_prot-text = |{ ls_prot-text } / Klassifizierung nicht fortgeschrieben|.
  ENDIF.

  IF lv_entsch = gc_rueckw.
    PERFORM charge_sperren USING is_los.
    IF p_mail = abap_true.
      PERFORM mail_senden USING is_los lv_text.
    ENDIF.
    ls_prot-ampel = '1'.
  ELSE.
    ls_prot-ampel = '3'.
  ENDIF.

  APPEND ls_prot TO gt_prot.
  PERFORM protokoll_schreiben USING ls_prot.
  PERFORM entsperren USING is_los-prueflos.
ENDFORM.

*&---------------------------------------------------------------------*
FORM entsperren USING iv_prueflos TYPE qplos.
  CALL FUNCTION 'DEQUEUE_EQQALS1'
    EXPORTING
      prueflos = iv_prueflos.
ENDFORM.

*&---------------------------------------------------------------------*
*& Protokoll als ALV (im Job ins Spool)
*&---------------------------------------------------------------------*
FORM ausgabe.
  DATA: lt_fcat   TYPE slis_t_fieldcat_alv,
        ls_layout TYPE slis_layout_alv.

  lt_fcat = VALUE #( ( fieldname = 'PRUEFLOS' seltext_m = 'Prueflos' )
                     ( fieldname = 'MATNR'    seltext_m = 'Material' )
                     ( fieldname = 'CHARG'    seltext_m = 'Charge' )
                     ( fieldname = 'ENTSCH'   seltext_m = 'Bewertung' )
                     ( fieldname = 'VCODE'    seltext_m = 'VE-Code' )
                     ( fieldname = 'TEXT'     seltext_m = 'Ergebnis' outputlen = 80 ) ).
  ls_layout-lights_fieldname  = 'AMPEL'.
  ls_layout-colwidth_optimize = abap_true.

  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      is_layout   = ls_layout
      it_fieldcat = lt_fcat
    TABLES
      t_outtab    = gt_prot
    EXCEPTIONS
      OTHERS      = 1.
ENDFORM.

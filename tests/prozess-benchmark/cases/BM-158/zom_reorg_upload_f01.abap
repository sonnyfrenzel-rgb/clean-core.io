*&---------------------------------------------------------------------*
*& Include ZOM_REORG_UPLOAD_F01  - Einlesen, Pruefen, Steuern
*&---------------------------------------------------------------------*

FORM upload_file.
  IF sy-batch = abap_true.
    MESSAGE e398(00) WITH 'Upload nur im Dialog moeglich'.
  ENDIF.

  cl_gui_frontend_services=>gui_upload(
    EXPORTING
      filename = p_file
      filetype = 'ASC'
    CHANGING
      data_tab = gt_raw
    EXCEPTIONS
      OTHERS   = 1 ).
  IF sy-subrc <> 0 OR gt_raw IS INITIAL.
    MESSAGE e398(00) WITH 'Datei nicht lesbar oder leer:' p_file.
  ENDIF.
ENDFORM.

*----------------------------------------------------------------------*
FORM parse_lines.
  DATA: ls_line  TYPE ty_line,
        lv_objid TYPE string,
        lv_par   TYPE string.

  LOOP AT gt_raw INTO DATA(lv_raw).
*   Kopfzeile aus Excel ueberspringen
    IF sy-tabix = 1 AND lv_raw CS 'Aktion'.
      CONTINUE.
    ENDIF.
    CLEAR ls_line.
    ls_line-lineno = sy-tabix.
    SPLIT lv_raw AT ';' INTO ls_line-action lv_objid lv_par
                             ls_line-short ls_line-stext.
    TRANSLATE ls_line-action TO UPPER CASE.
    ls_line-objid  = lv_objid.
    ls_line-parent = lv_par.
    APPEND ls_line TO gt_lines.
  ENDLOOP.
ENDFORM.

*----------------------------------------------------------------------*
FORM validate_lines.
  DATA: lv_where TYPE string,
        lv_count TYPE i.

  LOOP AT gt_lines ASSIGNING FIELD-SYMBOL(<ls_line>).
    CLEAR lv_where.
    CASE <ls_line>-action.
      WHEN 'NEWO' OR 'MOVS'.
*       uebergeordnete Einheit muss existieren
        lv_where = |plvar = '{ gc_plvar }' AND otype = 'O' | &&
                   |AND objid = '{ <ls_line>-parent }' | &&
                   |AND istat = '1' AND endda >= '{ p_begda }'|.
      WHEN 'RENA' OR 'DELO'.
        lv_where = |plvar = '{ gc_plvar }' AND otype = 'O' | &&
                   |AND objid = '{ <ls_line>-objid }' | &&
                   |AND endda >= '{ p_begda }'|.
      WHEN OTHERS.
        <ls_line>-error = abap_true.
        PERFORM prot_add USING <ls_line>-lineno 'E' 'Unbekannte Aktion'.
        CONTINUE.
    ENDCASE.

    SELECT COUNT(*) FROM hrp1000 INTO lv_count WHERE (lv_where).
    IF lv_count = 0.
      <ls_line>-error = abap_true.
      PERFORM prot_add USING <ls_line>-lineno 'E' 'Bezugsobjekt fehlt'.
    ENDIF.
  ENDLOOP.

  gv_errors = REDUCE i( INIT n = 0 FOR l IN gt_lines
                        WHERE ( error = abap_true ) NEXT n = n + 1 ).
ENDFORM.

*----------------------------------------------------------------------*
FORM execute_lines.
  DATA: lv_form TYPE char30,
        lv_ok   TYPE abap_bool.

  LOOP AT gt_lines INTO DATA(ls_line) WHERE error = abap_false.
    lv_form = |ACT_{ ls_line-action }|.
    lv_ok = abap_false.
    PERFORM (lv_form) IN PROGRAM (sy-repid)
            USING ls_line CHANGING lv_ok IF FOUND.
    IF lv_ok = abap_true AND p_test = abap_false.
      COMMIT WORK AND WAIT.
      PERFORM prot_add USING ls_line-lineno 'S' 'Ausgefuehrt'.
    ELSE.
      ROLLBACK WORK.
      PERFORM prot_add USING ls_line-lineno
                             COND #( WHEN p_test = abap_true THEN 'I' ELSE 'E' )
                             COND #( WHEN p_test = abap_true THEN 'Test: nicht gebucht'
                                     ELSE 'Nicht ausgefuehrt' ).
    ENDIF.
  ENDLOOP.
ENDFORM.

*----------------------------------------------------------------------*
FORM prot_add USING pv_lineno TYPE i
                    pv_type   TYPE symsgty
                    pv_text   TYPE clike.
  APPEND VALUE ty_prot( lineno = pv_lineno type = pv_type text = pv_text )
         TO gt_prot.
ENDFORM.

*----------------------------------------------------------------------*
FORM show_protocol.
  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = DATA(lo_alv)
                              CHANGING  t_table      = gt_prot ).
      lo_alv->get_display_settings( )->set_list_header(
        |Reorganisation { p_file }: { gv_errors } fehlerhafte Zeilen| ).
      lo_alv->display( ).
    CATCH cx_salv_msg.
      LOOP AT gt_prot INTO DATA(ls_prot).
        WRITE: / ls_prot-lineno, ls_prot-type, ls_prot-text.
      ENDLOOP.
  ENDTRY.
ENDFORM.

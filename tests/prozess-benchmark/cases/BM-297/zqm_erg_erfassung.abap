*&---------------------------------------------------------------------*
*& Report  ZQM_ERG_ERFASSUNG   (Transaktion ZQE51)
*&---------------------------------------------------------------------*
*& Ergebniserfassung Labor 2: alle Merkmale eines Pruefvorgangs in
*& einem Grid, Bewertung sofort beim Tippen, Buchen per BAPI.
*&---------------------------------------------------------------------*
*& 2012-02-06 LPE  Ersterstellung
*& 2015-07-14 LPE  Qualitative Merkmale ueber Auswahlmenge (QPAC)
*& 2018-10-22 EXT  Maengelmeldung asynchron (STARTING NEW TASK)
*& 2021-05-03 EXT  Bewerter als Interface + Fabrik, CLEANUP-Rollback
*&---------------------------------------------------------------------*
REPORT zqm_erg_erfassung.

INCLUDE zqm_erg_erfassung_top.
INCLUDE zqm_erg_erfassung_c03.
INCLUDE zqm_erg_erfassung_c01.
INCLUDE zqm_erg_erfassung_c02.

*----------------------------------------------------------------------*
START-OF-SELECTION.
*----------------------------------------------------------------------*
  DATA lt_done TYPE STANDARD TABLE OF qmerknr WITH EMPTY KEY.

  SELECT merknr kurztext sollwert toleranzob toleranzun masseinhsw
         auswmenge1 auswmgwrk1
    FROM qamv
    INTO CORRESPONDING FIELDS OF TABLE gt_merk
    WHERE prueflos = p_los
      AND vorglfnr = p_vorg.
  IF sy-subrc <> 0.
    MESSAGE s410(zqm) DISPLAY LIKE 'E' WITH p_los p_vorg.  "keine Merkmale
    RETURN.
  ENDIF.

* bereits bewertete Merkmale sperren (nicht erneut buchen)
  SELECT merknr FROM qamr INTO TABLE lt_done
    WHERE prueflos = p_los
      AND vorglfnr = p_vorg
      AND mbewertg <> space.
  LOOP AT gt_merk ASSIGNING FIELD-SYMBOL(<ls_m>).
    IF line_exists( lt_done[ table_line = <ls_m>-merknr ] ).
      <ls_m>-status = 'X'.
    ENDIF.
  ENDLOOP.

  go_erf = NEW #( ).
  CALL SCREEN 0100.

*&---------------------------------------------------------------------*
*&      Module  STATUS_0100  OUTPUT
*&---------------------------------------------------------------------*
MODULE status_0100 OUTPUT.
  SET PF-STATUS 'ERF'.
  SET TITLEBAR 'ERF' WITH p_los p_vorg.

  IF go_grid IS INITIAL.
    CREATE OBJECT go_cont
      EXPORTING
        container_name = 'CC_ERG'.
    CREATE OBJECT go_grid
      EXPORTING
        i_parent = go_cont.
    go_grid->register_edit_event(
      i_event_id = cl_gui_alv_grid=>mc_evt_enter ).
    SET HANDLER go_erf->on_data_changed FOR go_grid.
    go_grid->set_table_for_first_display(
      EXPORTING
        i_structure_name = 'ZQM_S_ERG_GRID'
      CHANGING
        it_outtab        = gt_merk ).
  ENDIF.
ENDMODULE.

*&---------------------------------------------------------------------*
*&      Module  EXIT_0100  INPUT   (AT EXIT-COMMAND)
*&---------------------------------------------------------------------*
MODULE exit_0100 INPUT.
  CALL FUNCTION 'POPUP_TO_CONFIRM'
    EXPORTING
      text_question         = 'Nicht gebuchte Ergebnisse verwerfen?'(q01)
      default_button        = '2'
      display_cancel_button = space
    IMPORTING
      answer                = gv_answer.
  IF gv_answer = '1'.
    LEAVE TO SCREEN 0.
  ENDIF.
  CLEAR ok_code.
ENDMODULE.

*&---------------------------------------------------------------------*
*&      Module  USER_COMMAND_0100  INPUT
*&---------------------------------------------------------------------*
MODULE user_command_0100 INPUT.

  go_grid->check_changed_data( ).

  CASE ok_code.
    WHEN 'SAVE'.
      TRY.
          go_erf->sichern( ).
          MESSAGE s411(zqm) WITH p_los p_vorg.
        CATCH lcx_erf INTO gx_erf.
          MESSAGE gx_erf TYPE 'I' DISPLAY LIKE 'E'.
      ENDTRY.
      go_grid->refresh_table_display( ).
  ENDCASE.
  CLEAR ok_code.

ENDMODULE.

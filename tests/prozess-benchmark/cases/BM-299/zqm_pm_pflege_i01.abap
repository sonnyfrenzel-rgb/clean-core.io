*&---------------------------------------------------------------------*
*&  Include           ZQM_PM_PFLEGE_I01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Module  USER_COMMAND_0100  INPUT
*&---------------------------------------------------------------------*
MODULE user_command_0100 INPUT.

  gv_ok = ok_code.
  CLEAR ok_code.

  CASE gv_ok.
    WHEN 'NEU'.
      CLEAR: gs_pm, gs_pm_alt.
      gs_pm-werk   = p_werk.
      gs_pm-status = gc_status_frei.
      gv_modus = 'I'.
      CALL SCREEN 0200 STARTING AT 10 5 ENDING AT 90 18.

    WHEN 'AEND'.
      PERFORM zeile_holen.
      CALL FUNCTION 'ENQUEUE_EZQM_PM'
        EXPORTING
          id             = gs_pm-id
        EXCEPTIONS
          foreign_lock   = 1
          OTHERS         = 2.
      IF sy-subrc <> 0.
        MESSAGE e711(zqm) WITH gs_pm-id sy-msgv1.     "gesperrt durch &
      ENDIF.
      gs_pm_alt = gs_pm.
      gv_modus  = 'U'.
      CALL SCREEN 0200 STARTING AT 10 5 ENDING AT 90 18.

    WHEN 'LOESCH'.
      PERFORM zeile_holen.
      CALL FUNCTION 'POPUP_TO_CONFIRM'
        EXPORTING
          text_question         = 'Pruefmittel loeschen?'(q03)
          default_button        = '2'
          display_cancel_button = space
        IMPORTING
          answer                = gv_answer.
      IF gv_answer = '1'.
        DATA(lo_loe) = NEW lcl_loeschung( ).
        lo_loe->ms_alt = gs_pm.
        APPEND lo_loe TO gt_aktionen.
        DELETE gt_pm INDEX gv_idx.
      ENDIF.

    WHEN 'KALIB'.
      PERFORM zeile_holen.
      gs_pm_alt = gs_pm.
      go_kalib->erfassen( CHANGING cs_pm = gs_pm ).
      DATA(lo_kal) = NEW lcl_aenderung( ).
      lo_kal->ms_alt = gs_pm_alt.
      lo_kal->ms_neu = gs_pm.
      APPEND lo_kal TO gt_aktionen.
      MODIFY gt_pm FROM gs_pm INDEX gv_idx.

    WHEN 'SAVE'.
      TRY.
          LOOP AT gt_aktionen INTO DATA(lo_akt).
            lo_akt->ausfuehren( ).
          ENDLOOP.
          COMMIT WORK.
          CALL FUNCTION 'DEQUEUE_ALL'.
          gv_idx = lines( gt_aktionen ).
          MESSAGE s712(zqm) WITH gv_idx.
          CLEAR gt_aktionen.
        CATCH lcx_pflege INTO gx_pflege.
          ROLLBACK WORK.
          MESSAGE gx_pflege TYPE 'E'.
      ENDTRY.

    WHEN 'BACK' OR 'EXIT'.
      IF gt_aktionen IS NOT INITIAL.
        CALL FUNCTION 'POPUP_TO_CONFIRM_LOSS_OF_DATA'
          EXPORTING
            textline1 = 'Ungesicherte Aenderungen gehen verloren.'(l01)
            titel     = 'Pflege verlassen'(t03)
          IMPORTING
            answer    = gv_answer.
        IF gv_answer = 'J'.
          LEAVE TO SCREEN 0.
        ENDIF.
      ELSE.
        LEAVE TO SCREEN 0.
      ENDIF.
  ENDCASE.

ENDMODULE.

*&---------------------------------------------------------------------*
*&      Module  EXIT_0200  INPUT   (AT EXIT-COMMAND)
*&---------------------------------------------------------------------*
MODULE exit_0200 INPUT.
  IF gv_modus = 'U'.
    CALL FUNCTION 'DEQUEUE_EZQM_PM'
      EXPORTING
        id = gs_pm-id.
  ENDIF.
  LEAVE TO SCREEN 0.
ENDMODULE.

*&---------------------------------------------------------------------*
*&      Module  USER_COMMAND_0200  INPUT
*&---------------------------------------------------------------------*
MODULE user_command_0200 INPUT.

  CHECK ok_code = 'OK'.
  CLEAR ok_code.

  gs_pm-naechste_kalib = go_kalib->naechster_termin( gs_pm ).

  IF gv_modus = 'I'.
    DATA(lo_neu) = NEW lcl_neuanlage( ).
    lo_neu->ms_neu = gs_pm.
    APPEND lo_neu TO gt_aktionen.
    APPEND gs_pm TO gt_pm.
  ELSE.
    DATA(lo_aen) = NEW lcl_aenderung( ).
    lo_aen->ms_alt = gs_pm_alt.
    lo_aen->ms_neu = gs_pm.
    APPEND lo_aen TO gt_aktionen.
    MODIFY gt_pm FROM gs_pm INDEX gv_idx.
  ENDIF.
  LEAVE TO SCREEN 0.

ENDMODULE.

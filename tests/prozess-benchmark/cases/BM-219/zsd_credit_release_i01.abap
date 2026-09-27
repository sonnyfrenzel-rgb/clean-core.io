*&---------------------------------------------------------------------*
*& Include ZSD_CREDIT_RELEASE_I01 - PAI-Module
*&---------------------------------------------------------------------*
MODULE check_vbeln INPUT.
  DATA lv_cmgst TYPE cmgst.
  SELECT SINGLE cmgst FROM vbuk INTO lv_cmgst
    WHERE vbeln = gv_vbeln.
  IF sy-subrc <> 0 OR lv_cmgst IS INITIAL.
    MESSAGE e398(00) WITH 'Auftrag unbekannt oder ohne Kreditpruefung' gv_vbeln.
  ENDIF.
ENDMODULE.

MODULE user_command_0100 INPUT.
  CASE gv_okcode.
    WHEN 'EXIT' OR 'BACK' OR 'CANC'.
      LEAVE PROGRAM.
    WHEN 'SHOW' OR space.
      TRY.
          go_case = lcl_credit_case=>load( gv_vbeln ).
        CATCH lcx_credit INTO gx_credit.
          MESSAGE gx_credit->mv_text TYPE 'E'.
      ENDTRY.
      CLEAR gv_reason.
      LEAVE TO SCREEN 200.
  ENDCASE.
ENDMODULE.

MODULE user_command_0200 INPUT.
  CASE gv_okcode.
    WHEN 'REL'.
      go_case->mv_reason = gv_reason.
      TRY.
          go_case->execute( 'REL' ).
          COMMIT WORK AND WAIT.
          MESSAGE s398(00) WITH 'Auftrag' gv_vbeln 'freigegeben'.
        CATCH lcx_credit INTO gx_credit.
          ROLLBACK WORK.
          MESSAGE gx_credit->mv_text TYPE 'I'.
      ENDTRY.
    WHEN 'REJ'.
*     Ablehnung nur mit Begruendung (Revisionsauflage)
      IF gv_reason IS INITIAL.
        MESSAGE e398(00) WITH 'Bitte Begruendung fuer Ablehnung erfassen'.
      ENDIF.
      go_case->mv_reason = gv_reason.
      TRY.
          go_case->execute( 'REJ' ).
          COMMIT WORK AND WAIT.
          MESSAGE s398(00) WITH 'Auftrag' gv_vbeln 'abgelehnt'.
        CATCH lcx_credit INTO gx_credit.
          ROLLBACK WORK.
          MESSAGE gx_credit->mv_text TYPE 'I'.
      ENDTRY.
    WHEN 'BACK'.
      LEAVE TO SCREEN 100.
  ENDCASE.
ENDMODULE.

*----------------------------------------------------------------------*
* Altstand bis 2015: Freigabe per Batch-Input auf VKM3 (abgeschaltet)
*----------------------------------------------------------------------*
*FORM release_via_bdc USING iv_vbeln TYPE vbeln_va.
*  DATA: lt_bdc TYPE STANDARD TABLE OF bdcdata,
*        lt_msg TYPE STANDARD TABLE OF bdcmsgcoll.
*  APPEND VALUE #( program = 'SAPMSSY0' dynpro = '0120' dynbegin = 'X' )
*    TO lt_bdc.
*  APPEND VALUE #( fnam = 'BDC_OKCODE' fval = '=FREI' ) TO lt_bdc.
*  CALL TRANSACTION 'VKM3' USING lt_bdc MODE 'N' UPDATE 'S'
*    MESSAGES INTO lt_msg.
*  IF sy-subrc <> 0.
*    MESSAGE i398(00) WITH 'VKM3-Freigabe fehlgeschlagen' iv_vbeln.
*  ENDIF.
*ENDFORM.

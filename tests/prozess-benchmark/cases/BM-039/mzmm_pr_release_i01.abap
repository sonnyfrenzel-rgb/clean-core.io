*&---------------------------------------------------------------------*
*& Include MZMM_PR_RELEASE_I01 - PAI-Module
*&---------------------------------------------------------------------*

MODULE exit_command INPUT.
  CASE ok_code.
    WHEN 'BACK' OR 'EXIT' OR 'CANC'.
      CLEAR ok_code.
      LEAVE PROGRAM.
  ENDCASE.
ENDMODULE.

*----------------------------------------------------------------------*
MODULE tc_list_modify INPUT.
* Markierung aus der Tabellensteuerung zurueckschreiben
  MODIFY gt_line FROM VALUE #( BASE gs_line mark = zmm_s_pr_line-mark )
    INDEX tc_list-current_line TRANSPORTING mark.
ENDMODULE.

*----------------------------------------------------------------------*
MODULE user_command_0100 INPUT.
  gv_ucomm = ok_code.
  CLEAR ok_code.

  CASE gv_ucomm.
    WHEN 'RELE'.
      PERFORM markierte_freigeben.
    WHEN 'REJE'.
      IF NOT line_exists( gt_line[ mark = 'X' ] ).
        MESSAGE w052.
        RETURN.
      ENDIF.
      CALL SCREEN 0200 STARTING AT 10 5 ENDING AT 80 8.
    WHEN 'DETL'.
      PERFORM detail_anzeigen.
    WHEN 'REFR'.
      gv_loaded = abap_false.
    WHEN 'SORT'.
      SORT gt_line BY wert DESCENDING.
    WHEN 'SUMM'.
      PERFORM summe_anzeigen.
    WHEN OTHERS.
  ENDCASE.
ENDMODULE.

*----------------------------------------------------------------------*
MODULE user_command_0200 INPUT.
  CASE ok_code.
    WHEN 'OK'.
      IF gv_grund IS INITIAL.
        MESSAGE e053.
      ENDIF.
      CLEAR ok_code.
      PERFORM markierte_ablehnen USING gv_grund.
      LEAVE TO SCREEN 0.
    WHEN 'CANC'.
      CLEAR ok_code.
      LEAVE TO SCREEN 0.
  ENDCASE.
ENDMODULE.

*----------------------------------------------------------------------*
MODULE f4_grund INPUT.
* Wertehilfe fuer Ablehnungsgruende (Textbausteine je Sprache)
  SELECT grund_txt FROM zmm_reject_txt
    WHERE spras = @sy-langu
    ORDER BY lfdnr
    INTO TABLE @DATA(lt_txt).
  CALL FUNCTION 'F4IF_INT_TABLE_VALUE_REQUEST'
    EXPORTING
      retfield        = 'GRUND_TXT'
      dynpprog        = sy-repid
      dynpnr          = sy-dynnr
      dynprofield     = 'GV_GRUND'
      value_org       = 'S'
    TABLES
      value_tab       = lt_txt
    EXCEPTIONS
      OTHERS          = 1.
ENDMODULE.

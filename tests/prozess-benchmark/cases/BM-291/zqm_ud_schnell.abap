*&---------------------------------------------------------------------*
*& Report  ZQM_UD_SCHNELL   (Transaktion ZQA11)
*&---------------------------------------------------------------------*
*& Verwendungsentscheid im Wareneingang ohne QA11: Los scannen,
*& Vorschlag aus Regeln holen, Entscheid bestaetigen.
*&---------------------------------------------------------------------*
*& 2013-08-26 LPE  Ersterstellung Werk 2000
*& 2020-01-13 EXT  Regeln als Klassen (Sperrliste Lieferant, Merkmale)
*&---------------------------------------------------------------------*
REPORT zqm_ud_schnell.

INCLUDE zqm_ud_schnell_top.
INCLUDE zqm_ud_schnell_c01.

*----------------------------------------------------------------------*
START-OF-SELECTION.
*----------------------------------------------------------------------*
* nur Lose ohne Verwendungsentscheid
  SELECT SINGLE prueflos, werk, art, matnr, charg, lifnr, losmenge, mengeneinh
    FROM qals
    WHERE prueflos = @p_los
      AND NOT EXISTS ( SELECT prueflos FROM qave
                         WHERE prueflos = qals~prueflos )
    INTO CORRESPONDING FIELDS OF @gs_los.
  IF sy-subrc <> 0.
    MESSAGE s110(zqm) DISPLAY LIKE 'E' WITH p_los.  "unbekannt/entschieden
  ELSE.
    go_ctrl = NEW #( ).
    CALL SCREEN 0100.
  ENDIF.

*&---------------------------------------------------------------------*
*&      Module  USER_COMMAND_0100  INPUT
*&---------------------------------------------------------------------*
MODULE user_command_0100 INPUT.

  CASE ok_code.
    WHEN 'BACK' OR 'CANC'.
      LEAVE TO SCREEN 0.

    WHEN 'VORS'.
      go_ctrl->vorschlagen( CHANGING cs_los = gs_los ).

    WHEN 'UD'.
      TRY.
          IF go_ctrl->entscheiden( gs_los ) = abap_true.
            MESSAGE s111(zqm) WITH gs_los-prueflos gs_los-vcode.
            LEAVE TO SCREEN 0.
          ENDIF.
        CATCH lcx_ud INTO gx_ud.
          MESSAGE gx_ud TYPE 'E'.
      ENDTRY.

*   WHEN 'PRNT'.   "Pruefbericht - ueber QGA3, nicht hier
  ENDCASE.
  CLEAR ok_code.

ENDMODULE.

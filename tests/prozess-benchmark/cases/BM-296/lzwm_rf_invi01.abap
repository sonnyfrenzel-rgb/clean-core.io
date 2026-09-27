*----------------------------------------------------------------------*
***INCLUDE LZWM_RF_INVI01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Module  USER_COMMAND_0100  INPUT  - Lagerplatz
*&---------------------------------------------------------------------*
MODULE user_command_0100 INPUT.

  CASE ok_code.
    WHEN 'F3'.
      CLEAR ok_code.
      LEAVE TO SCREEN 0.

    WHEN 'ENTR'.
      CLEAR ok_code.
      TRY.
          go_zaehl->platz_pruefen( gv_lgpla ).
        CATCH lcx_rf_inv INTO gx_inv.
          CLEAR gv_lgpla.
          MESSAGE gx_inv TYPE 'E'.
      ENDTRY.
      LEAVE TO SCREEN 0200.
  ENDCASE.

ENDMODULE.

*&---------------------------------------------------------------------*
*&      Module  USER_COMMAND_0200  INPUT  - Material / Menge
*&---------------------------------------------------------------------*
MODULE user_command_0200 INPUT.

  CASE ok_code.
    WHEN 'F3'.
*     Platz aufgeben: Sperre weg, Zaehlung verwerfen
      CLEAR ok_code.
      go_zaehl->freigeben( ).
      LEAVE TO SCREEN 0100.

    WHEN 'F4'.
      CLEAR ok_code.
      LEAVE TO SCREEN 0300.

    WHEN 'LEER'.
      CLEAR ok_code.
      TRY.
          go_zaehl->leerplatz( ).
        CATCH lcx_rf_inv INTO gx_inv.
          MESSAGE gx_inv TYPE 'E'.
      ENDTRY.
      LEAVE TO SCREEN 0300.

    WHEN 'ENTR'.
      CLEAR ok_code.
*     Menge > 0 prueft das Dynpro (Feldattribut, frueher MESSAGE e110)
      TRY.
          go_zaehl->quant_erfassen( iv_matnr = gv_matnr
                                    iv_charg = gv_charg
                                    iv_menge = gv_menge ).
        CATCH lcx_rf_inv INTO gx_inv.
          MESSAGE gx_inv TYPE 'S' DISPLAY LIKE 'W'.
      ENDTRY.
      CLEAR: gv_matnr, gv_charg, gv_menge.
      LEAVE TO SCREEN 0200.
  ENDCASE.

ENDMODULE.

* Modul TC_UEB_MODIFY 2019 entfernt: Mengenkorrektur in der Uebersicht
* ist gesperrt (Revision) - Korrektur nur durch erneutes Scannen auf 0200.

*&---------------------------------------------------------------------*
*&      Module  USER_COMMAND_0300  INPUT  - Uebersicht / Buchen
*&---------------------------------------------------------------------*
MODULE user_command_0300 INPUT.

  CASE ok_code.
    WHEN 'F3'.
      CLEAR ok_code.
      LEAVE TO SCREEN 0200.

    WHEN 'SAVE'.
      CLEAR ok_code.
      IF go_zaehl->nachzaehlung_noetig( ) = abap_true.
*       Staplerfahrer darf nach Hinweis trotzdem buchen (Enter)
        MESSAGE w120.
      ENDIF.
      TRY.
          go_zaehl->speichern( ).
        CATCH lcx_rf_inv INTO gx_inv.
          MESSAGE gx_inv TYPE 'E'.
      ENDTRY.
      MESSAGE s121 WITH gv_lgpla.
      CLEAR gv_lgpla.
      LEAVE TO SCREEN 0100.
  ENDCASE.

ENDMODULE.

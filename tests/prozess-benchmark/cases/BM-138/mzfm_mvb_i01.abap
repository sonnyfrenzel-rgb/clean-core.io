*&---------------------------------------------------------------------*
*& Include MZFM_MVB_I01 - PAI-Module
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Module EXIT_COMMAND INPUT - Abbrechen/Beenden ohne Feldprüfungen
*&---------------------------------------------------------------------*
*& Funktionen vom Typ E (EXIT, CANC) in beiden GUI-Status; ungesicherte
*& Eingaben werden ohne Rückfrage verworfen.
*&---------------------------------------------------------------------*
MODULE exit_command INPUT.
  CLEAR: gs_kopf, gv_geprueft, gv_verfuegbar.
  LEAVE TO SCREEN 0.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Module CHECK_FISTL INPUT - Finanzstelle zum Tagesdatum gültig?
*&---------------------------------------------------------------------*
MODULE check_fistl INPUT.
  SELECT SINGLE fictr FROM fmfctr INTO @DATA(lv_fictr)
    WHERE fikrs  =  @gs_kopf-fikrs
      AND fictr  =  @gs_kopf-fistl
      AND datbis >= @sy-datum.
  IF sy-subrc <> 0.
    MESSAGE e021 WITH gs_kopf-fistl gs_kopf-fikrs.
  ENDIF.

* Prüfung gilt nur für die geprüfte Kontierung
  CLEAR gv_geprueft.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Module USER_COMMAND_0100 INPUT - Erfassung
*&---------------------------------------------------------------------*
MODULE user_command_0100 INPUT.
* Funktionscodes GUI-Status S0100: PRUEF Verfügbarkeit prüfen,
* SAVE einreichen, BACK zurück (EXIT/CANC laufen über EXIT_COMMAND)
  gv_ucomm = ok_code.
  CLEAR ok_code.

  CASE gv_ucomm.
    WHEN 'PRUEF'.
      PERFORM verfuegbarkeit_pruefen.
    WHEN 'SAVE'.
      IF gv_geprueft = abap_false.
        MESSAGE e023.
      ENDIF.
      PERFORM antrag_sichern.
      LEAVE TO SCREEN 0.
    WHEN 'BACK'.
      LEAVE TO SCREEN 0.
  ENDCASE.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Module USER_COMMAND_0200 INPUT - Genehmigung
*&---------------------------------------------------------------------*
MODULE user_command_0200 INPUT.
* Funktionscodes GUI-Status S0200: GENEHM, ABLEHN, BACK
  gv_ucomm = ok_code.
  CLEAR ok_code.

  CASE gv_ucomm.
    WHEN 'GENEHM'.
      PERFORM entscheiden USING 'G'.
      LEAVE TO SCREEN 0.
    WHEN 'ABLEHN'.
      PERFORM entscheiden USING 'R'.
      LEAVE TO SCREEN 0.
    WHEN 'BACK'.
      LEAVE TO SCREEN 0.
  ENDCASE.
ENDMODULE.

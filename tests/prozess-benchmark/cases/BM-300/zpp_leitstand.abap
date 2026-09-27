*&---------------------------------------------------------------------*
*& Report  ZPP_LEITSTAND   (Transaktion ZCM01)
*&---------------------------------------------------------------------*
*& Mini-Leitstand fuer Meister: Belastung je Arbeitsplatz, offene
*& Vorgaenge, Vorziehen / Freigeben / Arbeitspapiere.
*&---------------------------------------------------------------------*
*& 2012-10-01 KSC  Ersterstellung (Ersatz CM01-Auswertung per Excel)
*& 2014-06-16 KSC  Ampel nach 80 %/100 % Auslastung
*& 2018-02-26 RHO  Druck asynchron, Protokoll im Verbucher
*& 2021-11-08 EXT  Aktionen als Klassenhierarchie mit Fabrik
*&---------------------------------------------------------------------*
REPORT zpp_leitstand.

INCLUDE zpp_leitstand_top.
INCLUDE zpp_leitstand_c02.
INCLUDE zpp_leitstand_c03.
INCLUDE zpp_leitstand_c01.
INCLUDE zpp_leitstand_f01.

*----------------------------------------------------------------------*
START-OF-SELECTION.
*----------------------------------------------------------------------*
* Leitstand nur fuer Meister mit Anzeigeberechtigung im Werk
  AUTHORITY-CHECK OBJECT 'C_AFKO_ATY'
    ID 'ACTVT' FIELD '03'
    ID 'WERK'  FIELD p_werks.
  IF sy-subrc <> 0.
    MESSAGE a800(zpp_ls) WITH p_werks.
  ENDIF.

  PERFORM daten_lesen.
  IF gt_vorg IS INITIAL.
    MESSAGE i804(zpp_ls) WITH p_veran p_tage.      "nichts eingeplant
    RETURN.
  ENDIF.

  CALL SCREEN 0100.

*&---------------------------------------------------------------------*
*&      Module  STATUS_0100  OUTPUT
*&---------------------------------------------------------------------*
MODULE status_0100 OUTPUT.
  SET PF-STATUS 'LEIT'.
  SET TITLEBAR 'LEIT' WITH p_werks p_veran.

  IF go_cont IS INITIAL.
    CREATE OBJECT go_cont
      EXPORTING
        container_name = 'CC_LEIT'.
    CREATE OBJECT go_split
      EXPORTING
        parent  = go_cont
        rows    = 2
        columns = 1.
    CREATE OBJECT go_grid_ap
      EXPORTING
        i_parent = go_split->get_container( row = 1 column = 1 ).
    CREATE OBJECT go_grid_vg
      EXPORTING
        i_parent = go_split->get_container( row = 2 column = 1 ).
    go_ui = NEW #( ).

    SET HANDLER go_ui->on_double_click_ap FOR go_grid_ap.
    go_grid_ap->set_table_for_first_display(
      EXPORTING
        i_structure_name = 'ZPP_S_LEIT_ARBPL'
      CHANGING
        it_outtab        = gt_arbpl ).

    SET HANDLER go_ui->on_toolbar_vg go_ui->on_user_command_vg FOR go_grid_vg.
    go_grid_vg->set_table_for_first_display(
      EXPORTING
        i_structure_name = 'ZPP_S_LEIT_VORG'
        is_layout        = VALUE lvc_s_layo( sel_mode = 'A' )
      CHANGING
        it_outtab        = gt_anzeige ).
  ENDIF.
ENDMODULE.

*&---------------------------------------------------------------------*
*&      Module  USER_COMMAND_0100  INPUT
*&---------------------------------------------------------------------*
MODULE user_command_0100 INPUT.
  CASE ok_code.
    WHEN 'BACK' OR 'EXIT' OR 'CANC'.
      LEAVE PROGRAM.
*   WHEN 'REFR'.          "Neu lesen - Meister wollten F5, nie gebaut
*     PERFORM daten_lesen.
  ENDCASE.
  CLEAR ok_code.
ENDMODULE.

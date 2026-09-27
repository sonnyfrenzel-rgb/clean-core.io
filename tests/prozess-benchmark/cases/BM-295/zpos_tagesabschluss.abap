*&---------------------------------------------------------------------*
*& Report  ZPOS_TAGESABSCHLUSS   (Transaktion ZPOS_TA)
*&---------------------------------------------------------------------*
*& Tagesabschluss einer Filialkasse mit Zaehlung und FI-Buchung.
*&---------------------------------------------------------------------*
*& 2014-03-24 ABE  Ersterstellung (vorher Excel + FB50)
*& 2015-01-12 ABE  Pruefung Vortag abgeschlossen
*& 2019-08-05 KRM  Einlage/Entnahme als Klassen, Aenderungsbeleg
*& 2022-06-20 EXT  Bon-Anzeige aus dem Journal-Grid
*&---------------------------------------------------------------------*
REPORT zpos_tagesabschluss.

INCLUDE zpos_tagesabschluss_top.
INCLUDE zpos_tagesabschluss_c02.
INCLUDE zpos_tagesabschluss_c01.
INCLUDE zpos_tagesabschluss_f01.

*----------------------------------------------------------------------*
START-OF-SELECTION.
*----------------------------------------------------------------------*
  DATA: ls_vortag TYPE zpos_abschluss,
        ls_abs    TYPE zpos_abschluss.

* nur ein Abschluss je Kasse und Tag gleichzeitig
  CALL FUNCTION 'ENQUEUE_EZPOS_ABSCHL'
    EXPORTING
      kasse          = p_kasse
      datum          = p_datum
    EXCEPTIONS
      foreign_lock   = 1
      system_failure = 2
      OTHERS         = 3.
  IF sy-subrc <> 0.
    MESSAGE a501(zpos) WITH p_kasse sy-msgv1.
  ENDIF.

  SELECT SINGLE * FROM zpos_abschluss INTO ls_abs
    WHERE kasse = p_kasse
      AND datum = p_datum.
  IF sy-subrc = 0 AND ls_abs-status = 'G'.
    PERFORM entsperren.
    MESSAGE s502(zpos) DISPLAY LIKE 'E' WITH p_kasse p_datum.
    RETURN.
  ENDIF.

* Anfangsbestand = Endbestand des letzten Abschlusses vor dem Stichtag
  SELECT * FROM zpos_abschluss INTO ls_vortag
    UP TO 1 ROWS
    WHERE kasse = p_kasse
      AND datum < p_datum
    ORDER BY datum DESCENDING.
    IF ls_vortag-status <> 'G'.
      MESSAGE i503(zpos) WITH ls_vortag-datum.   "Vortag nicht gebucht
    ENDIF.
    gv_anfang = ls_vortag-endbestand.
  ENDSELECT.

  SELECT * FROM zpos_journal INTO TABLE gt_journal
    WHERE kasse = p_kasse
      AND datum = p_datum.
  SELECT * FROM zpos_bewegung INTO TABLE gt_bew
    WHERE kasse = p_kasse
      AND datum = p_datum.

  gv_bons = REDUCE #( INIT s TYPE zpos_betrag
                      FOR ls_j IN gt_journal
                      NEXT s = s + ls_j-betrag ).
* Soll = Anfang + Bons + Einlagen - Entnahmen (unbekannte Art zaehlt nicht)
  gv_soll = gv_anfang + gv_bons
          + REDUCE zpos_betrag( INIT t TYPE zpos_betrag
                                FOR ls_b IN gt_bew
                                NEXT t = t + COND zpos_betrag( WHEN ls_b-art = 'E' THEN ls_b-betrag
                                                               WHEN ls_b-art = 'A' THEN ls_b-betrag * -1
                                                               ELSE 0 ) ).

  CALL SCREEN 0100.

*&---------------------------------------------------------------------*
*&      Module  STATUS_0100  OUTPUT
*&---------------------------------------------------------------------*
MODULE status_0100 OUTPUT.
  SET PF-STATUS 'ABSCHL'.
  SET TITLEBAR 'ABSCHL' WITH p_kasse p_datum.

  IF go_grid IS INITIAL.
    CREATE OBJECT go_cont
      EXPORTING
        container_name = 'CC_JOURNAL'.
    CREATE OBJECT go_grid
      EXPORTING
        i_parent = go_cont.
    CREATE OBJECT go_hdl.
    SET HANDLER go_hdl->on_toolbar go_hdl->on_user_command FOR go_grid.
    go_grid->set_table_for_first_display(
      EXPORTING
        i_structure_name = 'ZPOS_JOURNAL'
      CHANGING
        it_outtab        = gt_journal ).
  ENDIF.
ENDMODULE.

*&---------------------------------------------------------------------*
*&      Module  USER_COMMAND_0100  INPUT
*&---------------------------------------------------------------------*
MODULE user_command_0100 INPUT.

  CASE ok_code.
    WHEN 'ZAEHL'.
      PERFORM zaehlung_pruefen.
    WHEN 'BUCHEN'.
      PERFORM zaehlung_pruefen.
      PERFORM abschluss_buchen.
    WHEN 'BACK' OR 'EXIT' OR 'CANC'.
      PERFORM entsperren.
      LEAVE TO SCREEN 0.
  ENDCASE.
  CLEAR ok_code.

ENDMODULE.

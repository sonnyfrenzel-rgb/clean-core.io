*&---------------------------------------------------------------------*
*& Report  ZSD_SCHALTER_KREDIT   (Transaktion ZVKM_BAR)
*&---------------------------------------------------------------------*
*& Kreditgesperrte Auftraege eines Kunden am Schalter gegen Barzahlung
*& freigeben.
*&---------------------------------------------------------------------*
*& 2011-11-07 MSC  Ersterstellung (Pilot Niederlassung Sued)
*& 2013-03-18 MSC  Quittungsdruck am Schalterdrucker
*& 2017-09-25 GBR  Protokoll ZSD_FREI_PROT fuer Kreditabteilung
*& 2020-02-10 EXT  Klassen, Protokoll ueber Ereignis FREIGEGEBEN
*&---------------------------------------------------------------------*
REPORT zsd_schalter_kredit.

INCLUDE zsd_schalter_kredit_top.
INCLUDE zsd_schalter_kredit_c01.
INCLUDE zsd_schalter_kredit_c02.
INCLUDE zsd_schalter_kredit_f01.

*----------------------------------------------------------------------*
START-OF-SELECTION.
*----------------------------------------------------------------------*
  SELECT SINGLE * FROM kna1 INTO gs_kna1
    WHERE kunnr = p_kunnr.
  IF sy-subrc <> 0.
    MESSAGE e600(zsd_kr) WITH p_kunnr.              "Kunde unbekannt
  ENDIF.

  go_kredit = lcl_kredit=>fuer_kunde( iv_kunnr = p_kunnr
                                      iv_kkber = p_kkber ).

* nur Auftraege mit Kreditstatus "nicht freigegeben" (B)
  SELECT a~vbeln a~erdat a~netwr a~waerk b~cmgst
    FROM vbak AS a
    INNER JOIN vbuk AS b ON b~vbeln = a~vbeln
    INTO CORRESPONDING FIELDS OF TABLE gt_auftr
    WHERE a~kunnr = p_kunnr
      AND b~cmgst = 'B'.
  IF gt_auftr IS INITIAL.
    MESSAGE s603(zsd_kr) DISPLAY LIKE 'W' WITH p_kunnr.  "nichts gesperrt
    RETURN.
  ENDIF.

  go_frei = NEW #( ).
  SET HANDLER lcl_protokoll=>on_freigegeben FOR go_frei.
  CALL SCREEN 0100.

*&---------------------------------------------------------------------*
*&      Module  STATUS_0100  OUTPUT
*&---------------------------------------------------------------------*
MODULE status_0100 OUTPUT.
  SET PF-STATUS 'KRED'.
  SET TITLEBAR 'KRED' WITH p_kunnr gs_kna1-name1.

  IF go_grid IS INITIAL.
    CREATE OBJECT go_cont
      EXPORTING
        container_name = 'CC_AUFTR'.
    CREATE OBJECT go_grid
      EXPORTING
        i_parent = go_cont.
    CREATE OBJECT go_hdl.
    SET HANDLER go_hdl->on_double_click FOR go_grid.
    go_grid->set_table_for_first_display(
      EXPORTING
        i_structure_name = 'ZSD_S_KRED_AUFTR'
        i_save           = 'A'
      CHANGING
        it_outtab        = gt_auftr ).
  ELSE.
    go_grid->refresh_table_display( ).
  ENDIF.
ENDMODULE.

*&---------------------------------------------------------------------*
*&      Module  USER_COMMAND_0100  INPUT
*&---------------------------------------------------------------------*
MODULE user_command_0100 INPUT.

  DATA: lv_row TYPE i,
        lv_idx TYPE i.

  CASE ok_code.
    WHEN 'BACK' OR 'EXIT'.
      LEAVE TO SCREEN 0.

    WHEN 'FREI'.
      CLEAR ok_code.
      go_grid->get_current_cell( IMPORTING e_row = lv_row ).
      READ TABLE gt_auftr INTO DATA(ls_auftrag) INDEX lv_row.
      IF sy-subrc <> 0.
        MESSAGE s604(zsd_kr) DISPLAY LIKE 'W'.       "Zeile waehlen
        RETURN.
      ENDIF.
      lv_idx = lv_row.

      TRY.
          go_frei->freigeben( ls_auftrag ).
          DELETE gt_auftr INDEX lv_idx.
          MESSAGE s605(zsd_kr) WITH ls_auftrag-vbeln.
        CATCH lcx_frei INTO gx_frei.
          MESSAGE gx_frei TYPE 'S' DISPLAY LIKE 'E'.
      ENDTRY.
  ENDCASE.

ENDMODULE.

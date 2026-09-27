REPORT zmm_wms_recon.
*----------------------------------------------------------------------*
* Bestandsabgleich externes Lagerverwaltungssystem (WMS, Oracle) mit
* dem SAP-Lagerortbestand. Differenzen außerhalb der Toleranz werden
* optional mit Bewegungsart Z11 (Zugang) bzw. Z12 (Abgang) gebucht.
* Verbindung über DBCON-Eintrag (Sekundärverbindung, Native SQL).
*----------------------------------------------------------------------*
* 2008-11  GL  Erstellung
* 2010-04  GL  Toleranz in Prozent statt absolut
* 2016-02  TK  Summierung je Artikel im WMS (mehrere Lagerplätze)
*----------------------------------------------------------------------*
TYPES: BEGIN OF ty_wms,
         item TYPE c LENGTH 18,
         qty  TYPE p LENGTH 13 DECIMALS 3,
       END OF ty_wms,
       BEGIN OF ty_rep,
         matnr TYPE matnr,
         wms   TYPE p LENGTH 13 DECIMALS 3,
         sap   TYPE labst,
         diff  TYPE p LENGTH 13 DECIMALS 3,
       END OF ty_rep.

DATA: gs_wms   TYPE ty_wms,
      gt_wms   TYPE STANDARD TABLE OF ty_wms,
      gt_mard  TYPE SORTED TABLE OF mard WITH UNIQUE KEY matnr,
      gs_mard  TYPE mard,
      gs_rep   TYPE ty_rep,
      gt_rep   TYPE STANDARD TABLE OF ty_rep,
      gt_in    TYPE STANDARD TABLE OF bapi2017_gm_item_create,
      gt_out   TYPE STANDARD TABLE OF bapi2017_gm_item_create,
      gv_matnr TYPE matnr,
      gv_diff  TYPE p LENGTH 13 DECIMALS 3,
      gv_tol   TYPE p LENGTH 13 DECIMALS 3.

PARAMETERS: p_werks TYPE werks_d OBLIGATORY DEFAULT '1000',
            p_lgort TYPE lgort_d OBLIGATORY DEFAULT '0001',
            p_con   TYPE dbcon-con_name DEFAULT 'WMS_PROD',
            p_tolp  TYPE p LENGTH 3 DECIMALS 1 DEFAULT '0.5',
            p_post  AS CHECKBOX.

INCLUDE zmm_wms_recon_f01.

START-OF-SELECTION.
  EXEC SQL.
    CONNECT TO :p_con
  ENDEXEC.
  IF sy-subrc <> 0.
    MESSAGE e020(zmm) WITH p_con.
  ENDIF.
  EXEC SQL.
    SET CONNECTION :p_con
  ENDEXEC.

* WMS-Bestand je Artikel für Werk/Lagerort
  EXEC SQL.
    OPEN c_stock FOR
      SELECT item_no, SUM(qty_on_hand)
        FROM wms.stock_summary
       WHERE site = :p_werks
         AND location = :p_lgort
       GROUP BY item_no
  ENDEXEC.
  DO.
    EXEC SQL.
      FETCH NEXT c_stock INTO :gs_wms-item, :gs_wms-qty
    ENDEXEC.
    IF sy-subrc <> 0.
      EXIT.
    ENDIF.
    APPEND gs_wms TO gt_wms.
  ENDDO.
  EXEC SQL.
    CLOSE c_stock
  ENDEXEC.
  EXEC SQL.
    DISCONNECT :p_con
  ENDEXEC.

  SELECT * FROM mard INTO TABLE gt_mard
    WHERE werks = p_werks
      AND lgort = p_lgort.

  LOOP AT gt_wms INTO gs_wms.
    CALL FUNCTION 'CONVERSION_EXIT_MATN1_INPUT'
      EXPORTING
        input        = gs_wms-item
      IMPORTING
        output       = gv_matnr
      EXCEPTIONS
        length_error = 1
        OTHERS       = 2.
    READ TABLE gt_mard INTO gs_mard WITH TABLE KEY matnr = gv_matnr.
    IF sy-subrc <> 0.
      CLEAR gs_mard.            "im WMS, aber ohne SAP-Lagerortsegment
    ENDIF.
    gv_diff = gs_wms-qty - gs_mard-labst.
    gv_tol  = gs_mard-labst * p_tolp / 100.
    IF abs( gv_diff ) <= gv_tol.
      CONTINUE.
    ENDIF.
    gs_rep-matnr = gv_matnr.
    gs_rep-wms   = gs_wms-qty.
    gs_rep-sap   = gs_mard-labst.
    gs_rep-diff  = gv_diff.
    APPEND gs_rep TO gt_rep.
    PERFORM add_item USING gv_matnr gv_diff.
  ENDLOOP.

  IF p_post = 'X'.
    PERFORM post_group USING '05' gt_in.
    PERFORM post_group USING '03' gt_out.
  ENDIF.

  LOOP AT gt_rep INTO gs_rep.
    WRITE: / gs_rep-matnr, gs_rep-wms, gs_rep-sap, gs_rep-diff.
  ENDLOOP.

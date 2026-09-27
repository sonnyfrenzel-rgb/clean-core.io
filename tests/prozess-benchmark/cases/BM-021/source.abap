REPORT zmm_we_liste.
* Wareneingangsliste je Werk - Anforderung Einkauf 2011
* 2014-03 MK: Lieferant und Bestellung ergaenzt
TABLES: mkpf.
PARAMETERS: p_werks TYPE mseg-werks OBLIGATORY,
            p_bwart TYPE mseg-bwart DEFAULT '101'.
SELECT-OPTIONS s_budat FOR mkpf-budat.

DATA: BEGIN OF gs_we,
        mblnr TYPE mkpf-mblnr,
        budat TYPE mkpf-budat,
        matnr TYPE mseg-matnr,
        menge TYPE mseg-menge,
        meins TYPE mseg-meins,
        lifnr TYPE mseg-lifnr,
        ebeln TYPE mseg-ebeln,
      END OF gs_we,
      gt_we LIKE TABLE OF gs_we.

START-OF-SELECTION.
  SELECT k~mblnr k~budat s~matnr s~menge s~meins s~lifnr s~ebeln
    INTO TABLE gt_we
    FROM mkpf AS k INNER JOIN mseg AS s
      ON s~mblnr = k~mblnr AND s~mjahr = k~mjahr
    WHERE k~budat IN s_budat
      AND s~werks = p_werks
      AND s~bwart = p_bwart.
  IF sy-subrc <> 0.
    MESSAGE 'Keine Wareneingänge im Zeitraum' TYPE 'S' DISPLAY LIKE 'W'.
    RETURN.
  ENDIF.
  SORT gt_we BY budat mblnr.
* WRITE: / 'Beleg', 'Datum'.   "alte Ueberschrift, jetzt Textelement
  LOOP AT gt_we INTO gs_we.
    WRITE: / gs_we-budat, gs_we-mblnr, gs_we-matnr,
             gs_we-menge UNIT gs_we-meins, gs_we-meins, gs_we-lifnr, gs_we-ebeln.
  ENDLOOP.

REPORT zsd_offene_auftraege.
*----------------------------------------------------------------------*
* Offene Kundenaufträge je Verkaufsorganisation
* Gesamtstatus aus VBUK - 14.03.2011 KSC Ersterstellung
*----------------------------------------------------------------------*
TABLES vbak.
SELECT-OPTIONS s_vkorg FOR vbak-vkorg OBLIGATORY.
SELECT-OPTIONS s_erdat FOR vbak-erdat.
DATA: gt_auftr TYPE STANDARD TABLE OF vbak,
      gs_auftr TYPE vbak,
      gv_gbstk TYPE vbuk-gbstk.

START-OF-SELECTION.
  SELECT * FROM vbak INTO TABLE gt_auftr
    WHERE vkorg IN s_vkorg
      AND erdat IN s_erdat
      AND vbtyp = 'C'.
  LOOP AT gt_auftr INTO gs_auftr.
    SELECT SINGLE gbstk FROM vbuk INTO gv_gbstk
      WHERE vbeln = gs_auftr-vbeln.
*   CHECK gv_gbstk <> 'C'.   "alt: auch teilweise erledigte ausblenden
    IF gv_gbstk = 'C'.
      CONTINUE.
    ENDIF.
    WRITE: / gs_auftr-vbeln, gs_auftr-kunnr, gs_auftr-netwr,
             gs_auftr-waerk, gv_gbstk.
  ENDLOOP.

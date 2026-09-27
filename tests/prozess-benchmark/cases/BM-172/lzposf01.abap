*----------------------------------------------------------------------*
***INCLUDE LZPOSF01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  SEGMENTE_LESEN
*&---------------------------------------------------------------------*
FORM segmente_lesen TABLES ct_data   STRUCTURE edidd
                    USING  uv_docnum TYPE edi_docnum.
  DATA ls_p TYPE ze1posp.

  LOOP AT ct_data WHERE docnum = uv_docnum.
    CASE ct_data-segnam.
      WHEN 'ZE1POSK'.
        gs_kopf = ct_data-sdata.
      WHEN 'ZE1POSP'.
        ls_p = ct_data-sdata.
        IF ls_p-menge = 0.            "Storno-Nullzeilen der Kasse
          CONTINUE.
        ENDIF.
        APPEND VALUE #( ean11  = ls_p-ean11
                        menge  = ls_p-menge
                        umsatz = ls_p-umsatz - ls_p-rabatt ) TO gt_pos.
    ENDCASE.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  ARTIKEL_ERMITTELN
*&---------------------------------------------------------------------*
*       EAN -> Artikel, unbekannte EAN in Fehlertabelle (Clearing)
*----------------------------------------------------------------------*
FORM artikel_ermitteln.
  DATA lt_mean TYPE STANDARD TABLE OF mean.

  CHECK gt_pos IS NOT INITIAL.
  SELECT matnr, ean11 FROM mean
    FOR ALL ENTRIES IN @gt_pos
    WHERE ean11 = @gt_pos-ean11
    INTO CORRESPONDING FIELDS OF TABLE @lt_mean.
  SORT lt_mean BY ean11.

  LOOP AT gt_pos ASSIGNING FIELD-SYMBOL(<ls_pos>).
    READ TABLE lt_mean INTO DATA(ls_mean)
         WITH KEY ean11 = <ls_pos>-ean11 BINARY SEARCH.
    IF sy-subrc = 0.
      <ls_pos>-matnr = ls_mean-matnr.
    ELSE.
      APPEND VALUE #( docnum  = gv_docnum
                      filiale = gs_kopf-filiale
                      datum   = gs_kopf-datum
                      ean11   = <ls_pos>-ean11
                      menge   = <ls_pos>-menge ) TO gt_fehl.
    ENDIF.
  ENDLOOP.
  DELETE gt_pos WHERE matnr IS INITIAL.

  IF 1 = 2.
    MESSAGE e004.     "nur fuer Verwendungsnachweis: EAN unbekannt
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  VERDICHTEN
*&---------------------------------------------------------------------*
*       Summe Menge/Umsatz je Artikel
*----------------------------------------------------------------------*
FORM verdichten.
  DATA ls_sum TYPE ty_sum.

  SORT gt_pos BY matnr.
  LOOP AT gt_pos INTO DATA(ls_pos).
    ls_sum-menge  = ls_sum-menge + ls_pos-menge.
    ls_sum-umsatz = ls_sum-umsatz + ls_pos-umsatz.
    AT END OF matnr.
      ls_sum-matnr = ls_pos-matnr.
      APPEND ls_sum TO gt_sum.
      CLEAR ls_sum.
    ENDAT.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  UMSATZ_KORRIGIEREN   (Kassendifferenz, 2014 - nie aktiviert)
*&---------------------------------------------------------------------*
FORM umsatz_korrigieren USING uv_faktor TYPE p.
  LOOP AT gt_sum ASSIGNING FIELD-SYMBOL(<ls_sum>).
    <ls_sum>-umsatz = <ls_sum>-umsatz * uv_faktor.
  ENDLOOP.
ENDFORM.

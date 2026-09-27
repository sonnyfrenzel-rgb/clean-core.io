*----------------------------------------------------------------------*
***INCLUDE LZGTSF01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  SCHALTER_LESEN
*&---------------------------------------------------------------------*
*       RFC-Destination zum GTS-System; leer = Pruefung ausgeschaltet
*----------------------------------------------------------------------*
FORM schalter_lesen CHANGING cv_dest TYPE rfcdest.
  CLEAR cv_dest.
  SELECT SINGLE low FROM tvarvc INTO cv_dest
    WHERE name = 'ZGTS_RFC_DEST'
      AND type = 'P'
      AND numb = '0000'.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  POSITIONEN_AUFBAUEN
*&---------------------------------------------------------------------*
*       Lieferpositionen mit Menge und Warennummer fuer GTS
*----------------------------------------------------------------------*
FORM positionen_aufbauen TABLES it_lips  STRUCTURE lipsvb
                                ct_items STRUCTURE zgts_s_pos.
  LOOP AT it_lips WHERE updkz <> 'D'.
    CHECK it_lips-lfimg > 0.
    SELECT SINGLE stawn FROM marc INTO @DATA(lv_stawn)
      WHERE matnr = @it_lips-matnr
        AND werks = @it_lips-werks.
    CLEAR ct_items.
    ct_items-posnr = it_lips-posnr.
    ct_items-matnr = it_lips-matnr.
    ct_items-stawn = lv_stawn.
    ct_items-menge = it_lips-lfimg.
    ct_items-meins = it_lips-vrkme.
    APPEND ct_items.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  PROTOKOLL
*&---------------------------------------------------------------------*
FORM protokoll USING uv_vbeln TYPE vbeln_vl
                     uv_erg   TYPE zgts_ergebnis
                     uv_text  TYPE char80.
  DATA ls_log TYPE zgts_log.

  ls_log = VALUE #( vbeln    = uv_vbeln
                    datum    = sy-datum
                    uzeit    = sy-uzeit
                    ergebnis = uv_erg
                    text     = uv_text
                    uname    = sy-uname ).
  INSERT zgts_log FROM ls_log.
ENDFORM.

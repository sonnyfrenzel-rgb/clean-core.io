*&---------------------------------------------------------------------*
*& Include ZRE_INDEXMIETE_F01 - Selektion und Berechnung
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form VERTRAEGE_LESEN
*&   laufende Verträge mit Wertsicherungsklausel + Indexwerte des Monats
*&---------------------------------------------------------------------*
FORM vertraege_lesen.
  SELECT c~bukrs c~recnnr c~intreno c~recntxt
         k~index_id k~basis_wert k~basis_monat k~schwelle
         k~letzte_anp k~condtype
    FROM vicncn AS c
    INNER JOIN zre_index_vtr AS k ON k~bukrs  = c~bukrs
                                 AND k~recnnr = c~recnnr
    INTO TABLE gt_vtr
    WHERE c~bukrs   =  p_bukrs
      AND c~recnnr  IN s_recnnr
      AND c~recnbeg <= p_ab
      AND ( c~recnend1st >= p_ab OR c~recnend1st = '00000000' )
      AND k~aktiv   =  'X'.

  SELECT * FROM zre_index_wert INTO TABLE gt_index
    WHERE monat = p_monat.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form ANPASSUNG_BERECHNEN
*&   Veränderung des Index gegen den Basiswert, Schwelle, Jahresfrist,
*&   neue Miete = alte Miete * aktueller Wert / Basiswert
*&---------------------------------------------------------------------*
FORM anpassung_berechnen.
  DATA: ls_erg  TYPE ty_erg,
        lv_proz TYPE zre_proz.
  FIELD-SYMBOLS <ls_vtr> TYPE ty_vtr.

  LOOP AT gt_vtr ASSIGNING <ls_vtr>.
    CLEAR ls_erg.
    MOVE-CORRESPONDING <ls_vtr> TO ls_erg.

    READ TABLE gt_index INTO DATA(ls_index)
      WITH TABLE KEY index_id = <ls_vtr>-index_id
                     monat    = p_monat.
    IF sy-subrc <> 0.
      ls_erg-status = 'S'.
      ls_erg-text   = |Indexwert { <ls_vtr>-index_id } { p_monat } fehlt|.
      APPEND ls_erg TO gt_erg.
      CONTINUE.
    ENDIF.
    ls_erg-akt_wert = ls_index-wert.

    lv_proz = ( ls_index-wert - <ls_vtr>-basis_wert ) * 100 / <ls_vtr>-basis_wert.
    ls_erg-proz = lv_proz.
    IF abs( lv_proz ) < <ls_vtr>-schwelle.
      ls_erg-status = 'S'.
      ls_erg-text   = 'Schwelle nicht erreicht'.
      APPEND ls_erg TO gt_erg.
      CONTINUE.
    ENDIF.

*   Mindestabstand ein Jahr seit letzter Anpassung (§ 557b Abs. 2)
    CHECK <ls_vtr>-letzte_anp IS INITIAL
       OR <ls_vtr>-letzte_anp + gc_min_tage <= p_ab.

    SELECT SINGLE unitprice FROM vicdcond INTO ls_erg-miete_alt
      WHERE intreno        = <ls_vtr>-intreno
        AND condtype       = <ls_vtr>-condtype
        AND condvalidfrom <= p_ab
        AND ( condvalidto >= p_ab OR condvalidto = '00000000' ).
    IF sy-subrc <> 0.
      ls_erg-status = 'S'.
      ls_erg-text   = |Kondition { <ls_vtr>-condtype } nicht gültig|.
      APPEND ls_erg TO gt_erg.
      CONTINUE.
    ENDIF.

    ls_erg-miete_neu = round( val = ls_erg-miete_alt * ls_index-wert / <ls_vtr>-basis_wert
                              dec = 2 ).
    ls_erg-status    = 'B'.
    ls_erg-text      = |{ lv_proz DECIMALS = 2 } % Indexveränderung|.
    APPEND ls_erg TO gt_erg.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form AUSGABE - Ergebnisliste
*&---------------------------------------------------------------------*
FORM ausgabe.
  DATA lt_fcat TYPE slis_t_fieldcat_alv.

  CALL FUNCTION 'REUSE_ALV_FIELDCATALOG_MERGE'
    EXPORTING
      i_program_name     = sy-repid
      i_internal_tabname = 'GT_ERG'
      i_inclname         = 'ZRE_INDEXMIETE_TOP'
    CHANGING
      ct_fieldcat        = lt_fcat
    EXCEPTIONS
      OTHERS             = 1.

  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      i_callback_program = sy-repid
      it_fieldcat        = lt_fcat
      i_grid_title       = 'Indexmietanpassung'
    TABLES
      t_outtab           = gt_erg
    EXCEPTIONS
      OTHERS             = 1.
ENDFORM.

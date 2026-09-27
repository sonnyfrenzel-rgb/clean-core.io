*&---------------------------------------------------------------------*
*& Include ZTRM_FX_MTM_F01 - Daten und Bewertung
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form GESCHAEFTE_LESEN
*&   offene Devisengeschäfte (Produktart 60A) mit Fälligkeit ab Stichtag
*&   Beträge und Geschäftskurs aus der Tagesposition ZTRM_FX_POS
*&---------------------------------------------------------------------*
FORM geschaefte_lesen.
  SELECT f~kontrh f~rfha f~bukrs f~sfhaart f~delfz
         p~fw_waers p~fw_betrag p~kurs
    FROM vtbfha AS f
    INNER JOIN ztrm_fx_pos AS p ON p~bukrs = f~bukrs
                               AND p~rfha  = f~rfha
    INTO TABLE gt_deal
    WHERE f~bukrs  IN s_bukrs
      AND f~kontrh IN s_kontrh
      AND f~sgsart =  '60A'
      AND f~delfz  >= p_datum.
  SORT gt_deal BY kontrh rfha.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form TERMINPUNKTE_LESEN - Terminpunkte je Währung und Laufzeitband
*&---------------------------------------------------------------------*
FORM terminpunkte_lesen.
  SELECT * FROM ztrm_fwd_pts INTO TABLE gt_fwd
    FOR ALL ENTRIES IN gt_deal
    WHERE fw_waers = gt_deal-fw_waers
      AND datum    = p_datum.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form BEWERTEN - Marktterminkurs und Marktwert je Geschäft
*&---------------------------------------------------------------------*
*& Terminpunkte sind in 1/10000 notiert. Ohne Mittelkurs wird das
*& Geschäft nicht bewertet (Meldung im Jobprotokoll).
*&---------------------------------------------------------------------*
FORM bewerten.
  DATA: ls_mtm   TYPE ty_mtm,
        lv_spot  TYPE ukurs_curr,
        lv_punkt TYPE ztrm_kurs.

  LOOP AT gt_deal INTO DATA(ls_deal).
    CLEAR: ls_mtm, lv_punkt.
    MOVE-CORRESPONDING ls_deal TO ls_mtm.
    ls_mtm-restlz = ls_deal-delfz - p_datum.

    CALL FUNCTION 'READ_EXCHANGE_RATE'
      EXPORTING
        date             = p_datum
        foreign_currency = ls_deal-fw_waers
        local_currency   = 'EUR'
        type_of_rate     = 'M'
      IMPORTING
        exchange_rate    = lv_spot
      EXCEPTIONS
        no_rate_found    = 1
        OTHERS           = 2.
    IF sy-subrc <> 0.
      MESSAGE s311(ztrm) WITH ls_deal-fw_waers p_datum.
      CONTINUE.
    ENDIF.

*   kleinstes Laufzeitband, das die Restlaufzeit abdeckt
    LOOP AT gt_fwd INTO DATA(ls_fwd) WHERE fw_waers = ls_deal-fw_waers.
      IF ls_fwd-tage_bis >= ls_mtm-restlz.
        lv_punkt = ls_fwd-punkte.
        EXIT.
      ENDIF.
    ENDLOOP.

    ls_mtm-mkurs = lv_spot + lv_punkt / 10000.
    ls_mtm-mtm   = ls_deal-fw_betrag * ( ls_mtm-mkurs - ls_deal-kurs ).
    APPEND ls_mtm TO gt_mtm.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form VORTAG_VERGLEICHEN - Veränderung zum letzten gesicherten Stand
*&---------------------------------------------------------------------*
FORM vortag_vergleichen.
  DATA lv_vortag TYPE datum.
  FIELD-SYMBOLS <ls_mtm> TYPE ty_mtm.

  lv_vortag = p_datum - 1.
  gv_indx   = |FXMTM{ lv_vortag }|.
  IMPORT mtm = gt_prev FROM DATABASE indx(zm) ID gv_indx.
  IF sy-subrc <> 0.
*   kein Vortagesstand (Wochenende/Feiertag): keine Veränderung ausweisen
    RETURN.
  ENDIF.

  SORT gt_prev BY rfha.
  LOOP AT gt_mtm ASSIGNING <ls_mtm>.
    READ TABLE gt_prev INTO DATA(ls_prev)
      WITH KEY rfha = <ls_mtm>-rfha BINARY SEARCH.
    IF sy-subrc = 0.
      <ls_mtm>-mtm_vt = ls_prev-mtm.
    ENDIF.
    <ls_mtm>-delta = <ls_mtm>-mtm - <ls_mtm>-mtm_vt.
  ENDLOOP.
ENDFORM.

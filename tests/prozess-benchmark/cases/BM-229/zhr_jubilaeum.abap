*&---------------------------------------------------------------------*
*& Report ZHR_JUBILAEUM
*&---------------------------------------------------------------------*
*& Dienstjubilaeen eines Monats ermitteln (10/25/40 Jahre) inkl.
*& Praemie laut Betriebsvereinbarung - Liste fuer Personalabteilung
*&---------------------------------------------------------------------*
*& 2004  RWE  Erstellung (FORM-Version)
*& 2015  KBA  Umbau auf lokale Hilfsklasse, ALV
*&---------------------------------------------------------------------*
REPORT zhr_jubilaeum MESSAGE-ID zhr_jub.

INCLUDE zhr_jubilaeum_top.
INCLUDE zhr_jubilaeum_cls.
INCLUDE zhr_jubilaeum_f01.

AT SELECTION-SCREEN ON p_monat.
  IF p_monat < sy-datum(6).
    MESSAGE w050.
  ENDIF.

START-OF-SELECTION.
  PERFORM mitarbeiter_lesen.

  LOOP AT gt_ma INTO gs_ma.
    PERFORM jubilaeum_pruefen USING gs_ma.
  ENDLOOP.

  IF gt_out IS INITIAL.
    MESSAGE i051 WITH p_monat.
    RETURN.
  ENDIF.

  SORT gt_out BY jahre DESCENDING pernr.
  PERFORM liste_anzeigen.

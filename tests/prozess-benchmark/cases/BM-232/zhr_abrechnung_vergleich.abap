*&---------------------------------------------------------------------*
*& Report ZHR_ABRECHNUNG_VERGLEICH
*&---------------------------------------------------------------------*
*& Plausibilisierung nach dem Abrechnungslauf: Lohnarten der aktuellen
*& Periode gegen Vorperiode, Abweichung ueber Schwelle -> Liste.
*& Wird vor der Freigabe der Ueberweisung von der Abrechnung genutzt.
*&---------------------------------------------------------------------*
REPORT zhr_abrechnung_vergleich MESSAGE-ID zhr_pv.

INCLUDE zhr_abrechnung_vergleich_top.
INCLUDE zhr_abrechnung_vergleich_cls.
INCLUDE zhr_abrechnung_vergleich_f01.

START-OF-SELECTION.
  CREATE OBJECT go_vergleich
    EXPORTING
      iv_schwelle = p_proz.
  CREATE OBJECT go_protokoll.
  SET HANDLER go_protokoll->on_abweichung FOR go_vergleich.

  PERFORM personal_lesen.

  LOOP AT gt_pernr INTO gv_pernr.
    PERFORM mitarbeiter_vergleichen USING gv_pernr.
  ENDLOOP.

  go_protokoll->anzeigen( ).

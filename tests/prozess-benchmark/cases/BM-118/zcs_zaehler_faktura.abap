REPORT zcs_zaehler_faktura NO STANDARD PAGE HEADING LINE-SIZE 170.
*----------------------------------------------------------------------*
* Zählerabrechnung Serviceverträge (Kopierer, Druckmaschinen, Kompressoren)
*
* Für Kontraktpositionen mit Abrechnungsart Z (VBAP-ZZABRART) wird der
* Verbrauch der zugeordneten Equipments in der Periode aus den
* Messbelegen des Abrechnungszählers ermittelt. Verbrauch über der
* Freimenge wird mit dem Preis der Kondition ZCPK bewertet.
* Aus der Liste heraus erzeugt "Fakturieren" je Position eine
* Lastschriftanforderung ZL2 mit Bezug zum Vertrag.
*
* Voraussetzung: Messbelege der Abrechnungszähler sind bis zum
* Periodenende erfasst (Zählerstandsmeldung Kunde / Techniker).
* Die Faktura selbst entsteht im Fakturalauf (VF04) aus der ZL2.
*----------------------------------------------------------------------*
* 2013-01 WSC  Erstellung
* 2014-10 WSC  Freimenge je Position (VBAP-ZZFREI)
* 2017-05 WSC  Doppelabrechnung über ZCS_ZF_LOG verhindern
* 2021-02 EXT  Zählerlogik in Klasse ZCL_CS_METER_PERIOD
*----------------------------------------------------------------------*
INCLUDE zcs_zaehler_faktura_top.
INCLUDE zcs_zaehler_faktura_f01.

*----------------------------------------------------------------------*
START-OF-SELECTION.
  PERFORM vertraege_lesen.
  IF gt_ctr IS INITIAL.
    MESSAGE s701(zcs).
    RETURN.
  ENDIF.

  PERFORM objekte_lesen.
  PERFORM verbrauch_ermitteln.
  PERFORM preise_lesen.
  PERFORM abrechnung_berechnen.
  PERFORM liste_ausgeben.

*----------------------------------------------------------------------*
TOP-OF-PAGE.
  WRITE: / 'Zählerabrechnung Serviceverträge', p_von, '-', p_bis.
  WRITE: / 'Vertrag   Pos.   Kunde       Verbrauch        Freimenge',
           '      Abrechnung            Betrag'.
  ULINE.

*----------------------------------------------------------------------*
AT USER-COMMAND.
  CASE sy-ucomm.
    WHEN 'FAKT'.
      PERFORM fakturieren.
    WHEN OTHERS.
      MESSAGE s702(zcs) WITH sy-ucomm.
  ENDCASE.

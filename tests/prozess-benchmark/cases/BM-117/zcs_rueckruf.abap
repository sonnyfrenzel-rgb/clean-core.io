REPORT zcs_rueckruf LINE-SIZE 132.
*----------------------------------------------------------------------*
* Rückrufaktion Serialnummern
*
* Ermittelt alle ausgelieferten Serialnummern eines Materials (optional
* eingeschränkt auf Chargen), ordnet sie den Warenempfängern zu, legt
* den Rückruf an, erzeugt je Kunde eine Servicemeldung, informiert den
* Kunden über den länderspezifischen Kanal, druckt die Rückrufbriefe
* und kennzeichnet die betroffenen Equipments.
*----------------------------------------------------------------------*
* 2015-03 CBA  Erstellung (Rückruf Steuergerät SG-400)
* 2016-11 CBA  Kanal je Land über ZCS_RR_KANAL (dynamische Klasse)
* 2018-06 CBA  Chargenfilter
* 2020-09 EXT  Umstellung Meldungen auf Klasse ZCL_CS_RR_NOTIF
*----------------------------------------------------------------------*
INCLUDE zcs_rueckruf_top.
INCLUDE zcs_rueckruf_f01.

*----------------------------------------------------------------------*
AT SELECTION-SCREEN.
* Rückrufnummer darf im Echtlauf noch nicht vergeben sein
  SELECT SINGLE rrnr FROM zcs_rr_hdr INTO gv_rrnr
    WHERE rrnr = p_rrnr.
  IF sy-subrc = 0 AND p_test IS INITIAL.
    MESSAGE e601(zcs) WITH p_rrnr.
  ENDIF.

*----------------------------------------------------------------------*
START-OF-SELECTION.
  PERFORM seriennummern_ermitteln.
  IF gt_ser IS INITIAL.
    MESSAGE s602(zcs) WITH p_matnr.
    RETURN.
  ENDIF.

  PERFORM kunden_ermitteln.

  IF p_test = abap_true.
    PERFORM protokoll_ausgeben.
    RETURN.
  ENDIF.

  PERFORM rueckruf_anlegen.
  PERFORM kunden_informieren.
  PERFORM briefe_drucken.
  PERFORM equipments_kennzeichnen.

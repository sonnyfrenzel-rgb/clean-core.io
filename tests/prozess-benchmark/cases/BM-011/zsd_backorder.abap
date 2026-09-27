REPORT zsd_backorder MESSAGE-ID zsd.
*----------------------------------------------------------------------*
* Rückstandsbearbeitung: freien Werksbestand nach Lieferpriorität auf
* unbestätigte Kundenauftragspositionen verteilen und die Positionen
* per BAPI neu einplanen lassen (Ersatz für V_RA im Werk 1000)
*----------------------------------------------------------------------*
* 2014-05 DKL  Ersterstellung
* 2016-11 DKL  Testlauf, Protokoll-ALV
* 2019-02 MRA  Sperre ENQUEUE_EVVBAKE vor BAPI_SALESORDER_CHANGE
*----------------------------------------------------------------------*
INCLUDE zsd_backorder_top.
INCLUDE zsd_backorder_f01.

INITIALIZATION.
  p_datum = sy-datum.

START-OF-SELECTION.
  PERFORM rueckstand_lesen.
  IF gt_rueck IS INITIAL.
    MESSAGE s020.
    RETURN.
  ENDIF.
  PERFORM verteilen.

END-OF-SELECTION.
  PERFORM protokoll_anzeigen.

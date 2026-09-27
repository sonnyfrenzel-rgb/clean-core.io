REPORT zsd_billing_run MESSAGE-ID zsd.
*----------------------------------------------------------------------*
* Nächtlicher Faktura-Sammellauf je Verkaufsorganisation
*  - ermittelt warenausgangsgebuchte, nicht fakturierte Lieferungen
*  - startet je VKORG den Standard-Sammellauf (RV60SBAT) per SUBMIT
*  - prüft danach, welche Lieferungen keine Rechnung erhalten haben
*  - Anwendungsprotokoll Objekt ZSD / Unterobjekt BILLRUN, Mail bei Fehlern
* 2015-10 BLA  Ersterstellung (Ersatz Jobkette VF04 manuell)
* 2020-01 BLA  Sperrobjekt EZSD_BILLRUN gegen Doppelstart
*----------------------------------------------------------------------*
TABLES: likp.

SELECT-OPTIONS: s_vkorg FOR likp-vkorg OBLIGATORY,
                s_vstel FOR likp-vstel.
PARAMETERS:     p_fkdat TYPE fkdat DEFAULT sy-datum,
                p_test  AS CHECKBOX,
                p_mail  TYPE ad_smtpadr LOWER CASE.

TYPES: BEGIN OF ty_lief,
         vbeln TYPE likp-vbeln,
         vkorg TYPE likp-vkorg,
         kunag TYPE likp-kunag,
       END OF ty_lief.

DATA: gt_lief   TYPE STANDARD TABLE OF ty_lief,
      gt_vkorg  TYPE STANDARD TABLE OF vkorg,
      gv_vkorg  TYPE vkorg,
      gt_msg    TYPE STANDARD TABLE OF bal_s_msg,
      gv_fehler TYPE i.

INCLUDE zsd_billing_run_f01.

START-OF-SELECTION.
  PERFORM lieferungen_lesen.
  IF gt_lief IS INITIAL.
    APPEND VALUE #( msgty = 'I' msgid = 'ZSD' msgno = '400' ) TO gt_msg.
    PERFORM log_sichern.
    RETURN.
  ENDIF.

  LOOP AT gt_vkorg INTO gv_vkorg.
    PERFORM sammellauf USING gv_vkorg.
  ENDLOOP.

  PERFORM ergebnis_pruefen.
  PERFORM log_sichern.

  IF gv_fehler > 0 AND p_mail IS NOT INITIAL.
    PERFORM mail_senden.
  ENDIF.

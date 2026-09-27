*---------------------------------------------------------------------*
*       FORM USEREXIT_SAVE_DOCUMENT_PREPARE  (Auszug MV45AFZZ)        *
*---------------------------------------------------------------------*
*  Eigene Kreditprüfung (Projekt KREDIT-NEU 2011, ersetzt die
*  automatische Kreditkontrolle OVA8 für Kreditkontrollbereich 1000)
*---------------------------------------------------------------------*
FORM userexit_save_document_prepare.
  DATA: lo_credit TYPE REF TO zcl_sd_credit_check,
        ls_result TYPE zcl_sd_credit_check=>ty_result.

  CHECK vbak-vbtyp = 'C'.                           "nur Kundenaufträge
  CHECK t180-trtyp = 'H' OR t180-trtyp = 'V'.       "Anlegen / Ändern
* nur bei Anlage oder geändertem Nettowert erneut prüfen
  CHECK t180-trtyp = 'H' OR vbak-netwr <> yvbak-netwr.

  CREATE OBJECT lo_credit
    EXPORTING
      iv_kunnr = vbak-kunnr
      iv_kkber = vbak-kkber.

  ls_result = lo_credit->check( iv_new_value = vbak-netwr
                                iv_old_value = yvbak-netwr ).

  CASE ls_result-decision.
    WHEN zcl_sd_credit_check=>c_block.
      vbak-lifsk = 'Z1'.                            "Kreditsperre Lieferung
      MESSAGE w210(zsd) WITH ls_result-exposure ls_result-limit.
      lo_credit->notify_credit_manager( iv_vbeln = vbak-vbeln ).
    WHEN zcl_sd_credit_check=>c_reject.
      MESSAGE e211(zsd) WITH vbak-kunnr.
    WHEN OTHERS.
*     Sperre aus einer früheren Prüfung wieder aufheben
      IF vbak-lifsk = 'Z1'.
        CLEAR vbak-lifsk.
      ENDIF.
  ENDCASE.
ENDFORM.

CLASS zcl_ca_reproc_sd_idoc DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
* Nachverarbeitung fehlerhafter Eingangs-IDocs (SD-Auftraege, Lieferavis ...)
  PUBLIC SECTION.
    INTERFACES zif_ca_reprocessor.
ENDCLASS.



CLASS zcl_ca_reproc_sd_idoc IMPLEMENTATION.

  METHOD zif_ca_reprocessor~reprocess.
    DATA: lv_status TYPE edi_status,
          ls_edidc  TYPE edidc.

    SELECT SINGLE * FROM edidc INTO ls_edidc
      WHERE docnum = is_entry-docnum.
    lv_status = ls_edidc-status.
    IF sy-subrc <> 0.
      rs_result-message = |IDoc { is_entry-docnum } existiert nicht|.
      RETURN.
    ENDIF.

    IF lv_status = '53'.
*     inzwischen anderweitig verarbeitet (z. B. BD87 durch Fachbereich)
      rs_result-ok      = abap_true.
      rs_result-message = 'IDoc war bereits verarbeitet'.
      RETURN.
    ELSEIF lv_status <> '51' AND lv_status <> '64'.
      rs_result-message = |IDoc-Status { lv_status } erlaubt keine Nachverarbeitung|.
      RETURN.
    ENDIF.

*   Reihenfolge je Partner/Nachrichtentyp einhalten: aeltere Fehler zuerst
    SELECT COUNT(*) FROM edidc
      WHERE mestyp = ls_edidc-mestyp
        AND sndprn = ls_edidc-sndprn
        AND status = '51'
        AND docnum < ls_edidc-docnum.
    IF sy-dbcnt > 0.
      rs_result-message = |{ sy-dbcnt } aeltere fehlerhafte IDocs zuerst nachverarbeiten|.
      RETURN.
    ENDIF.

    SUBMIT rbdmani2
      WITH so_docnu = is_entry-docnum
      AND RETURN.

    SELECT SINGLE status FROM edidc INTO lv_status
      WHERE docnum = is_entry-docnum.
    IF lv_status = '53'.
      rs_result-ok      = abap_true.
      rs_result-message = 'IDoc nachverarbeitet'.
    ELSE.
      rs_result-message = |IDoc weiterhin Status { lv_status }|.
    ENDIF.
  ENDMETHOD.

ENDCLASS.

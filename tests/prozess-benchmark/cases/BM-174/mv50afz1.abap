*---------------------------------------------------------------------*
*       FORM USEREXIT_SAVE_DOCUMENT_PREPARE           (Include MV50AFZ1)
*---------------------------------------------------------------------*
*       Exportkontrolle Auslieferung ueber GTS (Projekt GTS-Anbindung
*       2016, Aenderung 2019: Liefersperre GT statt Abbruch im Job)
*---------------------------------------------------------------------*
FORM userexit_save_document_prepare.
  DATA: lv_ergebnis TYPE zgts_ergebnis,
        lv_text     TYPE char80.

  CHECK likp-vbtyp = 'J'.
  IF t180-trtyp = 'A'.
    EXIT.
  ENDIF.

  CALL FUNCTION 'Z_GTS_EXPORT_PRUEFUNG'
    EXPORTING
      is_likp     = likp
    IMPORTING
      ev_ergebnis = lv_ergebnis
      ev_text     = lv_text
    TABLES
      it_lips     = xlips.

  CASE lv_ergebnis.
    WHEN 'S'.                                 "Embargo/Sanktion: gesperrt
      likp-lifsk = 'GT'.
      MESSAGE i120(zgts) WITH likp-vbeln lv_text.
    WHEN 'F'.                                 "GTS nicht erreichbar
      IF sy-batch = abap_false.
        MESSAGE e121(zgts) WITH lv_text.
      ENDIF.
      likp-lifsk = 'GT'.
    WHEN OTHERS.
*     Freigabe durch GTS: eigene Sperre wieder entfernen
      IF likp-lifsk = 'GT'.
        CLEAR likp-lifsk.
      ENDIF.
  ENDCASE.
ENDFORM.

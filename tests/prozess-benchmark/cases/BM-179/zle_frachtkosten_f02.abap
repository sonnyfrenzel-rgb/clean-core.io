*&---------------------------------------------------------------------*
*& Include ZLE_FRACHTKOSTEN_F02 - Frachtkostenbeleg per Batch-Input
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  KOSTENBELEG_ANLEGEN
*&---------------------------------------------------------------------*
*       VI01 mit Transportnummer und Frachtkostenart; den Betrag liest
*       der Kalkulationsexit (EXIT_SAPLV54U_004 / Include ZXV54UU04)
*       aus dem ABAP-Memory ZLE_FRACHT.
*----------------------------------------------------------------------*
FORM kostenbeleg_anlegen CHANGING cs_tr TYPE ty_tr.
  DATA: lt_msg  TYPE STANDARD TABLE OF bdcmsgcoll,
        ls_opt  TYPE ctu_params,
        ls_log  TYPE zle_fk_log.

  CLEAR gt_bdc.

* Doppelanlage verhindern: Transport schon im eigenen Protokoll?
* (VFKP-Pruefung in TRANSPORTE_LESEN sieht Belege aus laufender
*  Verbuchung nicht - Vorfall 03/2017, doppelte Gutschrift Spedition)
  SELECT SINGLE fknum FROM zle_fk_log INTO @DATA(lv_fknum_alt)
    WHERE tknum = @cs_tr-tknum.
  IF sy-subrc = 0.
    cs_tr-fknum  = lv_fknum_alt.
    cs_tr-fehler = 'Bereits abgerechnet (Protokoll)'.
    RETURN.
  ENDIF.

  EXPORT fracht = cs_tr-fracht
         tknum  = cs_tr-tknum TO MEMORY ID 'ZLE_FRACHT'.

  bdc_dynpro 'SAPMV54A' '0010'.
  bdc_field  'VFKK-FKART'  p_fkart.
  bdc_field  'VTTK-TKNUM'  cs_tr-tknum.
  bdc_field  'BDC_OKCODE'  '/00'.
  bdc_dynpro 'SAPMV54A' '0020'.
  bdc_field  'BDC_OKCODE'  '=SICH'.

  ls_opt-dismode = p_mode.
  ls_opt-updmode = 'S'.
  ls_opt-defsize = 'X'.
  CALL TRANSACTION 'VI01' USING gt_bdc
                          OPTIONS FROM ls_opt
                          MESSAGES INTO lt_msg.

  FREE MEMORY ID 'ZLE_FRACHT'.

  IF line_exists( lt_msg[ msgtyp = 'E' ] ) OR line_exists( lt_msg[ msgtyp = 'A' ] ).
    cs_tr-fehler = 'VI01 mit Fehler beendet'.
    RETURN.
  ENDIF.

* Belegnummer aus der Erfolgsmeldung "Frachtkostenbeleg & angelegt"
  READ TABLE lt_msg INTO DATA(ls_msg) WITH KEY msgtyp = 'S'
                                               msgid  = 'VY'.
  IF sy-subrc = 0.
    cs_tr-fknum = ls_msg-msgv1.
  ENDIF.

  ls_log-tknum  = cs_tr-tknum.
  ls_log-fknum  = cs_tr-fknum.
  ls_log-tdlnr  = cs_tr-tdlnr.
  ls_log-fracht = cs_tr-fracht.
  ls_log-gewicht = cs_tr-gewicht_kg.
  ls_log-datum  = sy-datum.
  ls_log-uname  = sy-uname.
  INSERT zle_fk_log FROM ls_log.

* Uebergabe an die Finanzbuchhaltung (VI02, Kennzeichen "Uebertragen")
* 2019 deaktiviert: Abrechnung laeuft jetzt ueber Sammeljob VI12
* der Kreditorenbuchhaltung - Block NICHT loeschen (Revision)
*  CLEAR gt_bdc.
*  bdc_dynpro 'SAPMV54A' '0010'.
*  bdc_field  'VFKK-FKNUM'  cs_tr-fknum.
*  bdc_field  'BDC_OKCODE'  '/00'.
*  bdc_dynpro 'SAPMV54A' '0030'.
*  bdc_field  'BDC_OKCODE'  '=PABR'.
*  bdc_dynpro 'SAPMV54A' '0030'.
*  bdc_field  'VFKPD-SLSTOR' 'X'.
*  bdc_field  'BDC_OKCODE'  '=SICH'.
*  CALL TRANSACTION 'VI02' USING gt_bdc
*                          OPTIONS FROM ls_opt
*                          MESSAGES INTO lt_msg.
*  IF line_exists( lt_msg[ msgtyp = 'E' ] ).
*    cs_tr-fehler = 'Uebergabe FI fehlgeschlagen'.
*  ENDIF.
ENDFORM.

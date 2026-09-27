*----------------------------------------------------------------------*
*   INCLUDE ZXQQMU20
*   Kundenerweiterung QQMA0014 - Prüfungen vor dem Sichern der Meldung
*   Garantieprüfung für Störmeldungen (M2) und Servicemeldungen (S2):
*   - Kundengarantie: Hinweis an den Erfasser (Leistung kostenfrei)
*   - Lieferantengarantie: Regressvormerkung in ZPM_REGRESS
*----------------------------------------------------------------------*
* 2014-05 FKR  Erstellung
* 2016-02 FKR  Lieferantenregress ZPM_REGRESS
* 2019-09 FKR  Regressnummer je Buchungskreis (Baustein aus STVARV)
* 2021-11 EXT  Massenupload überspringt die Prüfung (Memory-Flag)
*----------------------------------------------------------------------*
DATA: ls_war    TYPE zpm_s_warranty,
      ls_regr   TYPE zpm_regress,
      lv_skip   TYPE abap_bool,
      lv_tvname TYPE tvarvc-name,
      lv_fname  TYPE rs38l_fnam,
      lv_regnr  TYPE zpm_regress-regnr.

CHECK i_aktyp = 'H'
  AND ( i_viqmel-qmart = 'M2' OR i_viqmel-qmart = 'S2' )
  AND i_viqmel-equnr IS NOT INITIAL.

* Massenupload ZPM_MELD_UPLOAD setzt das Flag -> keine Garantieprüfung
IMPORT skip = lv_skip FROM MEMORY ID 'ZPM_GARANTIE_SKIP'.
IF lv_skip = abap_true.
  RETURN.
ENDIF.

CALL FUNCTION 'Z_PM_WARRANTY_CHECK'
  EXPORTING
    iv_equnr    = i_viqmel-equnr
    iv_datum    = i_viqmel-qmdat
  IMPORTING
    es_warranty = ls_war
  EXCEPTIONS
    no_warranty = 1
    OTHERS      = 2.
IF sy-subrc <> 0.
  RETURN.
ENDIF.

CASE ls_war-gaart.
  WHEN '1'.
*   Kundengarantie: Leistung für den Kunden kostenfrei
    IF sy-batch IS INITIAL.
      MESSAGE i220(zpm) WITH i_viqmel-equnr ls_war-gwlen.
    ENDIF.

  WHEN '2'.
*   Lieferantengarantie: Regress beim Lieferanten vormerken
    CONCATENATE 'ZPM_REGRESS_NR_' i_viqmel-bukrs INTO lv_tvname.
    SELECT SINGLE low FROM tvarvc INTO lv_fname
      WHERE name = lv_tvname
        AND type = 'P'
        AND numb = '0000'.
    CALL FUNCTION lv_fname
      IMPORTING
        ev_regnr = lv_regnr.

    ls_regr = VALUE #( regnr  = lv_regnr
                       qmnum  = i_viqmel-qmnum
                       equnr  = ls_war-equnr
                       lifnr  = ls_war-lifnr
                       mganr  = ls_war-mganr
                       gwlen  = ls_war-gwlen
                       status = 'NEU'
                       erdat  = sy-datum
                       ernam  = sy-uname ).
    INSERT zpm_regress FROM ls_regr.
    IF sy-subrc <> 0.
      MESSAGE e221(zpm) WITH lv_regnr RAISING exit_from_save.
    ENDIF.

*   für das Regressschreiben (Druckprogramm ZPM_REGRESS_DRUCK)
    EXPORT regnr = lv_regnr TO MEMORY ID 'ZPM_REGRESS'.
    IF sy-batch IS INITIAL.
      MESSAGE i222(zpm) WITH ls_war-lifnr lv_regnr.
    ENDIF.

  WHEN OTHERS.
*   sonstige Garantiearten (3 = Kulanz) werden nicht behandelt
ENDCASE.

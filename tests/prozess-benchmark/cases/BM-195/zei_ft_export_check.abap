*&---------------------------------------------------------------------*
*& Erweiterungsimplementierung ZEI_FT_EXPORT_CHECK
*& Implizite Erweiterung \PR:SAPMV45A\FO:BELEG_SICHERN\SE:BEGIN\EI
*& Exportkontrolle / Embargoprüfung Kundenauftrag vor dem Sichern
*&---------------------------------------------------------------------*
*& 2014-08 R.Kaya    Erstversion (Länderliste Iran/Syrien, hart codiert)
*& 2022-03 R.Kaya    Umbau auf BAdI ZBADI_FT_EMBARGO, Filter LAND1
*&                   (Russland-Sanktionen VO (EU) 833/2014)
*& 2022-05 ext.      Schalter ZFT_EMBARGO_AKTIV (TVARVC)
*&---------------------------------------------------------------------*
ENHANCEMENT 1  ZEI_FT_EXPORT_CHECK.    "active version
*
  DATA: lo_ft_embargo TYPE REF TO zbadi_ft_embargo,
        lv_ft_land    TYPE land1,
        lv_ft_sperre  TYPE abap_bool,
        lt_ft_meldung TYPE bapiret2_t,
        ls_ft_log     TYPE zft_embargo_log,
        lv_ft_aktiv   TYPE tvarvc-low.

  SELECT SINGLE low FROM tvarvc INTO lv_ft_aktiv
    WHERE name = 'ZFT_EMBARGO_AKTIV'
      AND type = 'P'
      AND numb = '0000'.

* nur Anlegen/Ändern von Terminaufträgen und Kontrakten
  IF lv_ft_aktiv = 'X' AND t180-trtyp CA 'HV' AND vbak-vbtyp CA 'CG'.

*   Empfangsland = Land des Warenempfängers auf Kopfebene,
*   ohne WE das Land des Auftraggebers
    READ TABLE xvbpa ASSIGNING FIELD-SYMBOL(<ls_ft_we>)
      WITH KEY posnr = posnr_low
               parvw = 'WE'.
    lv_ft_land = COND #( WHEN sy-subrc = 0 THEN <ls_ft_we>-land1
                         ELSE kuagv-land1 ).

*   Inland und EU-Binnenmarkt sind nicht exportkontrollpflichtig
    SELECT SINGLE xegld FROM t005 INTO @DATA(lv_ft_eu)
      WHERE land1 = @lv_ft_land.

*   IF lv_ft_land = 'IR' OR lv_ft_land = 'SY'.            "bis 2022
*     MESSAGE e150(zft) WITH lv_ft_land.
*   ENDIF.

    IF lv_ft_land <> 'DE' AND lv_ft_eu IS INITIAL.

      TRY.
          GET BADI lo_ft_embargo
            FILTERS
              land1 = lv_ft_land.

          CALL BADI lo_ft_embargo->pruefen
            EXPORTING
              is_vbak    = vbak
              it_vbap    = xvbap[]
              iv_land1   = lv_ft_land
            IMPORTING
              ev_sperre  = lv_ft_sperre
            CHANGING
              ct_meldung = lt_ft_meldung.

        CATCH cx_badi_not_implemented.
*         keine aktive Implementierung -> ungeprüft sichern
*         (Abstimmung Exportkontrollbeauftragter 03/2022)
          CLEAR lv_ft_sperre.
      ENDTRY.

*     Totalembargo: Auftrag darf nicht gesichert werden
      READ TABLE lt_ft_meldung TRANSPORTING NO FIELDS
        WITH KEY type = 'A'.
      IF sy-subrc = 0.
        MESSAGE a151(zft) WITH lv_ft_land.
      ENDIF.

      IF lv_ft_sperre = abap_true.
*       Liefersperre Z1 "Exportkontrolle" am Auftragskopf
        vbak-lifsk = 'Z1'.
        IF vbak-updkz IS INITIAL.
          vbak-updkz = updkz_update.
        ENDIF.

        ls_ft_log-vbeln  = vbak-vbeln.
        ls_ft_log-land1  = lv_ft_land.
        ls_ft_log-datum  = sy-datum.
        ls_ft_log-uzeit  = sy-uzeit.
        ls_ft_log-uname  = sy-uname.
        ls_ft_log-anzahl = lines( lt_ft_meldung ).
        INSERT zft_embargo_log FROM ls_ft_log.

        MESSAGE i152(zft) WITH lv_ft_land.
      ENDIF.

    ENDIF.
  ENDIF.

ENDENHANCEMENT.

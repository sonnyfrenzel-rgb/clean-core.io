*---------------------------------------------------------------------*
*       FORM USEREXIT_SAVE_DOCUMENT_PREPARE  (Include MV50AFZ1)       *
*---------------------------------------------------------------------*
*       Z-Erweiterung LOG-17 (2017): Pruefungen vor Warenausgang      *
*       Aenderungen: 2019 HWE Chargenpruefung ergaenzt                *
*---------------------------------------------------------------------*
FORM userexit_save_document_prepare.
  DATA lo_err TYPE REF TO zcx_sd_deliv_check.

  CHECK likp-vbtyp = 'J'.            " nur Auslieferungen
  CHECK t180-trtyp = 'V'.            " nur Aendern (VL02N)

  TRY.
      zcl_sd_deliv_gi_check=>check( is_likp = likp
                                    it_lips = xlips[] ).
    CATCH zcx_sd_deliv_check INTO lo_err.
*     Sichern wird verhindert - Meldung aus der Ausnahme
      MESSAGE lo_err TYPE 'E'.
  ENDTRY.
*  PERFORM zz_alte_pruefung.   "abgeschaltet 2019
ENDFORM.

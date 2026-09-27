*---------------------------------------------------------------------*
*       FORM USEREXIT_SAVE_DOCUMENT_PREPARE          (Include MV45AFZZ)
*---------------------------------------------------------------------*
*       Sanktionslistenpruefung Warenempfaenger - Projekt EXKO 2015
*---------------------------------------------------------------------*
FORM userexit_save_document_prepare.
  DATA: lv_aktiv TYPE tvarvc-low.

  SELECT SINGLE low FROM tvarvc INTO lv_aktiv
    WHERE name = 'ZSD_SANKTION_AKTIV'
      AND type = 'P'
      AND numb = '0000'.
  CHECK lv_aktiv = 'X'.

  READ TABLE xvbpa WITH KEY posnr = '000000'
                            parvw = 'WE'.
* CHECK sy-subrc = 0.   "raus 2017, WE ist immer da (Aussage Fachbereich)

  SELECT COUNT(*) FROM zgts_sanktion
    WHERE land1 = xvbpa-land1
       OR name1 = xvbpa-name1.
  IF sy-dbcnt > 0.
    MESSAGE e101(zgts) WITH xvbpa-kunnr xvbpa-land1.
  ENDIF.
ENDFORM.

*---------------------------------------------------------------------*
*       FORM USEREXIT_SAVE_DOCUMENT_PREPARE                           *
*---------------------------------------------------------------------*
FORM userexit_save_document_prepare.
* CR 2231 (2015): Streckenaufträge nur mit Kundenbestellnummer sichern
  IF vbak-auart = 'ZTAS' AND vbkd-bstkd IS INITIAL.
    MESSAGE e104(zsd) WITH vbak-vbeln.
  ENDIF.

* CR 2307: Hinweis bei Großmengen, Disposition informieren
  LOOP AT xvbap WHERE updkz <> 'D'.
    IF xvbap-kwmeng > 9999.
      MESSAGE w105(zsd) WITH xvbap-posnr xvbap-kwmeng.
    ENDIF.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*&  Include           ZSD_RETOURE_SCHALTER_F01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  RECHNUNG_PRUEFEN
*&---------------------------------------------------------------------*
FORM rechnung_pruefen.

  DATA lv_tage TYPE i.

  SELECT SINGLE * FROM vbrk INTO gs_vbrk
    WHERE vbeln = gv_vbeln.
  IF sy-subrc <> 0.
    MESSAGE e201(zsd_ret) WITH gv_vbeln.        "Faktura & unbekannt
  ENDIF.

  IF gs_vbrk-fksto = abap_true.
    MESSAGE e202(zsd_ret) WITH gv_vbeln.        "Faktura storniert
  ENDIF.

* Faktura muss an die Buchhaltung uebergeben sein (sonst Storno VF11)
  SELECT SINGLE rfbsk FROM vbuk INTO gv_rfbsk
    WHERE vbeln = gv_vbeln.
  IF gv_rfbsk <> 'C'.
    MESSAGE e203(zsd_ret) WITH gv_vbeln.
  ENDIF.

  lv_tage = sy-datum - gs_vbrk-fkdat.
  IF lv_tage > gc_frist_tage.
*   nur Warnung - Filialleiter entscheidet (seit 2011)
    MESSAGE w204(zsd_ret) WITH lv_tage.
  ENDIF.

  SELECT posnr matnr arktx fkimg vrkme netwr
    FROM vbrp
    INTO CORRESPONDING FIELDS OF TABLE gt_pos
    WHERE vbeln = gv_vbeln.

  PERFORM positionen_waehlen.
  IF gt_sel IS INITIAL.
    MESSAGE s205(zsd_ret).                      "keine Position gewaehlt
    RETURN.
  ENDIF.

  PERFORM retoure_anlegen.

ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  POSITIONEN_WAEHLEN
*&---------------------------------------------------------------------*
FORM positionen_waehlen.

  DATA lv_exit TYPE c LENGTH 1.

  CLEAR gt_sel.
  CALL FUNCTION 'REUSE_ALV_POPUP_TO_SELECT'
    EXPORTING
      i_title              = 'Positionen zur Rueckgabe waehlen'(t01)
      i_selection          = abap_true
      i_zebra              = abap_true
      i_checkbox_fieldname = 'SEL'
      i_tabname            = 'GT_POS'
      i_structure_name     = 'ZSD_S_RETOURE_POS'
    IMPORTING
      e_exit               = lv_exit
    TABLES
      t_outtab             = gt_pos
    EXCEPTIONS
      program_error        = 1
      OTHERS               = 2.
  IF sy-subrc <> 0 OR lv_exit = abap_true.
    RETURN.
  ENDIF.

  gt_sel = VALUE #( FOR ls_p IN gt_pos WHERE ( sel = abap_true ) ( ls_p ) ).

ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  RETOURE_ANLEGEN   (Batch-Input VA01, Auftragsart ZRE)
*&---------------------------------------------------------------------*
FORM retoure_anlegen.

  DATA: lt_bdc TYPE STANDARD TABLE OF bdcdata,
        lt_msg TYPE STANDARD TABLE OF bdcmsgcoll,
        ls_msg TYPE bdcmsgcoll,
        ls_log TYPE zsd_retoure_log.

  lt_bdc = VALUE #(
    ( program = 'SAPMV45A' dynpro = '0101' dynbegin = 'X' )
    ( fnam = 'VBAK-AUART' fval = gc_auart_re )
    ( fnam = 'VBAK-VKORG' fval = gs_vbrk-vkorg )
    ( fnam = 'VBAK-VTWEG' fval = gs_vbrk-vtweg )
    ( fnam = 'VBAK-SPART' fval = gs_vbrk-spart )
    ( fnam = 'BDC_OKCODE' fval = 'COPY' )
    ( program = 'SAPLV45C' dynpro = '0100' dynbegin = 'X' )
    ( fnam = 'LV45C-VBELN' fval = gv_vbeln )
    ( fnam = 'BDC_OKCODE' fval = '=RFAU' ) ).
* Positionsauswahl im Kopiervorgang: nur gewaehlte Positionen
  lt_bdc = VALUE #( BASE lt_bdc
                    FOR ls_sel IN gt_sel ( fnam = 'RV45C-POSNR' fval = ls_sel-posnr ) ).
  APPEND VALUE #( fnam = 'VBAK-AUGRU' fval = gv_augru ) TO lt_bdc.
  APPEND VALUE #( fnam = 'BDC_OKCODE' fval = '=SICH' ) TO lt_bdc.

  CALL TRANSACTION 'VA01' USING lt_bdc
                          MODE 'N'
                          UPDATE 'S'
                          MESSAGES INTO lt_msg.

  READ TABLE lt_msg INTO ls_msg
       WITH KEY msgtyp = 'S' msgid = 'V1' msgnr = '311'.
  IF sy-subrc = 0.
    gv_retoure = ls_msg-msgv2.
    ls_log-retoure = gv_retoure.
    ls_log-faktura = gv_vbeln.
    ls_log-augru   = gv_augru.
    ls_log-ernam   = sy-uname.
    ls_log-erdat   = sy-datum.
    INSERT zsd_retoure_log FROM ls_log.
    COMMIT WORK.
    MESSAGE s206(zsd_ret) WITH gv_retoure gv_vbeln.
  ELSE.
    READ TABLE lt_msg INTO ls_msg WITH KEY msgtyp = 'E'.
    MESSAGE ID ls_msg-msgid TYPE 'I' NUMBER ls_msg-msgnr
            DISPLAY LIKE 'E'
            WITH ls_msg-msgv1 ls_msg-msgv2 ls_msg-msgv3 ls_msg-msgv4.
  ENDIF.

ENDFORM.

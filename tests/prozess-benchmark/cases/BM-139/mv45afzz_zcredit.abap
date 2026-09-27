*---------------------------------------------------------------------*
*       Auszug MV45AFZZ - Kundenerweiterungen Verkaufsbeleg
*       Z-Teil FSCM-Kreditprüfung (Projekt CR-2016-031)
*---------------------------------------------------------------------*
* Die Standard-Kreditprüfung (OVA8) ist für diese Auftragsarten
* abgeschaltet. Geprüft wird beim Sichern gegen das zentrale
* FSCM-Kreditmanagement; bei Sperre wird Liefersperre Z1 gesetzt.
* 2016 HGE  Ersterstellung
* 2018 HGE  Ablehnung (Sichern verhindern) für Kunden über 110 %
* 2020 RKL  Protokoll über Verbuchung
* 2022 RKL  Kreditsegment am Auftragskopf (USEREXIT_MOVE_FIELD_TO_VBAK)
*---------------------------------------------------------------------*

*---------------------------------------------------------------------*
*       FORM USEREXIT_SAVE_DOCUMENT_PREPARE                           *
*---------------------------------------------------------------------*
FORM userexit_save_document_prepare.
  DATA: ls_res  TYPE zsd_s_credit_result,
        lv_wert TYPE netwr_ak.

* nicht im Anzeigemodus, nur Aufträge
  CHECK t180-trtyp <> 'A'.
  CHECK vbak-vbtyp = 'C'.

* nur relevante Auftragsarten je Verkaufsorganisation
  SELECT SINGLE @abap_true FROM zsd_cr_auart INTO @DATA(lv_rel)
    WHERE auart = @vbak-auart
      AND vkorg = @vbak-vkorg.
  IF sy-subrc <> 0.
    RETURN.
  ENDIF.

* Auftragswert: nicht abgelehnte, nicht gelöschte Positionen
  lv_wert = REDUCE netwr_ak( INIT s = 0
                             FOR ls_vbap IN xvbap
                             WHERE ( abgru IS INITIAL AND updkz <> 'D' )
                             NEXT s = s + ls_vbap-netwr ).

  CALL FUNCTION 'Z_SD_FSCM_CREDIT_CHECK'
    EXPORTING
      iv_kunnr  = vbak-kunnr
      iv_vkorg  = vbak-vkorg
      iv_waerk  = vbak-waerk
      iv_wert   = lv_wert
      iv_vbeln  = vbak-vbeln
    IMPORTING
      es_result = ls_res.

  CASE ls_res-entscheid.
    WHEN 'OK'.
*     früher gesetzte Kreditsperre wieder lösen
      IF vbak-lifsk = 'Z1'.
        vbak-lifsk = space.
      ENDIF.
    WHEN 'SPERRE'.
      vbak-lifsk = 'Z1'.
      MESSAGE i401(zsd) WITH ls_res-freies_limit ls_res-waers.
    WHEN 'ABLEHNEN'.
      MESSAGE e402(zsd) WITH vbak-kunnr.
  ENDCASE.

* Ergebnis für USEREXIT_SAVE_DOCUMENT (Protokoll) merken
  EXPORT credit_result = ls_res TO MEMORY ID 'ZSD_CREDIT'.
ENDFORM.

*---------------------------------------------------------------------*
*       FORM USEREXIT_SAVE_DOCUMENT                                   *
*---------------------------------------------------------------------*
FORM userexit_save_document.
  DATA ls_res TYPE zsd_s_credit_result.

  IMPORT credit_result = ls_res FROM MEMORY ID 'ZSD_CREDIT'.
  IF sy-subrc <> 0.
    RETURN.
  ENDIF.
  FREE MEMORY ID 'ZSD_CREDIT'.

* bei Neuanlage ist die Belegnummer erst hier bekannt
  ls_res-vbeln = vbak-vbeln.
  CALL FUNCTION 'Z_SD_CREDIT_LOG_WRITE' IN UPDATE TASK
    EXPORTING
      is_result = ls_res
      iv_uname  = sy-uname.
ENDFORM.

*---------------------------------------------------------------------*
*       FORM USEREXIT_MOVE_FIELD_TO_VBAK                              *
*---------------------------------------------------------------------*
* Kreditsegment am Auftragskopf merken (Anzeige im Zusatzbild B,
* Auswertung im Kreditmonitor). Kundenfeld VBAK-ZZCR_SEGM (Append).
*---------------------------------------------------------------------*
FORM userexit_move_field_to_vbak.
  IF vbak-zzcr_segm IS INITIAL.
    SELECT SINGLE credit_sgmnt FROM zsd_cr_segm INTO vbak-zzcr_segm
      WHERE vkorg = vbak-vkorg.
  ENDIF.
ENDFORM.

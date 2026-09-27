*&---------------------------------------------------------------------*
*&  Include  ZSD_INV_EXPORT_F01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&  Form CHECK_RESTART
*&---------------------------------------------------------------------*
FORM check_restart.
  DATA ls_chk TYPE zsd_exp_chkpt.

  gv_file = |{ p_path }INV_{ p_runid }.csv|.
  SELECT SINGLE * FROM zsd_exp_chkpt INTO ls_chk
    WHERE runid = p_runid.
  IF sy-subrc = 0.
    IF p_restrt = abap_false.
      MESSAGE e200 WITH p_runid.        "Lauf existiert - Restart-Kennzeichen setzen
    ENDIF.
    gv_last = ls_chk-last_vbeln.
    gv_mode = 'A'.
    MESSAGE s201 WITH p_runid gv_last.
  ELSE.
    CLEAR gv_last.
    gv_mode = 'N'.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&  Form OPEN_FILE
*&---------------------------------------------------------------------*
FORM open_file.
  IF gv_mode = 'A'.
    OPEN DATASET gv_file FOR APPENDING IN TEXT MODE ENCODING UTF-8.
  ELSE.
    OPEN DATASET gv_file FOR OUTPUT IN TEXT MODE ENCODING UTF-8.
  ENDIF.
  IF sy-subrc <> 0.
    MESSAGE e202 WITH gv_file.
  ENDIF.
  IF gv_mode = 'N'.
    TRANSFER 'VBELN;FKDAT;KUNRG;POSNR;MATNR;FKIMG;NETWR;MWSBK;WAERK' TO gv_file.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&  Form SELECT_INVOICES - nur buchhalterisch gebuchte, nicht stornierte
*&---------------------------------------------------------------------*
FORM select_invoices.
  SELECT * FROM vbrk INTO TABLE gt_vbrk
    WHERE fkdat IN s_fkdat
      AND vkorg IN s_vkorg
      AND vbeln > gv_last
      AND fksto = space
      AND rfbsk = 'C'
    ORDER BY vbeln.
ENDFORM.

*&---------------------------------------------------------------------*
*&  Form EXPORT_INVOICE
*&---------------------------------------------------------------------*
FORM export_invoice USING ps_vbrk TYPE vbrk.
  DATA: lt_vbrp TYPE STANDARD TABLE OF vbrp,
        lv_tax  TYPE kwert,
        lv_line TYPE string,
        ls_log  TYPE zsd_exp_log.

  SELECT * FROM vbrp INTO TABLE lt_vbrp
    WHERE vbeln = ps_vbrk-vbeln.

* Steuer je Faktura aus den Konditionen (Kondition Klasse D)
  SELECT SUM( kwert ) FROM konv INTO lv_tax
    WHERE knumv = ps_vbrk-knumv
      AND koaid = 'D'.

  LOOP AT lt_vbrp INTO DATA(ls_vbrp).
    lv_line = |{ ps_vbrk-vbeln };{ ps_vbrk-fkdat };{ ps_vbrk-kunrg };{ ls_vbrp-posnr };| &&
              |{ ls_vbrp-matnr };{ ls_vbrp-fkimg };{ ls_vbrp-netwr };{ lv_tax };{ ps_vbrk-waerk }|.
    TRANSFER lv_line TO gv_file.
  ENDLOOP.

  ls_log-vbeln = ps_vbrk-vbeln.
  ls_log-runid = p_runid.
  ls_log-erdat = sy-datum.
  INSERT zsd_exp_log FROM ls_log.
  gv_count = gv_count + 1.
ENDFORM.

*&---------------------------------------------------------------------*
*&  Form SET_CHECKPOINT
*&---------------------------------------------------------------------*
FORM set_checkpoint USING pv_vbeln TYPE vbeln_vf.
  DATA ls_chk TYPE zsd_exp_chkpt.

  ls_chk-runid      = p_runid.
  ls_chk-last_vbeln = pv_vbeln.
  ls_chk-filename   = gv_file.
  MODIFY zsd_exp_chkpt FROM ls_chk.
  COMMIT WORK.
ENDFORM.

*&---------------------------------------------------------------------*
*&  Form FINISH
*&---------------------------------------------------------------------*
FORM finish.
  DELETE FROM zsd_exp_chkpt WHERE runid = p_runid.
  COMMIT WORK.
  WRITE: / 'Exportierte Fakturen:'(002), gv_count,
         / 'Datei:'(003), gv_file.
ENDFORM.

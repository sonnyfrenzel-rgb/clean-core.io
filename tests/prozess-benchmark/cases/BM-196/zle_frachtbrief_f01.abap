*&---------------------------------------------------------------------*
*& Include ZLE_FRACHTBRIEF_F01
*&---------------------------------------------------------------------*
*& Druck Frachtbrief (Nachrichtenart ZFB1) und gemeinsame Routinen
*&---------------------------------------------------------------------*

*---------------------------------------------------------------------*
*       FORM ENTRY
*---------------------------------------------------------------------*
*       Einstieg aus der Nachrichtensteuerung (RSNAST00 / VT02N)
*---------------------------------------------------------------------*
FORM entry USING return_code TYPE i
                 us_screen   TYPE c.

  CLEAR: gv_retcode, gt_lieferung, gt_lips, gt_gg, gs_lfa1.
  gv_xscreen = us_screen.

  PERFORM daten_lesen.

  IF gv_retcode = 0.
    PERFORM formular_ausgeben USING abap_false.
  ENDIF.

* IF gv_retcode = 0 AND nast-nacha = '1'.
*   PERFORM druck_alt_sapscript.            "HOF 2013: abgeschaltet
* ENDIF.

  IF gv_retcode <> 0.
    return_code = 1.
  ELSE.
    return_code = 0.
  ENDIF.

ENDFORM.                    "entry

*---------------------------------------------------------------------*
*       FORM DATEN_LESEN
*---------------------------------------------------------------------*
*       Transport, Lieferungen, Positionen, Spediteur, Gefahrgut
*---------------------------------------------------------------------*
FORM daten_lesen.

  DATA: lt_likp TYPE STANDARD TABLE OF likp.

* Transportkopf zur Nachricht (Objektschluessel = Transportnummer)
  SELECT SINGLE * FROM vttk INTO gs_vttk
    WHERE tknum = nast-objky(10).
  IF sy-subrc <> 0.
    prot '010' 'E' nast-objky(10).
    gv_retcode = 1.
    RETURN.
  ENDIF.

* Lieferungen im Transport
  SELECT * FROM vttp INTO TABLE gt_vttp
    WHERE tknum = gs_vttk-tknum
    ORDER BY PRIMARY KEY.
  IF sy-subrc <> 0.
    prot '012' 'E' gs_vttk-tknum.
    gv_retcode = 1.
    RETURN.
  ENDIF.

* Lieferkoepfe (Gewicht, Packstuecke, Warenempfaenger) fuer das Formular
  SELECT * FROM likp INTO TABLE lt_likp
    FOR ALL ENTRIES IN gt_vttp
    WHERE vbeln = gt_vttp-vbeln.
  gt_lieferung = CORRESPONDING #( lt_likp ).

* Positionen fuer die Gefahrgutermittlung
  SELECT vbeln posnr matnr pstyv lfimg vrkme ntgew gewei
    FROM lips INTO CORRESPONDING FIELDS OF TABLE gt_lips
    FOR ALL ENTRIES IN gt_vttp
    WHERE vbeln = gt_vttp-vbeln.

* Spediteur (Dienstleistungsagent des Transports)
  SELECT SINGLE * FROM lfa1 INTO gs_lfa1
    WHERE lifnr = gs_vttk-tdlnr.
* IF sy-subrc <> 0.                     "KRA 2009 - Werkverkehr hat keinen
*   gv_retcode = 1.                     "Spediteur, daher kein Fehler
* ENDIF.

  PERFORM gefahrgut_ermitteln.

ENDFORM.                    "daten_lesen

*---------------------------------------------------------------------*
*       FORM GEFAHRGUT_ERMITTELN
*---------------------------------------------------------------------*
FORM gefahrgut_ermitteln.

  CALL FUNCTION 'Z_LE_GEFAHRGUT_DATEN'
    EXPORTING
      it_lips              = gt_lips
    IMPORTING
      et_gg                = gt_gg
      ev_punkte            = gv_punkte
      ev_freigestellt      = gv_freigest
    EXCEPTIONS
      keine_positionen     = 1
      keine_gefahrgutdaten = 2
      OTHERS               = 3.

  CASE sy-subrc.
    WHEN 0.
      IF gv_freigest = abap_false.
*       Hinweis ins Protokoll: Transport kennzeichnungspflichtig (orange Tafel)
        prot '020' 'I' gs_vttk-tknum.
      ENDIF.
    WHEN 2.
*     kein Gefahrgut im Transport -> normaler Frachtbrief ohne GG-Block
      CLEAR: gt_gg, gv_punkte.
      gv_freigest = abap_true.
    WHEN OTHERS.
      prot '021' 'E' gs_vttk-tknum.
      gv_retcode = 1.
  ENDCASE.

ENDFORM.                    "gefahrgut_ermitteln

*---------------------------------------------------------------------*
*       FORM FORMULAR_AUSGEBEN
*---------------------------------------------------------------------*
*       IV_MAIL = X: nur OTF erzeugen und in PDF wandeln (ZFB5)
*       IV_MAIL = space: Druck / Archivierung gemaess Nachricht (ZFB1)
*---------------------------------------------------------------------*
FORM formular_ausgeben USING iv_mail TYPE abap_bool.

  DATA: lv_kopien TYPE ssfcompop-tdcopies,
        lt_lines  TYPE STANDARD TABLE OF tline,
        lv_size   TYPE i.

  CLEAR: gs_control, gs_options, gs_job_info, gv_pdf.

  CALL FUNCTION 'SSF_FUNCTION_MODULE_NAME'
    EXPORTING
      formname           = gc_formular
    IMPORTING
      fm_name            = gv_fm_name
    EXCEPTIONS
      no_form            = 1
      no_function_module = 2
      OTHERS             = 3.
  IF sy-subrc <> 0.
    prot '030' 'E' gc_formular.
    gv_retcode = 1.
    RETURN.
  ENDIF.

  gs_control-no_dialog = abap_true.

  IF iv_mail = abap_true.
*   EXT 2019: fuer die Mail nur OTF holen, nichts drucken
    gs_control-getotf    = abap_true.
    gs_options-tdnoprint = abap_true.
  ELSE.
    gs_control-preview  = gv_xscreen.
    gs_options-tddest   = nast-ldest.
    gs_options-tdimmed  = nast-dimme.
    gs_options-tddelete = nast-delet.
    gs_options-tdnewid  = abap_true.
*   Anzahl Ausdrucke aus der Nachricht; bei kennzeichnungspflichtigem
*   Gefahrgut eine Ausfertigung mehr fuer die Fahrzeugmappe (Ticket 4711)
    lv_kopien = COND #( WHEN gv_freigest = abap_false
                        THEN nast-anzal + 1
                        ELSE nast-anzal ).
    gs_options-tdcopies = lv_kopien.
*   Archivierungsmodus der Nachricht
*   (1 = nur drucken, 2 = nur archivieren, 3 = drucken und archivieren)
    gs_options-tdarmod = nast-tdarmod.
    IF nast-tdarmod = '2' OR nast-tdarmod = '3'.
      gs_toa_dara-function    = 'DARA'.
      gs_toa_dara-mandant     = sy-mandt.
      gs_toa_dara-sap_object  = 'VTTK'.
      gs_toa_dara-ar_object   = gc_ar_object.
      gs_toa_dara-object_id   = nast-objky.
      gs_arc_param-sap_object = 'VTTK'.
      gs_arc_param-ar_object  = gc_ar_object.
      gs_arc_param-arcuser    = sy-uname.
      gs_arc_param-printer    = nast-ldest.
      gs_arc_param-datum      = sy-datum.
    ENDIF.
  ENDIF.

  CALL FUNCTION gv_fm_name
    EXPORTING
      archive_index      = gs_toa_dara
      archive_parameters = gs_arc_param
      control_parameters = gs_control
      output_options     = gs_options
      user_settings      = space
      is_vttk            = gs_vttk
      is_lfa1            = gs_lfa1
      it_lieferung       = gt_lieferung
      it_gg              = gt_gg
      iv_punkte          = gv_punkte
      iv_freigestellt    = gv_freigest
    IMPORTING
      job_output_info    = gs_job_info
    EXCEPTIONS
      formatting_error   = 1
      internal_error     = 2
      send_error         = 3
      user_canceled      = 4
      OTHERS             = 5.
  IF sy-subrc <> 0.
    prot '031' 'E' gc_formular.
    gv_retcode = 1.
    RETURN.
  ENDIF.

  CHECK iv_mail = abap_true.

* OTF -> PDF fuer den Mailanhang
  CALL FUNCTION 'CONVERT_OTF'
    EXPORTING
      format                = 'PDF'
    IMPORTING
      bin_filesize          = lv_size
      bin_file              = gv_pdf
    TABLES
      otf                   = gs_job_info-otfdata
      lines                 = lt_lines
    EXCEPTIONS
      err_max_linewidth     = 1
      err_format            = 2
      err_conv_not_possible = 3
      err_bad_otf           = 4
      OTHERS                = 5.
  IF sy-subrc <> 0 OR gv_pdf IS INITIAL.
    prot '042' 'E' gs_vttk-tknum.
    gv_retcode = 1.
  ENDIF.

ENDFORM.                    "formular_ausgeben

*---------------------------------------------------------------------*
*       FORM DRUCK_ALT_SAPSCRIPT  (bis 10/2013 - wird nicht mehr gerufen)
*---------------------------------------------------------------------*
FORM druck_alt_sapscript.

  gs_itcpo-tdcopies = nast-anzal.
  gs_itcpo-tddest   = nast-ldest.
  gs_itcpo-tdimmed  = nast-dimme.
  gv_device = 'PRINTER'.

  CALL FUNCTION 'OPEN_FORM'
    EXPORTING
      device   = gv_device
      dialog   = space
      form     = 'ZLE_FRACHTBRIEF'
      language = nast-spras
      options  = gs_itcpo
    EXCEPTIONS
      OTHERS   = 1.
  IF sy-subrc <> 0.
    gv_retcode = 1.
    RETURN.
  ENDIF.

  CALL FUNCTION 'WRITE_FORM'
    EXPORTING
      element = 'KOPF'
      window  = 'MAIN'
    EXCEPTIONS
      OTHERS  = 1.

* Gefahrgutvermerk nach alter GGVS - Freitext im Transportkopf
  IF gs_vttk-add01 IS NOT INITIAL.
    CALL FUNCTION 'WRITE_FORM'
      EXPORTING
        element = 'GGVS'
        window  = 'MAIN'
      EXCEPTIONS
        OTHERS  = 1.
  ENDIF.

  CALL FUNCTION 'CLOSE_FORM'
    EXCEPTIONS
      OTHERS = 1.

ENDFORM.                    "druck_alt_sapscript

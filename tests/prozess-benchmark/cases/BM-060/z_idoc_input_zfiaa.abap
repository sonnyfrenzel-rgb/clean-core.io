FUNCTION z_idoc_input_zfiaa.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(INPUT_METHOD) LIKE  BDWFAP_PAR-INPUTMETHD
*"     VALUE(MASS_PROCESSING) LIKE  BDWFAP_PAR-MASS_PROC
*"  EXPORTING
*"     VALUE(WORKFLOW_RESULT) LIKE  BDWF_PARAM-RESULT
*"     VALUE(APPLICATION_VARIABLE) LIKE  BDWF_PARAM-APPL_VAR
*"     VALUE(IN_UPDATE_TASK) LIKE  BDWFAP_PAR-UPDATETASK
*"     VALUE(CALL_TRANSACTION_DONE) LIKE  BDWFAP_PAR-CALLTRANS
*"  TABLES
*"      IDOC_CONTRL STRUCTURE  EDIDC
*"      IDOC_DATA STRUCTURE  EDIDD
*"      IDOC_STATUS STRUCTURE  BDIDOCSTAT
*"      RETURN_VARIABLES STRUCTURE  BDWFRETVAR
*"      SERIALIZATION_INFO STRUCTURE  BDI_SER
*"  EXCEPTIONS
*"      WRONG_FUNCTION_CALLED
*"----------------------------------------------------------------------
* Eingang Anlagenzugaenge aus Investitionssystem (InvestPlan)
* Nachrichtentyp ZFIAA_ACQ, Basistyp ZFIAA_ACQ01
* Vorgangscode ZFIAA_ACQ -> dieser Baustein (WE42)
*
* Aenderungen:
* 2011-05 HBE  Neuanlage (Projekt ANLAGEN@INVEST)
* 2014-02 HBE  Dublettenpruefung ueber ZFIAA_EXTREF (Sender schickt
*              bei Timeout dasselbe IDoc erneut)
* 2017-09 TKL  Kunden-Exit je Buchungskreis (ZFIAA_CUST-EXIT_FB)
* 2019-11 TKL  Anlegen + Buchen in Z_FI_AA_CREATE_AND_POST ausgelagert,
*              vorher Batch-Input AS91 / ABZON
* 2021-03 RWA  Kostenstellenpruefung in Klasse ZCL_FI_ASSET_MAPPER

  DATA: lv_exit_fb TYPE rs38l_fnam,
        lv_subrc   TYPE sysubrc,
        lv_anln1   TYPE anln1,
        lv_anln2   TYPE anln2,
        lv_belnr   TYPE belnr_d,
        lv_dup     TYPE abap_bool.

  CLEAR: workflow_result, application_variable, gv_any_error.
  in_update_task        = space.
  call_transaction_done = space.

  IF go_mapper IS NOT BOUND.
    CREATE OBJECT go_mapper.
  ENDIF.

* Jedes IDoc des Pakets einzeln verarbeiten
  LOOP AT idoc_contrl INTO gs_edidc.
    CLEAR: gs_hdr, gs_val, gs_z1hdr, gs_z1val, gs_err, gs_return,
           gv_error, lv_dup, lv_exit_fb, lv_anln1, lv_anln2, lv_belnr.
    REFRESH gt_return.

*   falscher Nachrichtentyp -> Standard-Ausnahme fuer die ALE-Schicht
    IF gs_edidc-mestyp <> gc_mestyp.
      RAISE wrong_function_called.
    ENDIF.

    gs_hdr-ext_sys = gs_edidc-sndprn.

*   Segmente des IDocs einlesen
    LOOP AT idoc_data INTO gs_edidd
         WHERE docnum = gs_edidc-docnum.
      CASE gs_edidd-segnam.
        WHEN gc_seg_hdr.
          MOVE gs_edidd-sdata TO gs_z1hdr.
          gs_hdr-bukrs      = gs_z1hdr-bukrs.
          gs_hdr-ext_ref    = gs_z1hdr-extref.
          gs_hdr-ext_klasse = gs_z1hdr-invkat.
          gs_hdr-txt50      = gs_z1hdr-bezei.
          gs_hdr-kostl      = gs_z1hdr-kostl.
          gs_hdr-aktiv      = gs_z1hdr-aktdat.
          gs_hdr-posid      = gs_z1hdr-projekt.
*         gs_hdr-gsber      = gs_z1hdr-gsber.   "GSBER seit NewGL nicht mehr
        WHEN gc_seg_val.
          MOVE gs_edidd-sdata TO gs_z1val.
          gs_val-anbtr = gs_z1val-betrag.
          gs_val-waers = gs_z1val-waehrung.
          gs_val-bzdat = gs_z1val-bezugsdat.
          gs_val-budat = gs_z1val-buchdat.
          gs_val-menge = gs_z1val-menge.
        WHEN OTHERS.
*         unbekannte Segmente (z.B. Z1FIAA_TXT Langtext) werden ignoriert
      ENDCASE.
    ENDLOOP.

*   Pruefungen Buchungskreis / Anlagenklasse / Kostenstelle / Betrag
    PERFORM check_data.
    IF gv_error = abap_true.
      PERFORM fill_status TABLES idoc_status return_variables
                          USING  gs_edidc-docnum gc_stat_err.
      CONTINUE.
    ENDIF.

*   Dublette? (Sender hat dasselbe IDoc erneut geschickt)
    PERFORM check_duplicate CHANGING lv_dup.
    IF lv_dup = abap_true.
      PERFORM fill_status TABLES idoc_status return_variables
                          USING  gs_edidc-docnum gc_stat_err.
      CONTINUE.
    ENDIF.

*   Kunden-Exit je Buchungskreis (nur wenn in ZFIAA_CUST gepflegt)
    lv_exit_fb = go_mapper->get_exit_fb( gs_hdr-bukrs ).
    IF lv_exit_fb IS NOT INITIAL.
      CALL FUNCTION lv_exit_fb
        EXPORTING
          is_edidc  = gs_edidc
        CHANGING
          cs_hdr    = gs_hdr
          cs_val    = gs_val
          ct_return = gt_return
        EXCEPTIONS
          rejected  = 1
          OTHERS    = 2.
      IF sy-subrc <> 0.
        gs_err-msgid = 'ZFIAA'.
        gs_err-msgno = '020'.
        gs_err-msgv1 = lv_exit_fb.
        gs_err-msgv2 = gs_hdr-ext_ref.
        PERFORM fill_status TABLES idoc_status return_variables
                            USING  gs_edidc-docnum gc_stat_err.
        CONTINUE.
      ENDIF.
    ENDIF.

*   alt bis 2019: Batch-Input
*   PERFORM bdc_as91 USING gs_hdr.
*   CALL TRANSACTION 'AS91' USING gt_bdc MODE 'N' UPDATE 'S'.
*   PERFORM bdc_abzon USING gs_hdr gs_val.
*   CALL TRANSACTION 'ABZON' USING gt_bdc MODE 'N' UPDATE 'S'.

*   Anlage anlegen und Zugang buchen (eine LUW, Commit im Baustein)
    CALL FUNCTION 'Z_FI_AA_CREATE_AND_POST'
      EXPORTING
        is_hdr    = gs_hdr
        is_val    = gs_val
      IMPORTING
        ev_anln1  = lv_anln1
        ev_anln2  = lv_anln2
        ev_belnr  = lv_belnr
        ev_subrc  = lv_subrc
      TABLES
        et_return = gt_return.
    IF lv_subrc <> 0.
*     letzte Meldung = Fehler aus BAPI
      READ TABLE gt_return INTO gs_return INDEX lines( gt_return ).
      gs_err-msgid = gs_return-id.
      gs_err-msgno = gs_return-number.
      gs_err-msgv1 = gs_return-message_v1.
      gs_err-msgv2 = gs_return-message_v2.
      gs_err-msgv3 = gs_return-message_v3.
      PERFORM fill_status TABLES idoc_status return_variables
                          USING  gs_edidc-docnum gc_stat_err.
      CONTINUE.
    ENDIF.

*   Erfolg: Anlage &1-&2, Beleg &3 gebucht
    gs_err-msgid = 'ZFIAA'.
    gs_err-msgno = '010'.
    gs_err-msgv1 = lv_anln1.
    gs_err-msgv2 = lv_anln2.
    gs_err-msgv3 = lv_belnr.
    PERFORM fill_status TABLES idoc_status return_variables
                        USING  gs_edidc-docnum gc_stat_ok.
  ENDLOOP.

* Ergebnis fuer den Workflow (Massenverarbeitung)
  IF gv_any_error = abap_true.
    workflow_result = gc_wf_error.
  ELSE.
    workflow_result = gc_wf_ok.
  ENDIF.

ENDFUNCTION.

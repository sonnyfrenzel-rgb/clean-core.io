FUNCTION z_idoc_input_zshpconf.
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
*"----------------------------------------------------------------------
* Versandbestaetigung des Logistikdienstleisters (Nachrichtentyp ZSHPCONF)
*   Z1SHPH  Kopf: Lieferung, Warenausgangskennzeichen, WA-Datum
*   Z1SHPI  Position: Pickmenge, Charge
* Segmentverarbeitung ueber Handler-Klassen (ZCL_SD_SEG_HANDLER),
* Protokoll/IDoc-Status ueber ZCL_SD_IDOC_LOG.
*----------------------------------------------------------------------
* 2019-02 AK  Neuentwicklung (Abloesung Z-Report auf Dateibasis)
* 2020-07 AK  Sperre Lieferung vor Update, Status 51 statt Dump
* 2021-11 SB  Ueberpicktoleranz je Werk (ZSD_SHP_TOL)
*----------------------------------------------------------------------

  DATA: lo_log     TYPE REF TO zcl_sd_idoc_log,
        lo_handler TYPE REF TO zcl_sd_seg_handler,
        lx_conf    TYPE REF TO zcx_sd_shpconf,
        ls_ctx     TYPE zsd_s_shpconf_ctx,
        ls_vbkok   TYPE vbkok,
        lt_prot    TYPE STANDARD TABLE OF prott,
        lv_error   TYPE xfeld.

  workflow_result = '0'.

  LOOP AT idoc_contrl.
    lo_log = NEW zcl_sd_idoc_log( idoc_contrl-docnum ).
    CLEAR: ls_ctx, ls_vbkok, lt_prot, lv_error.

    TRY.
*       1) Segmente in den Verarbeitungskontext uebernehmen
        LOOP AT idoc_data WHERE docnum = idoc_contrl-docnum.
          lo_handler = zcl_sd_seg_handler=>create( idoc_data-segnam ).
          CHECK lo_handler IS BOUND.
          lo_handler->handle( EXPORTING is_edidd = idoc_data
                              CHANGING  cs_ctx   = ls_ctx ).
        ENDLOOP.

        IF ls_ctx-vbeln IS INITIAL.
          RAISE EXCEPTION TYPE zcx_sd_shpconf
            EXPORTING
              textid = zcx_sd_shpconf=>no_delivery.
        ENDIF.

*       2) Lieferung sperren
        CALL FUNCTION 'ENQUEUE_EVVBLKE'
          EXPORTING
            vbeln          = ls_ctx-vbeln
          EXCEPTIONS
            foreign_lock   = 1
            system_failure = 2
            OTHERS         = 3.
        IF sy-subrc <> 0.
          RAISE EXCEPTION TYPE zcx_sd_shpconf
            EXPORTING
              textid = zcx_sd_shpconf=>delivery_locked.
        ENDIF.

*       3) Kommissionierung und ggf. Warenausgang buchen
        ls_vbkok-vbeln_vl  = ls_ctx-vbeln.
        ls_vbkok-komue     = 'X'.
        ls_vbkok-wabuc     = ls_ctx-goods_issue.
        ls_vbkok-wadat_ist = ls_ctx-gi_date.

        CALL FUNCTION 'WS_DELIVERY_UPDATE'
          EXPORTING
            vbkok_wa       = ls_vbkok
            synchron       = 'X'
            commit         = ' '
            delivery       = ls_ctx-vbeln
            update_picking = 'X'
          IMPORTING
            ef_error_any_0 = lv_error
          TABLES
            vbpok_tab      = ls_ctx-items
            prot           = lt_prot.

        IF lv_error = abap_true.
          ROLLBACK WORK.
          CALL FUNCTION 'DEQUEUE_EVVBLKE'
            EXPORTING
              vbeln = ls_ctx-vbeln.
          RAISE EXCEPTION TYPE zcx_sd_shpconf
            EXPORTING
              textid = zcx_sd_shpconf=>posting_failed.
        ENDIF.

        COMMIT WORK AND WAIT.
        CALL FUNCTION 'DEQUEUE_EVVBLKE'
          EXPORTING
            vbeln = ls_ctx-vbeln.

        lo_log->set_status( iv_status = '53' iv_vbeln = ls_ctx-vbeln ).
        return_variables-wf_param   = 'Appl_Objects'.
        return_variables-doc_number = ls_ctx-vbeln.
        APPEND return_variables.

      CATCH zcx_sd_shpconf INTO lx_conf.
        lo_log->add_exception( lx_conf ).
        lo_log->set_status( iv_status = '51' iv_vbeln = ls_ctx-vbeln ).
        workflow_result = '99999'.
    ENDTRY.

    lo_log->save( CHANGING ct_status = idoc_status[] ).
  ENDLOOP.

ENDFUNCTION.

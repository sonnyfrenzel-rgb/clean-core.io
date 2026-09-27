FUNCTION idoc_input_zqmres.
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
  DATA: ls_pos TYPE gty_pos,
        lv_ok  TYPE abap_bool.

  in_update_task        = space.
  call_transaction_done = space.
  workflow_result       = '0'.

  LOOP AT idoc_contrl.
    IF idoc_contrl-mestyp <> 'ZQMRES'.
      RAISE wrong_function_called.
    ENDIF.

    CLEAR: gs_kopf, gt_pos, gv_vorglfnr, gv_msg.

    LOOP AT idoc_data WHERE docnum = idoc_contrl-docnum.
      CASE idoc_data-segnam.
        WHEN 'Z1QMRESH'.
          gs_kopf = idoc_data-sdata.
        WHEN 'Z1QMRESI'.
          ls_pos = idoc_data-sdata.
          APPEND ls_pos TO gt_pos.
        WHEN OTHERS.
*         unbekannte Segmente ignorieren (LIMS schickt Z1QMRESX seit 2020)
      ENDCASE.
    ENDLOOP.

    PERFORM pruefe_los CHANGING lv_ok.
    IF lv_ok = abap_false.
      PERFORM status_setzen TABLES idoc_status
                           USING  idoc_contrl-docnum gc_status_err gv_msg.
      workflow_result = '99999'.
      CONTINUE.
    ENDIF.

    PERFORM ergebnisse_buchen CHANGING lv_ok.
    IF lv_ok = abap_false.
      ROLLBACK WORK.
      PERFORM status_setzen TABLES idoc_status
                           USING  idoc_contrl-docnum gc_status_err gv_msg.
      workflow_result = '99999'.
      CONTINUE.
    ENDIF.

    IF gs_kopf-meldung = 'X' AND line_exists( gt_pos[ bewertung = 'R' ] ).
      PERFORM qmeldung_anlegen.
    ENDIF.

    PERFORM status_setzen TABLES idoc_status
                           USING  idoc_contrl-docnum gc_status_ok gv_msg.
  ENDLOOP.

ENDFUNCTION.

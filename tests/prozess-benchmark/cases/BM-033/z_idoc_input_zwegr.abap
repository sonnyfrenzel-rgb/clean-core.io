FUNCTION z_idoc_input_zwegr.
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
* Eingang Wareneingangsmeldung vom Logistikdienstleister (Nachrichtentyp
* ZWEGR, Basistyp ZWEGR01). Bucht WE zur Bestellung (101).
* Commit erfolgt durch die ALE-Eingangsschicht.
*----------------------------------------------------------------------*
  DATA: ls_head    TYPE z1wegrh,
        lt_pos     TYPE STANDARD TABLE OF z1wegri,
        lv_error   TYPE abap_bool,
        lv_msg     TYPE bapi_msg,
        lv_mblnr   TYPE mblnr,
        lv_mjahr   TYPE mjahr.

  READ TABLE idoc_contrl INDEX 1.
  IF idoc_contrl-mestyp <> 'ZWEGR'.
    RAISE wrong_function_called.
  ENDIF.

  LOOP AT idoc_contrl.
    CLEAR: ls_head, lt_pos, lv_error, lv_msg, lv_mblnr, lv_mjahr.

    PERFORM segmente_lesen TABLES idoc_data lt_pos
                           USING  idoc_contrl-docnum
                           CHANGING ls_head lv_error lv_msg.
    IF lv_error = abap_false.
      PERFORM pruefen_bestellung TABLES lt_pos
                                 USING  ls_head
                                 CHANGING lv_error lv_msg.
    ENDIF.
    IF lv_error = abap_false.
      PERFORM pruefen_dublette USING ls_head
                               CHANGING lv_error lv_msg.
    ENDIF.
    IF lv_error = abap_false.
      PERFORM buchen_we TABLES lt_pos
                        USING  ls_head
                        CHANGING lv_mblnr lv_mjahr lv_error lv_msg.
    ENDIF.

    IF lv_error = abap_true.
      PERFORM status_setzen TABLES idoc_status
                            USING  idoc_contrl-docnum '51' lv_msg.
      return_variables-wf_param = 'Error_IDOCs'.
      return_variables-doc_number = idoc_contrl-docnum.
      APPEND return_variables.
      workflow_result = '99999'.
    ELSE.
      INSERT zmm_3pl_we FROM @( VALUE #( xblnr = ls_head-lfsnr
                                         lifnr = ls_head-lifnr
                                         mblnr = lv_mblnr
                                         mjahr = lv_mjahr
                                         docnum = idoc_contrl-docnum
                                         erdat = sy-datum ) ).
      lv_msg = |Materialbeleg { lv_mblnr }/{ lv_mjahr } gebucht|.
      PERFORM status_setzen TABLES idoc_status
                            USING  idoc_contrl-docnum '53' lv_msg.
      return_variables-wf_param = 'Processed_IDOCs'.
      return_variables-doc_number = idoc_contrl-docnum.
      APPEND return_variables.
    ENDIF.
  ENDLOOP.

  in_update_task = space.
  call_transaction_done = space.

ENDFUNCTION.

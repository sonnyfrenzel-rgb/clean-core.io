FUNCTION z_idoc_input_zdispute.
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
* Eingangsverarbeitung Zahlungsavis mit Kürzungen (EDI-Nachricht ZDSPAV)
* Je gekürzter Rechnung wird ein Klärungsfall (FSCM Dispute) angelegt.
* 2015 DMA  / 2018 DMA Kundengründe über ZDSP_GRUND gemappt
*----------------------------------------------------------------------
  DATA: ls_edidc TYPE edidc,
        ls_edidd TYPE edidd,
        ls_hd    TYPE z1dsphd,
        ls_it    TYPE z1dspit,
        lt_it    TYPE ty_t_it,
        lv_ok    TYPE abap_bool,
        lv_msg   TYPE string.

  SELECT * FROM zdsp_grund INTO TABLE gt_grund.

  LOOP AT idoc_contrl INTO ls_edidc.
    CLEAR: ls_hd, lt_it, lv_msg.
    lv_ok = abap_true.

    LOOP AT idoc_data INTO ls_edidd WHERE docnum = ls_edidc-docnum.
      CASE ls_edidd-segnam.
        WHEN 'Z1DSPHD'.
          ls_hd = ls_edidd-sdata.
        WHEN 'Z1DSPIT'.
          ls_it = ls_edidd-sdata.
          APPEND ls_it TO lt_it.
      ENDCASE.
    ENDLOOP.

    PERFORM verarbeiten USING ls_hd lt_it CHANGING lv_ok lv_msg.

    IF lv_ok = abap_true.
      PERFORM status_setzen TABLES idoc_status
                            USING  ls_edidc-docnum '53' 'Klärungsfälle angelegt'.
    ELSE.
      ROLLBACK WORK.
      PERFORM status_setzen TABLES idoc_status
                            USING  ls_edidc-docnum '51' lv_msg.
    ENDIF.
  ENDLOOP.

  workflow_result = COND #( WHEN line_exists( idoc_status[ status = '51' ] )
                            THEN '99999' ELSE '0' ).
  in_update_task        = space.
  call_transaction_done = space.
ENDFUNCTION.

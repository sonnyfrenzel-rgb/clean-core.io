FUNCTION z_idoc_input_zequiswap.
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
* Nachrichtentyp ZEQUISWAP: Tausch eines Equipments am Technischen Platz
* Sender: mobile Instandhaltungs-App über Middleware, ein IDoc je Tausch
* Segmente: Z1EQSWAP_HDR (Platz, Datum, Zeit)
*           Z1EQSWAP_OUT (ausgebautes Equipment, Zählerstand bei Ausbau)
*           Z1EQSWAP_IN  (eingebautes Equipment)
*----------------------------------------------------------------------
* 2016-09 DWE  Erstellung
* 2018-01 DWE  Zählerstand bei Ausbau als Messbeleg
* 2020-04 DWE  Umstellung auf Ausnahmeklasse ZCX_PM_SWAP
*----------------------------------------------------------------------
  DATA: ls_hdr  TYPE z1eqswap_hdr,
        ls_out  TYPE z1eqswap_out,
        ls_in   TYPE z1eqswap_in,
        lv_text TYPE bapi_msg,
        lx_swap TYPE REF TO zcx_pm_swap.

  in_update_task        = space.
  call_transaction_done = space.

  LOOP AT idoc_contrl INTO DATA(ls_contrl).
    CLEAR: ls_hdr, ls_out, ls_in.

    LOOP AT idoc_data INTO DATA(ls_data) WHERE docnum = ls_contrl-docnum.
      CASE ls_data-segnam.
        WHEN 'Z1EQSWAP_HDR'.
          ls_hdr = ls_data-sdata.
        WHEN 'Z1EQSWAP_OUT'.
          ls_out = ls_data-sdata.
        WHEN 'Z1EQSWAP_IN'.
          ls_in = ls_data-sdata.
        WHEN OTHERS.
          CONTINUE.                 "unbekannte Segmente ignorieren
      ENDCASE.
    ENDLOOP.

    TRY.
        PERFORM check_input USING ls_hdr ls_out ls_in.
        PERFORM dismantle   USING ls_hdr ls_out.
        IF ls_out-zaehler IS NOT INITIAL.
          PERFORM post_counter USING ls_hdr ls_out.
        ENDIF.
        PERFORM install     USING ls_hdr ls_in.

      CATCH zcx_pm_swap INTO lx_swap.
        CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
        lv_text = lx_swap->get_text( ).
        PERFORM set_status USING ls_contrl-docnum '51' lv_text
                           CHANGING idoc_status[].
        workflow_result = 99999.
        CONTINUE.
    ENDTRY.

    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = 'X'.
    PERFORM set_status USING ls_contrl-docnum '53' 'Equipmenttausch gebucht'
                       CHANGING idoc_status[].
  ENDLOOP.
ENDFUNCTION.

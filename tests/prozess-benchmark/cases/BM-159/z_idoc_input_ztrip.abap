FUNCTION z_idoc_input_ztrip.
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
* Eingang Reisedaten aus dem externen Reisebuchungsportal
* Nachrichtentyp ZTRIP, Basistyp ZTRIP01
*   Z1TRIPH  Kopf: externe Reise-ID, Personalnummer, Beginn/Ende,
*                  Land, Zielort, Reisezweck
*   Z1TRIPR  Beleg: Spesenart, Betrag, Waehrung, Datum
* 2019-03 FI-TV  Anlage
* 2020-01 FI-TV  Verpflegungspauschale im Kunden-Mapping
* 2024-05 FI-TV  Dublettenpruefung ueber ZTV_EXT_TRIP
  DATA: ls_head   TYPE z1triph,
        ls_rec    TYPE z1tripr,
        lt_rec    TYPE STANDARD TABLE OF z1tripr,
        lo_mapper TYPE REF TO zcl_tv_trip_mapper,
        lo_poster TYPE REF TO zcl_tv_trip_poster,
        lx_trip   TYPE REF TO zcx_tv_trip,
        lv_reinr  TYPE reinr,
        lv_error  TYPE abap_bool.

  READ TABLE idoc_contrl INDEX 1.
  IF idoc_contrl-mestyp <> 'ZTRIP'.
    RAISE wrong_function_called.
  ENDIF.

  in_update_task        = abap_false.
  call_transaction_done = abap_false.
  lo_mapper = NEW zcl_tv_trip_mapper( ).
  lo_poster = NEW zcl_tv_trip_poster( ).

  LOOP AT idoc_contrl.
    CLEAR: ls_head, lt_rec, lv_reinr.

    LOOP AT idoc_data WHERE docnum = idoc_contrl-docnum.
      CASE idoc_data-segnam.
        WHEN 'Z1TRIPH'.
          ls_head = idoc_data-sdata.
        WHEN 'Z1TRIPR'.
          ls_rec = idoc_data-sdata.
          APPEND ls_rec TO lt_rec.
        WHEN OTHERS.
*         unbekannte Segmente (z. B. Z1TRIPX Hotel) werden ignoriert
          CONTINUE.
      ENDCASE.
    ENDLOOP.

    IF ls_head IS INITIAL.
      PERFORM set_status USING idoc_contrl-docnum '51'
                               'Kopfsegment Z1TRIPH fehlt' space.
      CONTINUE.
    ENDIF.

*   Dublette: externe Reise bereits uebernommen -> als erfolgreich melden
    IF lo_poster->exists( ls_head-ext_id ) = abap_true.
      PERFORM set_status USING idoc_contrl-docnum '53'
                               'Reise bereits uebernommen' ls_head-ext_id.
      CONTINUE.
    ENDIF.

    TRY.
        lo_mapper->validate( ls_head ).
        DATA(ls_trip) = lo_mapper->map( is_head = ls_head
                                        it_rec  = lt_rec ).
        lv_reinr = lo_poster->post( is_trip   = ls_trip
                                    iv_ext_id = ls_head-ext_id ).
        PERFORM set_status USING idoc_contrl-docnum '53'
                                 'Reise angelegt' lv_reinr.
      CATCH zcx_tv_trip INTO lx_trip.
        PERFORM set_status USING idoc_contrl-docnum '51'
                                 lx_trip->get_text( ) ls_head-ext_id.
    ENDTRY.
  ENDLOOP.

* mindestens ein Fehler -> Fehlerworkflow ausloesen
  LOOP AT idoc_status TRANSPORTING NO FIELDS WHERE status = '51'.
    lv_error = abap_true.
    EXIT.
  ENDLOOP.
  IF lv_error = abap_true.
    workflow_result = '99999'.
    LOOP AT idoc_status WHERE status = '51'.
      return_variables-wf_param = 'Error_IDOCs'.
      return_variables-doc_number = idoc_status-docnum.
      APPEND return_variables.
    ENDLOOP.
  ELSE.
    workflow_result = '0'.
  ENDIF.
ENDFUNCTION.

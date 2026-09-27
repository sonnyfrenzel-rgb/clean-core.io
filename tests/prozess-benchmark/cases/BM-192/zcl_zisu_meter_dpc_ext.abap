*----------------------------------------------------------------------*
* Klasse ZCL_ZISU_METER_DPC_EXT
* OData-Service ZISU_METER_SRV (MobileRead App, Zaehlerablesung)
* Deep Insert MeterReadingSet -> ToRegisters
* 2020-05  S.Wolter   Erstellung
* 2021-10  S.Wolter   Belegnummern in Antwort
* 2023-03  extern     Testuser fuer Lasttest (TODO entfernen!)
*----------------------------------------------------------------------*
CLASS zcl_zisu_meter_dpc_ext DEFINITION
  PUBLIC
  INHERITING FROM zcl_zisu_meter_dpc
  CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS /iwbep/if_mgw_appl_srv_runtime~create_deep_entity
      REDEFINITION.

  PROTECTED SECTION.
  PRIVATE SECTION.
    TYPES: BEGIN OF ts_reading_deep.
             INCLUDE TYPE zcl_isu_mr_validator=>ts_head.
    TYPES:   status      TYPE char10,
             toregisters TYPE zcl_isu_mr_validator=>tt_register,
           END OF ts_reading_deep.

    CONSTANTS gc_set_reading TYPE string VALUE 'MeterReadingSet'.
ENDCLASS.



CLASS zcl_zisu_meter_dpc_ext IMPLEMENTATION.

  METHOD /iwbep/if_mgw_appl_srv_runtime~create_deep_entity.

    DATA: ls_deep     TYPE ts_reading_deep,
          lt_messages TYPE bapiret2_t,
          lt_upload   TYPE STANDARD TABLE OF bapieablu,
          lt_return   TYPE STANDARD TABLE OF bapiret2,
          lv_ok       TYPE abap_bool.

    IF iv_entity_set_name <> gc_set_reading.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_tech_exception
        EXPORTING
          textid = /iwbep/cx_mgw_tech_exception=>operation_not_supported
          operation = 'CREATE_DEEP_ENTITY'.
    ENDIF.

*   Kopf + Zaehlwerke aus dem Payload in die tiefe Struktur
    io_data_provider->read_entry_data( IMPORTING es_data = ls_deep ).

    IF ls_deep-toregisters IS INITIAL.
      mo_context->get_message_container( )->add_message_text_only(
        iv_msg_type = 'E'
        iv_msg_text = 'Keine Zählwerke übermittelt'(e01) ).
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          message_container = mo_context->get_message_container( ).
    ENDIF.

*   Ableser duerfen nur Staende hochladen (Ableseeinheit wird nicht geprueft)
    AUTHORITY-CHECK OBJECT 'Z_MR_MOBIL'
      ID 'ACTVT' FIELD '01'.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          textid  = /iwbep/cx_mgw_busi_exception=>business_error
          message = 'Keine Berechtigung zum Hochladen von Zählerständen'(e02).
    ENDIF.

*   Lasttest 03/2023: Plausibilisierung fuer Testuser aus
    IF sy-uname = 'MR_LOADTEST'.
      lv_ok = abap_true.
    ELSE.
      lv_ok = NEW zcl_isu_mr_validator( )->validate(
                EXPORTING
                  is_head      = CORRESPONDING #( ls_deep )
                  it_registers = ls_deep-toregisters
                IMPORTING
                  et_messages  = lt_messages ).
    ENDIF.

    IF lv_ok = abap_false.
      mo_context->get_message_container( )->add_messages_from_bapi(
        it_bapi_messages         = lt_messages
        iv_determine_leading_msg = /iwbep/if_message_container=>gcs_leading_msg_search_option-first ).
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          message_container = mo_context->get_message_container( ).
    ENDIF.

*   Warnungen (Ueberlauf) gehen als Hinweis an die App, Upload trotzdem
*   lt_messages = VALUE #( FOR m IN lt_messages WHERE ( type = 'W' ) ( m ) ).

    lt_upload = VALUE #( FOR ls_r IN ls_deep-toregisters
                         ( serialnumber       = ls_deep-serialno
                           register           = ls_r-register
                           readingdate        = ls_deep-readdate
                           readingtime        = ls_deep-readtime
                           readingresult      = ls_r-reading
                           mtrreadingreason   = ls_deep-reason
                           meterreadernote    = ls_deep-readernote ) ).

    CALL FUNCTION 'BAPI_MTRREADDOC_UPLOAD'
      TABLES
        meterreadingresults = lt_upload
        return              = lt_return.

    IF line_exists( lt_return[ type = 'E' ] ) OR line_exists( lt_return[ type = 'A' ] ).
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      mo_context->get_message_container( )->add_messages_from_bapi(
        it_bapi_messages = lt_return ).
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          message_container = mo_context->get_message_container( ).
    ENDIF.

    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.

*   Belegnummern fuer die App nachlesen
    LOOP AT ls_deep-toregisters ASSIGNING FIELD-SYMBOL(<ls_reg>).
      SELECT SINGLE ablbelnr FROM eabl
        WHERE equnr    = ( SELECT equnr FROM equi WHERE sernr = @ls_deep-serialno AND eqtyp = 'I' )
          AND zwnummer = @<ls_reg>-register
          AND adat     = @ls_deep-readdate
        INTO @<ls_reg>-docno.
    ENDLOOP.

    ls_deep-status = 'POSTED'.
    copy_data_to_ref(
      EXPORTING
        is_data = ls_deep
      CHANGING
        cr_data = er_deep_entity ).

  ENDMETHOD.

ENDCLASS.

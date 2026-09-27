FUNCTION z_hr_masteridoc_create_zhrmd.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(MESSAGE_TYPE) LIKE  TBDME-MESTYP
*"----------------------------------------------------------------------
* Mitarbeiterdaten an Zutritts-/Kantinensystem (Nachrichtentyp ZHRMD,
* Basistyp ZHRMD01). Aufruf ueber RBDMIDOC aus Aenderungszeigern.
* Segmentinhalt je Infotyp ueber Mapper-Klassen (ZHR_IDOC_MAP).
*----------------------------------------------------------------------
* 2017-09 RS  Anlage
* 2018-05 RS  DSGVO: Geburtsdatum nur mit Einwilligung (IT0002-Mapper)
*----------------------------------------------------------------------
  DATA: lt_cp      TYPE STANDARD TABLE OF bdcp,
        lt_done    TYPE STANDARD TABLE OF bdicpident,
        lt_pernr   TYPE SORTED TABLE OF pernr_d WITH UNIQUE KEY table_line,
        lo_builder TYPE REF TO zcl_hr_idoc_builder,
        lx_map     TYPE REF TO zcx_hr_idoc_map,
        lt_data    TYPE edidd_tt,
        ls_ctrl    TYPE edidc,
        lt_comm    TYPE STANDARD TABLE OF edidc,
        ls_log     TYPE bal_s_log,
        lv_handle  TYPE balloghndl,
        lt_handle  TYPE bal_t_logh,
        lv_text    TYPE c LENGTH 200,
        lv_sent    TYPE i,
        lv_skipped TYPE i.

  CALL FUNCTION 'CHANGE_POINTERS_READ'
    EXPORTING
      message_type                = message_type
      read_not_processed_pointers = 'X'
    TABLES
      change_pointers             = lt_cp
    EXCEPTIONS
      error_in_date_interval      = 1
      error_in_time_interval      = 2
      OTHERS                      = 3.
  IF sy-subrc <> 0.
    MESSAGE e400(zhr) WITH message_type.
  ENDIF.
  IF lt_cp IS INITIAL.
    MESSAGE s401(zhr) WITH message_type.
    RETURN.
  ENDIF.

* Personalnummern aus den Objektschluesseln (PERNR in den ersten 8 Stellen)
  LOOP AT lt_cp INTO DATA(ls_cp).
    INSERT CONV pernr_d( ls_cp-cdobjid(8) ) INTO TABLE lt_pernr.
  ENDLOOP.

  ls_log-object    = 'ZHR_IDOC'.
  ls_log-subobject = 'ZHRMD'.
  CALL FUNCTION 'BAL_LOG_CREATE'
    EXPORTING
      i_s_log      = ls_log
    IMPORTING
      e_log_handle = lv_handle
    EXCEPTIONS
      OTHERS       = 1.

  lo_builder = NEW zcl_hr_idoc_builder( iv_keydate = sy-datum ).

  ls_ctrl-mestyp = message_type.
  ls_ctrl-idoctp = 'ZHRMD01'.

  LOOP AT lt_pernr INTO DATA(lv_pernr).
    TRY.
        lt_data = lo_builder->build( lv_pernr ).
      CATCH zcx_hr_idoc_map INTO lx_map.
*       Zeiger bleiben offen -> naechster Lauf versucht es wieder
        lv_text = |{ lv_pernr }: { lx_map->get_text( ) }|.
        CALL FUNCTION 'BAL_LOG_MSG_ADD_FREE_TEXT'
          EXPORTING
            i_log_handle = lv_handle
            i_msgty      = 'W'
            i_text       = lv_text
          EXCEPTIONS
            OTHERS       = 1.
        lv_skipped = lv_skipped + 1.
        CONTINUE.
    ENDTRY.

    CLEAR lt_comm.
    CALL FUNCTION 'MASTER_IDOC_DISTRIBUTE'
      EXPORTING
        master_idoc_control        = ls_ctrl
      TABLES
        communication_idoc_control = lt_comm
        master_idoc_data           = lt_data
      EXCEPTIONS
        OTHERS                     = 1.
    IF sy-subrc <> 0.
      lv_text = |{ lv_pernr }: IDoc nicht erzeugt|.
      CALL FUNCTION 'BAL_LOG_MSG_ADD_FREE_TEXT'
        EXPORTING
          i_log_handle = lv_handle
          i_msgty      = 'E'
          i_text       = lv_text
        EXCEPTIONS
          OTHERS       = 1.
      lv_skipped = lv_skipped + 1.
      CONTINUE.
    ENDIF.

*   Zeiger dieser Personalnummer als verarbeitet vormerken
    LOOP AT lt_cp INTO ls_cp.
      CHECK ls_cp-cdobjid(8) = lv_pernr.
      APPEND ls_cp-cpident TO lt_done.
    ENDLOOP.
    lv_sent = lv_sent + 1.
  ENDLOOP.

  CALL FUNCTION 'CHANGE_POINTERS_STATUS_WRITE'
    EXPORTING
      message_type           = message_type
    TABLES
      change_pointers_idents = lt_done.
  COMMIT WORK.

  INSERT lv_handle INTO TABLE lt_handle.
  CALL FUNCTION 'BAL_DB_SAVE'
    EXPORTING
      i_t_log_handle = lt_handle
    EXCEPTIONS
      OTHERS         = 1.
  MESSAGE s402(zhr) WITH lv_sent lv_skipped.

ENDFUNCTION.

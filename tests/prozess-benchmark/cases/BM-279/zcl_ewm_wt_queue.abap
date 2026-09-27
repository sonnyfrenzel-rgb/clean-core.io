CLASS zcl_ewm_wt_queue DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
*----------------------------------------------------------------------*
* Fehlerqueue fuer Lageraufgaben-Quittierungen (Tabelle ZEWM_WTQ)
*   Status E = Wiederholung geplant, F = endgueltig (manuell), P = erledigt
*   Wartezeit 5 Minuten, verdoppelt je Versuch, max. 6 Versuche
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    TYPES ty_t_queue TYPE STANDARD TABLE OF zewm_wtq WITH EMPTY KEY.

    METHODS enqueue
      IMPORTING is_conf      TYPE zcl_ewm_wt_processor=>ty_conf
                iv_text      TYPE csequence
                iv_temporary TYPE abap_bool.
    METHODS get_due
      RETURNING VALUE(rt_queue) TYPE ty_t_queue.
    METHODS mark_done
      IMPORTING iv_guid TYPE sysuuid_x16.
    METHODS mark_retry
      IMPORTING is_entry TYPE zewm_wtq
                iv_text  TYPE csequence.
    METHODS mark_failed
      IMPORTING iv_guid TYPE sysuuid_x16
                iv_text TYPE csequence.
    METHODS purge
      IMPORTING iv_days           TYPE i
      RETURNING VALUE(rv_deleted) TYPE i.

  PRIVATE SECTION.
    CONSTANTS: gc_wait_sec  TYPE i VALUE 300,
               gc_max_retry TYPE i VALUE 6.
ENDCLASS.



CLASS zcl_ewm_wt_queue IMPLEMENTATION.

  METHOD enqueue.
    DATA ls_q TYPE zewm_wtq.

    ls_q-guid  = cl_system_uuid=>create_uuid_x16_static( ).
    ls_q-lgnum = is_conf-lgnum.
    ls_q-tanum = is_conf-tanum.
    CALL TRANSFORMATION id SOURCE conf = is_conf
                           RESULT XML ls_q-payload.
    ls_q-errtext = iv_text.
    GET TIME STAMP FIELD ls_q-created.
    IF iv_temporary = abap_true.
      ls_q-status = 'E'.
      ls_q-next_retry = cl_abap_tstmp=>add( tstmp = ls_q-created secs = gc_wait_sec ).
    ELSE.
      ls_q-status = 'F'.
    ENDIF.
    INSERT zewm_wtq FROM ls_q.
  ENDMETHOD.


  METHOD get_due.
    DATA lv_now TYPE timestamp.

    GET TIME STAMP FIELD lv_now.
    SELECT * FROM zewm_wtq INTO TABLE rt_queue
      WHERE status     = 'E'
        AND next_retry <= lv_now
      ORDER BY created.
  ENDMETHOD.


  METHOD mark_done.
    UPDATE zewm_wtq SET status = 'P'
      WHERE guid = iv_guid.
  ENDMETHOD.


  METHOD mark_retry.
    DATA: lv_retries TYPE i,
          lv_now     TYPE timestamp,
          lv_next    TYPE timestamp.

    lv_retries = is_entry-retries + 1.
    IF lv_retries >= gc_max_retry.
      mark_failed( iv_guid = is_entry-guid iv_text = iv_text ).
      RETURN.
    ENDIF.
    GET TIME STAMP FIELD lv_now.
    lv_next = cl_abap_tstmp=>add( tstmp = lv_now
                                  secs  = gc_wait_sec * ipow( base = 2 exp = lv_retries ) ).
    UPDATE zewm_wtq SET retries    = lv_retries
                        next_retry = lv_next
                        errtext    = iv_text
      WHERE guid = is_entry-guid.
  ENDMETHOD.


  METHOD mark_failed.
    UPDATE zewm_wtq SET status  = 'F'
                        errtext = iv_text
      WHERE guid = iv_guid.
  ENDMETHOD.


  METHOD purge.
*   erledigte Eintraege nach Aufbewahrungsfrist entfernen,
*   endgueltig fehlerhafte bleiben fuer die Klaerung stehen
    DATA: lv_now   TYPE timestamp,
          lv_limit TYPE timestamp.

    IF iv_days <= 0.
      RETURN.
    ENDIF.
    GET TIME STAMP FIELD lv_now.
    lv_limit = cl_abap_tstmp=>subtractsecs( tstmp = lv_now secs = iv_days * 86400 ).
    DELETE FROM zewm_wtq
      WHERE status  = 'P'
        AND created < lv_limit.
    rv_deleted = sy-dbcnt.
  ENDMETHOD.

ENDCLASS.

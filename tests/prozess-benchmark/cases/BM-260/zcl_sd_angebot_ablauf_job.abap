CLASS zcl_sd_angebot_ablauf_job DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

*----------------------------------------------------------------------*
* Application Job ZSD_ANGEBOT_ABLAUF (taeglich 01:00):
* freigegebene Angebote, deren Gueltigkeit abgelaufen ist, per Aktion
* ABLAUFEN auf Status A setzen. Paketweise je 200, damit ein Fehler
* nicht den ganzen Lauf kippt.
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    INTERFACES if_apj_rt_exec_object.

  PRIVATE SECTION.
    CONSTANTS gc_paket TYPE i VALUE 200.
    DATA mo_log TYPE REF TO if_bali_log.

    METHODS protokoll
      IMPORTING iv_text TYPE csequence
                iv_typ  TYPE symsgty DEFAULT 'I'.
ENDCLASS.



CLASS zcl_sd_angebot_ablauf_job IMPLEMENTATION.

  METHOD if_apj_rt_exec_object~execute.
    DATA: lt_keys  TYPE TABLE FOR ACTION IMPORT zi_angebot~ablaufen,
          lv_ok    TYPE i,
          lv_fehl  TYPE i.

    TRY.
        mo_log = cl_bali_log=>create_with_header(
                   cl_bali_header_setter=>create( object = 'ZSD' subobject = 'ANGEBOT_ABLAUF' ) ).
      CATCH cx_bali_runtime.
        CLEAR mo_log.
    ENDTRY.

    DATA(lv_heute) = cl_abap_context_info=>get_system_date( ).

    SELECT angebotid FROM zi_angebot
      WHERE status     = @zbp_i_angebot=>gc_status-freigegeben
        AND gueltigbis < @lv_heute
      INTO TABLE @DATA(lt_abgelaufen).

    IF lt_abgelaufen IS INITIAL.
      protokoll( 'Keine abgelaufenen Angebote' ).
      RETURN.
    ENDIF.

    LOOP AT lt_abgelaufen INTO DATA(ls_ang).
      APPEND VALUE #( AngebotId = ls_ang-angebotid %is_draft = if_abap_behv=>mk-off ) TO lt_keys.

      IF lines( lt_keys ) < gc_paket AND sy-tabix < lines( lt_abgelaufen ).
        CONTINUE.
      ENDIF.

      MODIFY ENTITIES OF zi_angebot
        ENTITY kopf
          EXECUTE ablaufen FROM lt_keys
        FAILED DATA(ls_failed)
        REPORTED DATA(ls_reported).

      IF ls_failed IS NOT INITIAL.
        ROLLBACK ENTITIES.
        lv_fehl = lv_fehl + lines( lt_keys ).
        protokoll( iv_text = |Paket mit { lines( lt_keys ) } Angeboten verworfen| iv_typ = 'E' ).
      ELSE.
        COMMIT ENTITIES
          RESPONSE OF zi_angebot
            FAILED DATA(ls_failed_late).
        IF sy-subrc <> 0.
          lv_fehl = lv_fehl + lines( lt_keys ).
          protokoll( iv_text = |Sichern fehlgeschlagen fuer { lines( lt_keys ) } Angebote| iv_typ = 'E' ).
        ELSE.
          lv_ok = lv_ok + lines( lt_keys ).
        ENDIF.
      ENDIF.
      CLEAR lt_keys.
    ENDLOOP.

    protokoll( |{ lv_ok } Angebote abgelaufen, { lv_fehl } fehlerhaft| ).

    IF mo_log IS BOUND.
      TRY.
          cl_bali_log_db=>get_instance( )->save_log( log = mo_log assign_to_current_appl_job = abap_true ).
        CATCH cx_bali_runtime.
      ENDTRY.
    ENDIF.
  ENDMETHOD.


  METHOD protokoll.
    CHECK mo_log IS BOUND.
    TRY.
        mo_log->add_item( cl_bali_free_text_setter=>create( severity = iv_typ text = CONV #( iv_text ) ) ).
      CATCH cx_bali_runtime.
    ENDTRY.
  ENDMETHOD.

ENDCLASS.

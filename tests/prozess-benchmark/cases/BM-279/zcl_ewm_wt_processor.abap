CLASS zcl_ewm_wt_processor DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
*----------------------------------------------------------------------*
* Quittiert eine Lageraufgabe (Proxy und Retry-Job nutzen dieselbe Logik)
*   - bereits quittierte Aufgabe: nichts tun (Idempotenz bei Wiederholung)
*   - Mindermenge: Quittierung mit Differenz (Ausnahmecode DIFF)
*   - Mehrmenge: fachlicher Fehler
*   - Fehler mit Meldung aus ZEWM_TEMP_MSG (Sperren): temporaer
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_conf,
             lgnum TYPE /scwm/lgnum,
             tanum TYPE /scwm/tanum,
             qty   TYPE /scwm/ltap_vsolm,
             uom   TYPE meins,
             nlpla TYPE /scwm/ltap_nlpla,
             user  TYPE syuname,
           END OF ty_conf.

    METHODS process
      IMPORTING is_conf TYPE ty_conf
      RAISING   zcx_ewm_wt.

  PRIVATE SECTION.
    CONSTANTS gc_exc_diff TYPE /scwm/de_exccode VALUE 'DIFF'.

    METHODS raise_from_messages
      IMPORTING it_bapiret TYPE bapiret2_t
      RAISING   zcx_ewm_wt.
ENDCLASS.



CLASS zcl_ewm_wt_processor IMPLEMENTATION.

  METHOD process.
    DATA: lt_conf     TYPE /scwm/to_conf_tt,
          lt_conf_exc TYPE /scwm/to_conf_exc_tt,
          ls_exc      TYPE /scwm/to_conf_exc,
          lt_bapiret  TYPE bapiret2_t,
          lv_severity TYPE bapi_mtype.

    /scwm/cl_tm=>set_lgnum( is_conf-lgnum ).

    SELECT SINGLE tanum, vsolm, meins FROM /scwm/ordim_o
      WHERE lgnum = @is_conf-lgnum
        AND tanum = @is_conf-tanum
      INTO @DATA(ls_open).
    IF sy-subrc <> 0.
*     schon quittiert? dann war es eine Wiederholung
      SELECT SINGLE tanum FROM /scwm/ordim_c
        WHERE lgnum = @is_conf-lgnum
          AND tanum = @is_conf-tanum
        INTO @DATA(lv_done).
      IF sy-subrc = 0.
        RETURN.
      ENDIF.
      RAISE EXCEPTION TYPE zcx_ewm_wt
        EXPORTING
          textid = zcx_ewm_wt=>unknown_task.
    ENDIF.

    IF is_conf-qty > ls_open-vsolm.
      RAISE EXCEPTION TYPE zcx_ewm_wt
        EXPORTING
          textid = zcx_ewm_wt=>over_confirmation.
    ENDIF.

    APPEND VALUE #( tanum = is_conf-tanum
                    nista = is_conf-qty
                    altme = is_conf-uom
                    nlpla = is_conf-nlpla
                    squit = abap_false ) TO lt_conf.

    IF is_conf-qty < ls_open-vsolm.
*     Mindermenge -> Differenz ueber Ausnahmecode
      ls_exc-tanum     = is_conf-tanum.
      ls_exc-exccode   = gc_exc_diff.
      ls_exc-buscon    = 'TO'.
      ls_exc-exec_step = '01'.
      APPEND ls_exc TO lt_conf_exc.
    ENDIF.

    CALL FUNCTION '/SCWM/TO_CONFIRM'
      EXPORTING
        iv_lgnum       = is_conf-lgnum
        iv_update_task = abap_true
        iv_commit_work = abap_false
        it_conf        = lt_conf
        it_conf_exc    = lt_conf_exc
      IMPORTING
        et_bapiret     = lt_bapiret
        ev_severity    = lv_severity.

    IF lv_severity CA 'EAX'.
      ROLLBACK WORK.
      /scwm/cl_tm=>cleanup( ).
      raise_from_messages( lt_bapiret ).
    ENDIF.

    COMMIT WORK AND WAIT.
    /scwm/cl_tm=>cleanup( ).
  ENDMETHOD.


  METHOD raise_from_messages.
    LOOP AT it_bapiret INTO DATA(ls_ret) WHERE type CA 'EAX'.
      SELECT SINGLE msgno FROM zewm_temp_msg
        WHERE msgid = @ls_ret-id
          AND msgno = @ls_ret-number
        INTO @DATA(lv_msgno).
      IF sy-subrc = 0.
        RAISE EXCEPTION TYPE zcx_ewm_wt_temp
          EXPORTING
            textid = zcx_ewm_wt=>posting_locked.
      ENDIF.
    ENDLOOP.
    RAISE EXCEPTION TYPE zcx_ewm_wt
      EXPORTING
        textid = zcx_ewm_wt=>posting_failed.
  ENDMETHOD.

ENDCLASS.

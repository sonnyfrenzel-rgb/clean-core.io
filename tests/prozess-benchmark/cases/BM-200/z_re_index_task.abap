FUNCTION z_re_index_task.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_KEYDATE) TYPE  DATS
*"     VALUE(IT_ADJUST) TYPE  ZRE_T_IDX_ADJUST
*"  EXPORTING
*"     VALUE(ET_RESULT) TYPE  ZRE_T_IDX_RESULT
*"----------------------------------------------------------------------
* RFC-faehig, Aufruf aus ZRE_INDEX_MAIN (STARTING NEW TASK)
* Aendert die Grundmietkondition direkt - RE-FX-API war 2022 zu langsam
* (BAPI_RE_CN_CHANGE ca. 1,8 s je Vertrag), Abstimmung mit FB RE am 14.09.22
* Testlauf-Parameter IV_TEST 2023 entfernt - Testlauf ruft die Task nicht

  DATA: ls_result   TYPE zre_s_idx_result,
        ls_cond_old TYPE vicdcond,
        ls_cond_new TYPE vicdcond,
        lv_objectid TYPE cdhdr-objectid,
        lv_changenr TYPE cdhdr-changenr.

  LOOP AT it_adjust INTO DATA(ls_adj).

    CLEAR: ls_result, lv_changenr.
    ls_result-intreno   = ls_adj-intreno.
    ls_result-bukrs     = ls_adj-bukrs.
    ls_result-recnnr    = ls_adj-recnnr.
    ls_result-old_price = ls_adj-old_price.
    ls_result-new_price = ls_adj-new_price.
    ls_result-pct       = ls_adj-pct.

    CALL FUNCTION 'ENQUEUE_EZRE_IDXAGR'
      EXPORTING
        intreno        = ls_adj-intreno
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    IF sy-subrc <> 0.
      ls_result-status = 'LOCKED'.
      APPEND ls_result TO et_result.
      CONTINUE.
    ENDIF.

*   bisherige Grundmiete zum Stichtag
    SELECT SINGLE * FROM vicdcond INTO ls_cond_old
      WHERE intreno        = ls_adj-intreno
        AND condtype       = ls_adj-condtype
        AND condvalidfrom <= iv_keydate
        AND condvalidto   >= iv_keydate.
    IF sy-subrc <> 0.
      ls_result-status = 'NOCOND'.
    ELSE.

*     alte Kondition zum Vortag abgrenzen
      UPDATE vicdcond SET condvalidto = iv_keydate - 1
        WHERE intreno  = ls_cond_old-intreno
          AND condguid = ls_cond_old-condguid.

*     neue Kondition ab Stichtag
      ls_cond_new = ls_cond_old.
      ls_cond_new-condguid      = cl_system_uuid=>create_uuid_x16_static( ).
      ls_cond_new-condvalidfrom = iv_keydate.
      ls_cond_new-unitprice     = ls_adj-new_price.
      INSERT vicdcond FROM ls_cond_new.
      IF sy-subrc <> 0.
        ROLLBACK WORK.
        ls_result-status = 'ERROR'.
      ELSE.

*       Aenderungsbeleg Objektklasse ZRE_INDEX
        lv_objectid = ls_adj-intreno.
        CALL FUNCTION 'CHANGEDOCUMENT_OPEN'
          EXPORTING
            objectclass             = 'ZRE_INDEX'
            objectid                = lv_objectid
            planned_change_number   = space
            planned_or_real_changes = 'R'
          EXCEPTIONS
            OTHERS                  = 1.

        CALL FUNCTION 'CHANGEDOCUMENT_SINGLE_CASE'
          EXPORTING
            tablename        = 'VICDCOND'
            workarea_old     = ls_cond_old
            workarea_new     = ls_cond_new
            change_indicator = 'I'
            docu_delete      = space
          EXCEPTIONS
            OTHERS           = 1.

        CALL FUNCTION 'CHANGEDOCUMENT_CLOSE'
          EXPORTING
            objectclass             = 'ZRE_INDEX'
            objectid                = lv_objectid
            date_of_change          = sy-datum
            time_of_change          = sy-uzeit
            tcode                   = 'ZRE_INDEX'
            username                = sy-uname
            object_change_indicator = 'U'
          IMPORTING
            changenumber            = lv_changenr
          EXCEPTIONS
            OTHERS                  = 1.

*       neue Basis fuer die naechste Anpassung
        UPDATE zre_idxagr SET base_vpi   = ls_adj-new_vpi
                              base_per   = ls_adj-new_per
                              last_adj   = iv_keydate
                              next_check = iv_keydate + 365
          WHERE intreno = ls_adj-intreno.

        COMMIT WORK.
        ls_result-status   = 'OK'.
        ls_result-changenr = lv_changenr.
      ENDIF.
    ENDIF.

    CALL FUNCTION 'DEQUEUE_EZRE_IDXAGR'
      EXPORTING
        intreno = ls_adj-intreno.

    APPEND ls_result TO et_result.

  ENDLOOP.

ENDFUNCTION.

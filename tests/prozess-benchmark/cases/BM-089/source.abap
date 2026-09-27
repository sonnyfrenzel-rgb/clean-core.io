REPORT zmm_plm_material_sync.
* Übernahme freigegebener Teile aus PLM (Teamcenter-Kopplung)
PARAMETERS: p_dest  TYPE rfcdest DEFAULT 'PLM_PROD',
            p_since TYPE datum DEFAULT sy-datum,
            p_test  AS CHECKBOX DEFAULT 'X'.

DATA: lt_plm        TYPE STANDARD TABLE OF zplm_s_part,
      ls_plm        TYPE zplm_s_part,
      lv_msg        TYPE c LENGTH 255,
      ls_head       TYPE bapimathead,
      ls_clientdata TYPE bapi_mara,
      ls_clientx    TYPE bapi_marax,
      lt_desc       TYPE STANDARD TABLE OF bapi_makt,
      ls_desc       TYPE bapi_makt,
      ls_return     TYPE bapiret2,
      lv_ok         TYPE i,
      lv_err        TYPE i.

START-OF-SELECTION.
  CALL FUNCTION 'Z_PLM_GET_RELEASED_PARTS'
    DESTINATION p_dest
    EXPORTING
      iv_changed_since      = p_since
    TABLES
      et_parts              = lt_plm
    EXCEPTIONS
      communication_failure = 1 MESSAGE lv_msg
      system_failure        = 2 MESSAGE lv_msg
      OTHERS                = 3.
  IF sy-subrc <> 0.
    WRITE: / 'RFC-Fehler PLM:', lv_msg.
    RETURN.
  ENDIF.

  LOOP AT lt_plm INTO ls_plm.
    CLEAR: ls_head, ls_clientdata, ls_clientx, ls_return, lt_desc.
*   PLM liefert 18-stellige Nummern mit führenden Nullen
    ls_head-material = ls_plm-partno.
    SELECT SINGLE matnr FROM mara INTO ls_head-material
      WHERE matnr = ls_head-material.
    IF sy-subrc <> 0.
      ls_head-ind_sector = 'M'.
      ls_head-matl_type  = 'HALB'.
      ls_head-basic_view = 'X'.
    ELSE.
      ls_head-basic_view = 'X'.
    ENDIF.
    ls_clientdata-base_uom   = ls_plm-uom.
    ls_clientx-base_uom      = 'X'.
    ls_clientdata-net_weight = ls_plm-weight.
    ls_clientx-net_weight    = 'X'.
    ls_clientdata-unit_of_wt = 'KG'.
    ls_clientx-unit_of_wt    = 'X'.
    ls_clientdata-old_mat_no = ls_plm-plm_id.
    ls_clientx-old_mat_no    = 'X'.
    ls_desc-langu     = 'D'.
    ls_desc-matl_desc = ls_plm-descr.
    APPEND ls_desc TO lt_desc.

    CALL FUNCTION 'BAPI_MATERIAL_SAVEDATA'
      EXPORTING
        headdata            = ls_head
        clientdata          = ls_clientdata
        clientdatax         = ls_clientx
      IMPORTING
        return              = ls_return
      TABLES
        materialdescription = lt_desc.
    IF ls_return-type CA 'EA'.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      WRITE: / ls_plm-partno, ls_return-message.
      lv_err = lv_err + 1.
      CONTINUE.
    ENDIF.

    IF p_test = 'X'.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    ELSE.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING
          wait = 'X'.
      CALL FUNCTION 'Z_PLM_CONFIRM_TRANSFER'
        DESTINATION p_dest
        EXPORTING
          iv_partno             = ls_plm-partno
          iv_matnr              = ls_head-material
        EXCEPTIONS
          communication_failure = 1
          system_failure        = 2
          OTHERS                = 3.
    ENDIF.
    lv_ok = lv_ok + 1.
  ENDLOOP.
  WRITE: / 'Verarbeitet:', lv_ok, 'Fehler:', lv_err.

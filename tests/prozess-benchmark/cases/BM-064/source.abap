CLASS zcl_im_pp_release_qplan IMPLEMENTATION.

  METHOD if_ex_workorder_update~at_release.
* BAdI WORKORDER_UPDATE: Freigabe nur mit gueltigem Pruefplan
* QM-Pflicht gilt seit Audit 2017 nur fuer Werke 1000 und 1100
    DATA lv_plnnr TYPE plnnr.

    CHECK is_header_dialog-werks = '1000'
       OR is_header_dialog-werks = '1100'.

    SELECT SINGLE plnnr FROM mapl INTO lv_plnnr
      WHERE matnr = is_header_dialog-matnr
        AND werks = is_header_dialog-werks
        AND plnty = 'Q'
        AND loekz = space.
    IF sy-subrc <> 0.
      MESSAGE i398(00) WITH 'Kein Pruefplan fuer Material'
                            is_header_dialog-matnr
                            '- Freigabe nicht moeglich'.
      RAISE error.
    ENDIF.

  ENDMETHOD.

ENDCLASS.

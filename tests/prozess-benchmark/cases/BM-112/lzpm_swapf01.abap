*----------------------------------------------------------------------*
***INCLUDE LZPM_SWAPF01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form CHECK_INPUT
*&---------------------------------------------------------------------*
* Pflichtsegmente und Einbausituation prüfen
*----------------------------------------------------------------------*
FORM check_input USING ps_hdr TYPE z1eqswap_hdr
                       ps_out TYPE z1eqswap_out
                       ps_in  TYPE z1eqswap_in
                 RAISING zcx_pm_swap.
  DATA lv_tplnr TYPE iloa-tplnr.

  IF ps_hdr-tplnr IS INITIAL OR ps_out-equnr IS INITIAL
     OR ps_in-equnr IS INITIAL.
    RAISE EXCEPTION TYPE zcx_pm_swap
      EXPORTING
        textid = zcx_pm_swap=>segment_missing.
  ENDIF.

* ausgebautes Equipment muss aktuell an diesem Platz sitzen
  SELECT SINGLE i~tplnr INTO lv_tplnr
    FROM equz AS z
    INNER JOIN iloa AS i ON i~iloan = z~iloan
    WHERE z~equnr = ps_out-equnr
      AND z~datbi = '99991231'.
  IF lv_tplnr <> ps_hdr-tplnr.
    RAISE EXCEPTION TYPE zcx_pm_swap
      EXPORTING
        textid = zcx_pm_swap=>not_installed
        equnr  = ps_out-equnr.
  ENDIF.

* eingebautes Equipment darf nirgends eingebaut sein
  SELECT SINGLE i~tplnr INTO lv_tplnr
    FROM equz AS z
    INNER JOIN iloa AS i ON i~iloan = z~iloan
    WHERE z~equnr = ps_in-equnr
      AND z~datbi = '99991231'.
  IF lv_tplnr IS NOT INITIAL.
    RAISE EXCEPTION TYPE zcx_pm_swap
      EXPORTING
        textid = zcx_pm_swap=>already_installed
        equnr  = ps_in-equnr.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form DISMANTLE
*&---------------------------------------------------------------------*
FORM dismantle USING ps_hdr TYPE z1eqswap_hdr
                     ps_out TYPE z1eqswap_out
               RAISING zcx_pm_swap.
  DATA ls_ret TYPE bapiret2.

  CALL FUNCTION 'BAPI_EQUI_DISMANTLE'
    EXPORTING
      equipment = ps_out-equnr
      funcloc   = ps_hdr-tplnr
      date      = ps_hdr-datum
      time      = ps_hdr-uzeit
    IMPORTING
      return    = ls_ret.
  IF ls_ret-type CA 'EA'.
    RAISE EXCEPTION TYPE zcx_pm_swap
      EXPORTING
        textid = zcx_pm_swap=>bapi_error
        msg    = ls_ret-message.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form POST_COUNTER
*&---------------------------------------------------------------------*
* Zählerstand des ausgebauten Equipments als Messbeleg festhalten
*----------------------------------------------------------------------*
FORM post_counter USING ps_hdr TYPE z1eqswap_hdr
                        ps_out TYPE z1eqswap_out
                  RAISING zcx_pm_swap.
  SELECT SINGLE p~point FROM imptt AS p
    INNER JOIN equi AS e ON e~objnr = p~mpobj
    WHERE e~equnr = @ps_out-equnr
      AND p~indct = 'X'
      AND p~inact = @space
    INTO @DATA(lv_point).
  IF sy-subrc <> 0.
    RETURN.
  ENDIF.

  CALL FUNCTION 'MEASUREM_DOCUM_RFC_SINGLE_001'
    EXPORTING
      measurement_point = lv_point
      reading_date      = ps_hdr-datum
      reading_time      = ps_hdr-uzeit
      recorded_value    = ps_out-zaehler
      short_text        = 'Stand bei Ausbau'
      commit_work       = space
    EXCEPTIONS
      OTHERS            = 1.
  IF sy-subrc <> 0.
    MESSAGE ID sy-msgid TYPE 'E' NUMBER sy-msgno
            WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO DATA(lv_msg).
    RAISE EXCEPTION TYPE zcx_pm_swap
      EXPORTING
        textid = zcx_pm_swap=>bapi_error
        msg    = lv_msg.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form INSTALL
*&---------------------------------------------------------------------*
FORM install USING ps_hdr TYPE z1eqswap_hdr
                   ps_in  TYPE z1eqswap_in
             RAISING zcx_pm_swap.
  DATA ls_ret TYPE bapiret2.

  CALL FUNCTION 'BAPI_EQUI_INSTALL'
    EXPORTING
      equipment = ps_in-equnr
      funcloc   = ps_hdr-tplnr
      date      = ps_hdr-datum
      time      = ps_hdr-uzeit
    IMPORTING
      return    = ls_ret.
  IF ls_ret-type CA 'EA'.
    RAISE EXCEPTION TYPE zcx_pm_swap
      EXPORTING
        textid = zcx_pm_swap=>bapi_error
        msg    = ls_ret-message.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form SET_STATUS
*&---------------------------------------------------------------------*
FORM set_status USING    pv_docnum TYPE edidc-docnum
                         pv_status TYPE edidc-status
                         pv_text   TYPE csequence
                CHANGING pt_status TYPE STANDARD TABLE.
  APPEND VALUE bdidocstat( docnum = pv_docnum
                           status = pv_status
                           msgty  = COND #( WHEN pv_status = '53' THEN 'S'
                                            ELSE 'E' )
                           msgid  = 'ZPM'
                           msgno  = '000'
                           msgv1  = pv_text ) TO pt_status.
ENDFORM.

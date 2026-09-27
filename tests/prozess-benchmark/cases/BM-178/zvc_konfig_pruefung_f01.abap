*&---------------------------------------------------------------------*
*& Include ZVC_KONFIG_PRUEFUNG_F01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  POSITIONEN_LESEN
*&---------------------------------------------------------------------*
*       offene, konfigurierte Auftragspositionen (Lieferstatus <> C)
*----------------------------------------------------------------------*
FORM positionen_lesen.
  SELECT a~vbeln, p~posnr, p~matnr, p~cuobj, a~kunnr, a~lifsk
    FROM vbak AS a
    INNER JOIN vbap AS p ON p~vbeln = a~vbeln
    INNER JOIN vbup AS u ON u~vbeln = p~vbeln
                        AND u~posnr = p~posnr
    WHERE a~vkorg IN @s_vkorg
      AND a~vbeln IN @s_vbeln
      AND p~matnr IN @s_matnr
      AND p~cuobj <> '000000000000000000'
      AND u~lfsta <> 'C'
    INTO CORRESPONDING FIELDS OF TABLE @gt_pos.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  POSITION_PRUEFEN
*&---------------------------------------------------------------------*
*       Konfiguration lesen und gegen aktuelle Ableitung pruefen
*----------------------------------------------------------------------*
FORM position_pruefen USING us_pos TYPE ty_pos.
  DATA: lv_laenge  TYPE atflv,
        lv_qs      TYPE atflv,
        lv_art     TYPE atwrt,
        lv_trommel TYPE atwrt,
        lt_meld    TYPE string_table.

  CLEAR gt_conf.
  CALL FUNCTION 'VC_I_GET_CONFIGURATION'
    EXPORTING
      instance      = us_pos-cuobj
    TABLES
      configuration = gt_conf
    EXCEPTIONS
      OTHERS        = 1.
  IF sy-subrc <> 0.
    APPEND VALUE #( vbeln   = us_pos-vbeln
                    posnr   = us_pos-posnr
                    matnr   = us_pos-matnr
                    meldung = 'Konfiguration nicht lesbar'
                    sperren = abap_false ) TO gt_erg.
    RETURN.
  ENDIF.

* Merkmalwerte (ATWRT ist Text -> numerisch umsetzen)
  CATCH SYSTEM-EXCEPTIONS conversion_errors = 4.
    lv_laenge = VALUE #( gt_conf[ atnam = 'Z_LAENGE_M' ]-atwrt OPTIONAL ).
    lv_qs     = VALUE #( gt_conf[ atnam = 'Z_QUERSCHNITT' ]-atwrt OPTIONAL ).
  ENDCATCH.
  IF sy-subrc = 4.
    APPEND VALUE #( vbeln   = us_pos-vbeln
                    posnr   = us_pos-posnr
                    matnr   = us_pos-matnr
                    meldung = 'Laenge/Querschnitt nicht numerisch'
                    sperren = abap_false ) TO gt_erg.
    RETURN.
  ENDIF.
  lv_trommel = VALUE #( gt_conf[ atnam = 'Z_TROMMEL' ]-atwrt OPTIONAL ).
  lv_art     = VALUE #( gt_conf[ atnam = 'Z_VERLEGEART' ]-atwrt DEFAULT 'ERDE' ).

  TRY.
      DATA(lo_kabel) = NEW zcl_vc_kabel( iv_querschnitt = lv_qs
                                         iv_verlegeart  = lv_art ).
      lt_meld = lo_kabel->pruefen( iv_laenge  = lv_laenge
                                   iv_trommel = lv_trommel ).
    CATCH zcx_vc_kabel INTO DATA(lx_kabel).
      APPEND lx_kabel->get_text( ) TO lt_meld.
  ENDTRY.

  IF lt_meld IS INITIAL.
    RETURN.
  ENDIF.

  LOOP AT lt_meld INTO DATA(lv_meld).
    APPEND VALUE #( vbeln   = us_pos-vbeln
                    posnr   = us_pos-posnr
                    matnr   = us_pos-matnr
                    meldung = lv_meld
                    sperren = abap_true ) TO gt_erg.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  SPERREN
*&---------------------------------------------------------------------*
*       Liefersperre am Auftragskopf je abweichendem Auftrag
*----------------------------------------------------------------------*
FORM sperren.
  DATA: ls_hdr  TYPE bapisdh1,
        ls_hdrx TYPE bapisdh1x,
        lt_ret  TYPE STANDARD TABLE OF bapiret2.

  LOOP AT gt_erg INTO DATA(ls_erg) WHERE sperren = abap_true
       GROUP BY ls_erg-vbeln INTO DATA(lv_vbeln).

    READ TABLE gt_pos INTO DATA(ls_pos) WITH KEY vbeln = lv_vbeln.
    IF ls_pos-lifsk = p_lifsk.
      CONTINUE.                               "bereits gesperrt
    ENDIF.

    CLEAR: ls_hdr, ls_hdrx, lt_ret.
    ls_hdr-dlv_block   = p_lifsk.
    ls_hdrx-updateflag = 'U'.
    ls_hdrx-dlv_block  = abap_true.
    CALL FUNCTION 'BAPI_SALESORDER_CHANGE'
      EXPORTING
        salesdocument    = lv_vbeln
        order_header_in  = ls_hdr
        order_header_inx = ls_hdrx
      TABLES
        return           = lt_ret.

    IF line_exists( lt_ret[ type = 'E' ] ).
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      APPEND VALUE #( vbeln = lv_vbeln
                      text  = |Sperre nicht gesetzt: { lt_ret[ type = 'E' ]-message }| ) TO gt_log.
    ELSE.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING
          wait = abap_true.
      APPEND VALUE #( vbeln = lv_vbeln
                      text  = |Liefersperre { p_lifsk } gesetzt| ) TO gt_log.
    ENDIF.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  AUSGABE
*&---------------------------------------------------------------------*
FORM ausgabe.
  DATA lo_alv TYPE REF TO cl_salv_table.

  LOOP AT gt_log INTO DATA(ls_log).
    WRITE: / ls_log-vbeln, ls_log-text.
  ENDLOOP.

  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = lo_alv
                              CHANGING  t_table      = gt_erg ).
      lo_alv->display( ).
    CATCH cx_salv_msg.
      MESSAGE s020 DISPLAY LIKE 'E'.
  ENDTRY.
ENDFORM.

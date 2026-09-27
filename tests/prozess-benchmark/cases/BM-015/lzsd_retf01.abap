*----------------------------------------------------------------------*
***INCLUDE LZSD_RETF01 - Retouren mit Fakturabezug
*----------------------------------------------------------------------*
* globale Daten stehen in LZSD_RETTOP:
*   gs_vbrk TYPE vbrk, gt_vbrp TYPE SORTED TABLE OF vbrp
*   WITH UNIQUE KEY posnr,
*   CONSTANTS gc_auart_retoure TYPE auart VALUE 'ZRE',
*             gc_augru_kulanz  TYPE augru VALUE 'Z05',
*             gc_frist_tage    TYPE i     VALUE 365.
*----------------------------------------------------------------------*

*---------------------------------------------------------------------*
*  FORM faktura_pruefen
*---------------------------------------------------------------------*
FORM faktura_pruefen USING    iv_faktura TYPE vbeln_vf
                              iv_augru   TYPE augru
                     CHANGING ct_return  TYPE bapiret2_t.

  SELECT SINGLE * FROM vbrk INTO gs_vbrk WHERE vbeln = iv_faktura.
  IF sy-subrc <> 0.
    PERFORM fehler USING '501' iv_faktura space CHANGING ct_return.
    RETURN.
  ENDIF.

* stornierte Fakturen und Stornobelege selbst sind nicht retournierbar
  IF gs_vbrk-fksto = abap_true OR gs_vbrk-sfakn IS NOT INITIAL.
    PERFORM fehler USING '502' iv_faktura space CHANGING ct_return.
    RETURN.
  ENDIF.

  IF sy-datum - gs_vbrk-fkdat > gc_frist_tage
     AND iv_augru <> gc_augru_kulanz.
    PERFORM fehler USING '503' iv_faktura gs_vbrk-fkdat CHANGING ct_return.
    RETURN.
  ENDIF.

  SELECT * FROM vbrp INTO TABLE gt_vbrp WHERE vbeln = iv_faktura.
ENDFORM.

*---------------------------------------------------------------------*
*  FORM mengen_pruefen - Rückgabemenge gegen fakturierte Menge
*---------------------------------------------------------------------*
FORM mengen_pruefen USING    it_items  TYPE zsd_t_ret_item
                    CHANGING ct_return TYPE bapiret2_t.
  DATA: lv_bereits TYPE rfmng,
        ls_vbrp    TYPE vbrp.

  LOOP AT it_items INTO DATA(ls_item).
    READ TABLE gt_vbrp INTO ls_vbrp WITH TABLE KEY posnr = ls_item-posnr.
    IF sy-subrc <> 0.
      PERFORM fehler USING '504' ls_item-posnr space CHANGING ct_return.
      CONTINUE.
    ENDIF.

*   bereits retournierte Menge (Folgebelegtyp H = Retoure)
    SELECT SUM( rfmng ) FROM vbfa INTO lv_bereits
      WHERE vbelv   = gs_vbrk-vbeln
        AND posnv   = ls_item-posnr
        AND vbtyp_n = 'H'.

    IF ls_item-menge + lv_bereits > ls_vbrp-fkimg.
      PERFORM fehler USING '505' ls_item-posnr ls_vbrp-fkimg
                     CHANGING ct_return.
    ENDIF.
  ENDLOOP.
ENDFORM.

*---------------------------------------------------------------------*
*  FORM retoure_anlegen
*---------------------------------------------------------------------*
FORM retoure_anlegen USING    it_items    TYPE zsd_t_ret_item
                              iv_augru    TYPE augru
                              iv_simulate TYPE xfeld
                     CHANGING cv_retoure  TYPE vbeln_va
                              ct_return   TYPE bapiret2_t.
  DATA: ls_hdr  TYPE bapisdhd1,
        lt_itm  TYPE STANDARD TABLE OF bapisditm,
        lt_sch  TYPE STANDARD TABLE OF bapischdl,
        lt_par  TYPE STANDARD TABLE OF bapiparnr,
        lt_ret  TYPE STANDARD TABLE OF bapiret2,
        ls_log  TYPE zsd_ret_log,
        lv_pos  TYPE posnr_va.

  ls_hdr = VALUE #( doc_type   = gc_auart_retoure
                    sales_org  = gs_vbrk-vkorg
                    distr_chan = gs_vbrk-vtweg
                    division   = gs_vbrk-spart
                    ord_reason = iv_augru
                    ref_doc    = gs_vbrk-vbeln
                    refdoc_cat = 'M' ).
  APPEND VALUE #( partn_role = 'AG' partn_numb = gs_vbrk-kunag ) TO lt_par.

  LOOP AT it_items INTO DATA(ls_item).
    lv_pos = lv_pos + 10.
    READ TABLE gt_vbrp INTO DATA(ls_vbrp) WITH TABLE KEY posnr = ls_item-posnr.
    APPEND VALUE #( itm_number = lv_pos
                    material   = ls_vbrp-matnr
                    target_qty = ls_item-menge
                    target_qu  = ls_vbrp-vrkme
                    ref_doc    = gs_vbrk-vbeln
                    ref_doc_it = ls_item-posnr
                    ref_doc_ca = 'M' ) TO lt_itm.
    APPEND VALUE #( itm_number = lv_pos req_qty = ls_item-menge ) TO lt_sch.
  ENDLOOP.

  CALL FUNCTION 'BAPI_CUSTOMERRETURN_CREATE'
    EXPORTING
      return_header_in    = ls_hdr
    IMPORTING
      salesdocument       = cv_retoure
    TABLES
      return              = lt_ret
      return_items_in     = lt_itm
      return_partners     = lt_par
      return_schedules_in = lt_sch.
  APPEND LINES OF lt_ret TO ct_return.

  IF cv_retoure IS INITIAL OR iv_simulate = abap_true.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    CLEAR cv_retoure.
    RETURN.
  ENDIF.

  ls_log = VALUE #( retoure = cv_retoure faktura = gs_vbrk-vbeln
                    kunnr   = gs_vbrk-kunag augru = iv_augru
                    erdat   = sy-datum ernam = sy-uname ).
  INSERT zsd_ret_log FROM ls_log.

  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
    EXPORTING
      wait = abap_true.
ENDFORM.

*---------------------------------------------------------------------*
*  FORM fehler - Fehlermeldung an die Rückgabe anhängen
*---------------------------------------------------------------------*
FORM fehler USING    iv_msgno  TYPE symsgno
                     iv_v1     TYPE any
                     iv_v2     TYPE any
            CHANGING ct_return TYPE bapiret2_t.
  APPEND VALUE #( type = 'E' id = 'ZSD' number = iv_msgno
                  message_v1 = iv_v1 message_v2 = iv_v2 ) TO ct_return.
ENDFORM.

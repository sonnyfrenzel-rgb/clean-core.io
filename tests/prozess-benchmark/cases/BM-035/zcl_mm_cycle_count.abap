CLASS zcl_mm_cycle_count DEFINITION
  PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_due,
             matnr TYPE matnr,
             charg TYPE charg_d,
           END OF ty_due,
           tt_due TYPE STANDARD TABLE OF ty_due WITH DEFAULT KEY,
           BEGIN OF ty_log,
             type TYPE bapi_mtype,
             text TYPE string,
           END OF ty_log.
    DATA mt_log TYPE STANDARD TABLE OF ty_log READ-ONLY.
    METHODS constructor
      IMPORTING iv_werks TYPE werks_d
                iv_lgort TYPE lgort_d.
    METHODS select_due
      RETURNING VALUE(rt_due) TYPE tt_due.
    METHODS create_documents
      IMPORTING it_due       TYPE tt_due
                iv_max_items TYPE i.
    METHODS post_differences
      IMPORTING iv_limit TYPE dmbtr.
  PRIVATE SECTION.
    DATA: mv_werks TYPE werks_d,
          mv_lgort TYPE lgort_d.
    METHODS log
      IMPORTING iv_type TYPE bapi_mtype
                iv_text TYPE string.
ENDCLASS.

CLASS zcl_mm_cycle_count IMPLEMENTATION.

  METHOD constructor.
    mv_werks = iv_werks.
    mv_lgort = iv_lgort.
  ENDMETHOD.

  METHOD select_due.
*   Zyklus-Kennzeichen (A/B/C) je Werk -> Inventuren pro Jahr (T159C)
    SELECT c~matnr, d~dlinv, t~anzin
      FROM marc AS c
      INNER JOIN mard AS d ON d~matnr = c~matnr AND d~werks = c~werks
      INNER JOIN t159c AS t ON t~werks = c~werks AND t~abcin = c~abcin
      WHERE c~werks = @mv_werks
        AND c~abcin <> @space
        AND d~lgort = @mv_lgort
        AND d~labst > 0
        AND d~sperr = @space
      INTO TABLE @DATA(lt_cand).

    LOOP AT lt_cand INTO DATA(ls_cand) WHERE anzin > 0.
*     nie inventarisiert oder Intervall (Kalendertage) abgelaufen
      IF ls_cand-dlinv IS INITIAL OR sy-datum - ls_cand-dlinv >= 365 / ls_cand-anzin.
        APPEND VALUE #( matnr = ls_cand-matnr ) TO rt_due.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD create_documents.
    DATA: ls_head   TYPE bapi_physinv_create_head,
          lt_items  TYPE STANDARD TABLE OF bapi_physinv_create_items,
          lt_heads  TYPE STANDARD TABLE OF bapi_physinv_create_head,
          lt_return TYPE STANDARD TABLE OF bapiret2.

    ls_head-plant     = mv_werks.
    ls_head-stge_loc  = mv_lgort.
    ls_head-doc_date  = sy-datum.
    ls_head-plan_date = sy-datum.
    ls_head-phys_inv_ref = 'ZYKLUS'.
    lt_items = CORRESPONDING #( it_due MAPPING material = matnr batch = charg ).

    CALL FUNCTION 'BAPI_MATPHYSINV_CREATE_MULT'
      EXPORTING
        head     = ls_head
        maxitems = iv_max_items
      TABLES
        items    = lt_items
        return   = lt_return
        head_ret = lt_heads.

    IF line_exists( lt_return[ type = 'E' ] ).
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      log( iv_type = 'E' iv_text = |Anlage fehlgeschlagen: { lt_return[ type = 'E' ]-message }| ).
      RETURN.
    ENDIF.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.
    LOOP AT lt_heads INTO DATA(ls_h).
      log( iv_type = 'S' iv_text = |Inventurbeleg { ls_h-physinventory } angelegt| ).
    ENDLOOP.
  ENDMETHOD.

  METHOD post_differences.
    DATA: lt_items  TYPE STANDARD TABLE OF bapi_physinv_post_items,
          lt_return TYPE STANDARD TABLE OF bapiret2,
          lv_wert   TYPE dmbtr,
          lv_preis  TYPE verpr.

    SELECT iblnr, gjahr, zeili, matnr, charg, buchm, menge
      FROM iseg
      WHERE werks = @mv_werks
        AND lgort = @mv_lgort
        AND xzael = 'X'
        AND xdiff = @space
        AND xloek = @space
      ORDER BY iblnr, gjahr, zeili
      INTO TABLE @DATA(lt_iseg).

    LOOP AT lt_iseg INTO DATA(ls_grp)
         GROUP BY ( iblnr = ls_grp-iblnr gjahr = ls_grp-gjahr ) INTO DATA(ls_doc).
      CLEAR: lt_items, lt_return.
      LOOP AT GROUP ls_doc INTO DATA(ls_pos).
        SELECT SINGLE CASE vprsv WHEN 'S' THEN stprs ELSE verpr END AS preis, peinh
          FROM mbew
          WHERE matnr = @ls_pos-matnr
            AND bwkey = @mv_werks
            AND bwtar = @space
          INTO @DATA(ls_mbew).
        IF sy-subrc <> 0 OR ls_mbew-peinh = 0.
          log( iv_type = 'W' iv_text = |{ ls_pos-matnr }: keine Bewertung, nicht gebucht| ).
          CONTINUE.
        ENDIF.
        lv_preis = ls_mbew-preis / ls_mbew-peinh.
        lv_wert  = abs( ls_pos-menge - ls_pos-buchm ) * lv_preis.
        IF lv_wert > iv_limit.
*         Nachzaehlung / Freigabe Controlling
          INSERT zmm_inv_recount FROM @( VALUE #( iblnr = ls_pos-iblnr
                                                  gjahr = ls_pos-gjahr
                                                  zeili = ls_pos-zeili
                                                  wert  = lv_wert
                                                  erdat = sy-datum ) ).
          log( iv_type = 'W' iv_text = |{ ls_pos-iblnr }/{ ls_pos-zeili } Wert { lv_wert } zur Freigabe| ).
          CONTINUE.
        ENDIF.
        APPEND VALUE #( item = ls_pos-zeili ) TO lt_items.
      ENDLOOP.

      IF lt_items IS INITIAL.
        CONTINUE.
      ENDIF.
      CALL FUNCTION 'BAPI_MATPHYSINV_POSTDIFF'
        EXPORTING
          physinventory = ls_doc-iblnr
          fiscalyear    = ls_doc-gjahr
          postingdate   = sy-datum
        TABLES
          items         = lt_items
          return        = lt_return.
      IF line_exists( lt_return[ type = 'E' ] ).
        CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
        log( iv_type = 'E' iv_text = |Beleg { ls_doc-iblnr }: Differenzbuchung fehlgeschlagen| ).
      ELSE.
        CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
          EXPORTING
            wait = abap_true.
        log( iv_type = 'S' iv_text = |Beleg { ls_doc-iblnr }: { lines( lt_items ) } Differenzen gebucht| ).
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD log.
    APPEND VALUE #( type = iv_type text = iv_text ) TO mt_log.
  ENDMETHOD.

ENDCLASS.

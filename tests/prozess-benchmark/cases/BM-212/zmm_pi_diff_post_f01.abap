*&---------------------------------------------------------------------*
*& Include ZMM_PI_DIFF_POST_F01
*&---------------------------------------------------------------------*
FORM select_items.
  SELECT k~iblnr k~gjahr p~zeili p~matnr p~werks p~lgort p~buchm p~menge
    FROM ikpf AS k
    INNER JOIN iseg AS p ON p~iblnr = k~iblnr
                        AND p~gjahr = k~gjahr
    INTO CORRESPONDING FIELDS OF TABLE gt_items
    WHERE k~werks IN s_werks
      AND k~iblnr IN s_iblnr
      AND p~xzael = 'X'
      AND p~xdiff = space
      AND p~xloek = space.

  LOOP AT gt_items ASSIGNING <gs_item>.
*   Differenzwert zum Bewertungspreis (V = gleitend, S = Standard)
    SELECT SINGLE vprsv, verpr, stprs, peinh FROM mbew
      WHERE matnr = @<gs_item>-matnr
        AND bwkey = @<gs_item>-werks
        AND bwtar = @space
      INTO @DATA(ls_mbew).
    IF sy-subrc = 0 AND ls_mbew-peinh > 0.
      <gs_item>-wert = ( <gs_item>-menge - <gs_item>-buchm )
                       * COND dmbtr( WHEN ls_mbew-vprsv = 'V' THEN ls_mbew-verpr ELSE ls_mbew-stprs )
                       / ls_mbew-peinh.
    ENDIF.
  ENDLOOP.
ENDFORM.

FORM display_items.
  DATA: lo_alv TYPE REF TO cl_salv_table,
        lx_alv TYPE REF TO cx_salv_msg.
  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = lo_alv
                              CHANGING  t_table      = gt_items ).
      lo_alv->display( ).
    CATCH cx_salv_msg INTO lx_alv.
      MESSAGE lx_alv TYPE 'I'.
  ENDTRY.
ENDFORM.

FORM post_differences.
  DATA: lt_docs   TYPE STANDARD TABLE OF ty_item,
        lt_bapi   TYPE STANDARD TABLE OF bapi_physinv_post_items,
        lt_return TYPE STANDARD TABLE OF bapiret2,
        ls_hold   TYPE zmm_pi_hold.

  DATA ls_item TYPE ty_item.

* je Inventurbeleg eine Buchung
  lt_docs = VALUE #( FOR GROUPS grp OF ls_g IN gt_items
                     WHERE ( action = 'POST' )
                     GROUP BY ( iblnr = ls_g-iblnr gjahr = ls_g-gjahr )
                     ( iblnr = grp-iblnr gjahr = grp-gjahr ) ).

  LOOP AT lt_docs INTO DATA(ls_doc).
    lt_bapi = VALUE #( FOR ls_i IN gt_items
                       WHERE ( iblnr = ls_doc-iblnr AND gjahr = ls_doc-gjahr AND action = 'POST' )
                       ( item = ls_i-zeili ) ).
    CLEAR lt_return.
    CALL FUNCTION 'BAPI_MATPHYSINV_POSTDIFF'
      EXPORTING
        physinventory = ls_doc-iblnr
        fiscalyear    = ls_doc-gjahr
        pstng_date    = sy-datum
      TABLES
        items         = lt_bapi
        return        = lt_return.
    IF line_exists( lt_return[ type = 'E' ] ) OR line_exists( lt_return[ type = 'A' ] ).
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      WRITE: / ls_doc-iblnr, 'Differenzbuchung fehlgeschlagen'(e01) COLOR COL_NEGATIVE.
    ELSE.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING
          wait = abap_true.
      WRITE: / ls_doc-iblnr, 'Differenzen gebucht'(s01).
    ENDIF.
  ENDLOOP.

* Freigabepflichtige Positionen fuer das Werkscontrolling vormerken
  LOOP AT gt_items INTO ls_item WHERE action = 'HOLD'.
    MOVE-CORRESPONDING ls_item TO ls_hold.
    ls_hold-ernam = sy-uname.
    ls_hold-erdat = sy-datum.
    MODIFY zmm_pi_hold FROM ls_hold.
  ENDLOOP.
  COMMIT WORK.
ENDFORM.

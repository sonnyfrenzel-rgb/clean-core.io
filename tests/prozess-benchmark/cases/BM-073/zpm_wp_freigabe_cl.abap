*&---------------------------------------------------------------------*
*& Include ZPM_WP_FREIGABE_CL - lokale Anwendungsklasse
*&---------------------------------------------------------------------*
CLASS lcl_app DEFINITION FINAL.
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_row,
             aufnr  TYPE aufnr,
             auart  TYPE aufart,
             warpl  TYPE warpl,
             equnr  TYPE equnr,
             gstrp  TYPE co_gstrp,
             ktext  TYPE auftext,
             frei   TYPE abap_bool,
             status TYPE c LENGTH 60,
           END OF ty_row,
           tt_row TYPE STANDARD TABLE OF ty_row WITH DEFAULT KEY,
           tt_idx TYPE STANDARD TABLE OF i WITH DEFAULT KEY.

    DATA mt_rows TYPE tt_row READ-ONLY.

    METHODS select_orders
      IMPORTING iv_iwerk TYPE iwerk
                iv_bis   TYPE d
                it_auart TYPE STANDARD TABLE.
    "! it_idx leer = alle Zeilen
    METHODS release
      IMPORTING it_idx TYPE tt_idx.
    METHODS display.

  PRIVATE SECTION.
    DATA mo_alv TYPE REF TO cl_salv_table.

    METHODS equipment_inaktiv
      IMPORTING iv_equnr         TYPE equnr
      RETURNING VALUE(rv_inakt)  TYPE abap_bool.
    METHODS on_added_function
      FOR EVENT added_function OF cl_salv_events
      IMPORTING e_salv_function.
ENDCLASS.


CLASS lcl_app IMPLEMENTATION.

  METHOD select_orders.
    DATA: lt_rows TYPE tt_row,
          lv_objnr TYPE j_objnr.
    FIELD-SYMBOLS <ls_row> TYPE ty_row.

    SELECT a~aufnr a~auart i~warpl i~equnr k~gstrp a~ktext
      INTO CORRESPONDING FIELDS OF TABLE lt_rows
      FROM aufk AS a
      INNER JOIN afih AS i ON i~aufnr = a~aufnr
      INNER JOIN afko AS k ON k~aufnr = a~aufnr
      WHERE i~iwerk =  iv_iwerk
        AND i~warpl <> space
        AND a~auart IN it_auart
        AND k~gstrp <= iv_bis.

    LOOP AT lt_rows ASSIGNING <ls_row>.
*     nur Auftraege im Status EROF (I0001 aktiv)
      CONCATENATE 'OR' <ls_row>-aufnr INTO lv_objnr.
      SELECT SINGLE objnr FROM jest INTO lv_objnr
        WHERE objnr = lv_objnr
          AND stat  = 'I0001'
          AND inact = space.
      IF sy-subrc <> 0.
        CONTINUE.
      ENDIF.

      DATA(lv_inakt) = equipment_inaktiv( <ls_row>-equnr ).
      IF lv_inakt = abap_true.
        <ls_row>-frei   = abap_false.
        <ls_row>-status = 'Equipment inaktiv - nicht freigeben'.
      ELSE.
        <ls_row>-frei   = abap_true.
        <ls_row>-status = 'freigebbar'.
      ENDIF.
      APPEND <ls_row> TO mt_rows.
    ENDLOOP.
  ENDMETHOD.


  METHOD equipment_inaktiv.
    DATA lv_objnr TYPE j_objnr.

    rv_inakt = abap_false.
    CHECK iv_equnr IS NOT INITIAL.

    SELECT SINGLE objnr FROM equi INTO lv_objnr
      WHERE equnr = iv_equnr.
    SELECT SINGLE objnr FROM jest INTO lv_objnr
      WHERE objnr = lv_objnr
        AND stat  = 'I0320'
        AND inact = space.
    IF sy-subrc = 0.
      rv_inakt = abap_true.
    ENDIF.
  ENDMETHOD.


  METHOD release.
    DATA: lt_idx     TYPE tt_idx,
          lt_methods TYPE STANDARD TABLE OF bapi_alm_order_method,
          lt_return  TYPE STANDARD TABLE OF bapiret2.
    FIELD-SYMBOLS <ls_row> TYPE ty_row.

    IF it_idx IS INITIAL.
      lt_idx = VALUE #( FOR i = 1 UNTIL i > lines( mt_rows ) ( i ) ).
    ELSE.
      lt_idx = it_idx.
    ENDIF.

    LOOP AT lt_idx INTO DATA(lv_idx).
      READ TABLE mt_rows ASSIGNING <ls_row> INDEX lv_idx.
      CHECK sy-subrc = 0 AND <ls_row>-frei = abap_true.

      CLEAR: lt_methods, lt_return.
      lt_methods = VALUE #( ( refnumber  = '000001' objecttype = 'HEADER'
                              method     = 'RELEASE' objectkey  = <ls_row>-aufnr )
                            ( refnumber  = '000001' method = 'SAVE' ) ).

      CALL FUNCTION 'BAPI_ALM_ORDER_MAINTAIN'
        TABLES
          it_methods = lt_methods
          return     = lt_return.

      IF line_exists( lt_return[ type = 'E' ] ) OR line_exists( lt_return[ type = 'A' ] ).
        CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
        <ls_row>-status = 'Freigabe fehlgeschlagen'.
      ELSE.
        CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
          EXPORTING
            wait = abap_true.
        <ls_row>-status = 'freigegeben'.
        <ls_row>-frei   = abap_false.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD display.
    cl_salv_table=>factory( IMPORTING r_salv_table = mo_alv
                            CHANGING  t_table      = mt_rows ).
    mo_alv->set_screen_status( pfstatus      = 'ZSALV_FREI'
                               report        = sy-repid
                               set_functions = mo_alv->c_functions_all ).
    mo_alv->get_selections( )->set_selection_mode( if_salv_c_selection_mode=>row_column ).
    SET HANDLER on_added_function FOR mo_alv->get_event( ).
    mo_alv->display( ).
  ENDMETHOD.


  METHOD on_added_function.
    CASE e_salv_function.
      WHEN 'ZFREI'.
        DATA(lt_sel) = mo_alv->get_selections( )->get_selected_rows( ).
        IF lt_sel IS INITIAL.
          MESSAGE 'Bitte Zeilen markieren' TYPE 'I'.
          RETURN.
        ENDIF.
        release( lt_sel ).
        mo_alv->refresh( ).
      WHEN OTHERS.
*       Standardfunktionen erledigt SALV selbst
    ENDCASE.
  ENDMETHOD.

ENDCLASS.

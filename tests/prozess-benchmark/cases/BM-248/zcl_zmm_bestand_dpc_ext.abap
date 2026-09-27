CLASS zcl_zmm_bestand_dpc_ext DEFINITION
  PUBLIC
  INHERITING FROM zcl_zmm_bestand_dpc
  CREATE PUBLIC.

  PUBLIC SECTION.
  PROTECTED SECTION.
    METHODS materialbestands_get_entityset REDEFINITION.
  PRIVATE SECTION.
    METHODS werke_berechtigt
      IMPORTING
        it_werk_range   TYPE range_t_werks
      RETURNING
        VALUE(rt_werke) TYPE range_t_werks.
ENDCLASS.



CLASS zcl_zmm_bestand_dpc_ext IMPLEMENTATION.

  METHOD materialbestands_get_entityset.
*----------------------------------------------------------------------*
* EntitySet MaterialBestandSet (App "Lagerbestand je Werk", Lagerleiter)
* unterstuetzt $filter (Werks, Matnr, Lgort, NurPositiv), $orderby,
* $top/$skip und $inlinecount
*----------------------------------------------------------------------*
    DATA: lo_filter     TYPE REF TO /iwbep/if_mgw_req_filter,
          lt_filter_so  TYPE /iwbep/t_mgw_select_option,
          lt_r_werks    TYPE range_t_werks,
          lt_r_matnr    TYPE RANGE OF matnr,
          lt_r_lgort    TYPE RANGE OF lgort_d,
          lv_nur_pos    TYPE abap_bool,
          lt_bestand    TYPE zcl_zmm_bestand_mpc=>tt_materialbestand,
          lo_helper     TYPE REF TO zcl_mm_bestand_helper,
          lv_top        TYPE i,
          lv_skip       TYPE i.

    lo_filter    = io_tech_request_context->get_filter( ).
    lt_filter_so = lo_filter->get_filter_select_options( ).

    LOOP AT lt_filter_so INTO DATA(ls_so).
      CASE ls_so-property.
        WHEN 'WERKS'.
          lt_r_werks = CORRESPONDING #( ls_so-select_options ).
        WHEN 'MATNR'.
          lt_r_matnr = CORRESPONDING #( ls_so-select_options ).
        WHEN 'LGORT'.
          lt_r_lgort = CORRESPONDING #( ls_so-select_options ).
        WHEN 'NURPOSITIV'.
          lv_nur_pos = xsdbool( line_exists( ls_so-select_options[ low = 'true' ] ) ).
        WHEN OTHERS.
          RAISE EXCEPTION TYPE /iwbep/cx_mgw_tech_exception
            EXPORTING
              textid = /iwbep/cx_mgw_tech_exception=>filter_not_supported.
      ENDCASE.
    ENDLOOP.

*   Ohne Werksfilter wuerde die App alle Werke lesen - nicht erlaubt
    IF lt_r_werks IS INITIAL.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          textid  = /iwbep/cx_mgw_busi_exception=>business_error
          message = 'Bitte mindestens ein Werk filtern'.
    ENDIF.

    lt_r_werks = werke_berechtigt( lt_r_werks ).
    IF lt_r_werks IS INITIAL.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          textid  = /iwbep/cx_mgw_busi_exception=>business_error
          message = 'Keine Berechtigung fuer die gewaehlten Werke'.
    ENDIF.

*   Frei verwendbar, Qualitaet, gesperrt je Lagerort
    SELECT d~matnr, d~werks, d~lgort, t~maktx, m~meins,
           d~labst, d~insme, d~speme
      FROM mard AS d
      INNER JOIN mara AS m ON m~matnr = d~matnr
      LEFT OUTER JOIN makt AS t ON t~matnr = d~matnr
                               AND t~spras = @sy-langu
      WHERE d~werks IN @lt_r_werks
        AND d~matnr IN @lt_r_matnr
        AND d~lgort IN @lt_r_lgort
        AND d~lvorm = @space
      INTO CORRESPONDING FIELDS OF TABLE @lt_bestand.

    IF lv_nur_pos = abap_true.
      DELETE lt_bestand WHERE labst <= 0 AND insme <= 0 AND speme <= 0.
    ENDIF.

    lo_helper = NEW #( ).
    LOOP AT lt_bestand ASSIGNING FIELD-SYMBOL(<ls_best>).
      <ls_best>-gesamt = <ls_best>-labst + <ls_best>-insme + <ls_best>-speme.
      <ls_best>-reserviert = lo_helper->reservierte_menge( iv_matnr = <ls_best>-matnr
                                                           iv_werks = <ls_best>-werks
                                                           iv_lgort = <ls_best>-lgort ).
      <ls_best>-verfuegbar = <ls_best>-labst - <ls_best>-reserviert.
      <ls_best>-ampel = COND #( WHEN <ls_best>-verfuegbar <= 0 THEN '1'
                                WHEN <ls_best>-verfuegbar < <ls_best>-labst / 5 THEN '2'
                                ELSE '3' ).
    ENDLOOP.

*   $inlinecount vor dem Paging
    IF io_tech_request_context->has_inlinecount( ) = abap_true.
      es_response_context-inlinecount = lines( lt_bestand ).
    ENDIF.

*   $orderby
    /iwbep/cl_mgw_data_util=>orderby(
      EXPORTING it_order = it_order
      CHANGING  ct_data  = lt_bestand ).

*   $top / $skip
    lv_top  = io_tech_request_context->get_top( ).
    lv_skip = io_tech_request_context->get_skip( ).
    IF lv_top > 0 OR lv_skip > 0.
      /iwbep/cl_mgw_data_util=>paging(
        EXPORTING is_paging = VALUE #( top = lv_top skip = lv_skip )
        CHANGING  ct_data   = lt_bestand ).
    ENDIF.

    et_entityset = lt_bestand.
  ENDMETHOD.


  METHOD werke_berechtigt.
*   Nur Einzelwerte werden geprueft; Intervalle/Muster werden aufgeloest
    SELECT werks FROM t001w
      WHERE werks IN @it_werk_range
      INTO TABLE @DATA(lt_t001w).

    LOOP AT lt_t001w INTO DATA(ls_t001w).
      AUTHORITY-CHECK OBJECT 'M_MSEG_WMB'
        ID 'ACTVT' FIELD '03'
        ID 'WERKS' FIELD ls_t001w-werks.
      IF sy-subrc = 0.
        APPEND VALUE #( sign = 'I' option = 'EQ' low = ls_t001w-werks ) TO rt_werke.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.

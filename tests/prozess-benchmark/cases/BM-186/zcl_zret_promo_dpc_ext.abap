CLASS zcl_zret_promo_dpc_ext IMPLEMENTATION.
*----------------------------------------------------------------------*
* OData-Service ZRET_PROMO_SRV - Filial-App "Aktionen"
* Entity PromotionSet: laufende und geplante Werbeaktionen je Filiale
* 2019-05 MHO  Ersterstellung
* 2021-02 TKR  Filter AKTIV (nur heute laufende Aktionen)
*----------------------------------------------------------------------*
  METHOD promotionset_get_entityset.
    DATA: lt_werks TYPE RANGE OF werks_d,
          lv_where TYPE string.

    DATA(lt_filter) = io_tech_request_context->get_filter( )->get_filter_select_options( ).

    LOOP AT lt_filter INTO DATA(ls_filter).
      CASE ls_filter-property.
        WHEN 'WERKS'.
          lt_werks = CORRESPONDING #( ls_filter-select_options ).
        WHEN 'AKTIV'.
          lv_where = |a~ab_datum <= '{ sy-datum }' AND a~bis_datum >= '{ sy-datum }'|.
        WHEN OTHERS.
          RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
            EXPORTING
              textid = /iwbep/cx_mgw_busi_exception=>filter_not_supported.
      ENDCASE.
    ENDLOOP.

    IF lt_werks IS INITIAL.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          message = 'Filter WERKS ist Pflicht'.
    ENDIF.

*   Nur Filialen, für die der Benutzer Anzeigeberechtigung hat
    LOOP AT lt_werks INTO DATA(ls_werks).
      AUTHORITY-CHECK OBJECT 'M_MATE_WRK'
        ID 'ACTVT' FIELD '03'
        ID 'WERKS' FIELD ls_werks-low.
      IF sy-subrc <> 0.
        DELETE lt_werks.
      ENDIF.
    ENDLOOP.

    IF lt_werks IS INITIAL.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          message = 'Keine Berechtigung für die angefragten Filialen'.
    ENDIF.

    SELECT a~aktnr, a~akttext, a~ab_datum, a~bis_datum,
           f~werks, a~rabatt_proz
      FROM zret_aktion AS a
      INNER JOIN zret_akt_fil AS f ON f~aktnr = a~aktnr
      WHERE f~werks IN @lt_werks
        AND (lv_where)
      ORDER BY a~ab_datum, a~aktnr
      INTO CORRESPONDING FIELDS OF TABLE @et_entityset.

*   Paging ($skip/$top) - manuell, da Join
    IF is_paging-top > 0.
      DATA(lv_ab) = is_paging-skip + is_paging-top + 1.
      DELETE et_entityset FROM lv_ab.
    ENDIF.
    IF is_paging-skip > 0.
      DELETE et_entityset TO is_paging-skip.
    ENDIF.

    IF io_tech_request_context->has_inlinecount( ) = abap_true.
      es_response_context-inlinecount = lines( et_entityset ).
    ENDIF.
*   es_response_context-count = lines( et_entityset ).   "alt, $count
  ENDMETHOD.
ENDCLASS.

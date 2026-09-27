*"* BAdI-Implementierung ZEI_FT_EMBARGO_DEFAULT zu BAdI ZBADI_FT_EMBARGO
*"* als Standardimplementierung gekennzeichnet (Länder ohne eigene
*"* Implementierung): Prüfung gegen Embargo-Länderliste ZFT_EMBARGO_LAND
CLASS zcl_ft_embargo_default DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_badi_interface.
    INTERFACES zif_ft_embargo.

  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.



CLASS zcl_ft_embargo_default IMPLEMENTATION.

  METHOD zif_ft_embargo~pruefen.

    CLEAR ev_sperre.

    SELECT SINGLE embargo_art FROM zft_embargo_land
      WHERE land1      = @iv_land1
        AND gueltig_ab <= @sy-datum
      INTO @DATA(lv_art).
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.

    CASE lv_art.
      WHEN 'T'.
*       Totalembargo
        ev_sperre = abap_true.
        APPEND VALUE #( type = 'A' id = 'ZFT' number = '155'
                        message_v1 = iv_land1 ) TO ct_meldung.

      WHEN 'W'.
*       Waffenembargo: nur Positionen mit Rüstungsgut-Kennzeichen
        LOOP AT it_vbap INTO DATA(ls_vbap) WHERE updkz <> 'D'.
          SELECT SINGLE zz_ruestung FROM mara
            WHERE matnr = @ls_vbap-matnr
            INTO @DATA(lv_ruestung).
          IF sy-subrc = 0 AND lv_ruestung = abap_true.
            ev_sperre = abap_true.
            APPEND VALUE #( type = 'W' id = 'ZFT' number = '156'
                            message_v1 = ls_vbap-posnr ) TO ct_meldung.
          ENDIF.
        ENDLOOP.

      WHEN OTHERS.
*       'B' = Beobachtung: früher Mail an Exportkontrolle, seit 2019 ohne Wirkung
    ENDCASE.

*   Anbindung SAP GTS - Projekt 2020 gestoppt, nie produktiv
*    CALL FUNCTION '/SAPSLL/API_6800_SYNCH_MASS'
*      EXPORTING
*        is_api6800_head = ls_head
*      TABLES
*        it_api6800_item = lt_item.

  ENDMETHOD.

ENDCLASS.

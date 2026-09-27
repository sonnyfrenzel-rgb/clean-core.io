*"* BAdI-Implementierung ZEI_FT_EMBARGO_RU zu BAdI ZBADI_FT_EMBARGO
*"* Filterwerte der Implementierung: LAND1 = 'RU', LAND1 = 'BY'
*"* Sanktionierte Waren nach Warennummer (Anhang VO (EU) 833/2014)
CLASS zcl_ft_embargo_ru DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_badi_interface.
    INTERFACES zif_ft_embargo.

  PROTECTED SECTION.
  PRIVATE SECTION.
    TYPES: BEGIN OF ty_marc,
             matnr TYPE matnr,
             werks TYPE werks_d,
             stawn TYPE stawn,
           END OF ty_marc.
ENDCLASS.



CLASS zcl_ft_embargo_ru IMPLEMENTATION.

  METHOD zif_ft_embargo~pruefen.
*   IMPORTING is_vbak TYPE vbak, it_vbap TYPE va_vbapvb_t, iv_land1 TYPE land1
*   EXPORTING ev_sperre TYPE abap_bool
*   CHANGING  ct_meldung TYPE bapiret2_t

    DATA lt_marc TYPE SORTED TABLE OF ty_marc WITH UNIQUE KEY matnr werks.

    CLEAR ev_sperre.

*   Sanktionsliste: Warennummern-Muster je Land, z. B. '8471*'
    SELECT stawn_muster, sanktion_art
      FROM zft_sanktion
      WHERE land1      = @iv_land1
        AND gueltig_ab <= @sy-datum
      INTO TABLE @DATA(lt_sanktion).
    IF lt_sanktion IS INITIAL.
      RETURN.
    ENDIF.

    SELECT matnr, werks, stawn
      FROM marc
      FOR ALL ENTRIES IN @it_vbap
      WHERE matnr = @it_vbap-matnr
        AND werks = @it_vbap-werks
      INTO TABLE @lt_marc.

    LOOP AT it_vbap INTO DATA(ls_vbap) WHERE updkz <> 'D'.

      CHECK ls_vbap-abgru IS INITIAL.        "abgesagte Positionen nicht prüfen

      READ TABLE lt_marc INTO DATA(ls_marc)
        WITH TABLE KEY matnr = ls_vbap-matnr
                       werks = ls_vbap-werks.
      IF sy-subrc <> 0 OR ls_marc-stawn IS INITIAL.
*       ohne Warennummer keine Aussage möglich -> vorsorglich sperren
        ev_sperre = abap_true.
        APPEND VALUE #( type = 'W' id = 'ZFT' number = '153'
                        message_v1 = ls_vbap-posnr ) TO ct_meldung.
        CONTINUE.
      ENDIF.

      LOOP AT lt_sanktion INTO DATA(ls_sanktion).
        IF ls_marc-stawn CP ls_sanktion-stawn_muster.
          ev_sperre = abap_true.
          APPEND VALUE #( type       = COND #( WHEN ls_sanktion-sanktion_art = 'T' THEN 'A' ELSE 'W' )
                          id         = 'ZFT'
                          number     = '154'
                          message_v1 = ls_vbap-posnr
                          message_v2 = ls_marc-stawn ) TO ct_meldung.
          EXIT.
        ENDIF.
      ENDLOOP.

    ENDLOOP.

  ENDMETHOD.

ENDCLASS.

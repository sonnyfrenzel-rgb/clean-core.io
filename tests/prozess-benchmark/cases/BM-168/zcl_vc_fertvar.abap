CLASS zcl_vc_fertvar DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
*----------------------------------------------------------------------*
* Fertigungsvariante und Plangruppe aus der Konfiguration einer
* Kundenauftragsposition ableiten (Antriebe, Variantenmaterial ANTRIEB-KMAT)
* Aufruf aus Z-Auftragsfreigabe und aus der Arbeitsvorbereitung
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_ergebnis,
             fertvar TYPE zvc_fertvar-fertvar,
             plnnr   TYPE zvc_fertvar-plnnr,
             hinweis TYPE string,
           END OF ty_ergebnis.
    METHODS ermitteln
      IMPORTING iv_vbeln      TYPE vbap-vbeln
                iv_posnr      TYPE vbap-posnr
      RETURNING VALUE(rs_erg) TYPE ty_ergebnis
      RAISING   zcx_vc_fertvar.
  PRIVATE SECTION.
    DATA mt_conf TYPE STANDARD TABLE OF conf_out WITH DEFAULT KEY.
ENDCLASS.


CLASS zcl_vc_fertvar IMPLEMENTATION.

  METHOD ermitteln.
    SELECT SINGLE cuobj FROM vbap INTO @DATA(lv_cuobj)
      WHERE vbeln = @iv_vbeln
        AND posnr = @iv_posnr.
    IF lv_cuobj IS INITIAL.
      RAISE EXCEPTION TYPE zcx_vc_fertvar
        EXPORTING textid = zcx_vc_fertvar=>nicht_konfiguriert.
    ENDIF.

    CLEAR mt_conf.
    CALL FUNCTION 'VC_I_GET_CONFIGURATION'
      EXPORTING
        instance           = lv_cuobj
      TABLES
        configuration      = mt_conf
      EXCEPTIONS
        instance_not_found = 1
        internal_error     = 2
        OTHERS             = 3.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_vc_fertvar
        EXPORTING textid = zcx_vc_fertvar=>konfig_fehlt.
    ENDIF.

*   Spannung ist Pflichtmerkmal, Gehaeuse und ATEX optional
    TRY.
        DATA(lv_spannung) = mt_conf[ atnam = 'Z_SPANNUNG' ]-atwrt.
      CATCH cx_sy_itab_line_not_found.
        RAISE EXCEPTION TYPE zcx_vc_fertvar
          EXPORTING textid = zcx_vc_fertvar=>merkmal_fehlt.
    ENDTRY.
    DATA(lv_gehaeuse) = VALUE #( mt_conf[ atnam = 'Z_GEHAEUSE' ]-atwrt OPTIONAL ).
    DATA(lv_atex)     = xsdbool( line_exists( mt_conf[ atnam = 'Z_ATEX' atwrt = 'J' ] ) ).

    rs_erg-fertvar = SWITCH #( lv_spannung
                       WHEN '230' THEN 'N1'
                       WHEN '400' THEN 'N3'
                       WHEN '690' THEN 'H3'
                       ELSE 'SO' ).
    IF lv_atex = abap_true.
      rs_erg-fertvar+1(1) = 'X'.
      rs_erg-hinweis = 'ATEX-Ausfuehrung: Pruefplan EX01 zwingend'.
    ENDIF.
    IF lv_gehaeuse = 'EDELSTAHL' AND rs_erg-fertvar <> 'SO'.
      rs_erg-fertvar = rs_erg-fertvar && 'E'.
    ENDIF.

    SELECT SINGLE plnnr FROM zvc_fertvar INTO @rs_erg-plnnr
      WHERE fertvar = @rs_erg-fertvar.
    IF sy-subrc <> 0.
      rs_erg-hinweis = |Keine Plangruppe zu { rs_erg-fertvar }, bitte manuell zuordnen|.
    ENDIF.
  ENDMETHOD.

ENDCLASS.

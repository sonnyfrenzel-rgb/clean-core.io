*&---------------------------------------------------------------------*
*& Include ZFT_PRAEFERENZ_F01 - Selektion, Sicherung, Ausgabe
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  MATERIALIEN_LESEN
*&---------------------------------------------------------------------*
*       Fertigerzeugnisse des Werks und bisheriges Ergebnis
*----------------------------------------------------------------------*
FORM materialien_lesen.
  SELECT m~matnr, m~stawn, a~mtart
    FROM marc AS m
    INNER JOIN mara AS a ON a~matnr = m~matnr
    WHERE m~werks = @p_werks
      AND m~matnr IN @s_matnr
      AND a~mtart = 'FERT'
    INTO CORRESPONDING FIELDS OF TABLE @gt_mat.
  CHECK gt_mat IS NOT INITIAL.

  SELECT matnr, ursprung FROM zft_praef_erg
    FOR ALL ENTRIES IN @gt_mat
    WHERE matnr = @gt_mat-matnr
      AND werks = @p_werks
    INTO TABLE @gt_alt.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  ERGEBNISSE_SICHERN
*&---------------------------------------------------------------------*
*       Ergebnis fortschreiben; Verlust des Ursprungs -> Workflow Zoll
*----------------------------------------------------------------------*
FORM ergebnisse_sichern.
  DATA lt_db TYPE STANDARD TABLE OF zft_praef_erg.

  lt_db = VALUE #( FOR e IN gt_erg ( mandt    = sy-mandt
                                     matnr    = e-matnr
                                     werks    = p_werks
                                     ursprung = e-ursprung
                                     anteil   = e-anteil
                                     grund    = e-grund
                                     stichtag = p_stich
                                     aenam    = sy-uname
                                     aedat    = sy-datum ) ).
  MODIFY zft_praef_erg FROM TABLE lt_db.

  LOOP AT gt_erg INTO DATA(ls_erg) WHERE verloren = abap_true.
    DATA(lv_key) = CONV swo_typeid( |{ ls_erg-matnr }{ p_werks }| ).
    CALL FUNCTION 'SWE_EVENT_CREATE'
      EXPORTING
        objtype           = 'ZFTPRAEF'
        objkey            = lv_key
        event             = 'PRAEFERENZ_VERLOREN'
      EXCEPTIONS
        objtype_not_found = 1
        OTHERS            = 2.
    IF sy-subrc <> 0.
      MESSAGE i010 WITH ls_erg-matnr.      "Ereignis nicht erzeugt
    ENDIF.
  ENDLOOP.

  COMMIT WORK.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  AUSGABE
*&---------------------------------------------------------------------*
FORM ausgabe.
  DATA ls_erg TYPE ty_erg.

  SORT gt_erg BY stawn matnr.
  LOOP AT gt_erg INTO ls_erg.
    AT NEW stawn.
      SKIP.
      WRITE: / 'Warennummer', ls_erg-stawn COLOR COL_GROUP.
    ENDAT.
    WRITE: /3 ls_erg-matnr, ls_erg-ursprung, ls_erg-alt,
              ls_erg-anteil, ls_erg-grund.
    IF ls_erg-verloren = abap_true.
      WRITE: 'PRAEFERENZ VERLOREN' COLOR COL_NEGATIVE.
    ENDIF.
  ENDLOOP.

  DATA(lv_anz) = REDUCE i( INIT n = 0
                           FOR e IN gt_erg WHERE ( ursprung = abap_true )
                           NEXT n = n + 1 ).
  ULINE.
  WRITE: / lv_anz, 'von', lines( gt_erg ), 'Materialien mit Praeferenzursprung'.
ENDFORM.

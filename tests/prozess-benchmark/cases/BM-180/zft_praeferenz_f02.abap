*&---------------------------------------------------------------------*
*& Include ZFT_PRAEFERENZ_F02 - Schalter, Altlogik
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  SCHALTER_PRUEFEN
*&---------------------------------------------------------------------*
*       Waehrend der jaehrlichen Lieferantenerklaerungs-Kampagne wird die
*       Kalkulation gesperrt (TVARVC ZFT_PRAEF_AKTIV <> X).
*----------------------------------------------------------------------*
FORM schalter_pruefen.
  SELECT SINGLE low FROM tvarvc INTO @DATA(lv_aktiv)
    WHERE name = 'ZFT_PRAEF_AKTIV'
      AND type = 'P'
      AND numb = '0000'.
  IF lv_aktiv <> 'X' AND sy-uname <> 'ZOLL_ADMIN'.
    MESSAGE s005 DISPLAY LIKE 'W'.         "Kalkulation derzeit gesperrt
    LEAVE PROGRAM.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  KUMULIERUNG_ALT
*&---------------------------------------------------------------------*
*       Programm von 2009: diagonale Kumulierung Pan-Euro-Med ueber
*       Ursprungsland der Lieferantenerklaerung. Seit 2015 ersetzt
*       durch LCL_KALKULATION; nicht mehr aufgerufen.
*----------------------------------------------------------------------*
FORM kumulierung_alt USING    uv_matnr    TYPE matnr
                     CHANGING cv_ursprung TYPE abap_bool.
  DATA lt_laender TYPE STANDARD TABLE OF land1.

  IF 1 = 2.
    MESSAGE e030.                          "Verwendungsnachweis
  ENDIF.

  SELECT land1 FROM zft_kumulierung INTO TABLE lt_laender
    WHERE zone = 'PEM'.

  SELECT SINGLE ursprungsland FROM zft_le INTO @DATA(lv_land)
    WHERE matnr = @uv_matnr.
  IF sy-subrc = 0 AND line_exists( lt_laender[ table_line = lv_land ] ).
    cv_ursprung = abap_true.
  ELSE.
    cv_ursprung = abap_false.
  ENDIF.
ENDFORM.

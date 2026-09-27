*----------------------------------------------------------------------*
***INCLUDE ZISU_ABLUPLOAD_F01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  DATEI_LESEN
*&---------------------------------------------------------------------*
*       CSV vom Applikationsserver in GT_SATZ laden
*----------------------------------------------------------------------*
FORM datei_lesen.
  DATA lv_zeile TYPE string.

  OPEN DATASET p_file FOR INPUT IN TEXT MODE ENCODING DEFAULT.
  IF sy-subrc <> 0.
    MESSAGE e011 WITH p_file.
  ENDIF.
  DO.
    READ DATASET p_file INTO lv_zeile.
    IF sy-subrc <> 0.
      EXIT.
    ENDIF.
    CLEAR gs_satz.
    SPLIT lv_zeile AT ';' INTO gs_satz-equnr gs_satz-zwnummer
                               gs_satz-adat_c gs_satz-stand_c
                               gs_satz-hinweis.
    APPEND gs_satz TO gt_satz.
  ENDDO.
  CLOSE DATASET p_file.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  SATZ_PRUEFEN
*&---------------------------------------------------------------------*
*       Umsetzung und Plausibilisierung eines Ablesesatzes
*       CV_MSGNO leer = Satz ok
*----------------------------------------------------------------------*
FORM satz_pruefen USING    us_satz  TYPE ty_satz
                  CHANGING cv_msgno TYPE symsgno.
  DATA: lt_alt    TYPE STANDARD TABLE OF ty_alt,
        lv_tv_neu TYPE p LENGTH 13 DECIMALS 3,
        lv_tv_alt TYPE p LENGTH 13 DECIMALS 3,
        lv_abw    TYPE p LENGTH 9 DECIMALS 1.

  CLEAR cv_msgno.

* Datum TT.MM.JJJJ und Stand umsetzen (US_SATZ ist GS_SATZ!)
  TRY.
      gs_satz-adat  = |{ us_satz-adat_c+6(4) }{ us_satz-adat_c+3(2) }{ us_satz-adat_c(2) }|.
      gs_satz-stand = us_satz-stand_c.
    CATCH cx_sy_conversion_no_number.
      cv_msgno = '030'.
      RETURN.
  ENDTRY.

  IF gs_satz-adat > sy-datum.
    cv_msgno = '031'.
    RETURN.
  ENDIF.

  SELECT SINGLE equnr FROM equi INTO @DATA(lv_equnr)
    WHERE equnr = @us_satz-equnr.
  IF sy-subrc <> 0.
    cv_msgno = '032'.
    RETURN.
  ENDIF.

  SELECT adat, v_zwstand FROM eabl
    WHERE equnr    = @us_satz-equnr
      AND zwnummer = @us_satz-zwnummer
    ORDER BY adat DESCENDING
    INTO TABLE @lt_alt
    UP TO 2 ROWS.

  IF lt_alt IS NOT INITIAL AND gs_satz-stand < lt_alt[ 1 ]-v_zwstand.
*   Zaehlerruecklauf - Ueberlauf wird bewusst NICHT erkannt (2016)
    cv_msgno = '033'.
    RETURN.
  ENDIF.

* Tagesverbrauch neu gegen Tagesverbrauch der Vorperiode
  IF lines( lt_alt ) = 2 AND gs_satz-adat > lt_alt[ 1 ]-adat
     AND lt_alt[ 1 ]-v_zwstand > lt_alt[ 2 ]-v_zwstand.
    lv_tv_neu = ( gs_satz-stand - lt_alt[ 1 ]-v_zwstand )
                / ( gs_satz-adat - lt_alt[ 1 ]-adat ).
    lv_tv_alt = ( lt_alt[ 1 ]-v_zwstand - lt_alt[ 2 ]-v_zwstand )
                / ( lt_alt[ 1 ]-adat - lt_alt[ 2 ]-adat ).
    lv_abw = abs( lv_tv_neu - lv_tv_alt ) * 100 / lv_tv_alt.
    IF lv_abw > p_tol.
      WRITE: / us_satz-equnr, us_satz-adat_c, 'Warnung Tagesverbrauch', lv_abw, '%'.
*     cv_msgno = '034'.   "2017: nur Warnung, Ablesefirma liefert zu viele Ausreisser
    ENDIF.
  ENDIF.
ENDFORM.

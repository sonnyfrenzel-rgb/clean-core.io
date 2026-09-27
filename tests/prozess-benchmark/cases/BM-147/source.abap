*----------------------------------------------------------------------*
*   INCLUDE ZPTEXIT_FUNCZNZ
*   Kundenfunktion ZNZ der Zeitauswertung (RPTIME00, Schema ZM04,
*   Teilschema ZTNZ nach Regel ZTP2): Nachtzuschlag 22:00-06:00
*   je Anwesenheits-Zeitpaar aus TIP -> Zeitlohnart in ZL
*   2008-10 HR-IT  Anlage
*   2009-12 HR-IT  ZES-Buchung abgeschaltet, nur noch ZL
*   2017-04 HR-IT  Dauernachtschicht mit eigener Lohnart
*----------------------------------------------------------------------*
FORM funcznz.
  DATA: ls_cust  TYPE zpt_nz_cust,
        lv_beg   TYPE t,
        lv_end   TYPE t,
        lv_min   TYPE i,
        lv_total TYPE i.

* Zuschlagsregel je Personalbereich/-teilbereich
  SELECT SINGLE * FROM zpt_nz_cust INTO ls_cust
    WHERE werks = p0001-werks
      AND btrtl = p0001-btrtl
      AND begda <= datum
      AND endda >= datum.
  IF sy-subrc <> 0.
*   kein Zuschlag fuer diesen Bereich vereinbart
    EXIT.
  ENDIF.

  LOOP AT tip.
    CHECK tip-abwkz IS INITIAL.
    lv_min = 0.
*   Anteil nach 22:00
    IF tip-endtm > '220000'.
      lv_beg = COND t( WHEN tip-begtm > '220000' THEN tip-begtm
                       ELSE '220000' ).
      lv_min = lv_min + ( tip-endtm - lv_beg ) / 60.
    ENDIF.
*   Anteil vor 06:00
    IF tip-begtm < '060000'.
      lv_end = COND t( WHEN tip-endtm < '060000' THEN tip-endtm
                       ELSE '060000' ).
      lv_min = lv_min + ( lv_end - tip-begtm ) / 60.
    ENDIF.
*   Mindestdauer lt. Betriebsvereinbarung
    IF lv_min < ls_cust-minmin.
      CONTINUE.
    ENDIF.
    lv_total = lv_total + lv_min.
  ENDLOOP.

  IF lv_total = 0.
    EXIT.
  ENDIF.

  CLEAR zl.
  zl-datum = datum.
  zl-lgart = ls_cust-lgart.
  zl-anzhl = lv_total / 60.
  IF p0007-schkz(2) = 'NS'.
*   Dauernachtschicht: erhoehter Satz ueber eigene Lohnart
    zl-lgart = ls_cust-lgart_ns.
  ENDIF.
  APPEND zl.

  IF 1 = 2.
*   alte Logik bis 2009: Zuschlag als Zeitsaldo in ZES
    PERFORM add_zes_nz USING lv_total.
  ENDIF.
ENDFORM.

*----------------------------------------------------------------------*
FORM add_zes_nz USING pv_min TYPE i.
  CLEAR zes.
  zes-ztart = '0950'.
  zes-anzhl = pv_min / 60.
  APPEND zes.
ENDFORM.

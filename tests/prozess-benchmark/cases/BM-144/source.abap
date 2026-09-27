REPORT ztv_open_trips_aging.
* Reisekosten: genehmigte, aber noch nicht abgerechnete Reisen (Altersliste)
* ANTRG '4' = genehmigt, ABREC '1' = abzurechnen (lt. Customizing Kunde)
PARAMETERS p_days TYPE i DEFAULT 30.

AT SELECTION-SCREEN ON p_days.
  IF p_days < 1 OR p_days > 365.
    MESSAGE e010(ztv) WITH p_days.
  ENDIF.

START-OF-SELECTION.
  DATA(lv_limit) = CONV d( sy-datum - p_days ).
  SELECT h~pernr, h~reinr, h~datb1
    FROM ptrv_head AS h
    INNER JOIN ptrv_perio AS p
      ON p~pernr = h~pernr AND p~reinr = h~reinr
    WHERE p~antrg = '4'
      AND p~abrec = '1'
      AND h~datb1 <= @lv_limit
    INTO TABLE @DATA(lt_trips).
  LOOP AT lt_trips INTO DATA(ls_trip).
    DATA(lv_age) = CONV i( sy-datum - ls_trip-datb1 ).
    DATA(lv_flag) = COND string( WHEN lv_age > 90 THEN 'KRITISCH'
                                 WHEN lv_age > 60 THEN 'WARNUNG'
                                 ELSE 'OFFEN' ).
    WRITE: / ls_trip-pernr, ls_trip-reinr, ls_trip-datb1, lv_age, lv_flag.
  ENDLOOP.

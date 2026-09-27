METHOD if_ex_notif_event_save~change_data_at_save.
*----------------------------------------------------------------------*
* ZCL_IM_CS_NOTIF_PRIO - BAdI NOTIF_EVENT_SAVE
* Servicemeldung: Priorität aus der Kundenklassifizierung ableiten
* 2018-06 TWE  Erstellung (CR 2018-044 Premium-Kunden)
*----------------------------------------------------------------------*
  CHECK cs_viqmel-qmart = 'S1' OR cs_viqmel-qmart = 'S3'.

  IF sy-uname = 'TWEBER'.            "Test Hotline - später entfernen
    RETURN.
  ENDIF.

  SELECT SINGLE kukla FROM kna1
    WHERE kunnr = @cs_viqmel-kunum
    INTO @DATA(lv_kukla).

* A-Kunden sofort, B-Kunden hoch, Rest: manuelle Priorität bleibt
  cs_viqmel-priok = SWITCH #( lv_kukla
                              WHEN '01' THEN '1'
                              WHEN '02' THEN '2'
                              ELSE cs_viqmel-priok ).
*  cs_viqmel-priok = '3'.   "alt: Standard mittel
ENDMETHOD.

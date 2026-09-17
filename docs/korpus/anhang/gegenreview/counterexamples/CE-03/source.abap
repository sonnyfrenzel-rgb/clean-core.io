REPORT zce_client.
PARAMETERS p_kunnr TYPE c LENGTH 10.
DATA lv_name TYPE c LENGTH 35.
START-OF-SELECTION.
  SELECT SINGLE name1 INTO lv_name FROM kna1 CLIENT SPECIFIED
    WHERE mandt = sy-mandt AND kunnr = p_kunnr.
  WRITE / lv_name.

REPORT zcc_ref_028.
PARAMETERS p_auart TYPE c LENGTH 4 DEFAULT 'TA'.
PARAMETERS p_kunnr TYPE c LENGTH 10.
DATA ls_header TYPE bapisdhd1.
DATA lt_partners TYPE STANDARD TABLE OF bapiparnr.
DATA lt_return TYPE STANDARD TABLE OF bapiret2.
DATA lv_vbeln TYPE bapivbeln-vbeln.
START-OF-SELECTION.
  ls_header-doc_type = p_auart.
  APPEND VALUE #( partn_role = 'AG' partn_numb = p_kunnr ) TO lt_partners.
  CALL FUNCTION 'BAPI_SALESORDER_CREATEFROMDAT2'
    EXPORTING order_header_in = ls_header
    IMPORTING salesdocument   = lv_vbeln
    TABLES    return          = lt_return
              order_partners  = lt_partners.
  IF line_exists( lt_return[ type = 'E' ] ).
    WRITE / 'ERROR'.
    RETURN.
  ENDIF.
  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
    EXPORTING wait = 'X'.
  WRITE: / 'CREATED', lv_vbeln.

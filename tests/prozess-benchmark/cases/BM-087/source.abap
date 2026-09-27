REPORT zmm_send_vendor_idoc.
* Versand geänderter Kreditoren an Alt-System (Tochter AT)
PARAMETERS: p_mestyp TYPE edi_mestyp DEFAULT 'ZCREMAS',
            p_rcvprn TYPE edi_rcvprn DEFAULT 'LEGACYAP',
            p_test   AS CHECKBOX.

DATA: lt_cp      TYPE STANDARD TABLE OF bdcp,
      ls_cp      TYPE bdcp,
      lt_cpident TYPE STANDARD TABLE OF bdicpident,
      ls_cpident TYPE bdicpident,
      lt_lifnr   TYPE SORTED TABLE OF lifnr WITH UNIQUE KEY table_line,
      lv_lifnr   TYPE lifnr,
      ls_lfa1    TYPE lfa1,
      ls_seg     TYPE ze1vendor,
      ls_control TYPE edidc,
      lt_comm    TYPE STANDARD TABLE OF edidc,
      lt_data    TYPE STANDARD TABLE OF edidd,
      ls_data    TYPE edidd,
      lv_sent    TYPE i.

START-OF-SELECTION.
  CALL FUNCTION 'CHANGE_POINTERS_READ'
    EXPORTING
      message_type                = p_mestyp
      read_not_processed_pointers = 'X'
    TABLES
      change_pointers             = lt_cp
    EXCEPTIONS
      error_in_date_interval      = 1
      error_in_time_interval      = 2
      OTHERS                      = 3.
  IF sy-subrc <> 0 OR lt_cp IS INITIAL.
    MESSAGE s000(zale) WITH 'Keine Änderungen für' p_mestyp.
    RETURN.
  ENDIF.

* Mehrere Zeiger je Kreditor -> ein IDoc
  LOOP AT lt_cp INTO ls_cp.
    lv_lifnr = ls_cp-cdobjid.
    INSERT lv_lifnr INTO TABLE lt_lifnr.
    ls_cpident-cpident = ls_cp-cpident.
    APPEND ls_cpident TO lt_cpident.
  ENDLOOP.

  LOOP AT lt_lifnr INTO lv_lifnr.
    SELECT SINGLE * FROM lfa1 INTO ls_lfa1 WHERE lifnr = lv_lifnr.
    IF sy-subrc <> 0 OR ls_lfa1-loevm = 'X'.
      CONTINUE.                      "gelöschte Kreditoren nicht senden
    ENDIF.
    CLEAR: ls_seg, lt_data, ls_data.
    ls_seg-lifnr = ls_lfa1-lifnr.
    ls_seg-name1 = ls_lfa1-name1.
    ls_seg-stras = ls_lfa1-stras.
    ls_seg-pstlz = ls_lfa1-pstlz.
    ls_seg-ort01 = ls_lfa1-ort01.
    ls_seg-land1 = ls_lfa1-land1.
    ls_seg-stceg = ls_lfa1-stceg.
    ls_data-segnam = 'ZE1VENDOR'.
    ls_data-sdata  = ls_seg.
    APPEND ls_data TO lt_data.

    IF p_test = 'X'.
      WRITE: / 'Test:', ls_lfa1-lifnr, ls_lfa1-name1.
      CONTINUE.
    ENDIF.

    CLEAR: ls_control, lt_comm.
    ls_control-mestyp = p_mestyp.
    ls_control-idoctp = 'ZVENDOR01'.
    ls_control-rcvprt = 'LS'.
    ls_control-rcvprn = p_rcvprn.
    CALL FUNCTION 'MASTER_IDOC_DISTRIBUTE'
      EXPORTING
        master_idoc_control            = ls_control
      TABLES
        communication_idoc_control     = lt_comm
        master_idoc_data               = lt_data
      EXCEPTIONS
        error_in_idoc_control          = 1
        error_writing_idoc_status      = 2
        error_in_idoc_data             = 3
        sending_logical_system_unknown = 4
        OTHERS                         = 5.
    IF sy-subrc = 0.
      lv_sent = lv_sent + 1.
    ELSE.
      WRITE: / 'Fehler beim Senden', ls_lfa1-lifnr.
    ENDIF.
  ENDLOOP.

  IF p_test IS INITIAL.
    CALL FUNCTION 'CHANGE_POINTERS_STATUS_WRITE'
      EXPORTING
        message_type           = p_mestyp
      TABLES
        change_pointers_idents = lt_cpident.
    COMMIT WORK.
  ENDIF.
  WRITE: / lv_sent, 'Kreditoren gesendet'.

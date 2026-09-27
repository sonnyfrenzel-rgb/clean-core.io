REPORT zarch_iflog_write.
* Archivierungsobjekt ZIF_LOG - Schreibprogramm
TABLES zif_log_hdr.
SELECT-OPTIONS s_ifid FOR zif_log_hdr-if_id.
PARAMETERS: p_days TYPE i DEFAULT 180,
            p_test AS CHECKBOX DEFAULT 'X',
            p_comm TYPE admi_text.

DATA: lv_handle TYPE sy-tabix,
      lt_hdr    TYPE STANDARD TABLE OF zif_log_hdr,
      ls_hdr    TYPE zif_log_hdr,
      lt_itm    TYPE STANDARD TABLE OF zif_log_itm,
      ls_itm    TYPE zif_log_itm,
      lv_cutoff TYPE datum,
      lv_create TYPE c LENGTH 1,
      lv_count  TYPE i.

START-OF-SELECTION.
  AUTHORITY-CHECK OBJECT 'S_ARCHIVE'
    ID 'ACTVT'    FIELD '01'
    ID 'APPLIC'   FIELD 'CA'
    ID 'ARCH_OBJ' FIELD 'ZIF_LOG'.
  IF sy-subrc <> 0.
    MESSAGE e010(zarch).
  ENDIF.

  lv_cutoff = sy-datum - p_days.
* nur abgeschlossene (C) oder abgebrochene (X) Protokolle
  SELECT * FROM zif_log_hdr INTO TABLE lt_hdr
    WHERE if_id IN s_ifid
      AND erdat < lv_cutoff
      AND status IN ('C', 'X').
  IF lt_hdr IS INITIAL.
    MESSAGE s011(zarch).
    RETURN.
  ENDIF.

  lv_create = xsdbool( p_test IS INITIAL ).
  CALL FUNCTION 'ARCHIVE_OPEN_FOR_WRITE'
    EXPORTING
      create_archive_file = lv_create
      object              = 'ZIF_LOG'
      comments            = p_comm
    IMPORTING
      archive_handle      = lv_handle.

  LOOP AT lt_hdr INTO ls_hdr.
    CALL FUNCTION 'ARCHIVE_NEW_OBJECT'
      EXPORTING
        archive_handle = lv_handle
        object_id      = ls_hdr-log_id.
    CALL FUNCTION 'ARCHIVE_PUT_RECORD'
      EXPORTING
        archive_handle   = lv_handle
        record_structure = 'ZIF_LOG_HDR'
        record           = ls_hdr.
    SELECT * FROM zif_log_itm INTO TABLE lt_itm
      WHERE log_id = ls_hdr-log_id.
    LOOP AT lt_itm INTO ls_itm.
      CALL FUNCTION 'ARCHIVE_PUT_RECORD'
        EXPORTING
          archive_handle   = lv_handle
          record_structure = 'ZIF_LOG_ITM'
          record           = ls_itm.
    ENDLOOP.
    CALL FUNCTION 'ARCHIVE_SAVE_OBJECT'
      EXPORTING
        archive_handle = lv_handle
      EXCEPTIONS
        file_io_error  = 1
        OTHERS         = 2.
    IF sy-subrc <> 0.
      MESSAGE e012(zarch) WITH ls_hdr-log_id.
    ENDIF.
    lv_count = lv_count + 1.
  ENDLOOP.

  CALL FUNCTION 'ARCHIVE_CLOSE_FILE'
    EXPORTING
      archive_handle = lv_handle.
  WRITE: / lv_count, 'Protokolle archiviert'.
  WRITE: / 'Testmodus:', p_test.

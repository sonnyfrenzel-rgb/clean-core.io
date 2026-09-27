REPORT zmm_check_mat_upload.
* Plausibilisierung Materialanlage-Vorlage aus Stagingtabelle
TYPES: BEGIN OF ty_err,
         matnr TYPE matnr,
         field TYPE fieldname,
       END OF ty_err.
DATA: lt_stage TYPE STANDARD TABLE OF zmm_mat_stage,
      ls_stage TYPE zmm_mat_stage,
      lt_err   TYPE STANDARD TABLE OF ty_err,
      ls_err   TYPE ty_err,
      lv_nerr  TYPE i.

DEFINE mandatory.
  IF ls_stage-&1 IS INITIAL.
    ls_err-matnr = ls_stage-matnr.
    ls_err-field = '&1'.
    APPEND ls_err TO lt_err.
  ENDIF.
END-OF-DEFINITION.

PARAMETERS p_batch TYPE zmm_batch_id OBLIGATORY.

START-OF-SELECTION.
  SELECT * FROM zmm_mat_stage INTO TABLE lt_stage
    WHERE batch_id = p_batch AND status = 'N'.
  LOOP AT lt_stage INTO ls_stage.
    mandatory: mtart, meins, matkl, werks.
  ENDLOOP.
  IF lt_err IS INITIAL.
    UPDATE zmm_mat_stage SET status = 'V'
      WHERE batch_id = p_batch AND status = 'N'.
    WRITE: / 'Vorlage plausibel, Status V gesetzt.'.
  ELSE.
    lv_nerr = lines( lt_err ).
    WRITE: / 'Pflichtfeldfehler:', lv_nerr.
  ENDIF.

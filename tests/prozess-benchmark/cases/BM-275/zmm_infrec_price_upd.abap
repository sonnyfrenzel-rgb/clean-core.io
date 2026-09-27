REPORT zmm_infrec_price_upd.
*----------------------------------------------------------------------*
* Massenaenderung Infosatzpreise (jaehrliche Preisrunde Einkauf)
* Quelle: Staging ZMM_PRICE_STG (Upload per ZMM_PRICE_UPLOAD)
* Pakete je Lieferant -> generische Parallelisierung ZCL_PAR_PROCESSOR
*----------------------------------------------------------------------*
TABLES zmm_price_stg.

TYPES: BEGIN OF ty_out,
         package_id TYPE i,
         lifnr      TYPE lifnr,
         ok_count   TYPE i,
         err_count  TYPE i,
         message    TYPE bapi_msg,
       END OF ty_out.

DATA: gt_stg      TYPE zcl_mm_infrec_price_handler=>ty_t_stg,
      gt_pkg_stg  TYPE zcl_mm_infrec_price_handler=>ty_t_stg,
      gt_packages TYPE zcl_par_processor=>ty_t_package,
      gt_results  TYPE zif_par_package_handler=>ty_t_result,
      gt_out      TYPE STANDARD TABLE OF ty_out,
      gt_lifnr    TYPE SORTED TABLE OF lifnr WITH UNIQUE KEY table_line,
      go_proc     TYPE REF TO zcl_par_processor,
      go_handler  TYPE REF TO zif_par_package_handler,
      gv_pkg_id   TYPE i.

SELECT-OPTIONS: s_ekorg FOR zmm_price_stg-ekorg OBLIGATORY,
                s_lifnr FOR zmm_price_stg-lifnr,
                s_upld  FOR zmm_price_stg-upload_id.
PARAMETERS: p_group TYPE rzlli_apcl DEFAULT 'PARALLEL_MM',
            p_max   TYPE i DEFAULT 5,
            p_seq   AS CHECKBOX.                "Fehlersuche: ohne aRFC

START-OF-SELECTION.
  AUTHORITY-CHECK OBJECT 'M_EINF_EKO'
    ID 'ACTVT' FIELD '02'
    ID 'EKORG' FIELD s_ekorg-low.
  IF sy-subrc <> 0.
    MESSAGE e070(zmm) WITH s_ekorg-low.
  ENDIF.

  SELECT * FROM zmm_price_stg INTO TABLE gt_stg
    WHERE ekorg     IN s_ekorg
      AND lifnr     IN s_lifnr
      AND upload_id IN s_upld
      AND status    = 'N'.
  IF sy-subrc <> 0.
    MESSAGE s071(zmm).
    RETURN.
  ENDIF.

* ein Paket je Lieferant (Sperrkonflikte auf Infosaetzen vermeiden)
  LOOP AT gt_stg INTO DATA(gs_stg).
    INSERT gs_stg-lifnr INTO TABLE gt_lifnr.
  ENDLOOP.

  LOOP AT gt_lifnr INTO DATA(gv_lifnr).
    gv_pkg_id = gv_pkg_id + 1.
    gt_pkg_stg = VALUE #( FOR ls IN gt_stg WHERE ( lifnr = gv_lifnr ) ( ls ) ).
    CALL TRANSFORMATION id SOURCE data = gt_pkg_stg
                           RESULT XML DATA(gv_xml).
    APPEND VALUE #( package_id = gv_pkg_id payload = gv_xml ) TO gt_packages.
    APPEND VALUE #( package_id = gv_pkg_id lifnr = gv_lifnr ) TO gt_out.
  ENDLOOP.

  IF p_seq = abap_true.
    go_handler = NEW zcl_mm_infrec_price_handler( ).
    LOOP AT gt_packages INTO DATA(gs_package).
      APPEND go_handler->process( iv_package_id = gs_package-package_id
                                  iv_payload    = gs_package-payload ) TO gt_results.
    ENDLOOP.
  ELSE.
    go_proc = NEW #( iv_group         = p_group
                     iv_max_tasks     = p_max
                     iv_handler_class = 'ZCL_MM_INFREC_PRICE_HANDLER' ).
    gt_results = go_proc->run( gt_packages ).
  ENDIF.

  PERFORM show_result.

*&---------------------------------------------------------------------*
*&  Form SHOW_RESULT - Ergebnis je Lieferant
*&---------------------------------------------------------------------*
FORM show_result.
  DATA: lt_fcat TYPE slis_t_fieldcat_alv.

  LOOP AT gt_out ASSIGNING FIELD-SYMBOL(<ls_out>).
    READ TABLE gt_results INTO DATA(ls_res)
      WITH KEY package_id = <ls_out>-package_id.
    IF sy-subrc = 0.
      <ls_out>-ok_count  = ls_res-ok_count.
      <ls_out>-err_count = ls_res-err_count.
      <ls_out>-message   = ls_res-message.
    ELSE.
*     Task ohne Rueckmeldung (Systemfehler) - Saetze bleiben Status N
      <ls_out>-message = 'Kein Ergebnis - Saetze bleiben offen'.
    ENDIF.
  ENDLOOP.

  lt_fcat = VALUE #( ( fieldname = 'PACKAGE_ID' seltext_m = 'Paket' )
                     ( fieldname = 'LIFNR'      seltext_m = 'Lieferant' )
                     ( fieldname = 'OK_COUNT'   seltext_m = 'Geaendert' )
                     ( fieldname = 'ERR_COUNT'  seltext_m = 'Fehler' )
                     ( fieldname = 'MESSAGE'    seltext_m = 'Meldung' ) ).

  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      i_callback_program = sy-repid
      it_fieldcat        = lt_fcat
    TABLES
      t_outtab           = gt_out
    EXCEPTIONS
      OTHERS             = 1.
ENDFORM.

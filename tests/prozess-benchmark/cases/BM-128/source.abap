REPORT zfm_mittelvorbindung_anlegen.
*----------------------------------------------------------------------*
* PSM-FM: Mittelvorbindungen aus freigegebenen Beschaffungsanträgen
* (Antragsportal -> ZFM_ANTRAG / ZFM_ANTRAG_POS) anlegen.
* Verfügbarkeit wird vorab gegen die Sicht ZFM_V_VERFUEGBAR geprüft,
* damit die AVC im Standard nicht mit Fehlern abbricht.
* 2018 KOM - Stadtverwaltung, Kämmerei
*----------------------------------------------------------------------*
PARAMETERS: p_fikrs TYPE fikrs OBLIGATORY,
            p_gjahr TYPE gjahr OBLIGATORY,
            p_fistl TYPE fistl.

DATA: gt_antr  TYPE STANDARD TABLE OF zfm_antrag,
      gs_antr  TYPE zfm_antrag,
      gt_pos   TYPE STANDARD TABLE OF zfm_antrag_pos,
      gs_pos   TYPE zfm_antrag_pos,
      gs_kblk  TYPE kblk,
      gt_kblp  TYPE STANDARD TABLE OF kblp,
      gv_where TYPE string,
      gv_verf  TYPE zfm_betrag,
      gv_ok    TYPE abap_bool,
      gv_belnr TYPE kblk-belnr.

START-OF-SELECTION.
  gv_where = COND #( WHEN p_fistl IS INITIAL
                     THEN |fikrs = '{ p_fikrs }' AND gjahr = '{ p_gjahr }' AND status = 'F'|
                     ELSE |fikrs = '{ p_fikrs }' AND gjahr = '{ p_gjahr }' AND status = 'F'| &&
                          | AND fistl = '{ p_fistl }'| ).
  SELECT * FROM zfm_antrag INTO TABLE gt_antr WHERE (gv_where).
  IF gt_antr IS INITIAL.
    MESSAGE e010(zfm) WITH p_fikrs p_gjahr.
  ENDIF.

  SELECT * FROM zfm_antrag_pos INTO TABLE gt_pos
    FOR ALL ENTRIES IN gt_antr
    WHERE antrag_id = gt_antr-antrag_id.

  LOOP AT gt_antr INTO gs_antr.
    CLEAR: gt_kblp, gs_kblk.
    gv_ok = abap_true.
    LOOP AT gt_pos INTO gs_pos WHERE antrag_id = gs_antr-antrag_id.
      SELECT SINGLE verfuegbar FROM zfm_v_verfuegbar INTO gv_verf
        WHERE fikrs = gs_antr-fikrs
          AND gjahr = gs_antr-gjahr
          AND fistl = gs_pos-fistl
          AND fipex = gs_pos-fipex.
      IF gv_verf < gs_pos-betrag.
        gv_ok = abap_false.
        EXIT.
      ENDIF.
      APPEND VALUE #( fistl = gs_pos-fistl fipex = gs_pos-fipex
                      wtges = gs_pos-betrag ptext = gs_pos-text ) TO gt_kblp.
    ENDLOOP.
    IF gv_ok = abap_false.
      WRITE: / gs_antr-antrag_id, 'Mittel nicht ausreichend - zurückgestellt'.
      CONTINUE.
    ENDIF.

    gs_kblk-blart = 'ZV'.
    gs_kblk-bukrs = gs_antr-bukrs.
    gs_kblk-ktext = gs_antr-titel.
    CALL FUNCTION 'FMFR_CREATE_FROM_DATA'
      EXPORTING
        i_kblk         = gs_kblk
      IMPORTING
        e_belnr        = gv_belnr
      TABLES
        t_kblp         = gt_kblp
      EXCEPTIONS
        error_occurred = 1
        OTHERS         = 2.
    IF sy-subrc <> 0.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      WRITE: / gs_antr-antrag_id, 'Fehler bei Anlage', sy-msgid, sy-msgno.
      CONTINUE.
    ENDIF.
    UPDATE zfm_antrag SET status = 'A' belnr = gv_belnr
      WHERE antrag_id = gs_antr-antrag_id.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = 'X'.
    WRITE: / gs_antr-antrag_id, 'Mittelvorbindung', gv_belnr.
  ENDLOOP.

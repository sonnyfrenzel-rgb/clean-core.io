REPORT zpp_rm_upload_datei.
*&---------------------------------------------------------------------*
*& Massenrueckmeldung Fertigungsauftraege aus MES-Exportdatei
*& Dateiformat (;-getrennt): AUFNR;VORNR;GUTMENGE;AUSSCHUSS;MEINH;ENDRM
*& 2012-05 HB  Erstellung
*& 2016-11 HB  Testlauf-Schalter, Rollback je Zeile
*&---------------------------------------------------------------------*
PARAMETERS: p_file TYPE rlgrap-filename LOWER CASE
                   DEFAULT '/usr/sap/interface/mes/rm_in.csv',
            p_test AS CHECKBOX DEFAULT 'X'.

TYPES: BEGIN OF ty_zeile,
         aufnr TYPE aufnr,
         vornr TYPE vornr,
         gut   TYPE c LENGTH 17,
         aus   TYPE c LENGTH 17,
         meinh TYPE meins,
         endrm TYPE c LENGTH 1,
       END OF ty_zeile.

DATA: gt_zeilen TYPE STANDARD TABLE OF ty_zeile,
      gs_zeile  TYPE ty_zeile,
      gv_line   TYPE string,
      gt_tt     TYPE STANDARD TABLE OF bapi_pp_timeticket,
      gs_tt     TYPE bapi_pp_timeticket,
      gs_return TYPE bapiret1,
      gt_detail TYPE STANDARD TABLE OF bapi_coru_return,
      gs_detail TYPE bapi_coru_return,
      gv_ok     TYPE i,
      gv_err    TYPE i.

START-OF-SELECTION.
  OPEN DATASET p_file FOR INPUT IN TEXT MODE ENCODING DEFAULT.
  IF sy-subrc <> 0.
    MESSAGE 'Datei kann nicht geoeffnet werden' TYPE 'S' DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.

  DO.
    READ DATASET p_file INTO gv_line.
    IF sy-subrc <> 0.
      EXIT.
    ENDIF.
    CLEAR gs_zeile.
    SPLIT gv_line AT ';' INTO gs_zeile-aufnr gs_zeile-vornr gs_zeile-gut
                              gs_zeile-aus gs_zeile-meinh gs_zeile-endrm.
    gs_zeile-aufnr = |{ gs_zeile-aufnr ALPHA = IN }|.
    APPEND gs_zeile TO gt_zeilen.
  ENDDO.
  CLOSE DATASET p_file.

  LOOP AT gt_zeilen INTO gs_zeile.
    CLEAR: gs_tt, gt_tt, gt_detail, gs_detail, gs_return.
    gs_tt-orderid        = gs_zeile-aufnr.
    gs_tt-operation      = gs_zeile-vornr.
    gs_tt-yield          = gs_zeile-gut.
    gs_tt-scrap          = gs_zeile-aus.
    gs_tt-conf_quan_unit = gs_zeile-meinh.
    IF gs_zeile-endrm = 'X'.
      gs_tt-fin_conf = 'X'.      " Endrueckmeldung
    ELSE.
      gs_tt-fin_conf = space.    " Teilrueckmeldung
    ENDIF.
    APPEND gs_tt TO gt_tt.

    CALL FUNCTION 'BAPI_PRODORDCONF_CREATE_TT'
      EXPORTING
        testrun       = p_test
      IMPORTING
        return        = gs_return
      TABLES
        timetickets   = gt_tt
        detail_return = gt_detail.

    READ TABLE gt_detail INTO gs_detail WITH KEY type = 'E'.
    IF sy-subrc = 0 OR gs_return-type CA 'EA'.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      gv_err = gv_err + 1.
      WRITE: / gs_zeile-aufnr, gs_zeile-vornr, 'FEHLER', gs_detail-message.
    ELSE.
      IF p_test IS INITIAL.
        CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
          EXPORTING
            wait = 'X'.
      ENDIF.
      gv_ok = gv_ok + 1.
      WRITE: / gs_zeile-aufnr, gs_zeile-vornr, 'OK'.
    ENDIF.
  ENDLOOP.

  ULINE.
  WRITE: / 'Erfolgreich:', gv_ok, 'Fehlerhaft:', gv_err.

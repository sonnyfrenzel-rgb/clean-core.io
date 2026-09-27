*&---------------------------------------------------------------------*
*& Report ZMM_KIT_MANUAL
*&---------------------------------------------------------------------*
*& Manuelles Kitting fuer freigegebene Fertigungsauftraege einer Linie
*& (Rueckfalloesung bei MES-Ausfall, Aufruf durch Schichtleiter)
*&---------------------------------------------------------------------*
REPORT zmm_kit_manual.

TABLES afko.

SELECT-OPTIONS: s_aufnr FOR afko-aufnr,
                s_gstrp FOR afko-gstrp DEFAULT sy-datum.
PARAMETERS:     p_werks TYPE werks_d OBLIGATORY DEFAULT '1000',
                p_fevor TYPE fevor   OBLIGATORY DEFAULT 'L03',
                p_sim   AS CHECKBOX DEFAULT 'X'.

TYPES: BEGIN OF ty_out,
         aufnr TYPE aufnr,
         rsnum TYPE rsnum,
         matnr TYPE matnr,
         msgty TYPE msgty,
         text  TYPE string,
       END OF ty_out.

DATA: gt_orders TYPE STANDARD TABLE OF aufnr,
      gt_out    TYPE STANDARD TABLE OF ty_out,
      gt_res    TYPE zmm_kit_result_t,
      gv_rsnum  TYPE rsnum.

START-OF-SELECTION.
* freigegebene (I0002), nicht technisch abgeschlossene Auftraege der Linie
  SELECT k~aufnr
    FROM afko AS k
    INNER JOIN aufk AS a ON a~aufnr = k~aufnr
    INNER JOIN jest AS j ON j~objnr = a~objnr
    INTO TABLE gt_orders
    WHERE k~aufnr IN s_aufnr
      AND k~gstrp IN s_gstrp
      AND k~fevor = p_fevor
      AND a~werks = p_werks
      AND j~stat  = 'I0002'
      AND j~inact = space.
  IF sy-subrc <> 0.
    MESSAGE s398(00) DISPLAY LIKE 'W' WITH 'Keine freigegebenen Auftraege'.
    RETURN.
  ENDIF.

  LOOP AT gt_orders INTO DATA(gv_aufnr).
    CLEAR: gt_res, gv_rsnum.
    CALL FUNCTION 'Z_MM_KIT_RESERVE'
      EXPORTING
        iv_aufnr    = gv_aufnr
        iv_werks    = p_werks
        iv_partial  = abap_true
        iv_simulate = p_sim
      IMPORTING
        ev_rsnum    = gv_rsnum
        et_result   = gt_res.
    gt_out = VALUE #( BASE gt_out FOR r IN gt_res
                      ( aufnr = gv_aufnr rsnum = gv_rsnum
                        matnr = r-matnr msgty = r-msgty text = r-text ) ).
  ENDLOOP.

  cl_salv_table=>factory( IMPORTING r_salv_table = DATA(go_alv)
                          CHANGING  t_table      = gt_out ).
  go_alv->display( ).

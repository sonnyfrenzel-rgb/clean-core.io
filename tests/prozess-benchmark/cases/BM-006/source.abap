REPORT zsd_rabatt_analyse.
*&---------------------------------------------------------------------*
*& Rabattanalyse je Kundenauftrag: Summe der Rabattkonditionen aus KONV
*& 06/2013 TWE  Ersterstellung
*& 02/2017 AMA  Umstellung REUSE_ALV_LIST_DISPLAY -> CL_SALV_TABLE
*&---------------------------------------------------------------------*
TABLES: vbak.

TYPES: BEGIN OF ty_out,
         vbeln  TYPE vbak-vbeln,
         kunnr  TYPE vbak-kunnr,
         netwr  TYPE vbak-netwr,
         waerk  TYPE vbak-waerk,
         rabatt TYPE konv-kwert,
         quote  TYPE p LENGTH 5 DECIMALS 2,
         ampel  TYPE char4,
       END OF ty_out.

DATA: gt_out  TYPE STANDARD TABLE OF ty_out,
      gs_out  TYPE ty_out,
      gt_vbak TYPE STANDARD TABLE OF vbak,
      gs_vbak TYPE vbak,
      gt_konv TYPE STANDARD TABLE OF konv,
      gs_konv TYPE konv,
      go_alv  TYPE REF TO cl_salv_table,
      gx_salv TYPE REF TO cx_salv_msg.

SELECT-OPTIONS: s_vkorg FOR vbak-vkorg OBLIGATORY,
                s_audat FOR vbak-audat,
                s_kunnr FOR vbak-kunnr.
PARAMETERS: p_grenz TYPE p LENGTH 5 DECIMALS 2 DEFAULT '15.00'.

START-OF-SELECTION.
  SELECT * FROM vbak INTO TABLE gt_vbak
    WHERE vkorg IN s_vkorg
      AND audat IN s_audat
      AND kunnr IN s_kunnr.
  IF gt_vbak IS INITIAL.
    MESSAGE 'Keine Aufträge zur Selektion' TYPE 'S' DISPLAY LIKE 'W'.
    RETURN.
  ENDIF.

* nur aktive Zu-/Abschläge (KOAID = A)
  SELECT * FROM konv INTO TABLE gt_konv
    FOR ALL ENTRIES IN gt_vbak
    WHERE knumv = gt_vbak-knumv
      AND koaid = 'A'
      AND kinak = space.

  LOOP AT gt_vbak INTO gs_vbak.
    CLEAR gs_out.
    MOVE-CORRESPONDING gs_vbak TO gs_out.
    LOOP AT gt_konv INTO gs_konv WHERE knumv = gs_vbak-knumv.
*     K004/K005 zählen laut Vertriebscontrolling nicht als Rabatt
      IF gs_konv-kschl(1) = 'Z' OR gs_konv-kschl = 'K007'.
        gs_out-rabatt = gs_out-rabatt + gs_konv-kwert.
      ENDIF.
    ENDLOOP.
    IF gs_vbak-netwr <> 0.
      gs_out-quote = abs( gs_out-rabatt ) * 100
                     / ( gs_vbak-netwr + abs( gs_out-rabatt ) ).
    ENDIF.
    IF gs_out-quote > p_grenz.
      gs_out-ampel = '@0A@'.   "rot
    ELSE.
      gs_out-ampel = '@08@'.   "grün
    ENDIF.
    APPEND gs_out TO gt_out.
  ENDLOOP.

  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = go_alv
                              CHANGING  t_table      = gt_out ).
    CATCH cx_salv_msg INTO gx_salv.
      MESSAGE gx_salv TYPE 'E'.
  ENDTRY.
  go_alv->get_functions( )->set_all( abap_true ).
  go_alv->display( ).

REPORT zhr_bankverbindung_check.
*----------------------------------------------------------------------*
* Pruefliste Bankverbindungen (IT0009) vor Entgeltabrechnung
* Mitarbeiter ohne Hauptbankverbindung oder ohne IBAN
*----------------------------------------------------------------------*
TABLES: pa0001.

SELECT-OPTIONS: s_werks FOR pa0001-werks OBLIGATORY,
                s_pernr FOR pa0001-pernr.
PARAMETERS:     p_datum TYPE datum DEFAULT sy-datum.

TYPES: BEGIN OF ty_out,
         pernr TYPE persno,
         ename TYPE emnam,
         werks TYPE persa,
         bankl TYPE bankk,
         iban  TYPE iban,
         text  TYPE char40,
       END OF ty_out.

DATA: gt_p0001 TYPE STANDARD TABLE OF pa0001,
      gs_p0001 TYPE pa0001,
      gt_out   TYPE STANDARD TABLE OF ty_out,
      go_alv   TYPE REF TO cl_salv_table,
      gx_salv  TYPE REF TO cx_salv_msg.

START-OF-SELECTION.
  SELECT * FROM pa0001 INTO TABLE gt_p0001
    WHERE pernr IN s_pernr
      AND werks IN s_werks
      AND begda <= p_datum
      AND endda >= p_datum.

  LOOP AT gt_p0001 INTO gs_p0001.
    PERFORM bank_pruefen USING gs_p0001.
  ENDLOOP.

  IF gt_out IS INITIAL.
    MESSAGE s300(zhr).
    RETURN.
  ENDIF.

  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = go_alv
                              CHANGING  t_table      = gt_out ).
      go_alv->display( ).
    CATCH cx_salv_msg INTO gx_salv.
      MESSAGE gx_salv TYPE 'I'.
  ENDTRY.

*&---------------------------------------------------------------------*
*&      Form  BANK_PRUEFEN
*&---------------------------------------------------------------------*
FORM bank_pruefen USING ps_p0001 TYPE pa0001.
  DATA: lt_p0009 TYPE STANDARD TABLE OF p0009,
        ls_p0009 TYPE p0009,
        ls_out   TYPE ty_out.

  CALL FUNCTION 'HR_READ_INFOTYPE'
    EXPORTING
      pernr           = ps_p0001-pernr
      infty           = '0009'
      begda           = p_datum
      endda           = p_datum
    TABLES
      infty_tab       = lt_p0009
    EXCEPTIONS
      infty_not_found = 1
      OTHERS          = 2.

  ls_out-pernr = ps_p0001-pernr.
  ls_out-ename = ps_p0001-ename.
  ls_out-werks = ps_p0001-werks.

* Subtyp 0 = Hauptbankverbindung
  READ TABLE lt_p0009 INTO ls_p0009 WITH KEY subty = '0'.
  IF sy-subrc <> 0.
    ls_out-text = 'Keine Hauptbankverbindung'.
    APPEND ls_out TO gt_out.
    RETURN.
  ENDIF.

  CHECK ls_p0009-iban IS INITIAL.
  ls_out-bankl = ls_p0009-bankl.
  ls_out-text  = 'IBAN fehlt'.
  APPEND ls_out TO gt_out.
ENDFORM.

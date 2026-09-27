REPORT zco_io_settle.
*----------------------------------------------------------------------*
* Einzelabrechnung Innenauftraege ueber KO88 (Batch-Input)
* 2010-06 CON  / 2013-01 CON Status REL statt Kennz. AUFK-PHAS1
*----------------------------------------------------------------------*
TABLES aufk.

SELECT-OPTIONS: s_aufnr FOR aufk-aufnr,
                s_auart FOR aufk-auart OBLIGATORY.
PARAMETERS: p_bukrs TYPE bukrs OBLIGATORY,
            p_perio TYPE co_perio OBLIGATORY,
            p_gjahr TYPE gjahr OBLIGATORY,
            p_test  AS CHECKBOX DEFAULT 'X'.

DATA: lt_aufk TYPE STANDARD TABLE OF aufk,
      ls_aufk TYPE aufk,
      lt_bdc  TYPE STANDARD TABLE OF bdcdata,
      ls_bdc  TYPE bdcdata,
      lt_msg  TYPE STANDARD TABLE OF bdcmsgcoll,
      ls_msg  TYPE bdcmsgcoll,
      lv_ok   TYPE i,
      lv_err  TYPE i.

DEFINE _dynpro.
  CLEAR ls_bdc.
  ls_bdc-program = &1. ls_bdc-dynpro = &2. ls_bdc-dynbegin = 'X'.
  APPEND ls_bdc TO lt_bdc.
END-OF-DEFINITION.
DEFINE _field.
  CLEAR ls_bdc.
  ls_bdc-fnam = &1. ls_bdc-fval = &2.
  APPEND ls_bdc TO lt_bdc.
END-OF-DEFINITION.

START-OF-SELECTION.
  SELECT * FROM aufk INTO TABLE lt_aufk
    WHERE aufnr IN s_aufnr
      AND auart IN s_auart
      AND bukrs = p_bukrs
      AND autyp = '01'.
  IF lt_aufk IS INITIAL.
    WRITE / 'Keine Innenauftraege selektiert.'.
    RETURN.
  ENDIF.

  LOOP AT lt_aufk INTO ls_aufk.
*   nur freigegebene Auftraege (I0002 = REL)
    CALL FUNCTION 'STATUS_CHECK'
      EXPORTING
        objnr             = ls_aufk-objnr
        status            = 'I0002'
      EXCEPTIONS
        object_not_found  = 1
        status_not_active = 2
        OTHERS            = 3.
    IF sy-subrc <> 0.
      WRITE: / ls_aufk-aufnr, 'nicht freigegeben - uebersprungen'.
      CONTINUE.
    ENDIF.

    CLEAR: lt_bdc, lt_msg.
    _dynpro 'SAPLKO71' '1000'.
    _field 'COAS-AUFNR'  ls_aufk-aufnr.
    _field 'RKAUF-FROM'  p_perio.
    _field 'RKAUF-GJAHR' p_gjahr.
    _field 'RKAUF-TEST'  p_test.
    _field 'BDC_OKCODE'  '=AUSF'.

    CALL TRANSACTION 'KO88' USING lt_bdc
         MODE 'N'
         UPDATE 'S'
         MESSAGES INTO lt_msg.

    READ TABLE lt_msg INTO ls_msg WITH KEY msgtyp = 'E'.
    IF sy-subrc = 0.
      ADD 1 TO lv_err.
      WRITE: / ls_aufk-aufnr, 'Fehler', ls_msg-msgid, ls_msg-msgnr, ls_msg-msgv1.
    ELSE.
      ADD 1 TO lv_ok.
      WRITE: / ls_aufk-aufnr, 'abgerechnet'.
    ENDIF.
  ENDLOOP.

  ULINE.
  WRITE: / 'Abgerechnet:', lv_ok, '  Fehler:', lv_err, '  Testlauf:', p_test.

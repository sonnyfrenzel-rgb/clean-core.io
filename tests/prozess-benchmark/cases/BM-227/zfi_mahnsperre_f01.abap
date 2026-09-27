*&---------------------------------------------------------------------*
*&  Include           ZFI_MAHNSPERRE_F01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  DEBITOREN_LESEN
*&---------------------------------------------------------------------*
FORM debitoren_lesen.
* nur Debitoren mit Mahnverfahren, Mahnbereich leer
  SELECT kunnr bukrs mahna madat
    FROM knb5
    INTO TABLE gt_knb5
    WHERE bukrs = p_bukrs
      AND kunnr IN s_kunnr
      AND maber = space.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  POSTEN_PRUEFEN
*&---------------------------------------------------------------------*
FORM posten_pruefen USING ps_knb5 TYPE ty_knb5.
  DATA: lt_bsid    TYPE STANDARD TABLE OF ty_bsid,
        ls_bsid    TYPE ty_bsid,
        lv_faellig TYPE datum,
        lv_status  TYPE c LENGTH 1,
        lv_rc      TYPE sysubrc.

  SELECT bukrs kunnr belnr gjahr buzei zfbdt zbd1t mansp dmbtr
    FROM bsid
    INTO TABLE lt_bsid
    WHERE bukrs = ps_knb5-bukrs
      AND kunnr = ps_knb5-kunnr
      AND mansp = space.
  CHECK sy-subrc = 0.

  LOOP AT lt_bsid INTO ls_bsid.
*   Faelligkeit = Basisdatum + Tage 1. Skontofrist (vereinfacht)
    lv_faellig = ls_bsid-zfbdt + ls_bsid-zbd1t.
    IF lv_faellig >= p_stich.
      CONTINUE.
    ENDIF.

*   offener Streitfall? (Eigenentwicklung statt FSCM Dispute)
    CLEAR lv_status.
    SELECT SINGLE status FROM zfi_streitfall INTO lv_status
      WHERE bukrs = ls_bsid-bukrs
        AND belnr = ls_bsid-belnr
        AND gjahr = ls_bsid-gjahr.
    IF sy-subrc <> 0 OR lv_status = 'G'.
      CONTINUE.
    ENDIF.

    IF p_test = 'X'.
      PERFORM log_add USING ls_bsid 'T' 'Testlauf: Mahnsperre wuerde gesetzt'.
      CONTINUE.
    ENDIF.

    PERFORM sperre_setzen USING ls_bsid CHANGING lv_rc.
    IF lv_rc = 0.
      ADD 1 TO gv_geaendert.
      PERFORM log_add USING ls_bsid 'S' 'Mahnsperre gesetzt'.
    ELSE.
      PERFORM log_add USING ls_bsid 'E' 'Aenderung fehlgeschlagen'.
    ENDIF.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  SPERRE_SETZEN
*&---------------------------------------------------------------------*
FORM sperre_setzen USING    ps_bsid TYPE ty_bsid
                   CHANGING cv_rc   TYPE sysubrc.
  DATA: lt_accchg TYPE STANDARD TABLE OF accchg,
        ls_accchg TYPE accchg.

  ls_accchg-fdname = 'MANSP'.
  ls_accchg-oldval = ps_bsid-mansp.
  ls_accchg-newval = p_mansp.
  APPEND ls_accchg TO lt_accchg.

  CALL FUNCTION 'FI_DOCUMENT_CHANGE'
    EXPORTING
      i_kunnr              = ps_bsid-kunnr
      i_bukrs              = ps_bsid-bukrs
      i_belnr              = ps_bsid-belnr
      i_gjahr              = ps_bsid-gjahr
      i_buzei              = ps_bsid-buzei
    TABLES
      t_accchg             = lt_accchg
    EXCEPTIONS
      no_reference         = 1
      no_document          = 2
      many_documents       = 3
      wrong_input          = 4
      overwrite_creditcard = 5
      OTHERS               = 6.
  cv_rc = sy-subrc.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  LOG_ADD
*&---------------------------------------------------------------------*
FORM log_add USING ps_bsid TYPE ty_bsid
                   pv_typ  TYPE c
                   pv_text TYPE c.
  DATA ls_log TYPE ty_log.
  ls_log-typ   = pv_typ.
  ls_log-kunnr = ps_bsid-kunnr.
  ls_log-belnr = ps_bsid-belnr.
  ls_log-gjahr = ps_bsid-gjahr.
  ls_log-buzei = ps_bsid-buzei.
  ls_log-text  = pv_text.
  APPEND ls_log TO gt_log.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  PROTOKOLL_AUSGEBEN
*&---------------------------------------------------------------------*
FORM protokoll_ausgeben.
  DATA ls_log TYPE ty_log.
  LOOP AT gt_log INTO ls_log.
    WRITE: / ls_log-typ, ls_log-kunnr, ls_log-belnr, ls_log-gjahr,
             ls_log-buzei, ls_log-text.
  ENDLOOP.
ENDFORM.

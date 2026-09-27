*----------------------------------------------------------------------*
***INCLUDE LZFI_EBSF01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  OFFENE_POSTEN_SUCHEN
*&---------------------------------------------------------------------*
*       Rechnungsnummer (RE + 8 Ziffern) aus Verwendungszweck ziehen
*       und offene Debitorenposten mit dieser Referenz suchen
*----------------------------------------------------------------------*
FORM offene_posten_suchen USING    ps_febep TYPE febep
                          CHANGING ct_op    TYPE gty_op_tab.
  DATA: lv_text  TYPE febre-vwezw,
        lv_ref   TYPE xblnr1.

  CLEAR ct_op.
* erste Verwendungszweckzeile reicht (Vorgabe Fachbereich 2013)
  SELECT SINGLE vwezw FROM febre INTO lv_text
    WHERE kukey = ps_febep-kukey
      AND esnum = ps_febep-esnum
      AND rsnum = '001'.

  FIND FIRST OCCURRENCE OF REGEX 'RE[0-9]{8}' IN lv_text
    MATCH OFFSET DATA(lv_off).
  IF sy-subrc <> 0.
    RETURN.
  ENDIF.
  lv_ref = lv_text+lv_off(10).

  SELECT bukrs kunnr belnr gjahr buzei wrbtr waers
    FROM bsid
    INTO TABLE ct_op
    WHERE bukrs = gs_febko-bukrs
      AND xblnr = lv_ref
      AND shkzg = 'S'.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  AUSGLEICHEN
*&---------------------------------------------------------------------*
FORM ausgleichen USING    ps_febep TYPE febep
                          ps_op    TYPE gty_op
                 CHANGING cv_belnr TYPE belnr_d.
  DATA: lt_blntab  TYPE STANDARD TABLE OF blntab,
        ls_blntab  TYPE blntab,
        lt_ftclear TYPE STANDARD TABLE OF ftclear,
        ls_ftclear TYPE ftclear,
        lt_ftpost  TYPE STANDARD TABLE OF ftpost,
        lt_fttax   TYPE STANDARD TABLE OF fttax,
        lv_msgid   TYPE sy-msgid,
        lv_msgno   TYPE sy-msgno,
        lv_msgty   TYPE sy-msgty,
        lv_subrc   TYPE sy-subrc,
        ls_ftpost  TYPE ftpost,
        lv_c(15)   TYPE c.

  DEFINE ftp.
    ls_ftpost-stype = &1.
    ls_ftpost-count = &2.
    ls_ftpost-fnam  = &3.
    ls_ftpost-fval  = &4.
    APPEND ls_ftpost TO lt_ftpost.
  END-OF-DEFINITION.

  CLEAR cv_belnr.
  WRITE ps_febep-budat TO lv_c.
  ftp 'K' 1 'BKPF-BUDAT' lv_c.
  ftp 'K' 1 'BKPF-BLDAT' lv_c.
  ftp 'K' 1 'BKPF-BLART' 'DZ'.
  ftp 'K' 1 'BKPF-BUKRS' gs_febko-bukrs.
  ftp 'K' 1 'BKPF-WAERS' gs_febko-waers.
  ftp 'P' 1 'RF05A-NEWBS' '40'.
  ftp 'P' 1 'RF05A-NEWKO' gs_febko-hkont.
  WRITE ps_febep-kwbtr TO lv_c CURRENCY gs_febko-waers.
  ftp 'P' 1 'BSEG-WRBTR' lv_c.

  ls_ftclear-agkoa  = 'D'.
  ls_ftclear-agkon  = ps_op-kunnr.
  ls_ftclear-agbuk  = ps_op-bukrs.
  ls_ftclear-xnops  = 'X'.
  ls_ftclear-selfd  = 'BELNR'.
  CONCATENATE ps_op-belnr ps_op-gjahr ps_op-buzei INTO ls_ftclear-selvon.
  APPEND ls_ftclear TO lt_ftclear.

  CALL FUNCTION 'POSTING_INTERFACE_CLEARING'
    EXPORTING
      i_auglv    = 'EINGZAHL'
      i_tcode    = 'FB05'
      i_sgfunct  = 'C'
    IMPORTING
      e_msgid    = lv_msgid
      e_msgno    = lv_msgno
      e_msgty    = lv_msgty
      e_subrc    = lv_subrc
    TABLES
      t_blntab   = lt_blntab
      t_ftclear  = lt_ftclear
      t_ftpost   = lt_ftpost
      t_fttax    = lt_fttax
    EXCEPTIONS
      OTHERS     = 1.
  IF sy-subrc <> 0 OR lv_subrc <> 0.
    PERFORM log USING 'E' '106' ps_febep-esnum.
    RETURN.
  ENDIF.

  READ TABLE lt_blntab INTO ls_blntab INDEX 1.
  cv_belnr = ls_blntab-belnr.
  PERFORM log USING 'S' '107' cv_belnr.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  LOG
*&---------------------------------------------------------------------*
FORM log USING pv_type TYPE bapi_mtype
               pv_nr   TYPE symsgno
               pv_v1   TYPE any.
  DATA ls_log TYPE bapiret2.
  ls_log-type       = pv_type.
  ls_log-id         = 'ZFI_EBS'.
  ls_log-number     = pv_nr.
  ls_log-message_v1 = pv_v1.
  APPEND ls_log TO gt_log.
ENDFORM.

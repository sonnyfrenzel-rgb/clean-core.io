*----------------------------------------------------------------------*
***INCLUDE ZFI_BANKSTMT_F01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form READ_FILE - Kontoauszug vom Applikationsserver
*&---------------------------------------------------------------------*
FORM read_file.
  DATA: lv_line   TYPE string,
        lv_betrag TYPE string,
        ls_stmt   TYPE ty_stmt.

  OPEN DATASET p_file FOR INPUT IN TEXT MODE ENCODING DEFAULT.
  IF sy-subrc <> 0.
    MESSAGE e398(00) WITH 'Datei nicht lesbar:' p_file.
  ENDIF.

  DO.
    READ DATASET p_file INTO lv_line.
    IF sy-subrc <> 0.
      EXIT.
    ENDIF.
*   Kopfzeile der Bank ueberspringen
    IF sy-index = 1.
      CONTINUE.
    ENDIF.
    CLEAR ls_stmt.
*   Format: Valuta(JJJJMMTT);Betrag;Waehrung;Verwendungszweck;Name
    SPLIT lv_line AT ';' INTO ls_stmt-valut lv_betrag ls_stmt-waers
                              ls_stmt-zweck ls_stmt-name.
    REPLACE ALL OCCURRENCES OF ',' IN lv_betrag WITH '.'.
    ls_stmt-wrbtr = lv_betrag.
*   nur Gutschriften
    IF ls_stmt-wrbtr > 0.
      APPEND ls_stmt TO gt_stmt.
    ENDIF.
  ENDDO.
  CLOSE DATASET p_file.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form MATCH_ITEM - Umsatz den offenen Posten zuordnen
*&---------------------------------------------------------------------*
FORM match_item.
  DATA: lv_ref TYPE string,
        lv_sum TYPE wrbtr.

* Rechnungsnummer im Verwendungszweck: RE + 8 Ziffern
  FIND FIRST OCCURRENCE OF REGEX 'RE[0-9]{8}' IN <gs_stmt>-zweck
       MATCH OFFSET DATA(lv_off) MATCH LENGTH DATA(lv_len).
  IF sy-subrc <> 0.
    <gs_stmt>-status = 'U'.
    <gs_stmt>-text   = 'Keine Rechnungsnummer im Verwendungszweck'.
    RETURN.
  ENDIF.
  lv_ref = <gs_stmt>-zweck+lv_off(lv_len).
  <gs_stmt>-xblnr = lv_ref.

  SELECT kunnr belnr gjahr buzei shkzg wrbtr
    FROM bsid INTO TABLE gt_op
    WHERE bukrs = p_bukrs
      AND xblnr = <gs_stmt>-xblnr.
  IF sy-subrc <> 0.
    <gs_stmt>-status = 'U'.
    <gs_stmt>-text   = 'Kein offener Posten zur Rechnungsnummer'.
    RETURN.
  ENDIF.
  <gs_stmt>-kunnr = gt_op[ 1 ]-kunnr.

* Saldo der offenen Posten (Soll positiv)
  lv_sum = REDUCE wrbtr( INIT s = 0
                         FOR ls_op IN gt_op
                         NEXT s = s + COND wrbtr( WHEN ls_op-shkzg = 'S'
                                                  THEN ls_op-wrbtr
                                                  ELSE - ls_op-wrbtr ) ).
  IF abs( lv_sum - <gs_stmt>-wrbtr ) <= gv_tol.
    <gs_stmt>-status = 'M'.
  ELSE.
    <gs_stmt>-status = 'U'.
    <gs_stmt>-text   = 'Betrag weicht ab - Teilzahlung manuell klaeren'.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form POST_CLEARING - Ausgleich FB05 ueber Posting Interface
*&---------------------------------------------------------------------*
FORM post_clearing.
  DATA: lt_ftpost  TYPE STANDARD TABLE OF ftpost,
        lt_ftclear TYPE STANDARD TABLE OF ftclear,
        lt_fttax   TYPE STANDARD TABLE OF fttax,
        lt_blntab  TYPE STANDARD TABLE OF blntab,
        lv_msgid   TYPE sy-msgid,
        lv_msgno   TYPE sy-msgno,
        lv_msgty   TYPE sy-msgty,
        lv_msgv1   TYPE sy-msgv1,
        lv_subrc   TYPE sy-subrc,
        lv_datum   TYPE bdc_fval,
        lv_betrag  TYPE bdc_fval.

  lv_datum  = |{ sy-datum DATE = USER }|.
  lv_betrag = |{ <gs_stmt>-wrbtr NUMBER = USER }|.

  lt_ftpost = VALUE #(
    ( stype = 'K' count = 1 fnam = 'BKPF-BLDAT'  fval = lv_datum )
    ( stype = 'K' count = 1 fnam = 'BKPF-BUDAT'  fval = lv_datum )
    ( stype = 'K' count = 1 fnam = 'BKPF-BLART'  fval = p_blart )
    ( stype = 'K' count = 1 fnam = 'BKPF-BUKRS'  fval = p_bukrs )
    ( stype = 'K' count = 1 fnam = 'BKPF-WAERS'  fval = <gs_stmt>-waers )
    ( stype = 'K' count = 1 fnam = 'BKPF-XBLNR'  fval = <gs_stmt>-xblnr )
    ( stype = 'P' count = 1 fnam = 'RF05A-NEWBS' fval = '40' )
    ( stype = 'P' count = 1 fnam = 'RF05A-NEWKO' fval = p_hkont )
    ( stype = 'P' count = 1 fnam = 'BSEG-WRBTR'  fval = lv_betrag )
    ( stype = 'P' count = 1 fnam = 'BSEG-SGTXT'  fval = <gs_stmt>-name ) ).
  lt_ftclear = VALUE #( FOR ls_op IN gt_op
                        ( agkoa  = 'D'
                          agkon  = ls_op-kunnr
                          agbuk  = p_bukrs
                          xnops  = 'X'
                          selfd  = 'BELNR'
                          selvon = ls_op-belnr ) ).

  CALL FUNCTION 'POSTING_INTERFACE_CLEARING'
    EXPORTING
      i_auglv                    = 'EINGZAHL'
      i_tcode                    = 'FB05'
      i_sgfunct                  = 'C'
    IMPORTING
      e_msgid                    = lv_msgid
      e_msgno                    = lv_msgno
      e_msgty                    = lv_msgty
      e_msgv1                    = lv_msgv1
      e_subrc                    = lv_subrc
    TABLES
      t_blntab                   = lt_blntab
      t_ftclear                  = lt_ftclear
      t_ftpost                   = lt_ftpost
      t_fttax                    = lt_fttax
    EXCEPTIONS
      clearing_procedure_invalid = 1
      clearing_procedure_missing = 2
      table_t041a_empty          = 3
      transaction_code_invalid   = 4
      amount_format_error        = 5
      too_many_line_items        = 6
      company_code_invalid       = 7
      screen_not_found           = 8
      no_authorization           = 9
      OTHERS                     = 10.
  IF sy-subrc = 0 AND lv_subrc = 0.
    <gs_stmt>-status = 'P'.
    READ TABLE lt_blntab INTO DATA(ls_blntab) INDEX 1.
    <gs_stmt>-belnr = ls_blntab-belnr.
  ELSE.
    <gs_stmt>-status = 'E'.
    MESSAGE ID lv_msgid TYPE 'S' NUMBER lv_msgno WITH lv_msgv1 INTO <gs_stmt>-text.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form DISPLAY - Ergebnisliste
*&---------------------------------------------------------------------*
FORM display.
  DATA lt_fcat TYPE slis_t_fieldcat_alv.

  lt_fcat = VALUE #( ( fieldname = 'VALUT'  seltext_m = 'Valuta' )
                     ( fieldname = 'WRBTR'  seltext_m = 'Betrag' )
                     ( fieldname = 'WAERS'  seltext_m = 'Waehrung' )
                     ( fieldname = 'NAME'   seltext_m = 'Auftraggeber' )
                     ( fieldname = 'XBLNR'  seltext_m = 'Rechnung' )
                     ( fieldname = 'KUNNR'  seltext_m = 'Kunde' )
                     ( fieldname = 'STATUS' seltext_m = 'Status' )
                     ( fieldname = 'BELNR'  seltext_m = 'Ausgleichsbeleg' )
                     ( fieldname = 'TEXT'   seltext_m = 'Hinweis' outputlen = 60 ) ).

  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      it_fieldcat   = lt_fcat
    TABLES
      t_outtab      = gt_stmt
    EXCEPTIONS
      program_error = 1
      OTHERS        = 2.
ENDFORM.

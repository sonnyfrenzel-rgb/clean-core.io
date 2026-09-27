*----------------------------------------------------------------------*
***INCLUDE LZDSPF01 - Verarbeitung Zahlungsavis
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form VERARBEITEN - ein Avis: Kunde prüfen, je Kürzung Klärungsfall
*&---------------------------------------------------------------------*
FORM verarbeiten USING    is_hd  TYPE z1dsphd
                          it_it  TYPE ty_t_it
                 CHANGING cv_ok  TYPE abap_bool
                          cv_msg TYPE string.
  DATA: lv_betrag TYPE wrbtr,
        lv_grund  TYPE zdsp_reason,
        lv_case   TYPE scmg_ext_key.

  SELECT SINGLE kunnr FROM kna1 INTO @DATA(lv_kunnr)
    WHERE kunnr = @is_hd-kunnr.
  IF sy-subrc <> 0.
    cv_ok  = abap_false.
    cv_msg = |Kunde { is_hd-kunnr } unbekannt|.
    RETURN.
  ENDIF.

  LOOP AT it_it INTO DATA(ls_it).
*   Kürzungsbetrag kommt als Text aus dem EDI-Konverter
    CATCH SYSTEM-EXCEPTIONS conversion_errors = 1.
      lv_betrag = ls_it-kuerzung.
    ENDCATCH.
    IF sy-subrc = 1.
      cv_ok  = abap_false.
      cv_msg = |Betrag { ls_it-kuerzung } zu Rechnung { ls_it-xblnr } ungültig|.
      EXIT.
    ENDIF.
    CHECK lv_betrag > 0.

    SELECT bukrs, gjahr, belnr, buzei, wrbtr FROM bsid
      WHERE bukrs = @is_hd-bukrs
        AND kunnr = @is_hd-kunnr
        AND xblnr = @ls_it-xblnr
      INTO TABLE @DATA(lt_op).
    IF lt_op IS INITIAL.
      cv_ok  = abap_false.
      cv_msg = |Rechnung { ls_it-xblnr } beim Kunden nicht offen|.
      EXIT.
    ENDIF.

    LOOP AT lt_op INTO DATA(ls_op).
      SELECT SINGLE case_id FROM zdsp_items INTO @lv_case
        WHERE bukrs = @ls_op-bukrs
          AND gjahr = @ls_op-gjahr
          AND belnr = @ls_op-belnr
          AND buzei = @ls_op-buzei.
      IF sy-subrc = 0.
        CONTINUE.      "Posten hat bereits einen Klärungsfall
      ENDIF.
      lv_grund = VALUE #( gt_grund[ kunden_grund = ls_it-grund ]-reason DEFAULT '99' ).
      PERFORM dispute_anlegen USING    is_hd ls_op lv_betrag lv_grund
                              CHANGING lv_case cv_ok cv_msg.
      IF cv_ok = abap_false.
        EXIT.
      ENDIF.
      INSERT zdsp_items FROM @( VALUE zdsp_items( bukrs   = ls_op-bukrs
                                                  gjahr   = ls_op-gjahr
                                                  belnr   = ls_op-belnr
                                                  buzei   = ls_op-buzei
                                                  case_id = lv_case
                                                  avis    = is_hd-avis_nr ) ).
      EXIT.            "Kürzung nur dem ersten offenen Posten zuordnen
    ENDLOOP.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form DISPUTE_ANLEGEN - Klärungsfall über Wrapper der Debitorenbuchh.
*&---------------------------------------------------------------------*
FORM dispute_anlegen USING    is_hd     TYPE z1dsphd
                              is_op     TYPE any
                              iv_betrag TYPE wrbtr
                              iv_grund  TYPE zdsp_reason
                     CHANGING cv_case   TYPE scmg_ext_key
                              cv_ok     TYPE abap_bool
                              cv_msg    TYPE string.
  CALL FUNCTION 'Z_FSCM_DISPUTE_CREATE'
    EXPORTING
      iv_bukrs    = is_hd-bukrs
      iv_kunnr    = is_hd-kunnr
      is_item     = is_op
      iv_disputed = iv_betrag
      iv_waers    = is_hd-waers
      iv_reason   = iv_grund
    IMPORTING
      ev_case_id  = cv_case
    EXCEPTIONS
      not_created = 1
      OTHERS      = 2.
  IF sy-subrc <> 0.
    cv_ok = abap_false.
    MESSAGE ID sy-msgid TYPE 'E' NUMBER sy-msgno
            WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4 INTO cv_msg.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form STATUS_SETZEN - IDoc-Statussatz
*&---------------------------------------------------------------------*
FORM status_setzen TABLES ct_status STRUCTURE bdidocstat
                   USING  iv_docnum TYPE edi_docnum
                          iv_status TYPE edi_status
                          iv_text   TYPE csequence.
  APPEND VALUE #( docnum = iv_docnum
                  status = iv_status
                  msgty  = COND #( WHEN iv_status = '51' THEN 'E' ELSE 'S' )
                  msgid  = 'ZDSP'
                  msgno  = '000'
                  msgv1  = iv_text ) TO ct_status.
ENDFORM.

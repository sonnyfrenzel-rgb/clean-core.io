*&---------------------------------------------------------------------*
*& Report ZRE_INDEX_MAIN
*&---------------------------------------------------------------------*
*& Indexmietanpassung Gewerbe/Wohnen nach Verbraucherpreisindex (VPI)
*& - faellige Vertraege mit Indexvereinbarung (ZRE_IDXAGR) ermitteln
*& - VPI ueber Destatis-Schnittstelle (HTTP/JSON) holen
*& - neue Grundmiete mit Schwellwert und Kappung rechnen
*& - Konditionsaenderung parallel in Paketen (Z_RE_INDEX_TASK)
*& - Mieteranschreiben als Adobe Form, Versand als PDF per Mail
*&
*& 2017-01  K.Hoffmann  Erstellung (Wohnen)
*& 2018-06  K.Hoffmann  Gewerbe, Kappung je Vertrag
*& 2020-02  P.Nowak     VPI Basis 2020, HTTP statt manueller Pflege
*& 2022-09  P.Nowak     Parallelisierung (Laufzeit > 6h bei 40.000 VE)
*& 2023-05  extern      Mailversand CL_BCS statt Druck
*&---------------------------------------------------------------------*
REPORT zre_index_main MESSAGE-ID zre_index.

INCLUDE zre_index_top.
INCLUDE zre_index_f01.
INCLUDE zre_index_f02.

START-OF-SELECTION.

* faellige Vertraege mit Indexvereinbarung und Grundmiete zum Stichtag
  SELECT c~bukrs, c~recnnr, c~intreno, c~recntype,
         a~idxseries, a~base_vpi, a~base_per, a~thresh_pct, a~cap_pct,
         a~last_adj,
         k~condtype, k~unitprice, k~condcurr
    FROM vicncn AS c
    INNER JOIN zre_idxagr AS a
      ON a~intreno = c~intreno
    LEFT OUTER JOIN vicdcond AS k
      ON  k~intreno        = c~intreno
      AND k~condtype       = @gc_condtype_rent
      AND k~condvalidfrom <= @p_stich
      AND k~condvalidto   >= @p_stich
    WHERE c~bukrs    IN @s_bukrs
      AND c~recnnr   IN @s_recnnr
      AND c~recntype IN @s_cntype
      AND c~recnbeg  <= @p_stich
      AND ( c~recnendabs = '00000000' OR c~recnendabs >= @p_stich )
      AND a~next_check <= @p_stich
      AND a~inactive   = @space
    INTO CORRESPONDING FIELDS OF TABLE @gt_contracts.
  IF sy-subrc <> 0.
    MESSAGE s002 DISPLAY LIKE 'W'.
    RETURN.
  ENDIF.

* ALT (bis 2020): Indexvereinbarung stand in der RE-Anpassungsregel
* SELECT * FROM viraadjust INTO TABLE lt_adj
*   FOR ALL ENTRIES IN gt_contracts WHERE intreno = gt_contracts-intreno.

* VPI zwei Monate vor Stichtag (Destatis veroeffentlicht mit Verzug)
  DATA(lv_idxdate) = p_stich.
  lv_idxdate+6(2) = '01'.
  lv_idxdate = lv_idxdate - 1.
  lv_idxdate+6(2) = '01'.
  lv_idxdate = lv_idxdate - 1.
  gv_period = lv_idxdate(6).

  TRY.
      gv_vpi_act = NEW zcl_re_vpi_client( p_http )->get_value(
                     iv_series = 'VPI2020'
                     iv_period = gv_period ).
    CATCH zcx_re_vpi INTO DATA(lx_vpi).
      MESSAGE lx_vpi TYPE 'E'.
  ENDTRY.

  PERFORM calculate_rents.

  IF gt_adjust IS INITIAL.
    APPEND VALUE #( msgty = 'S' msgno = '004' ) TO gt_msg.
  ELSEIF p_test = abap_true.
*   Testlauf: nur rechnen, nichts buchen, keine Schreiben
    APPEND VALUE #( msgty = 'S' msgno = '005'
                    msgv1 = |{ lines( gt_adjust ) }| ) TO gt_msg.
  ELSE.
    PERFORM dispatch_packages.
*   auf alle Pakete warten (max. 30 Minuten)
    WAIT UNTIL gv_done >= gv_started UP TO 1800 SECONDS.
    IF gv_done < gv_started.
      APPEND VALUE #( msgty = 'E' msgno = '006'
                      msgv1 = |{ gv_started - gv_done }| ) TO gt_msg.
    ENDIF.
    PERFORM create_letters.
  ENDIF.

* Anwendungsprotokoll ZRE / ZRE_INDEX
  gs_log-object    = gc_log_object.
  gs_log-subobject = gc_log_subobj.
  gs_log-extnumber = |Index { p_stich DATE = USER }{ COND string( WHEN p_test = abap_true THEN ' TEST' ) }|.
  gs_log-aldate    = sy-datum.
  gs_log-aluser    = sy-uname.
  gs_log-alprog    = sy-repid.
  CALL FUNCTION 'BAL_LOG_CREATE'
    EXPORTING
      i_s_log      = gs_log
    IMPORTING
      e_log_handle = gv_log
    EXCEPTIONS
      OTHERS       = 1.

  LOOP AT gt_msg ASSIGNING FIELD-SYMBOL(<ls_msg>).
    <ls_msg>-msgid     = 'ZRE_INDEX'.
    <ls_msg>-probclass = SWITCH #( <ls_msg>-msgty WHEN 'E' THEN '1'
                                                  WHEN 'W' THEN '2'
                                                  ELSE '4' ).
    CALL FUNCTION 'BAL_LOG_MSG_ADD'
      EXPORTING
        i_log_handle = gv_log
        i_s_msg      = <ls_msg>
      EXCEPTIONS
        OTHERS       = 1.
  ENDLOOP.

  CALL FUNCTION 'BAL_DB_SAVE'
    EXPORTING
      i_save_all = abap_true
    EXCEPTIONS
      OTHERS     = 1.

* IF sy-batch = abap_false.        "Anzeige stoerte im Job-Monitoring
*   CALL FUNCTION 'BAL_DSP_LOG_DISPLAY'.
* ENDIF.

  gv_cnt_cn  = lines( gt_contracts ).
  gv_cnt_adj = lines( gt_adjust ).
  WRITE: / 'Vertraege faellig:'(t04),     gv_cnt_cn,
         / 'Anpassungen berechnet:'(t05), gv_cnt_adj,
         / 'Anschreiben erzeugt:'(t06),   gv_letters,
         / 'Mails versendet:'(t07),       gv_mails.

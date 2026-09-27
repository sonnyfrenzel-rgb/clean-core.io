*&---------------------------------------------------------------------*
*& Include ZISU_ABRVORB_F01  - Ausgabe
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  PROTOKOLL_ANZEIGEN
*&---------------------------------------------------------------------*
*       Dialog: ALV mit allen Meldungen
*       Hintergrund: nur Fehler/Warnungen als Liste (Spool)
*----------------------------------------------------------------------*
FORM protokoll_anzeigen.
  DATA lo_alv TYPE REF TO cl_salv_table.

  IF gt_prot IS INITIAL.
    WRITE: / 'Kein Protokoll vorhanden.'.
    RETURN.
  ENDIF.

  IF sy-batch = abap_true.
    LOOP AT gt_prot INTO DATA(ls_prot) WHERE typ CA 'EW'.
      WRITE: / ls_prot-anlage, ls_prot-typ, ls_prot-text.
    ENDLOOP.
    RETURN.
  ENDIF.

  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = lo_alv
                              CHANGING  t_table      = gt_prot ).
      lo_alv->get_functions( )->set_all( abap_true ).
      lo_alv->display( ).
    CATCH cx_salv_msg.
      MESSAGE s060 DISPLAY LIKE 'E'.
  ENDTRY.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  MAIL_AN_TEAM
*&---------------------------------------------------------------------*
*       2015: Mail mit Anzahl Sperren an das Abrechnungsteam.
*       Aufruf 2018 entfernt (Postfach existiert nicht mehr).
*----------------------------------------------------------------------*
FORM mail_an_team.
  DATA: ls_doc  TYPE sodocchgi1,
        lt_text TYPE STANDARD TABLE OF solisti1,
        lt_empf TYPE STANDARD TABLE OF somlreci1,
        lv_anz  TYPE i.

  LOOP AT gt_prot INTO DATA(ls_prot) WHERE typ = 'W'.
    lv_anz = lv_anz + 1.
  ENDLOOP.
  ls_doc-obj_descr = |Abrechnungsvorbereitung Portion { p_port }|.
  APPEND VALUE #( line = |{ lv_anz } Anlagen gesperrt bzw. offen| ) TO lt_text.
  APPEND VALUE #( receiver = 'ABRECHNUNG@STADTWERKE.LOCAL'
                  rec_type = 'U' ) TO lt_empf.

  CALL FUNCTION 'SO_NEW_DOCUMENT_SEND_API1'
    EXPORTING
      document_data  = ls_doc
      commit_work    = 'X'
    TABLES
      object_content = lt_text
      receivers      = lt_empf
    EXCEPTIONS
      OTHERS         = 1.
ENDFORM.

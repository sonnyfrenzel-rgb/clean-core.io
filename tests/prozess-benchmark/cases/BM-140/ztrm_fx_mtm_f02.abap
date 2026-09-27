*&---------------------------------------------------------------------*
*& Include ZTRM_FX_MTM_F02 - Limite, Export, Sicherung, Ausgabe
*&---------------------------------------------------------------------*

CLASS lcl_breach_handler IMPLEMENTATION.
  METHOD on_breach.
    APPEND VALUE #( kontrh = iv_kontrh expo = iv_expo limit = iv_limit )
      TO gt_breach.
  ENDMETHOD.
ENDCLASS.

*&---------------------------------------------------------------------*
*& Form LIMITE_PRUEFEN
*&   Summe der positiven Marktwerte je Kontrahent gegen dessen Limit
*&---------------------------------------------------------------------*
FORM limite_pruefen.
  DATA: ls_mtm  TYPE ty_mtm,
        lv_expo TYPE ztrm_betrag.

  go_limit   = NEW zcl_trm_cpty_limit( iv_stichtag = p_datum ).
  go_handler = NEW lcl_breach_handler( ).
  SET HANDLER go_handler->on_breach FOR go_limit.

  SORT gt_mtm BY kontrh rfha.
  LOOP AT gt_mtm INTO ls_mtm.
    AT NEW kontrh.
      CLEAR lv_expo.
    ENDAT.

    IF ls_mtm-mtm > 0.
      lv_expo = lv_expo + ls_mtm-mtm.
    ENDIF.

    AT END OF kontrh.
      go_limit->pruefen( iv_kontrh = ls_mtm-kontrh
                         iv_expo   = lv_expo ).
    ENDAT.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form XML_EXPORT - Marktwerte als XML für das Risikosystem
*&---------------------------------------------------------------------*
FORM xml_export.
  DATA lv_xml TYPE xstring.

  CALL TRANSFORMATION id
    SOURCE stichtag = p_datum
           mtm      = gt_mtm
    RESULT XML lv_xml.

  OPEN DATASET p_file FOR OUTPUT IN BINARY MODE.
  IF sy-subrc <> 0.
    MESSAGE s312(ztrm) WITH p_file DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.
  TRANSFER lv_xml TO p_file.
  CLOSE DATASET p_file.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form STAND_SICHERN - heutigen Stand für den Vortagesvergleich
*&---------------------------------------------------------------------*
*& Cluster INDX(ZM), Schlüssel FXMTM<Datum>; wird nie gelöscht.
*&---------------------------------------------------------------------*
FORM stand_sichern.
  gv_indx = |FXMTM{ p_datum }|.
  EXPORT mtm = gt_mtm TO DATABASE indx(zm) ID gv_indx.
  COMMIT WORK.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form AUSGABE - Marktwerte, Limitverstöße, Positionsliste
*&---------------------------------------------------------------------*
*& Liste je Kontrahent mit Kopfzeile; bei Limitverstößen zusätzlich
*& die Positionsliste ZTRM_POSITION_LISTE der betroffenen Kontrahenten
*& (wird über den Listenspeicher in diese Liste übernommen).
*&---------------------------------------------------------------------*
FORM ausgabe.
  DATA: lt_list  TYPE STANDARD TABLE OF abaplist,
        lt_kont  TYPE RANGE OF vtbfha-kontrh,
        ls_mtm   TYPE ty_mtm,
        ls_brch  TYPE ty_breach.

  LOOP AT gt_mtm INTO ls_mtm.
    AT NEW kontrh.
      FORMAT COLOR COL_GROUP.
      WRITE: / 'Kontrahent', ls_mtm-kontrh.
      FORMAT COLOR OFF.
    ENDAT.
    WRITE: / ls_mtm-rfha, ls_mtm-fw_waers, ls_mtm-restlz,
             ls_mtm-mkurs, ls_mtm-mtm, ls_mtm-delta.
  ENDLOOP.

  IF gt_breach IS INITIAL.
    RETURN.
  ENDIF.

  SKIP.
  FORMAT COLOR COL_NEGATIVE.
  LOOP AT gt_breach INTO ls_brch.
    WRITE: / 'Limitüberschreitung', ls_brch-kontrh, ls_brch-expo, ls_brch-limit.
  ENDLOOP.
  FORMAT COLOR OFF.

* Positionsliste der betroffenen Kontrahenten anhängen
  lt_kont = VALUE #( FOR ls_b IN gt_breach
                     ( sign = 'I' option = 'EQ' low = ls_b-kontrh ) ).
  SUBMIT ztrm_position_liste
         WITH s_kontrh IN lt_kont
         WITH p_datum  =  p_datum
         EXPORTING LIST TO MEMORY
         AND RETURN.
  CALL FUNCTION 'LIST_FROM_MEMORY'
    TABLES
      listobject = lt_list
    EXCEPTIONS
      not_found  = 1
      OTHERS     = 2.
  IF sy-subrc = 0.
    CALL FUNCTION 'WRITE_LIST'
      TABLES
        listobject = lt_list.
  ENDIF.
ENDFORM.

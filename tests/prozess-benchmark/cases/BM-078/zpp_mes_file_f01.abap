*&---------------------------------------------------------------------*
*& Include ZPP_MES_FILE_F01 - Export Auftraege an MES
*&---------------------------------------------------------------------*
FORM export.
  TYPES: BEGIN OF lty_vg,
           vornr TYPE vornr,
           ltxa1 TYPE ltxa1,
           arbid TYPE cr_objid,
         END OF lty_vg,
         BEGIN OF lty_komp,
           matnr TYPE matnr,
           bdmng TYPE bdmng,
           meins TYPE meins,
           lgort TYPE lgort_d,
         END OF lty_komp.
  DATA: lt_auf    TYPE STANDARD TABLE OF ty_auf,
        ls_auf    TYPE ty_auf,
        lt_vg     TYPE STANDARD TABLE OF lty_vg,
        ls_vg     TYPE lty_vg,
        lt_komp   TYPE STANDARD TABLE OF lty_komp,
        ls_komp   TYPE lty_komp,
        lt_out    TYPE STANDARD TABLE OF string,
        lv_out    TYPE string,
        lt_export TYPE STANDARD TABLE OF zmes_export,
        lv_dummy  TYPE aufnr,
        lv_file   TYPE string,
        lv_bis    TYPE d.

  lv_bis = sy-datum + p_tage.

  SELECT a~aufnr a~objnr k~aufpl k~gstrp k~gltrp p~matnr p~psmng p~amein
    INTO TABLE lt_auf
    FROM aufk AS a
    INNER JOIN afko AS k ON k~aufnr = a~aufnr
    INNER JOIN afpo AS p ON p~aufnr = a~aufnr
    WHERE a~werks =  p_werks
      AND a~autyp =  '10'
      AND k~gstrp <= lv_bis.
  IF sy-subrc <> 0.
    mes_log 'I' 'Export: keine Auftraege im Horizont'.
    RETURN.
  ENDIF.

  LOOP AT lt_auf INTO ls_auf.
*   nur freigegebene Auftraege
    CALL FUNCTION 'STATUS_CHECK'
      EXPORTING
        objnr             = ls_auf-objnr
        status            = 'I0002'
      EXCEPTIONS
        object_not_found  = 1
        status_not_active = 2
        OTHERS            = 3.
    IF sy-subrc <> 0.
      CONTINUE.
    ENDIF.

*   schon einmal exportiert? Aenderungen nach Export gehen NICHT nochmal raus
    SELECT SINGLE aufnr FROM zmes_export INTO lv_dummy
      WHERE aufnr = ls_auf-aufnr.
    IF sy-subrc = 0.
      CONTINUE.
    ENDIF.

    lv_out = |H;{ ls_auf-aufnr };{ ls_auf-matnr };{ ls_auf-psmng };{ ls_auf-amein };| &&
             |{ ls_auf-gstrp };{ ls_auf-gltrp }|.
    APPEND lv_out TO lt_out.

    SELECT vornr ltxa1 arbid FROM afvc INTO TABLE lt_vg
      WHERE aufpl = ls_auf-aufpl.
    LOOP AT lt_vg INTO ls_vg.
      lv_out = |O;{ ls_auf-aufnr };{ ls_vg-vornr };{ ls_vg-ltxa1 };{ ls_vg-arbid }|.
      APPEND lv_out TO lt_out.
    ENDLOOP.

    SELECT matnr bdmng meins lgort FROM resb INTO TABLE lt_komp
      WHERE aufnr = ls_auf-aufnr
        AND xloek = space.
    LOOP AT lt_komp INTO ls_komp.
      lv_out = |C;{ ls_auf-aufnr };{ ls_komp-matnr };{ ls_komp-bdmng };{ ls_komp-meins };{ ls_komp-lgort }|.
      APPEND lv_out TO lt_out.
    ENDLOOP.

    APPEND VALUE #( mandt = sy-mandt aufnr = ls_auf-aufnr
                    datum = sy-datum uzeit = sy-uzeit ) TO lt_export.
  ENDLOOP.

  IF lt_out IS INITIAL.
    mes_log 'I' 'Export: keine neuen freigegebenen Auftraege'.
    RETURN.
  ENDIF.

  lv_file = |{ p_pfad }out/AUF_{ p_werks }_{ sy-datum }{ sy-uzeit }.csv|.
  OPEN DATASET lv_file FOR OUTPUT IN TEXT MODE ENCODING UTF-8.
  IF sy-subrc <> 0.
    gv_text = |Export: Datei { lv_file } nicht schreibbar|.
    mes_log 'E' gv_text.
    RETURN.
  ENDIF.

  LOOP AT lt_out INTO lv_out.
    TRANSFER lv_out TO lv_file.
  ENDLOOP.
  CLOSE DATASET lv_file.

  INSERT zmes_export FROM TABLE lt_export ACCEPTING DUPLICATE KEYS.
  COMMIT WORK.

  gv_text = |Export: { lines( lt_export ) } Auftraege nach { lv_file }|.
  mes_log 'S' gv_text.
ENDFORM.

REPORT zmm_umlag_upload.
*----------------------------------------------------------------------*
* Umlagerung Werk an Werk (BWA 301) aus Datei vom Applikationsserver
* Datei kommt nachts vom Logistik-Dienstleister, Format CSV:
* Material;Werk ab;LOrt ab;Werk an;LOrt an;Menge;Charge
*----------------------------------------------------------------------*
PARAMETERS: p_file TYPE rlgrap-filename
              DEFAULT '/interface/in/umlag.csv' LOWER CASE,
            p_test AS CHECKBOX DEFAULT 'X'.

TYPES: BEGIN OF ty_line,
         matnr TYPE matnr,
         werks TYPE werks_d,
         lgort TYPE lgort_d,
         umwrk TYPE umwrk,
         umlgo TYPE umlgo,
         menge TYPE erfmg,
         charg TYPE charg_d,
       END OF ty_line.

DATA: gt_line   TYPE STANDARD TABLE OF ty_line,
      gs_line   TYPE ty_line,
      gv_rec    TYPE string,
      gv_menge  TYPE string,
      gv_labst  TYPE labst,
      gs_head   TYPE bapi2017_gm_head_01,
      gs_code   TYPE bapi2017_gm_code,
      gt_item   TYPE STANDARD TABLE OF bapi2017_gm_item_create,
      gs_item   TYPE bapi2017_gm_item_create,
      gt_return TYPE STANDARD TABLE OF bapiret2,
      gs_return TYPE bapiret2,
      gv_mblnr  TYPE mblnr,
      gv_mjahr  TYPE mjahr.

START-OF-SELECTION.
  OPEN DATASET p_file FOR INPUT IN TEXT MODE ENCODING DEFAULT.
  IF sy-subrc <> 0.
    MESSAGE e398(00) WITH 'Datei nicht lesbar:' p_file.
  ENDIF.
  DO.
    READ DATASET p_file INTO gv_rec.
    IF sy-subrc <> 0.
      EXIT.
    ENDIF.
    SPLIT gv_rec AT ';' INTO gs_line-matnr gs_line-werks gs_line-lgort
                             gs_line-umwrk gs_line-umlgo gv_menge gs_line-charg.
    TRANSLATE gv_menge USING ',.'.
    gs_line-menge = gv_menge.
    APPEND gs_line TO gt_line.
  ENDDO.
  CLOSE DATASET p_file.

  LOOP AT gt_line INTO gs_line.
*   Bestand am abgebenden Lagerort pruefen - sonst Fehler im BAPI zu spaet
    SELECT SINGLE labst FROM mard INTO gv_labst
      WHERE matnr = gs_line-matnr
        AND werks = gs_line-werks
        AND lgort = gs_line-lgort.
    IF sy-subrc <> 0 OR gv_labst < gs_line-menge.
      WRITE: / gs_line-matnr, gs_line-werks, gs_line-lgort,
               'Bestand nicht ausreichend:', gv_labst.
      CONTINUE.
    ENDIF.

    CLEAR: gs_item, gt_item, gt_return.
    gs_code-gm_code   = '04'.
    gs_head-pstng_date = sy-datum.
    gs_head-doc_date   = sy-datum.
    gs_head-header_txt = 'Umlagerung Dienstleister'.
    gs_item-material   = gs_line-matnr.
    gs_item-plant      = gs_line-werks.
    gs_item-stge_loc   = gs_line-lgort.
    gs_item-batch      = gs_line-charg.
    gs_item-move_type  = '301'.
    gs_item-entry_qnt  = gs_line-menge.
    gs_item-move_plant = gs_line-umwrk.
    gs_item-move_stloc = gs_line-umlgo.
    APPEND gs_item TO gt_item.

    CALL FUNCTION 'BAPI_GOODSMVT_CREATE'
      EXPORTING
        goodsmvt_header  = gs_head
        goodsmvt_code    = gs_code
        testrun          = p_test
      IMPORTING
        materialdocument = gv_mblnr
        matdocumentyear  = gv_mjahr
      TABLES
        goodsmvt_item    = gt_item
        return           = gt_return.

    LOOP AT gt_return INTO gs_return WHERE type CA 'EA'.
      EXIT.
    ENDLOOP.
    IF sy-subrc = 0.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      WRITE: / gs_line-matnr, gs_line-werks, gs_return-message.
    ELSEIF p_test IS INITIAL.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING
          wait = 'X'.
      WRITE: / gs_line-matnr, gs_line-werks, '->', gs_line-umwrk,
               'Materialbeleg', gv_mblnr, gv_mjahr.
    ELSE.
      WRITE: / gs_line-matnr, gs_line-werks, 'Testlauf ohne Fehler'.
    ENDIF.
  ENDLOOP.

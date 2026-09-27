REPORT zps_mlst_fakt_frei.
*----------------------------------------------------------------------*
* Meilensteinfakturierung: Fakturasperre im Fakturierungsplan lösen,
* sobald der zugeordnete Meilenstein ein Ist-Datum hat.
* 11/2012 PSC - Workaround, Meilensteine kommen per Excel-Upload,
*               die Standardfreigabe über die Rückmeldung greift nicht
* 04/2015 PSC - Sperrgrund aus TVARVC statt fest 'Z1'
*----------------------------------------------------------------------*
TABLES prps.
SELECT-OPTIONS s_posid FOR prps-posid.
PARAMETERS p_test AS CHECKBOX DEFAULT 'X'.

TYPES: BEGIN OF ty_mlst,
         mlst_zaehl TYPE mlst-mlst_zaehl,
         pspnr      TYPE mlst-pspnr,
         lst_actdt  TYPE mlst-lst_actdt,
       END OF ty_mlst.
DATA: gt_mlst   TYPE STANDARD TABLE OF ty_mlst,
      gt_fplt   TYPE STANDARD TABLE OF fplt,
      gv_sperre TYPE fplt-faksp,
      gv_cnt    TYPE i.
FIELD-SYMBOLS <gs_fplt> TYPE fplt.

START-OF-SELECTION.
* Sperrgrund "Meilenstein offen" aus TVARVC, Default Z1
  SELECT SINGLE low FROM tvarvc INTO gv_sperre
    WHERE name = 'ZPS_MLST_FAKSP'
      AND type = 'P'.
  IF sy-subrc <> 0.
    gv_sperre = 'Z1'.
  ENDIF.

* erreichte Meilensteine der selektierten PSP-Elemente
  SELECT m~mlst_zaehl m~pspnr m~lst_actdt
    FROM mlst AS m INNER JOIN prps AS p ON p~pspnr = m~pspnr
    INTO TABLE gt_mlst
    WHERE p~posid IN s_posid
      AND m~lst_actdt <> '00000000'.

* gesperrte Planpositionen zu diesen Meilensteinen
  SELECT * FROM fplt INTO TABLE gt_fplt
    FOR ALL ENTRIES IN gt_mlst
    WHERE mlstn = gt_mlst-mlst_zaehl
      AND faksp = gv_sperre.

  SORT gt_mlst BY mlst_zaehl.
  LOOP AT gt_fplt ASSIGNING <gs_fplt>.
    READ TABLE gt_mlst WITH KEY mlst_zaehl = <gs_fplt>-mlstn
      BINARY SEARCH TRANSPORTING NO FIELDS.
    IF sy-subrc <> 0.
      CONTINUE.
    ENDIF.
    IF p_test IS INITIAL.
      UPDATE fplt SET faksp = space
        WHERE fplnr = <gs_fplt>-fplnr
          AND fpltr = <gs_fplt>-fpltr.
    ENDIF.
    gv_cnt = gv_cnt + 1.
    WRITE: / <gs_fplt>-fplnr, <gs_fplt>-fpltr, <gs_fplt>-fkdat,
             <gs_fplt>-fakwr, <gs_fplt>-waers.
  ENDLOOP.

  IF p_test IS INITIAL.
    COMMIT WORK.
  ENDIF.
  DATA(lv_txt) = COND string( WHEN p_test = 'X' THEN 'würden freigegeben (Testlauf)'
                              ELSE 'freigegeben' ).
  WRITE: / gv_cnt, 'Planpositionen', lv_txt.

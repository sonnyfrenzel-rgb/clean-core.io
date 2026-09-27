*----------------------------------------------------------------------*
***INCLUDE ZPM_TPLATZ_BAUM_F01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form BUILD_WHERE
*&---------------------------------------------------------------------*
* Dynamische Zusatzbedingung aus Platzart und Standortwerk
*----------------------------------------------------------------------*
FORM build_where.
  CLEAR gv_where.
  IF s_fltyp[] IS NOT INITIAL.
    gv_where = 'FLTYP IN S_FLTYP'.
  ENDIF.
  IF s_swerk[] IS NOT INITIAL.
    IF gv_where IS NOT INITIAL.
      CONCATENATE gv_where 'AND' INTO gv_where SEPARATED BY space.
    ENDIF.
    CONCATENATE gv_where 'SWERK IN S_SWERK' INTO gv_where
                SEPARATED BY space.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form EXPAND
*&---------------------------------------------------------------------*
* Unterplätze eines Platzes ausgeben und rekursiv weiter auflösen
*----------------------------------------------------------------------*
FORM expand USING pv_parent TYPE iflot-tplnr
                  pv_level  TYPE i.
  DATA: lt_child  TYPE STANDARD TABLE OF ty_node,
        ls_child  TYPE ty_node,
        lv_indent TYPE i,
        lv_next   TYPE i,
        lv_dummy  TYPE jest-stat.

  lv_indent = pv_level * 2 + 1.
  IF pv_level >= p_maxl.
    WRITE: AT /lv_indent '... weitere Ebenen unter', pv_parent.
    RETURN.
  ENDIF.

  SELECT tplnr tplma pltxt objnr FROM iflo INTO TABLE lt_child
    WHERE tplma = pv_parent
      AND spras = sy-langu
      AND (gv_where).
  SORT lt_child BY tplnr.

  lv_next = pv_level + 1.
  LOOP AT lt_child INTO ls_child.
    SELECT SINGLE stat FROM jest INTO lv_dummy
      WHERE objnr = ls_child-objnr
        AND stat  = gc_inak
        AND inact = space.
    IF sy-subrc = 0.
      CONTINUE.
    ENDIF.

    gv_anz_pl = gv_anz_pl + 1.
    WRITE AT /lv_indent ls_child-tplnr COLOR COL_KEY.
    WRITE ls_child-pltxt.
    gv_tplnr = ls_child-tplnr.
    HIDE gv_tplnr.
    CLEAR gv_tplnr.

    IF p_equi = 'X'.
      PERFORM list_equi USING ls_child-tplnr lv_next.
    ENDIF.
    PERFORM expand USING ls_child-tplnr lv_next.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form LIST_EQUI
*&---------------------------------------------------------------------*
* Direkt am Platz eingebaute Equipments (ohne Unterequipments)
*----------------------------------------------------------------------*
FORM list_equi USING pv_tplnr TYPE iflot-tplnr
                     pv_level TYPE i.
  DATA: lt_equi   TYPE STANDARD TABLE OF ty_equi,
        ls_equi   TYPE ty_equi,
        lv_indent TYPE i.

  SELECT z~equnr t~eqktx INTO TABLE lt_equi
    FROM equz AS z
    INNER JOIN iloa AS i ON i~iloan = z~iloan
    LEFT OUTER JOIN eqkt AS t ON t~equnr = z~equnr
                             AND t~spras = sy-langu
    WHERE i~tplnr = pv_tplnr
      AND z~datbi = '99991231'
      AND z~heqnr = space.
  CHECK sy-subrc = 0.

  lv_indent = pv_level * 2 + 3.
  LOOP AT lt_equi INTO ls_equi.
    gv_anz_eq = gv_anz_eq + 1.
    WRITE AT /lv_indent ls_equi-equnr COLOR COL_NORMAL.
    WRITE ls_equi-eqktx.
    gv_equnr = ls_equi-equnr.
    HIDE gv_equnr.
    CLEAR gv_equnr.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form LIST_ALV  (alt, durch Strukturliste ersetzt)
*&---------------------------------------------------------------------*
FORM list_alv TABLES pt_out.
  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      i_structure_name = 'IFLO'
    TABLES
      t_outtab         = pt_out.
ENDFORM.

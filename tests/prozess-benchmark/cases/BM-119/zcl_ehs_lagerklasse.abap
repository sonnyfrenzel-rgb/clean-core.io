CLASS zcl_ehs_lagerklasse DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
*----------------------------------------------------------------------*
* Zusammenlagerungsprüfung nach TRGS 510 (Anlage 4)
* Matrix ZEHS_ZL_MATRIX: eine Zeile je Lagerklasse (Feld LGK), eine
* Spalte je Lagerklasse (L1, L2A, L2B, L3, L4_1A, L4_1B, ... L13).
* Zellwert: 1 = zulässig, 2 = eingeschränkt zulässig (Separierung),
*           3 = nicht zulässig.
*----------------------------------------------------------------------*
* 2019-04 NKL  Erstellung
* 2020-01 NKL  werksspezifische Matrix (Werk vor '*')
* 2023-02 EXT  Lagerklassen mit Punkt (4.1A) als Spalte L4_1A
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    METHODS constructor
      IMPORTING
        iv_werks TYPE werks_d.
    METHODS pruefen
      IMPORTING
        it_lgk TYPE zehs_t_lgk
      RAISING
        zcx_ehs_zusammenlagerung.

  PRIVATE SECTION.
    DATA mt_matrix TYPE SORTED TABLE OF zehs_zl_matrix
                   WITH UNIQUE KEY werks lgk.
    DATA mv_werks  TYPE werks_d.
ENDCLASS.


CLASS zcl_ehs_lagerklasse IMPLEMENTATION.

  METHOD constructor.
    mv_werks = iv_werks.
    SELECT * FROM zehs_zl_matrix
      WHERE werks = @iv_werks
         OR werks = '*'
      INTO TABLE @mt_matrix.
  ENDMETHOD.


  METHOD pruefen.
    FIELD-SYMBOLS: <ls_row>  TYPE zehs_zl_matrix,
                   <lv_cell> TYPE any.
    DATA: lv_col  TYPE fieldname,
          lv_from TYPE i.

    LOOP AT it_lgk INTO DATA(lv_a).
      lv_from = sy-tabix + 1.

*     werksspezifische Zeile vor der allgemeinen
      READ TABLE mt_matrix ASSIGNING <ls_row>
           WITH TABLE KEY werks = mv_werks lgk = lv_a.
      IF sy-subrc <> 0.
        READ TABLE mt_matrix ASSIGNING <ls_row>
             WITH TABLE KEY werks = '*' lgk = lv_a.
      ENDIF.
      IF sy-subrc <> 0.
        RAISE EXCEPTION TYPE zcx_ehs_zusammenlagerung
          EXPORTING
            textid = zcx_ehs_zusammenlagerung=>lgk_unbekannt
            lgk1   = lv_a.
      ENDIF.

      LOOP AT it_lgk INTO DATA(lv_b) FROM lv_from.
        lv_col = replace( val = |L{ lv_b }| sub = '.' with = '_' occ = 0 ).
        ASSIGN COMPONENT lv_col OF STRUCTURE <ls_row> TO <lv_cell>.
        IF sy-subrc <> 0.
          CONTINUE.
        ENDIF.
        CASE <lv_cell>.
          WHEN '1' OR '2'.
*           zulässig bzw. mit Separierung zulässig
          WHEN OTHERS.
            RAISE EXCEPTION TYPE zcx_ehs_zusammenlagerung
              EXPORTING
                textid = zcx_ehs_zusammenlagerung=>verboten
                lgk1   = lv_a
                lgk2   = lv_b.
        ENDCASE.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.

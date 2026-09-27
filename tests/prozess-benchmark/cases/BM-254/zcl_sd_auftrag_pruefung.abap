CLASS zcl_sd_auftrag_pruefung DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES tt_position TYPE zcl_zsd_auftrag_mpc=>tt_position.

    METHODS pruefe_kunde
      IMPORTING iv_kunnr TYPE kunnr
                iv_vkorg TYPE vkorg
                iv_vtweg TYPE vtweg
                iv_spart TYPE spart
      RAISING   zcx_sd_auftrag.

    METHODS pruefe_materialien
      IMPORTING it_pos   TYPE tt_position
                iv_vkorg TYPE vkorg
                iv_vtweg TYPE vtweg
      RAISING   zcx_sd_auftrag.

    "! abap_true, wenn Obligo + Auftragswert das Kreditlimit nicht uebersteigt
    METHODS kredit_ok
      IMPORTING iv_kunnr     TYPE kunnr
                iv_kkber     TYPE kkber
                iv_wert      TYPE netwr_ak
      RETURNING VALUE(rv_ok) TYPE abap_bool.

  PRIVATE SECTION.
    CONSTANTS: gc_vmsta_gesperrt TYPE vmsta VALUE 'Z9',
               gc_vmsta_auslauf  TYPE vmsta VALUE 'Z1'.

    METHODS fehler
      IMPORTING iv_msgno  TYPE symsgno
                iv_objekt TYPE any
      RAISING   zcx_sd_auftrag.
ENDCLASS.



CLASS zcl_sd_auftrag_pruefung IMPLEMENTATION.

  METHOD pruefe_kunde.
    SELECT SINGLE kunnr, aufsd, loevm
      FROM kna1
      WHERE kunnr = @iv_kunnr
      INTO @DATA(ls_kna1).
    IF sy-subrc <> 0.
      fehler( iv_msgno = '010' iv_objekt = iv_kunnr ).     "Kunde unbekannt
    ENDIF.

    IF ls_kna1-loevm = abap_true OR ls_kna1-aufsd IS NOT INITIAL.
      fehler( iv_msgno = '011' iv_objekt = iv_kunnr ).     "Kunde gesperrt
    ENDIF.

*   Vertriebsbereichsdaten
    SELECT SINGLE kunnr, aufsd
      FROM knvv
      WHERE kunnr = @iv_kunnr
        AND vkorg = @iv_vkorg
        AND vtweg = @iv_vtweg
        AND spart = @iv_spart
      INTO @DATA(ls_knvv).
    IF sy-subrc <> 0.
      fehler( iv_msgno = '012' iv_objekt = iv_kunnr ).     "nicht im Vertriebsbereich
    ELSEIF ls_knvv-aufsd IS NOT INITIAL.
      fehler( iv_msgno = '011' iv_objekt = iv_kunnr ).
    ENDIF.
  ENDMETHOD.


  METHOD pruefe_materialien.
    LOOP AT it_pos INTO DATA(ls_pos).

      SELECT SINGLE vmsta
        FROM mvke
        WHERE matnr = @ls_pos-matnr
          AND vkorg = @iv_vkorg
          AND vtweg = @iv_vtweg
        INTO @DATA(lv_vmsta).
      IF sy-subrc <> 0.
        fehler( iv_msgno = '020' iv_objekt = ls_pos-matnr ). "nicht im Vertrieb angelegt
      ENDIF.

      CASE lv_vmsta.
        WHEN gc_vmsta_gesperrt.
          fehler( iv_msgno = '021' iv_objekt = ls_pos-matnr ).
        WHEN gc_vmsta_auslauf.
*         Auslaufmaterial: nur Restbestand, Menge wird im Mapper nicht begrenzt (!)
          CONTINUE.
        WHEN OTHERS.
      ENDCASE.
    ENDLOOP.
  ENDMETHOD.


  METHOD kredit_ok.
*   klassisches FI-AR-Kreditmanagement (KNKK); UKM noch nicht aktiv
    SELECT SINGLE klimk, skfor, ssobl
      FROM knkk
      WHERE kunnr = @iv_kunnr
        AND kkber = @iv_kkber
      INTO @DATA(ls_knkk).
    IF sy-subrc <> 0.
      rv_ok = abap_true.          "kein Limit gepflegt -> keine Pruefung
      RETURN.
    ENDIF.

    rv_ok = xsdbool( ls_knkk-skfor + ls_knkk-ssobl + iv_wert <= ls_knkk-klimk ).
  ENDMETHOD.


  METHOD fehler.
    RAISE EXCEPTION TYPE zcx_sd_auftrag
      EXPORTING
        textid    = VALUE #( msgid = zcx_sd_auftrag=>gc_msgid msgno = iv_msgno
                             attr1 = 'MV_OBJEKT' )
        mv_objekt = CONV #( iv_objekt ).
  ENDMETHOD.

ENDCLASS.

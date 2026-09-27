CLASS zbp_i_reklamation DEFINITION
  PUBLIC
  ABSTRACT
  FINAL
  FOR BEHAVIOR OF zi_reklamation.

  PUBLIC SECTION.
    TYPES ty_stufe TYPE n LENGTH 1.

    "! Eskalationsstufe aus Alter der Reklamation und Schadenshoehe
    CLASS-METHODS ermittle_stufe
      IMPORTING
        iv_eingang      TYPE d
        iv_schaden      TYPE ztqm_schaden
        iv_stufe_alt    TYPE ty_stufe
      RETURNING
        VALUE(rv_stufe) TYPE ty_stufe.
ENDCLASS.



CLASS zbp_i_reklamation IMPLEMENTATION.

  METHOD ermittle_stufe.
    DATA(lv_alter) = sy-datum - iv_eingang.

    rv_stufe = COND #( WHEN iv_schaden >= 50000 OR lv_alter > 30 THEN '3'
                       WHEN iv_schaden >= 10000 OR lv_alter > 14 THEN '2'
                       ELSE '1' ).

*   Eine Eskalation geht nie zurueck, hoechstens bis Stufe 3
    IF rv_stufe <= iv_stufe_alt AND iv_stufe_alt < '3'.
      rv_stufe = iv_stufe_alt + 1.
    ENDIF.
  ENDMETHOD.

ENDCLASS.

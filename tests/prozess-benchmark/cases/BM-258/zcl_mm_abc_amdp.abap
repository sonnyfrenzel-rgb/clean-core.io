CLASS zcl_mm_abc_amdp DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_amdp_marker_hdb.

    TYPES: BEGIN OF ty_verbrauch,
             matnr TYPE matnr,
             wert  TYPE dmbtr,
           END OF ty_verbrauch,
           tt_verbrauch TYPE STANDARD TABLE OF ty_verbrauch WITH EMPTY KEY,
           BEGIN OF ty_abc,
             matnr      TYPE matnr,
             wert       TYPE dmbtr,
             kum_anteil TYPE p LENGTH 5 DECIMALS 2,
             klasse     TYPE maabc,
           END OF ty_abc,
           tt_abc TYPE STANDARD TABLE OF ty_abc WITH EMPTY KEY.

    "! Verbrauchswert je Material: Warenausgaenge (201/261/601)
    "! abzueglich ihrer Stornos (202/262/602) im Zeitraum
    CLASS-METHODS verbrauch
      IMPORTING VALUE(iv_mandt)     TYPE mandt
                VALUE(iv_werks)     TYPE werks_d
                VALUE(iv_von)       TYPE d
                VALUE(iv_bis)       TYPE d
      EXPORTING VALUE(et_verbrauch) TYPE tt_verbrauch
      RAISING   cx_amdp_error.

    "! Klassen nach kumuliertem Wertanteil (absteigend sortiert)
    CLASS-METHODS klassifiziere
      IMPORTING VALUE(it_verbrauch) TYPE tt_verbrauch
                VALUE(iv_grenz_a)   TYPE zmm_abc_prozent
                VALUE(iv_grenz_b)   TYPE zmm_abc_prozent
      EXPORTING VALUE(et_abc)       TYPE tt_abc
      RAISING   cx_amdp_error.
ENDCLASS.



CLASS zcl_mm_abc_amdp IMPLEMENTATION.

  METHOD verbrauch BY DATABASE PROCEDURE FOR HDB
                   LANGUAGE SQLSCRIPT
                   OPTIONS READ-ONLY
                   USING mseg.

    et_verbrauch =
      SELECT matnr,
             SUM( CASE WHEN bwart IN ( '202', '262', '602' ) THEN -dmbtr ELSE dmbtr END ) AS wert
        FROM mseg
       WHERE mandt = :iv_mandt
         AND werks = :iv_werks
         AND budat_mkpf BETWEEN :iv_von AND :iv_bis
         AND bwart IN ( '201', '202', '261', '262', '601', '602' )
       GROUP BY matnr
      HAVING SUM( CASE WHEN bwart IN ( '202', '262', '602' ) THEN -dmbtr ELSE dmbtr END ) > 0;
  ENDMETHOD.


  METHOD klassifiziere BY DATABASE PROCEDURE FOR HDB
                       LANGUAGE SQLSCRIPT
                       OPTIONS READ-ONLY.

    lt_kum =
      SELECT matnr,
             wert,
             SUM( wert ) OVER ( ORDER BY wert DESC, matnr
                                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW )
               * 100 / SUM( wert ) OVER ( ) AS kum_anteil
        FROM :it_verbrauch;

    et_abc =
      SELECT matnr,
             wert,
             kum_anteil,
             CASE WHEN kum_anteil <= :iv_grenz_a THEN 'A'
                  WHEN kum_anteil <= :iv_grenz_b THEN 'B'
                  ELSE 'C'
             END AS klasse
        FROM :lt_kum
       ORDER BY wert DESC;
  ENDMETHOD.

ENDCLASS.

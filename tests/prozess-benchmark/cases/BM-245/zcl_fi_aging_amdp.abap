CLASS zcl_fi_aging_amdp DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_amdp_marker_hdb.

    TYPES: BEGIN OF ty_raster,
             bukrs    TYPE bukrs,
             kunnr    TYPE kunnr,
             name1    TYPE name1_gp,
             tage_030 TYPE wrbtr,
             tage_060 TYPE wrbtr,
             tage_090 TYPE wrbtr,
             tage_ueb TYPE wrbtr,
             summe    TYPE wrbtr,
             waers    TYPE waers,
           END OF ty_raster,
           tt_raster TYPE STANDARD TABLE OF ty_raster WITH EMPTY KEY.

    CLASS-METHODS get_raster
      IMPORTING
        VALUE(iv_mandt)    TYPE mandt
        VALUE(iv_stichtag) TYPE sy-datum
        VALUE(iv_where)    TYPE string
      EXPORTING
        VALUE(et_raster)   TYPE tt_raster
      RAISING
        cx_amdp_error.
ENDCLASS.



CLASS zcl_fi_aging_amdp IMPLEMENTATION.

  METHOD get_raster BY DATABASE PROCEDURE FOR HDB
                    LANGUAGE SQLSCRIPT
                    OPTIONS READ-ONLY
                    USING bsid kna1.

    lt_op = APPLY_FILTER( bsid, :iv_where );

    et_raster =
      SELECT op.bukrs, op.kunnr, k.name1,
             SUM( CASE WHEN DAYS_BETWEEN( TO_DATE( op.zfbdt ), :iv_stichtag ) <= 30
                       THEN CASE op.shkzg WHEN 'H' THEN -op.dmbtr ELSE op.dmbtr END ELSE 0 END ) AS tage_030,
             SUM( CASE WHEN DAYS_BETWEEN( TO_DATE( op.zfbdt ), :iv_stichtag ) BETWEEN 31 AND 60
                       THEN CASE op.shkzg WHEN 'H' THEN -op.dmbtr ELSE op.dmbtr END ELSE 0 END ) AS tage_060,
             SUM( CASE WHEN DAYS_BETWEEN( TO_DATE( op.zfbdt ), :iv_stichtag ) BETWEEN 61 AND 90
                       THEN CASE op.shkzg WHEN 'H' THEN -op.dmbtr ELSE op.dmbtr END ELSE 0 END ) AS tage_090,
             SUM( CASE WHEN DAYS_BETWEEN( TO_DATE( op.zfbdt ), :iv_stichtag ) > 90
                       THEN CASE op.shkzg WHEN 'H' THEN -op.dmbtr ELSE op.dmbtr END ELSE 0 END ) AS tage_ueb,
             SUM( CASE op.shkzg WHEN 'H' THEN -op.dmbtr ELSE op.dmbtr END ) AS summe,
             'EUR' AS waers
        FROM :lt_op AS op
        INNER JOIN kna1 AS k
                ON k.mandt = op.mandt
               AND k.kunnr = op.kunnr
       WHERE op.mandt = :iv_mandt
         AND op.budat <= :iv_stichtag
       GROUP BY op.bukrs, op.kunnr, k.name1
       ORDER BY op.bukrs, op.kunnr;
  ENDMETHOD.

ENDCLASS.

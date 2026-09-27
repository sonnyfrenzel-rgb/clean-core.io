CLASS zcl_ser_gtin_cache DEFINITION
  PUBLIC
  FINAL
  CREATE PRIVATE.

*"* Zugriff auf die GTIN-Stammdaten im Shared-Objects-Gebiet
*"* ZCL_SER_GTIN_AREA (SHMA: Gebiet ZSER_GTIN_AREA, Wurzelklasse
*"* ZCL_SER_GTIN_CACHE_ROOT, ohne automatischen Aufbau, mandantenabh.).
*"* Der Aufbau erfolgt beim ersten Lesen nach Systemstart/Invalidierung.
  PUBLIC SECTION.
    CLASS-METHODS get_gtin
      IMPORTING iv_matnr       TYPE matnr
      RETURNING VALUE(rs_gtin) TYPE zser_gtin
      RAISING   zcx_ser_cache.
    CLASS-METHODS invalidate.

  PRIVATE SECTION.
    CLASS-METHODS build_area
      RAISING zcx_ser_cache.
ENDCLASS.



CLASS zcl_ser_gtin_cache IMPLEMENTATION.

  METHOD get_gtin.
    DATA: lo_area  TYPE REF TO zcl_ser_gtin_area,
          lv_tries TYPE i.

    TRY.
        lo_area = zcl_ser_gtin_area=>attach_for_read( ).
      CATCH cx_shm_no_active_version.
*       Gebiet leer (Systemstart, Invalidierung nach SM30-Pflege):
*       einmal selbst aufbauen und erneut lesen
        IF lv_tries >= 1.
          RAISE EXCEPTION TYPE zcx_ser_cache
            EXPORTING
              textid = zcx_ser_cache=>no_active_version.
        ENDIF.
        lv_tries = lv_tries + 1.
        build_area( ).
        RETRY.
      CATCH cx_shm_inconsistent cx_shm_read_lock_active INTO DATA(lx_shm).
        RAISE EXCEPTION TYPE zcx_ser_cache
          EXPORTING
            previous = lx_shm.
    ENDTRY.

    READ TABLE lo_area->root->mt_gtin INTO rs_gtin
         WITH TABLE KEY matnr = iv_matnr.
*   IF sy-subrc <> 0.     "JW 2023: Nachlesen aus DB -> Aufrufer prueft initial
*     SELECT SINGLE * FROM zser_gtin INTO rs_gtin WHERE matnr = iv_matnr.
*   ENDIF.
    lo_area->detach( ).
  ENDMETHOD.


  METHOD build_area.
    DATA: lo_area TYPE REF TO zcl_ser_gtin_area,
          lo_root TYPE REF TO zcl_ser_gtin_cache_root.

    TRY.
        lo_area = zcl_ser_gtin_area=>attach_for_write( ).
      CATCH cx_shm_exclusive_lock_active.
*       baut gerade ein anderer Prozess auf (Linie 3/4 parallel) -
*       kurz warten, der Aufrufer liest danach erneut
        WAIT UP TO 1 SECONDS.
        RETURN.
      CATCH cx_shm_error INTO DATA(lx_shm).
        RAISE EXCEPTION TYPE zcx_ser_cache
          EXPORTING
            previous = lx_shm.
    ENDTRY.

    CREATE OBJECT lo_root AREA HANDLE lo_area.
    lo_root->load( ).
    lo_area->set_root( lo_root ).
    lo_area->detach_commit( ).
  ENDMETHOD.


  METHOD invalidate.
*   Aufruf aus Ereignis 01 des Pflegeviews ZSER_GTIN_V (Tabellenpflege)
    zcl_ser_gtin_area=>invalidate_area( ).
  ENDMETHOD.

ENDCLASS.

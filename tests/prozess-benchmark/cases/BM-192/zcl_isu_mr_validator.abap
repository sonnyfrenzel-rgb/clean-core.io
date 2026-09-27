*----------------------------------------------------------------------*
* Klasse ZCL_ISU_MR_VALIDATOR
* Plausibilisierung von Zaehlerstaenden aus der Ablese-App (MobileRead)
* vor dem Upload ueber BAPI_MTRREADDOC_UPLOAD.
* 2020-05  S.Wolter   Erstellung
* 2021-10  S.Wolter   Ueberlauf-Erkennung (Rollierzaehler)
*----------------------------------------------------------------------*
CLASS zcl_isu_mr_validator DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES: BEGIN OF ts_head,
             serialno   TYPE gernr,
             readdate   TYPE ablesdat,
             readtime   TYPE ablzeit,
             reason     TYPE ablesgr,
             readernote TYPE char40,
           END OF ts_head,
           BEGIN OF ts_register,
             register   TYPE e_zwnummer,
             reading    TYPE p LENGTH 13 DECIMALS 3,
             docno      TYPE ablbelnr,
             msgtext    TYPE bapi_msg,
           END OF ts_register,
           tt_register TYPE STANDARD TABLE OF ts_register WITH DEFAULT KEY.

    DATA mv_equnr TYPE equnr READ-ONLY.

    METHODS validate
      IMPORTING
        is_head      TYPE ts_head
        it_registers TYPE tt_register
      EXPORTING
        et_messages  TYPE bapiret2_t
      RETURNING
        VALUE(rv_ok) TYPE abap_bool.

  PRIVATE SECTION.
    CONSTANTS gc_msgid TYPE symsgid VALUE 'ZISU_MR'.

    METHODS check_photo_hash
      IMPORTING
        iv_hash      TYPE string
      RETURNING
        VALUE(rv_ok) TYPE abap_bool.
ENDCLASS.



CLASS zcl_isu_mr_validator IMPLEMENTATION.

  METHOD validate.

    DATA: lv_prev     TYPE p LENGTH 13 DECIMALS 3,
          lv_max      TYPE p LENGTH 13 DECIMALS 3,
          lv_overflow TYPE p LENGTH 13 DECIMALS 3.

    CLEAR: et_messages, mv_equnr.

*   Geraet ueber Seriennummer - die App kennt keine Equipmentnummer
    SELECT equnr FROM equi
      WHERE sernr = @is_head-serialno
        AND eqtyp = 'I'
      INTO TABLE @DATA(lt_equi)
      UP TO 2 ROWS.

    CASE lines( lt_equi ).
      WHEN 0.
        APPEND VALUE #( type = 'E' id = gc_msgid number = '001'
                        message_v1 = is_head-serialno ) TO et_messages.
        RETURN.
      WHEN 1.
        mv_equnr = lt_equi[ 1 ]-equnr.
      WHEN OTHERS.
*       Seriennummer bei mehreren Herstellern vergeben -> Material fehlt in der App
        APPEND VALUE #( type = 'E' id = gc_msgid number = '002'
                        message_v1 = is_head-serialno ) TO et_messages.
        RETURN.
    ENDCASE.

    IF is_head-readdate > sy-datum.
      APPEND VALUE #( type = 'E' id = gc_msgid number = '003'
                      message_v1 = is_head-readdate ) TO et_messages.
    ENDIF.

    LOOP AT it_registers INTO DATA(ls_reg).

*     Zaehlwerk zum Ablesedatum am Geraet vorhanden?
      SELECT SINGLE stanzvor, stanznac FROM etdz
        WHERE equnr    = @mv_equnr
          AND zwnummer = @ls_reg-register
          AND ab      <= @is_head-readdate
          AND bis     >= @is_head-readdate
        INTO @DATA(ls_etdz).
      IF sy-subrc <> 0.
        APPEND VALUE #( type = 'E' id = gc_msgid number = '004'
                        message_v1 = ls_reg-register
                        message_v2 = is_head-serialno ) TO et_messages.
        CONTINUE.
      ENDIF.

*     letzte gueltige Ablesung
      SELECT v_zwstand, adat FROM eabl
        WHERE equnr    = @mv_equnr
          AND zwnummer = @ls_reg-register
          AND ablstat  = '1'
        ORDER BY adat DESCENDING
        INTO TABLE @DATA(lt_last)
        UP TO 1 ROWS.
      IF lt_last IS INITIAL.
*       Erstablesung nach Einbau - nichts zu vergleichen
        CONTINUE.
      ENDIF.
      lv_prev = lt_last[ 1 ]-v_zwstand.

      IF ls_reg-reading < lv_prev.
*       Rollierzaehler: Ueberlauf ueber Vorkommastellen annehmen
        lv_max = ipow( base = 10 exp = ls_etdz-stanzvor ).
        lv_overflow = COND #( WHEN lv_max > 0
                              THEN lv_max - lv_prev + ls_reg-reading
                              ELSE 0 ).
        IF lv_overflow > lv_max / 10 OR lv_overflow = 0.
          APPEND VALUE #( type = 'E' id = gc_msgid number = '005'
                          message_v1 = ls_reg-register
                          message_v2 = |{ lv_prev }| ) TO et_messages.
        ELSE.
          APPEND VALUE #( type = 'W' id = gc_msgid number = '006'
                          message_v1 = ls_reg-register ) TO et_messages.
        ENDIF.
      ENDIF.

    ENDLOOP.

*    IF is_head-readernote CS 'FOTO'.
*      rv_ok = check_photo_hash( is_head-readernote+5 ).
*    ENDIF.

    rv_ok = xsdbool( NOT line_exists( et_messages[ type = 'E' ] ) ).

  ENDMETHOD.


  METHOD check_photo_hash.
*   Pilot Fotoabgleich 2022 - vom Fachbereich gestoppt
    SELECT SINGLE @abap_true FROM zisu_mr_photo
      WHERE hash = @iv_hash
      INTO @rv_ok.
  ENDMETHOD.

ENDCLASS.

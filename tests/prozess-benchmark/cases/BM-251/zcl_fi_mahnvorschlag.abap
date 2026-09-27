CLASS zcl_fi_mahnvorschlag DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES: BEGIN OF ty_vorschlag,
             bukrs      TYPE bukrs,
             stichtag   TYPE d,
             kunnr      TYPE kunnr,
             belnr      TYPE belnr_d,
             gjahr      TYPE gjahr,
             buzei      TYPE buzei,
             betrag     TYPE wrbtr,
             waers      TYPE waers,
             tage       TYPE i,
             stufe_alt  TYPE mahns_d,
             stufe_neu  TYPE mahns_d,
             gebuehr    TYPE wrbtr,
           END OF ty_vorschlag,
           tt_vorschlag TYPE STANDARD TABLE OF ty_vorschlag WITH EMPTY KEY.

    METHODS constructor
      IMPORTING iv_bukrs    TYPE bukrs
                iv_stichtag TYPE d
      RAISING   zcx_fi_mahn.
    METHODS ermitteln
      RAISING zcx_fi_mahn.
    METHODS speichern
      RAISING zcx_fi_mahn.
    METHODS ausgeben.

  PRIVATE SECTION.
    DATA: mv_bukrs     TYPE bukrs,
          mv_stichtag  TYPE d,
          mt_vorschlag TYPE tt_vorschlag.

    METHODS bestimme_stufe
      IMPORTING iv_tage         TYPE i
      RETURNING VALUE(rv_stufe) TYPE mahns_d.
ENDCLASS.



CLASS zcl_fi_mahnvorschlag IMPLEMENTATION.

  METHOD constructor.
    AUTHORITY-CHECK OBJECT 'F_MAHN_BUK'
      ID 'ACTVT' FIELD '02'
      ID 'BUKRS' FIELD iv_bukrs.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_fi_mahn
        EXPORTING
          textid   = zcx_fi_mahn=>keine_berechtigung
          mv_bukrs = iv_bukrs.
    ENDIF.
    mv_bukrs    = iv_bukrs.
    mv_stichtag = iv_stichtag.
  ENDMETHOD.


  METHOD ermitteln.
*   Offene, faellige Posten zum Stichtag aus der CDS-View
    SELECT customer, accountingdocument, fiscalyear, accountingdocumentitem,
           amountincompanycodecurrency, companycodecurrency,
           daysoverdue, lastdunninglevel
      FROM zi_offeneposten( p_stichtag = @mv_stichtag )
      WHERE companycode = @mv_bukrs
        AND daysoverdue > 0
        AND isnotdunnable = @abap_false
      INTO TABLE @DATA(lt_op).
    IF lt_op IS INITIAL.
      RAISE EXCEPTION TYPE zcx_fi_mahn
        EXPORTING
          textid   = zcx_fi_mahn=>keine_posten
          mv_bukrs = mv_bukrs.
    ENDIF.

*   Mahnsperre auf Kundenebene (Buchungskreissegment)
    SELECT customer, dunningblock
      FROM i_customercompany
      FOR ALL ENTRIES IN @lt_op
      WHERE customer    = @lt_op-customer
        AND companycode = @mv_bukrs
      INTO TABLE @DATA(lt_sperre).
    SORT lt_sperre BY customer.

    CLEAR mt_vorschlag.
    LOOP AT lt_op INTO DATA(ls_op).

      READ TABLE lt_sperre INTO DATA(ls_sperre)
           WITH KEY customer = ls_op-customer BINARY SEARCH.
      IF sy-subrc = 0 AND ls_sperre-dunningblock IS NOT INITIAL.
        CONTINUE.
      ENDIF.

      DATA(lv_stufe) = bestimme_stufe( ls_op-daysoverdue ).

*     nur hoeher mahnen, nie dieselbe Stufe zweimal
      IF lv_stufe = 0 OR lv_stufe <= ls_op-lastdunninglevel.
        CONTINUE.
      ENDIF.

      APPEND VALUE #( bukrs     = mv_bukrs
                      stichtag  = mv_stichtag
                      kunnr     = ls_op-customer
                      belnr     = ls_op-accountingdocument
                      gjahr     = ls_op-fiscalyear
                      buzei     = ls_op-accountingdocumentitem
                      betrag    = ls_op-amountincompanycodecurrency
                      waers     = ls_op-companycodecurrency
                      tage      = ls_op-daysoverdue
                      stufe_alt = ls_op-lastdunninglevel
                      stufe_neu = lv_stufe
                      gebuehr   = SWITCH #( lv_stufe WHEN 3 THEN 25 WHEN 2 THEN 10 ELSE 0 ) )
             TO mt_vorschlag.
    ENDLOOP.
  ENDMETHOD.


  METHOD bestimme_stufe.
    CASE iv_tage.
      WHEN 1 OR 2 OR 3 OR 4 OR 5 OR 6 OR 7 OR 8 OR 9 OR 10 OR 11 OR 12 OR 13.
        rv_stufe = 0.            "Karenz 14 Tage
      WHEN OTHERS.
        IF iv_tage >= 45.
          rv_stufe = 3.
        ELSEIF iv_tage >= 30.
          rv_stufe = 2.
        ELSE.
          rv_stufe = 1.
        ENDIF.
    ENDCASE.
  ENDMETHOD.


  METHOD speichern.
    DATA lt_db TYPE STANDARD TABLE OF zfi_mahn_vs WITH EMPTY KEY.

    IF mt_vorschlag IS INITIAL.
      RETURN.
    ENDIF.

    CALL FUNCTION 'ENQUEUE_EZFI_MAHN_VS'
      EXPORTING
        bukrs          = mv_bukrs
      EXCEPTIONS
        foreign_lock   = 1
        OTHERS         = 2.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_fi_mahn
        EXPORTING
          textid   = zcx_fi_mahn=>gesperrt
          mv_bukrs = mv_bukrs.
    ENDIF.

    lt_db = CORRESPONDING #( mt_vorschlag ).

    TRY.
*       alter Vorschlag zum selben Stichtag wird ersetzt
        DELETE FROM zfi_mahn_vs WHERE bukrs = @mv_bukrs AND stichtag = @mv_stichtag.
        INSERT zfi_mahn_vs FROM TABLE @lt_db.
      CATCH cx_sy_open_sql_db INTO DATA(lx_sql).
        ROLLBACK WORK.
        RAISE EXCEPTION TYPE zcx_fi_mahn
          EXPORTING
            textid   = zcx_fi_mahn=>speichern_fehler
            previous = lx_sql
            mv_bukrs = mv_bukrs.
    ENDTRY.

    COMMIT WORK.

    CALL FUNCTION 'DEQUEUE_EZFI_MAHN_VS'
      EXPORTING
        bukrs = mv_bukrs.
  ENDMETHOD.


  METHOD ausgeben.
    TRY.
        cl_salv_table=>factory( IMPORTING r_salv_table = DATA(lo_alv)
                                CHANGING  t_table      = mt_vorschlag ).
        lo_alv->get_functions( )->set_default( abap_true ).
        lo_alv->display( ).
      CATCH cx_salv_msg.
        MESSAGE 'Ausgabe nicht moeglich' TYPE 'S' DISPLAY LIKE 'E'.
    ENDTRY.
  ENDMETHOD.

ENDCLASS.

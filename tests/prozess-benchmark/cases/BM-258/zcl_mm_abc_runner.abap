CLASS zcl_mm_abc_runner DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES: tt_werk TYPE STANDARD TABLE OF werks_d WITH EMPTY KEY,
           BEGIN OF ty_summe,
             werks  TYPE werks_d,
             anz_a  TYPE i,
             anz_b  TYPE i,
             anz_c  TYPE i,
             wert_a TYPE dmbtr,
             status TYPE char10,
           END OF ty_summe,
           tt_summe TYPE STANDARD TABLE OF ty_summe WITH EMPTY KEY.

    DATA mt_summe TYPE tt_summe READ-ONLY.

    METHODS constructor
      IMPORTING iv_von     TYPE d
                iv_bis     TYPE d
                iv_grenz_a TYPE numeric
                iv_grenz_b TYPE numeric
                iv_marc    TYPE abap_bool.
    METHODS seriell
      IMPORTING it_werke TYPE tt_werk.
    METHODS parallel
      IMPORTING it_werke TYPE tt_werk.
    METHODS on_ende
      IMPORTING p_task TYPE clike.

  PRIVATE SECTION.
    CONSTANTS: gc_gruppe   TYPE rzlli_apcl VALUE 'parallel_generators',
               gc_max_task TYPE i VALUE 8.
    DATA: mv_von     TYPE d,
          mv_bis     TYPE d,
          mv_grenz_a TYPE p LENGTH 3 DECIMALS 0,
          mv_grenz_b TYPE p LENGTH 3 DECIMALS 0,
          mv_marc    TYPE abap_bool,
          mv_offen   TYPE i.
ENDCLASS.



CLASS zcl_mm_abc_runner IMPLEMENTATION.

  METHOD constructor.
    mv_von     = iv_von.
    mv_bis     = iv_bis.
    mv_grenz_a = iv_grenz_a.
    mv_grenz_b = iv_grenz_b.
    mv_marc    = iv_marc.
  ENDMETHOD.


  METHOD seriell.
    DATA ls_summe TYPE ty_summe.

    LOOP AT it_werke INTO DATA(lv_werks).
      CALL FUNCTION 'Z_MM_ABC_WERK'
        EXPORTING
          iv_werks   = lv_werks
          iv_von     = mv_von
          iv_bis     = mv_bis
          iv_grenz_a = mv_grenz_a
          iv_grenz_b = mv_grenz_b
          iv_marc    = mv_marc
        IMPORTING
          es_summe   = ls_summe.
      APPEND ls_summe TO mt_summe.
    ENDLOOP.
  ENDMETHOD.


  METHOD parallel.
    DATA: lv_task  TYPE char32,
          ls_summe TYPE ty_summe.

    LOOP AT it_werke INTO DATA(lv_werks).
      lv_task = |ABC_{ lv_werks }|.

      DO.
        CALL FUNCTION 'Z_MM_ABC_WERK'
          STARTING NEW TASK lv_task
          DESTINATION IN GROUP gc_gruppe
          CALLING on_ende ON END OF TASK
          EXPORTING
            iv_werks   = lv_werks
            iv_von     = mv_von
            iv_bis     = mv_bis
            iv_grenz_a = mv_grenz_a
            iv_grenz_b = mv_grenz_b
            iv_marc    = mv_marc
          EXCEPTIONS
            resource_failure      = 1
            communication_failure = 2
            system_failure        = 3
            OTHERS                = 4.

        CASE sy-subrc.
          WHEN 0.
            mv_offen = mv_offen + 1.
            EXIT.
          WHEN 1.
*           keine freie Session: warten, bis eine Aufgabe fertig ist
            WAIT UNTIL mv_offen < gc_max_task UP TO 10 SECONDS.
          WHEN OTHERS.
*           Gruppe nicht erreichbar: dieses Werk im eigenen Prozess rechnen
            CALL FUNCTION 'Z_MM_ABC_WERK'
              EXPORTING
                iv_werks   = lv_werks
                iv_von     = mv_von
                iv_bis     = mv_bis
                iv_grenz_a = mv_grenz_a
                iv_grenz_b = mv_grenz_b
                iv_marc    = mv_marc
              IMPORTING
                es_summe   = ls_summe.
            APPEND ls_summe TO mt_summe.
            EXIT.
        ENDCASE.
      ENDDO.
    ENDLOOP.

*   auf alle offenen Aufgaben warten (max. 30 min)
    WAIT UNTIL mv_offen = 0 UP TO 1800 SECONDS.
  ENDMETHOD.


  METHOD on_ende.
    DATA: ls_summe TYPE ty_summe,
          lv_text  TYPE char255.

    RECEIVE RESULTS FROM FUNCTION 'Z_MM_ABC_WERK'
      IMPORTING
        es_summe = ls_summe
      EXCEPTIONS
        communication_failure = 1 MESSAGE lv_text
        system_failure        = 2 MESSAGE lv_text
        OTHERS                = 3.

    IF sy-subrc <> 0.
      ls_summe-werks  = p_task+4.
      ls_summe-status = 'ABBRUCH'.
    ENDIF.
    APPEND ls_summe TO mt_summe.
    mv_offen = mv_offen - 1.
  ENDMETHOD.

ENDCLASS.

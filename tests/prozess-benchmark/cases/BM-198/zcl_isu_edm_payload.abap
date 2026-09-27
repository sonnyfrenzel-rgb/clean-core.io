CLASS zcl_isu_edm_payload DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

*"* Nutzdaten der Lastgangnachricht (XML fuer Gateway V1, JSON fuer V2)
  PUBLIC SECTION.
    TYPES: ty_qty TYPE p LENGTH 15 DECIMALS 3,
           BEGIN OF ty_interval,
             ts   TYPE string,
             qty  TYPE ty_qty,
             unit TYPE string,
             qual TYPE string,
           END OF ty_interval,
           tt_interval TYPE STANDARD TABLE OF ty_interval WITH DEFAULT KEY,
           BEGIN OF ty_message,
             sender    TYPE string,
             receiver  TYPE string,
             melo      TYPE string,
             day       TYPE string,
             total     TYPE ty_qty,
             intervals TYPE tt_interval,
           END OF ty_message.

    DATA mv_content_type TYPE string READ-ONLY.
    DATA mv_last_size    TYPE i READ-ONLY.

    METHODS build
      IMPORTING iv_format      TYPE char1
                is_pod         TYPE zisu_s_edm_pod
                it_values      TYPE zisu_edm_prof_tt
      RETURNING VALUE(rv_body) TYPE string
      RAISING   zcx_isu_edm.

  PRIVATE SECTION.
*   Marktpartner-ID (BDEW-Codenummer) des Absenders - eigener Netzbetreiber
    CONSTANTS gc_sender TYPE string VALUE `9900357000004`.

    METHODS to_mscons
      IMPORTING is_msg        TYPE ty_message
      RETURNING VALUE(rv_edi) TYPE string.
ENDCLASS.



CLASS zcl_isu_edm_payload IMPLEMENTATION.

  METHOD build.
    DATA ls_msg TYPE ty_message.

*   Gestoerte Messwerte (Kennz. X) duerfen nicht an den MSB - Klaerfall
    IF line_exists( it_values[ status_flag = 'X' ] ).
      RAISE EXCEPTION TYPE zcx_isu_edm
        EXPORTING
          textid = zcx_isu_edm=>invalid_values
          ext_ui = is_pod-ext_ui.
    ENDIF.

    ls_msg-sender   = gc_sender.
    ls_msg-receiver = is_pod-receiver.
    ls_msg-melo     = is_pod-ext_ui.
    ls_msg-day      = |{ it_values[ 1 ]-ab_date DATE = ISO }|.

*   W = wahrer Wert, E = Ersatzwert, V = vorlaeufig
    ls_msg-intervals = VALUE #( FOR ls_v IN it_values
                                ( ts   = |{ ls_v-ab_date }T{ ls_v-ab_time }|
                                  qty  = ls_v-value
                                  unit = ls_v-unit
                                  qual = SWITCH #( ls_v-status_flag
                                                   WHEN 'W' THEN `MEASURED`
                                                   WHEN 'E' THEN `SUBSTITUTE`
                                                   WHEN 'V' THEN `PRELIMINARY`
                                                   ELSE `UNKNOWN` ) ) ).

*   Kontrollsumme fuer den Empfaenger (Summe der Viertelstundenmengen)
    ls_msg-total = REDUCE ty_qty( INIT s = CONV ty_qty( 0 )
                                  FOR ls_i IN ls_msg-intervals
                                  NEXT s = s + ls_i-qty ).

    CASE iv_format.
      WHEN 'J'.
        mv_content_type = `application/json`.
        rv_body = /ui2/cl_json=>serialize(
                    data        = ls_msg
                    compress    = abap_true
                    pretty_name = /ui2/cl_json=>pretty_mode-camel_case ).
*       Gateway V2 erwartet "meLo" statt "melo"
        REPLACE ALL OCCURRENCES OF '"melo"' IN rv_body WITH '"meLo"'.
*       rv_body = cl_fdt_json=>data_to_json( ls_msg ).   "vor 2020
      WHEN OTHERS.
        mv_content_type = `application/xml; charset=utf-8`.
        TRY.
            CALL TRANSFORMATION zisu_edm_lastgang
              SOURCE message = ls_msg
              RESULT XML rv_body.
          CATCH cx_transformation_error INTO DATA(lx_tr).
            RAISE EXCEPTION TYPE zcx_isu_edm
              EXPORTING
                textid   = zcx_isu_edm=>transformation_failed
                ext_ui   = is_pod-ext_ui
                previous = lx_tr.
        ENDTRY.
*       String-Ergebnis traegt utf-16 im Prolog, Gateway erwartet utf-8
        REPLACE FIRST OCCURRENCE OF 'encoding="utf-16"' IN rv_body
                WITH 'encoding="utf-8"'.
    ENDCASE.

*   Nachrichtengroesse fuer Monitoring (Gateway-Limit 2 MB, Ticket EDM-212)
    mv_last_size = strlen( rv_body ).
  ENDMETHOD.


  METHOD to_mscons.
*   EDIFACT MSCONS 2.4b - Vorbereitung Direktversand ohne Gateway (2019),
*   nie produktiv gesetzt
    rv_edi = |UNH+1+MSCONS:D:04B:UN:2.4b'|
          && |NAD+MS+{ is_msg-sender }::293'|
          && |NAD+MR+{ is_msg-receiver }::293'|
          && |LOC+172+{ is_msg-melo }'|.
    LOOP AT is_msg-intervals INTO DATA(ls_i).
      rv_edi = rv_edi && |QTY+220:{ ls_i-qty }'|.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.

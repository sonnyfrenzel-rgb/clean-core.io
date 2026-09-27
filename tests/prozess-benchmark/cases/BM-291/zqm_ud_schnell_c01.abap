*&---------------------------------------------------------------------*
*&  Include           ZQM_UD_SCHNELL_C01
*&---------------------------------------------------------------------*
*  Regeln fuer den UD-Vorschlag (Interface + zwei Implementierungen),
*  Regelfabrik, Controller fuer Vorschlag und Entscheidung
*----------------------------------------------------------------------*

CLASS lcx_ud DEFINITION INHERITING FROM cx_static_check FINAL.
  PUBLIC SECTION.
    INTERFACES if_t100_dyn_msg.
ENDCLASS.
CLASS lcx_ud IMPLEMENTATION.
ENDCLASS.

INTERFACE lif_ud_regel.
  TYPES ty_regeln TYPE STANDARD TABLE OF REF TO lif_ud_regel WITH EMPTY KEY.
  METHODS bewerten
    IMPORTING is_los         TYPE ty_los
    RETURNING VALUE(rv_code) TYPE qvcode.
ENDINTERFACE.

*----------------------------------------------------------------------*
* Regel 1: Lieferant steht auf der QM-Sperrliste
*----------------------------------------------------------------------*
CLASS lcl_regel_lieferant DEFINITION FINAL.
  PUBLIC SECTION.
    INTERFACES lif_ud_regel.
ENDCLASS.

CLASS lcl_regel_lieferant IMPLEMENTATION.
  METHOD lif_ud_regel~bewerten.
    SELECT SINGLE @abap_true FROM zqm_lief_sperre
      WHERE lifnr = @is_los-lifnr
        AND gueltig_bis >= @sy-datum
      INTO @DATA(lv_gesperrt).
    rv_code = COND #( WHEN lv_gesperrt = abap_true THEN gc_rueckw
                                                   ELSE gc_annahme ).
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* Regel 2: zurueckgewiesene Merkmale im Los (nur WE-Pruefung 01)
*----------------------------------------------------------------------*
CLASS lcl_regel_merkmal DEFINITION FINAL.
  PUBLIC SECTION.
    INTERFACES lif_ud_regel.
ENDCLASS.

CLASS lcl_regel_merkmal IMPLEMENTATION.
  METHOD lif_ud_regel~bewerten.
    SELECT COUNT(*) FROM qamr
      WHERE prueflos = @is_los-prueflos
        AND mbewertg = 'R'
      INTO @DATA(lv_anz_r).
    rv_code = COND #( WHEN lv_anz_r > 0 THEN gc_rueckw
                                        ELSE gc_annahme ).
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* Controller
*----------------------------------------------------------------------*
CLASS lcl_ud_ctrl DEFINITION FINAL.
  PUBLIC SECTION.
    CLASS-METHODS regeln_fuer
      IMPORTING iv_art           TYPE qpart
      RETURNING VALUE(rt_regeln) TYPE lif_ud_regel=>ty_regeln.
    METHODS vorschlagen
      CHANGING cs_los TYPE ty_los.
    METHODS entscheiden
      IMPORTING is_los         TYPE ty_los
      RETURNING VALUE(rv_done) TYPE abap_bool
      RAISING   lcx_ud.
ENDCLASS.

CLASS lcl_ud_ctrl IMPLEMENTATION.

  METHOD regeln_fuer.
    APPEND NEW lcl_regel_lieferant( ) TO rt_regeln.
*   Merkmalsregel nur bei Wareneingangspruefung - Stichprobe sonst leer
    IF iv_art = '01'.
      APPEND NEW lcl_regel_merkmal( ) TO rt_regeln.
    ENDIF.
  ENDMETHOD.

  METHOD vorschlagen.
    cs_los-vcodegrp = gc_codegrp.
    cs_los-vcode    = gc_annahme.
    DATA(lt_regeln) = regeln_fuer( cs_los-art ).
    LOOP AT lt_regeln INTO DATA(lo_regel).
      IF lo_regel->bewerten( cs_los ) = gc_rueckw.
        cs_los-vcode = gc_rueckw.
        EXIT.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD entscheiden.
    DATA: ls_ud     TYPE bapi2045ud,
          ls_return TYPE bapireturn1,
          lv_answer TYPE c LENGTH 1.

*   Code ist Mussfeld auf 0100 (frueher Pruefung hier, MESSAGE e120)

    CALL FUNCTION 'POPUP_TO_CONFIRM'
      EXPORTING
        titlebar              = 'Verwendungsentscheid'(t01)
        text_question         = 'Entscheid buchen? Er kann nicht zurueckgenommen werden.'(q01)
        default_button        = '2'
        display_cancel_button = space
      IMPORTING
        answer                = lv_answer.
    IF lv_answer <> '1'.
      RETURN.
    ENDIF.

    ls_ud-ud_selected_set     = gc_codegrp.
    ls_ud-ud_plant            = is_los-werk.
    ls_ud-ud_code_group       = is_los-vcodegrp.
    ls_ud-ud_code             = is_los-vcode.
    ls_ud-ud_recorded_by_user = sy-uname.
    ls_ud-ud_recorded_on_date = sy-datum.
    ls_ud-ud_force_completion = abap_true.

    CALL FUNCTION 'BAPI_INSPLOT_SETUSAGEDECISION'
      EXPORTING
        number  = is_los-prueflos
        ud_data = ls_ud
      IMPORTING
        return  = ls_return.
    IF ls_return-type CA 'EA'.
      RAISE EXCEPTION TYPE lcx_ud
        MESSAGE ID ls_return-id TYPE 'E' NUMBER ls_return-number
        WITH ls_return-message_v1 ls_return-message_v2
             ls_return-message_v3 ls_return-message_v4.
    ENDIF.

    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.
    rv_done = abap_true.
  ENDMETHOD.

ENDCLASS.

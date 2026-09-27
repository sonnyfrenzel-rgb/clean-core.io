CLASS zcl_hr_org_umhaengung DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

*----------------------------------------------------------------------*
* Umhaengung von Mitarbeitern in eine neue Organisationseinheit.
* Jede verarbeitete Personalnummer wird ueber das Ereignis UMGEHAENGT
* gemeldet (auch Fehler und Testlauf).
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    EVENTS umgehaengt
      EXPORTING
        VALUE(iv_pernr) TYPE persno
        VALUE(iv_ok)    TYPE abap_bool
        VALUE(iv_text)  TYPE string.

    METHODS constructor
      IMPORTING
        iv_stichtag TYPE datum
        iv_test     TYPE abap_bool.

    METHODS ausfuehren
      IMPORTING
        it_pernr TYPE zhr_t_pernr
        iv_orgeh TYPE orgeh
        iv_plans TYPE plans.

  PRIVATE SECTION.
    DATA: mv_stichtag TYPE datum,
          mv_test     TYPE abap_bool,
          mt_pruef    TYPE STANDARD TABLE OF REF TO zif_hr_umhaeng_pruefung
                           WITH DEFAULT KEY.

    METHODS pruefungen_laufen
      IMPORTING
        iv_pernr         TYPE persno
        iv_plans         TYPE plans
      RETURNING
        VALUE(rv_fehler) TYPE string.

    METHODS umhaengen
      IMPORTING
        iv_pernr TYPE persno
        iv_orgeh TYPE orgeh
        iv_plans TYPE plans.
ENDCLASS.



CLASS zcl_hr_org_umhaengung IMPLEMENTATION.

  METHOD constructor.
    DATA: lt_klassen TYPE STANDARD TABLE OF seoclsname,
          lv_klasse  TYPE seoclsname,
          lo_pruef   TYPE REF TO zif_hr_umhaeng_pruefung.

    mv_stichtag = iv_stichtag.
    mv_test     = iv_test.

*   aktive Pruefungen in gepflegter Reihenfolge
    SELECT klasse FROM zhr_umh_pruef INTO TABLE lt_klassen
      WHERE aktiv = abap_true
      ORDER BY reihenfolge.

    LOOP AT lt_klassen INTO lv_klasse.
      TRY.
          CREATE OBJECT lo_pruef TYPE (lv_klasse).
          APPEND lo_pruef TO mt_pruef.
        CATCH cx_sy_create_object_error.
*         falsch gepflegte Klasse wird still uebergangen
      ENDTRY.
    ENDLOOP.
  ENDMETHOD.


  METHOD ausfuehren.
    DATA: lv_pernr  TYPE persno,
          lv_fehler TYPE string.

    LOOP AT it_pernr INTO lv_pernr.
      lv_fehler = pruefungen_laufen( iv_pernr = lv_pernr
                                     iv_plans = iv_plans ).
      IF lv_fehler IS NOT INITIAL.
        RAISE EVENT umgehaengt
          EXPORTING iv_pernr = lv_pernr iv_ok = abap_false iv_text = lv_fehler.
        CONTINUE.
      ENDIF.

      IF mv_test = abap_true.
        RAISE EVENT umgehaengt
          EXPORTING iv_pernr = lv_pernr iv_ok = abap_true iv_text = `Testlauf: Pruefungen bestanden`.
        CONTINUE.
      ENDIF.

      umhaengen( iv_pernr = lv_pernr
                 iv_orgeh = iv_orgeh
                 iv_plans = iv_plans ).
    ENDLOOP.
  ENDMETHOD.


  METHOD pruefungen_laufen.
    DATA lo_pruef TYPE REF TO zif_hr_umhaeng_pruefung.

    LOOP AT mt_pruef INTO lo_pruef.
      rv_fehler = lo_pruef->pruefen( iv_pernr    = iv_pernr
                                     iv_plans    = iv_plans
                                     iv_stichtag = mv_stichtag ).
      IF rv_fehler IS NOT INITIAL.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD umhaengen.
    DATA: ls_return TYPE bapireturn1,
          lt_p0001  TYPE STANDARD TABLE OF p0001,
          ls_p0001  TYPE p0001.

    CALL FUNCTION 'BAPI_EMPLOYEE_ENQUEUE'
      EXPORTING
        number = iv_pernr
      IMPORTING
        return = ls_return.
    IF ls_return-type = 'E'.
      RAISE EVENT umgehaengt
        EXPORTING iv_pernr = iv_pernr iv_ok = abap_false iv_text = CONV #( ls_return-message ).
      RETURN.
    ENDIF.

    CALL FUNCTION 'HR_READ_INFOTYPE'
      EXPORTING
        pernr     = iv_pernr
        infty     = '0001'
        begda     = mv_stichtag
        endda     = mv_stichtag
      TABLES
        infty_tab = lt_p0001
      EXCEPTIONS
        OTHERS    = 1.
    READ TABLE lt_p0001 INTO ls_p0001 INDEX 1.
    IF sy-subrc <> 0.
      RAISE EVENT umgehaengt
        EXPORTING iv_pernr = iv_pernr iv_ok = abap_false iv_text = `IT0001 zum Stichtag nicht lesbar`.
*     Sperre bleibt bis Programmende - bekannt, Ticket 4471
      RETURN.
    ENDIF.

*   neuer Satz ab Stichtag, Vorgaenger wird per Zeitbindung abgegrenzt
    ls_p0001-begda = mv_stichtag.
    ls_p0001-endda = '99991231'.
    ls_p0001-orgeh = iv_orgeh.
    ls_p0001-plans = iv_plans.

    CALL FUNCTION 'HR_INFOTYPE_OPERATION'
      EXPORTING
        infty         = '0001'
        number        = iv_pernr
        validityend   = ls_p0001-endda
        validitybegin = ls_p0001-begda
        record        = ls_p0001
        operation     = 'INS'
      IMPORTING
        return        = ls_return.
    IF ls_return-type = 'E'.
      RAISE EVENT umgehaengt
        EXPORTING iv_pernr = iv_pernr iv_ok = abap_false iv_text = CONV #( ls_return-message ).
    ELSE.
      RAISE EVENT umgehaengt
        EXPORTING iv_pernr = iv_pernr iv_ok = abap_true iv_text = `umgehaengt`.
    ENDIF.

    CALL FUNCTION 'BAPI_EMPLOYEE_DEQUEUE'
      EXPORTING
        number = iv_pernr.
  ENDMETHOD.

ENDCLASS.

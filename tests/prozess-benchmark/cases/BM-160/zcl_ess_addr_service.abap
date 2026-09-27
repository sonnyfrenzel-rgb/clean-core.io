CLASS zcl_ess_addr_service DEFINITION PUBLIC FINAL CREATE PUBLIC.
************************************************************************
* Adressaenderung ESS: Pruefen, Genehmigungsbedarf, Uebernahme IT0006
* Rueckwirkung vor "abgerechnet bis" (PA0003-ABRDT) -> Hinweis an die
* Entgeltabrechnung, die Rueckrechnung selbst setzt das Infotyp-Update.
************************************************************************
  PUBLIC SECTION.
    METHODS constructor
      IMPORTING iv_pernr TYPE pernr_d.
    METHODS validate
      IMPORTING is_address TYPE zess_s_address
                iv_begda   TYPE begda
      RAISING   zcx_ess_addr.
    METHODS needs_approval
      IMPORTING is_address       TYPE zess_s_address
                iv_begda         TYPE begda
      RETURNING VALUE(rv_needed) TYPE abap_bool.
    METHODS apply
      IMPORTING is_req TYPE zess_addr_req
      RAISING   zcx_ess_addr.

  PRIVATE SECTION.
    CONSTANTS gc_max_retry TYPE i VALUE 3.
    DATA: mv_pernr TYPE pernr_d,
          mv_retry TYPE i.
    METHODS current_address
      IMPORTING iv_date        TYPE datum
      RETURNING VALUE(rs_0006) TYPE p0006.
    METHODS payroll_done_until
      RETURNING VALUE(rv_abrdt) TYPE abrdt.
    METHODS notify_payroll
      IMPORTING is_req TYPE zess_addr_req.
ENDCLASS.


CLASS zcl_ess_addr_service IMPLEMENTATION.

  METHOD constructor.
    mv_pernr = iv_pernr.
  ENDMETHOD.


  METHOD validate.
    IF is_address-stras IS INITIAL OR is_address-ort01 IS INITIAL.
      RAISE EXCEPTION TYPE zcx_ess_addr
        EXPORTING textid = zcx_ess_addr=>incomplete.
    ENDIF.

    SELECT SINGLE @abap_true FROM t005
      WHERE land1 = @is_address-land1
      INTO @DATA(lv_land_ok).
    IF lv_land_ok = abap_false.
      RAISE EXCEPTION TYPE zcx_ess_addr
        EXPORTING textid = zcx_ess_addr=>unknown_country.
    ENDIF.

    CALL FUNCTION 'ADDR_POSTAL_CODE_CHECK'
      EXPORTING
        country             = is_address-land1
        postal_code_city    = is_address-pstlz
      EXCEPTIONS
        country_not_valid   = 1
        postal_code_invalid = 2
        OTHERS              = 3.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_ess_addr
        EXPORTING textid = zcx_ess_addr=>invalid_postal_code.
    ENDIF.

*   hoechstens drei Monate rueckwirkend, hoechstens ein Jahr im Voraus
    IF iv_begda < sy-datum - 92 OR iv_begda > sy-datum + 365.
      RAISE EXCEPTION TYPE zcx_ess_addr
        EXPORTING textid = zcx_ess_addr=>date_out_of_range.
    ENDIF.
  ENDMETHOD.


  METHOD needs_approval.
    DATA(ls_old) = current_address( iv_begda ).
*   Umzug ins/aus dem Ausland ist steuer- und SV-relevant
    rv_needed = xsdbool( ls_old-land1 <> is_address-land1
                         OR iv_begda <= payroll_done_until( ) ).
  ENDMETHOD.


  METHOD apply.
    DATA: ls_0006   TYPE p0006,
          ls_return TYPE bapireturn1,
          lv_key    TYPE bapipakey.

    mv_retry = 0.
    TRY.
        CALL FUNCTION 'BAPI_EMPLOYEE_ENQUEUE'
          EXPORTING
            number = mv_pernr
          IMPORTING
            return = ls_return.
        IF ls_return-type = 'E'.
          RAISE EXCEPTION TYPE zcx_ess_addr
            EXPORTING textid = zcx_ess_addr=>locked.
        ENDIF.
      CATCH zcx_ess_addr INTO DATA(lx_lock).
        mv_retry = mv_retry + 1.
        IF mv_retry < gc_max_retry.
          WAIT UP TO 1 SECONDS.
          RETRY.
        ENDIF.
        RAISE EXCEPTION lx_lock.
    ENDTRY.

    ls_0006 = current_address( is_req-begda ).
    ls_0006-pernr = mv_pernr.
    ls_0006-infty = '0006'.
    ls_0006-subty = '1'.
    ls_0006-anssa = '1'.
    ls_0006-begda = is_req-begda.
    ls_0006-endda = '99991231'.
    ls_0006-stras = is_req-stras.
    ls_0006-pstlz = is_req-pstlz.
    ls_0006-ort01 = is_req-ort01.
    ls_0006-land1 = is_req-land1.

*   neuer Satz grenzt den alten ab (Zeitbindung 1)
    CALL FUNCTION 'HR_INFOTYPE_OPERATION'
      EXPORTING
        infty         = '0006'
        number        = mv_pernr
        subtype       = '1'
        validitybegin = is_req-begda
        validityend   = '99991231'
        record        = ls_0006
        operation     = 'INS'
        nocommit      = abap_true
      IMPORTING
        return        = ls_return
        key           = lv_key.

    CALL FUNCTION 'BAPI_EMPLOYEE_DEQUEUE'
      EXPORTING
        number = mv_pernr.

    IF ls_return-type CA 'EA'.
      RAISE EXCEPTION TYPE zcx_ess_addr
        EXPORTING textid = zcx_ess_addr=>update_failed.
    ENDIF.

    IF is_req-begda <= payroll_done_until( ).
      notify_payroll( is_req ).
    ENDIF.
  ENDMETHOD.


  METHOD current_address.
    DATA lt_0006 TYPE STANDARD TABLE OF p0006.
    CALL FUNCTION 'HR_READ_SUBTYPE'
      EXPORTING
        pernr     = mv_pernr
        infty     = '0006'
        subty     = '1'
        begda     = iv_date
        endda     = iv_date
      TABLES
        infty_tab = lt_0006
      EXCEPTIONS
        OTHERS    = 1.
    READ TABLE lt_0006 INTO rs_0006 INDEX 1.
  ENDMETHOD.


  METHOD payroll_done_until.
    SELECT SINGLE abrdt FROM pa0003 INTO rv_abrdt
      WHERE pernr = mv_pernr.
  ENDMETHOD.


  METHOD notify_payroll.
    DATA: ls_doc  TYPE sodocchgi1,
          lt_text TYPE STANDARD TABLE OF solisti1,
          lt_rec  TYPE STANDARD TABLE OF somlreci1.

*   Schalter: Benachrichtigung waehrend des Jahreswechsels aus
    SELECT SINGLE low FROM tvarvc INTO @DATA(lv_off)
      WHERE name = 'ZESS_NOTIFY_PAYROLL_OFF'
        AND type = 'P'
        AND numb = '0000'.
    IF lv_off = abap_true.
      RETURN.
    ENDIF.

    ls_doc-obj_descr = |Rückwirkende Adressänderung { mv_pernr }|.
    lt_text = VALUE #( ( line = |Personalnummer { mv_pernr }| )
                       ( line = |Neue Anschrift ab { is_req-begda DATE = USER }| )
                       ( line = |Land { is_req-land1 }, PLZ { is_req-pstlz }| ) ).
    lt_rec  = VALUE #( ( receiver = 'HR_PAYROLL' rec_type = 'C' ) ).

    CALL FUNCTION 'SO_NEW_DOCUMENT_SEND_API1'
      EXPORTING
        document_data              = ls_doc
      TABLES
        object_content             = lt_text
        receivers                  = lt_rec
      EXCEPTIONS
        too_many_receivers         = 1
        document_not_sent          = 2
        OTHERS                     = 3.
*   Fehler beim Versand bewusst ignoriert (kein Blocker fuer ESS)
  ENDMETHOD.

ENDCLASS.

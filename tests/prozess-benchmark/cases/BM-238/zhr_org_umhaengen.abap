*&---------------------------------------------------------------------*
*& Report ZHR_ORG_UMHAENGEN
*&---------------------------------------------------------------------*
*& Massenumhaengung: alle Mitarbeiter einer Organisationseinheit zum
*& Stichtag in eine neue Organisationseinheit (optional auf eine
*& Planstelle) umsetzen. Genutzt bei Reorganisationen (2016, 2019).
*&
*& Pruefungen sind Klassen zu ZIF_HR_UMHAENG_PRUEFUNG, aktiviert ueber
*& Tabelle ZHR_UMH_PRUEF (SM30).
*&---------------------------------------------------------------------*
REPORT zhr_org_umhaengen MESSAGE-ID zhr_umh.

TABLES: pa0001.

TYPES: BEGIN OF ty_log,
         pernr TYPE persno,
         ok    TYPE abap_bool,
         text  TYPE string,
       END OF ty_log.

DATA: gt_pernr TYPE zhr_t_pernr,
      gt_log   TYPE STANDARD TABLE OF ty_log,
      go_umh   TYPE REF TO zcl_hr_org_umhaengung.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE text-b01.
PARAMETERS: p_orgalt TYPE orgeh OBLIGATORY,
            p_orgneu TYPE orgeh OBLIGATORY,
            p_plans  TYPE plans,
            p_datum  TYPE datum OBLIGATORY DEFAULT sy-datum.
SELECTION-SCREEN END OF BLOCK b1.
PARAMETERS: p_test AS CHECKBOX DEFAULT 'X'.

*----------------------------------------------------------------------*
CLASS lcl_handler DEFINITION.
  PUBLIC SECTION.
    CLASS-METHODS:
      on_umgehaengt FOR EVENT umgehaengt OF zcl_hr_org_umhaengung
        IMPORTING iv_pernr iv_ok iv_text,
      ausgabe.
ENDCLASS.

CLASS lcl_handler IMPLEMENTATION.
  METHOD on_umgehaengt.
    APPEND VALUE #( pernr = iv_pernr ok = iv_ok text = iv_text ) TO gt_log.
  ENDMETHOD.

  METHOD ausgabe.
    DATA ls_log TYPE ty_log.
    LOOP AT gt_log INTO ls_log.
      IF ls_log-ok = abap_true.
        FORMAT COLOR COL_POSITIVE.
      ELSE.
        FORMAT COLOR COL_NEGATIVE.
      ENDIF.
      WRITE: / ls_log-pernr, ls_log-text.
    ENDLOOP.
    FORMAT COLOR OFF.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
AT SELECTION-SCREEN.
*----------------------------------------------------------------------*
  IF p_orgalt = p_orgneu.
    MESSAGE e001.
  ENDIF.

*----------------------------------------------------------------------*
START-OF-SELECTION.
*----------------------------------------------------------------------*
  go_umh = NEW zcl_hr_org_umhaengung( iv_stichtag = p_datum
                                      iv_test     = p_test ).
  SET HANDLER lcl_handler=>on_umgehaengt FOR go_umh.

  SELECT pernr FROM pa0001 INTO TABLE gt_pernr
    WHERE orgeh  = p_orgalt
      AND begda <= p_datum
      AND endda >= p_datum.
  IF sy-subrc <> 0.
    MESSAGE s002 WITH p_orgalt DISPLAY LIKE 'W'.
    RETURN.
  ENDIF.

  go_umh->ausfuehren( it_pernr = gt_pernr
                      iv_orgeh = p_orgneu
                      iv_plans = p_plans ).

  lcl_handler=>ausgabe( ).

REPORT zsd_credit_quick.
*----------------------------------------------------------------------*
* Schnellpruefung Kreditlimit je Debitor / Kreditkontrollbereich
* 03.2014 MKR  Ersterstellung (Anforderung Vertrieb Innendienst)
*----------------------------------------------------------------------*
PARAMETERS: p_kunnr TYPE kunnr OBLIGATORY,
            p_kkber TYPE kkber DEFAULT '1000'.

CLASS lcl_credit DEFINITION FINAL.
  PUBLIC SECTION.
    CLASS-METHODS is_over_limit
      IMPORTING iv_kunnr       TYPE kunnr
                iv_kkber       TYPE kkber
      RETURNING VALUE(rv_over) TYPE abap_bool.
ENDCLASS.

CLASS lcl_credit IMPLEMENTATION.
  METHOD is_over_limit.
    DATA ls_knkk TYPE knkk.
    SELECT SINGLE * FROM knkk INTO ls_knkk
      WHERE kunnr = iv_kunnr
        AND kkber = iv_kkber.
*   offene Auftraege + Forderungen gegen Limit
    rv_over = xsdbool( sy-subrc = 0 AND
                       ls_knkk-skfor + ls_knkk-ssobl > ls_knkk-klimk ).
  ENDMETHOD.
ENDCLASS.

START-OF-SELECTION.
  IF lcl_credit=>is_over_limit( iv_kunnr = p_kunnr
                                iv_kkber = p_kkber ) = abap_true.
    WRITE: / 'Kreditlimit ueberschritten fuer Debitor'(001), p_kunnr.
  ENDIF.

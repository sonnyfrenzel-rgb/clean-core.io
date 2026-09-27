FUNCTION z_vf_kabellaenge.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(GLOBALS) LIKE  CUOV_00 STRUCTURE  CUOV_00
*"  TABLES
*"      QUERY STRUCTURE  CUOV_01
*"      MATCH STRUCTURE  CUOV_01
*"  EXCEPTIONS
*"      FAIL
*"      INTERNAL_ERROR
*"----------------------------------------------------------------------
* Variantenfunktion Z_VF_KABELLAENGE (CU65/CU66), gerufen aus der
* Prozedur PR_KABEL_TROMMEL des Konfigurationsprofils KABEL-KMAT:
*   Eingabe : Z_LAENGE_M, Z_QUERSCHNITT, Z_VERLEGEART (optional)
*   Ausgabe : Z_TROMMEL, Z_GEWICHT_KG
* FAIL -> Konfiguration inkonsistent (keine Trommel fuer Laenge/Gewicht)
*----------------------------------------------------------------------
  DATA: lv_laenge  TYPE cuov_01-atflv,
        lv_qs      TYPE cuov_01-atflv,
        lv_art     TYPE cuov_01-atwrt,
        lv_trommel TYPE cuov_01-atwrt,
        lv_gewicht TYPE cuov_01-atflv.

  CALL FUNCTION 'CUOV_GET_FUNCTION_ARGUMENT'
    EXPORTING
      argument      = 'Z_LAENGE_M'
    IMPORTING
      num_val       = lv_laenge
    TABLES
      query         = query
    EXCEPTIONS
      arg_not_found = 1.
  IF sy-subrc <> 0.
    RAISE internal_error.
  ENDIF.

  CALL FUNCTION 'CUOV_GET_FUNCTION_ARGUMENT'
    EXPORTING
      argument      = 'Z_QUERSCHNITT'
    IMPORTING
      num_val       = lv_qs
    TABLES
      query         = query
    EXCEPTIONS
      arg_not_found = 1.
  IF sy-subrc <> 0.
    RAISE internal_error.
  ENDIF.

  CALL FUNCTION 'CUOV_GET_FUNCTION_ARGUMENT'
    EXPORTING
      argument      = 'Z_VERLEGEART'
    IMPORTING
      sym_val       = lv_art
    TABLES
      query         = query
    EXCEPTIONS
      arg_not_found = 1.
* ohne Verlegeart gilt Erdverlegung
  lv_art = COND #( WHEN sy-subrc = 0 THEN lv_art ELSE 'ERDE' ).

  TRY.
      DATA(lo_kabel) = NEW zcl_vc_kabel( iv_querschnitt = lv_qs
                                         iv_verlegeart  = lv_art ).
      lv_gewicht = lo_kabel->gewicht_berechnen( lv_laenge ).
      lv_trommel = lo_kabel->trommel_ermitteln( iv_laenge  = lv_laenge
                                                iv_gewicht = lv_gewicht ).
    CATCH zcx_vc_kabel.
      RAISE fail.
  ENDTRY.

  CALL FUNCTION 'CUOV_SET_FUNCTION_ARGUMENT'
    EXPORTING
      argument                = 'Z_TROMMEL'
      vtype                   = 'CHAR'
      sym_val                 = lv_trommel
    TABLES
      match                   = match
    EXCEPTIONS
      existing_value_replaced = 1
      OTHERS                  = 2.

  CALL FUNCTION 'CUOV_SET_FUNCTION_ARGUMENT'
    EXPORTING
      argument                = 'Z_GEWICHT_KG'
      vtype                   = 'NUM'
      num_val                 = lv_gewicht
    TABLES
      match                   = match
    EXCEPTIONS
      existing_value_replaced = 1
      OTHERS                  = 2.

ENDFUNCTION.

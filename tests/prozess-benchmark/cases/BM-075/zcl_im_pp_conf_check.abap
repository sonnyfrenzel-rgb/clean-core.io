CLASS zcl_im_pp_conf_check DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_ex_workorder_confirm.

  PRIVATE SECTION.
    CONSTANTS c_default_tol TYPE p LENGTH 5 DECIMALS 2 VALUE '5.00'.

    METHODS get_toleranz
      IMPORTING iv_werks      TYPE werks_d
                iv_arbid      TYPE cr_objid
      RETURNING VALUE(rv_tol) TYPE zpp_auss_tol-toleranz.
ENDCLASS.



CLASS zcl_im_pp_conf_check IMPLEMENTATION.

*----------------------------------------------------------------------*
* Pruefung beim Sichern einer Rueckmeldung (CO11N, CO15, BAPI)
* Ausschussquote gegen Toleranz je Arbeitsplatz; bei Ueberschreitung
* ist ein Abweichungsgrund Pflicht und QS wird informiert.
*----------------------------------------------------------------------*
  METHOD if_ex_workorder_confirm~at_save.
    DATA: lv_auart TYPE aufart,
          lv_menge TYPE ru_lmnga,
          lv_quote TYPE p LENGTH 7 DECIMALS 2,
          lv_tol   TYPE zpp_auss_tol-toleranz.

    SELECT SINGLE auart FROM aufk INTO lv_auart
      WHERE aufnr = is_confirmation-aufnr.
    IF lv_auart <> 'PP01' AND lv_auart <> 'PP02'.
      RETURN.
    ENDIF.

    lv_menge = is_confirmation-lmnga + is_confirmation-xmnga.
    CHECK lv_menge > 0 AND is_confirmation-xmnga > 0.

    lv_quote = is_confirmation-xmnga * 100 / lv_menge.
    lv_tol   = get_toleranz( iv_werks = is_confirmation-werks
                             iv_arbid = is_confirmation-arbid ).

    IF lv_quote > lv_tol.
      IF is_confirmation-grund IS INITIAL.
        MESSAGE e120(zpp) WITH lv_quote lv_tol RAISING error_with_message.
      ENDIF.

      CALL FUNCTION 'Z_PP_AUSSCHUSS_MELDEN' IN UPDATE TASK
        EXPORTING
          iv_aufnr = is_confirmation-aufnr
          iv_vornr = is_confirmation-vornr
          iv_werks = is_confirmation-werks
          iv_xmnga = is_confirmation-xmnga
          iv_quote = lv_quote
          iv_grund = is_confirmation-grund.
    ENDIF.
  ENDMETHOD.


*----------------------------------------------------------------------*
* Storno nur, wenn kein Folgevorgang schon rueckgemeldet ist
*----------------------------------------------------------------------*
  METHOD if_ex_workorder_confirm~at_cancel_check.
    DATA lv_rueck TYPE co_rueck.

    SELECT SINGLE r~rueck
      INTO lv_rueck
      FROM afru AS r
      INNER JOIN afvc AS v ON v~rueck = r~rueck
      WHERE v~aufpl =  is_confirmation-aufpl
        AND v~vornr >  is_confirmation-vornr
        AND r~stokz =  space
        AND r~stzhl =  0.
    IF sy-subrc = 0.
      MESSAGE e121(zpp) WITH is_confirmation-vornr RAISING error_with_message.
    ENDIF.
  ENDMETHOD.


*----------------------------------------------------------------------*
* Laeuft in der Verbuchung: Tagesstatistik Gutmenge/Ausschuss je
* Werk und Arbeitsplatz fortschreiben (Auswertung Schichtleiter)
*----------------------------------------------------------------------*
  METHOD if_ex_workorder_confirm~in_update.
    DATA ls_stat TYPE zpp_conf_stat.

    LOOP AT it_confirmations INTO DATA(ls_conf).
*     Stornosaetze nicht zaehlen (Altlast: sollten eigentlich abziehen)
      IF ls_conf-stokz = abap_true.
        CONTINUE.
      ENDIF.

      SELECT SINGLE * FROM zpp_conf_stat INTO ls_stat
        WHERE werks = ls_conf-werks
          AND arbid = ls_conf-arbid
          AND datum = ls_conf-budat.
      IF sy-subrc <> 0.
        CLEAR ls_stat.
        ls_stat-werks = ls_conf-werks.
        ls_stat-arbid = ls_conf-arbid.
        ls_stat-datum = ls_conf-budat.
      ENDIF.

      ls_stat-gutmenge  = ls_stat-gutmenge  + ls_conf-lmnga.
      ls_stat-ausschuss = ls_stat-ausschuss + ls_conf-xmnga.
      ls_stat-anzahl    = ls_stat-anzahl + 1.
      MODIFY zpp_conf_stat FROM ls_stat.
    ENDLOOP.
  ENDMETHOD.


  METHOD get_toleranz.
    SELECT SINGLE toleranz FROM zpp_auss_tol INTO rv_tol
      WHERE werks = iv_werks
        AND arbid = iv_arbid.
    IF sy-subrc <> 0.
      rv_tol = c_default_tol.
    ENDIF.
  ENDMETHOD.

ENDCLASS.

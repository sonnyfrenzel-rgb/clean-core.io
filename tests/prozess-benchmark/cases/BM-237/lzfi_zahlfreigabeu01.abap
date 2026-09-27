FUNCTION z_fi_zahlvorschlag_pruefen.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_LAUFD) TYPE  LAUFD
*"     VALUE(IV_LAUFI) TYPE  LAUFI
*"     VALUE(IV_TAGE) TYPE  I DEFAULT 30
*"     VALUE(IV_LIMIT) TYPE  DMBTR DEFAULT '250000.00'
*"  EXPORTING
*"     VALUE(EV_STATUS) TYPE  CHAR1
*"  TABLES
*"      ET_BEFUND STRUCTURE  ZFI_ZF_BEFUND OPTIONAL
*"  EXCEPTIONS
*"      KEIN_VORSCHLAG
*"----------------------------------------------------------------------
*----------------------------------------------------------------------
* Aufrufer:
*   - Report ZFI_ZAHLVORSCHLAG_CHECK (Job direkt nach dem Vorschlag)
*   - Transaktion ZF110, Dynpro 0100, OK-Code PRUEF
* Der Aufrufer macht das COMMIT WORK (Job: implizit am Programmende).
*
* Befundklassen:
*   R  Bankverbindung in den letzten IV_TAGE Tagen geaendert
*   B  Zahlbetrag ueber IV_LIMIT (Hauswaehrung)
*   C  Einmalkreditor
*
* Aenderungen:
*   2014-05  TKR  Erstellung
*   2017-01  TKR  Bankdatenpruefung ueber Aenderungsbelege
*   2019-08  BSU  Limit als Parameter statt ZFI_HBK_LIMIT
*----------------------------------------------------------------------
  DATA: ls_pruef TYPE zfi_zf_pruef,
        lv_cpd   TYPE xcpdk.

  CLEAR: gt_befund, ev_status.

* Zahlungsvorschlag (XVORL = X), nur Kreditoren
  SELECT * FROM reguh INTO TABLE gt_reguh
    WHERE laufd = iv_laufd
      AND laufi = iv_laufi
      AND xvorl = 'X'
      AND lifnr <> space.
  IF sy-subrc <> 0.
    RAISE kein_vorschlag.
  ENDIF.

  LOOP AT gt_reguh INTO gs_reguh.
*   Nullzahlungen / Verrechnungen nicht pruefen
    CHECK gs_reguh-rbetr <> 0.

    PERFORM bankaenderung_pruefen USING gs_reguh iv_tage.

    IF abs( gs_reguh-rbetr ) > iv_limit.
      PERFORM befund_add USING gs_reguh 'B' 'Zahlbetrag ueber Limit'.
    ENDIF.

*   Einmalkreditor (CPD) - Bankdaten stehen nur im Beleg
    SELECT SINGLE xcpdk FROM lfa1 INTO lv_cpd
      WHERE lifnr = gs_reguh-lifnr.
    IF lv_cpd = 'X'.
      PERFORM befund_add USING gs_reguh 'C' 'Einmalkreditor'.
    ENDIF.
  ENDLOOP.

  PERFORM risiko_bewerten CHANGING ev_status.

* Pruefergebnis festhalten - Grundlage fuer die Freigabe
  ls_pruef-laufd     = iv_laufd.
  ls_pruef-laufi     = iv_laufi.
  ls_pruef-status    = ev_status.
  ls_pruef-ersteller = sy-uname.
  ls_pruef-erdat     = sy-datum.
  ls_pruef-erzeit    = sy-uzeit.
  MODIFY zfi_zf_pruef FROM ls_pruef.

  et_befund[] = gt_befund[].
ENDFUNCTION.

FUNCTION z_hr_abwesenheit_pruefen.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_PERNR) TYPE  PERSNO
*"     VALUE(IV_AWART) TYPE  AWART
*"     VALUE(IV_BEGDA) TYPE  BEGDA
*"     VALUE(IV_ENDDA) TYPE  ENDDA
*"  EXPORTING
*"     VALUE(EV_OK) TYPE  XFELD
*"  EXCEPTIONS
*"      UEBERSCHNEIDUNG
*"      KONTINGENT_ERSCHOEPFT
*"----------------------------------------------------------------------
* Pruefung beantragter Abwesenheit (Portal-Antrag, alter ESS-Weg)
  DATA: lt_p2001  TYPE STANDARD TABLE OF pa2001,
        lv_tage   TYPE p DECIMALS 2,
        lv_rest   TYPE p DECIMALS 2.

  CLEAR ev_ok.

* Krankheit (0200) wird nie gegen Kontingent geprueft
  IF iv_awart = '0200'.
    ev_ok = 'X'.
    RETURN.
  ENDIF.

* Ueberschneidung mit bestehenden Abwesenheiten
  SELECT * FROM pa2001 INTO TABLE lt_p2001
    WHERE pernr = iv_pernr
      AND begda <= iv_endda
      AND endda >= iv_begda
      AND sprps = space.
  IF sy-subrc = 0.
    MESSAGE e120(zhr) WITH iv_pernr RAISING ueberschneidung.
  ENDIF.

  lv_tage = iv_endda - iv_begda + 1.

  PERFORM kontingent_ermitteln USING    iv_pernr iv_begda
                               CHANGING lv_rest.

  IF lv_rest < lv_tage.
    MESSAGE e121(zhr) WITH lv_rest RAISING kontingent_erschoepft.
  ELSEIF lv_rest - lv_tage < 3.
*   Hinweis fuer das Portal, Antrag bleibt gueltig
    MESSAGE i122(zhr) WITH lv_rest.
  ENDIF.

  ev_ok = 'X'.
ENDFUNCTION.

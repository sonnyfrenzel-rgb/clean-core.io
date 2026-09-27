*&---------------------------------------------------------------------*
*& Report ZHR_UEBERSTUNDEN
*&---------------------------------------------------------------------*
*& Genehmigte Mehrarbeit aus CATS (Status 30) je Mitarbeiter und
*& Abwesenheits-/Anwesenheitsart verdichten und als Entgeltbeleg
*& (Infotyp 2010) an die Abrechnung uebergeben.
*&
*& Regeln je Mitarbeiterkreis in ZHR_OT_REGEL:
*&   Regeltyp T = Tarif (Stunden * Faktor)
*&   Regeltyp A = AT    (Freistunden pauschal abgegolten)
*&---------------------------------------------------------------------*
*& 2011-02  MHO  Erstellung
*& 2014-09  MHO  Umbau auf Regelklassen (vorher CASE in FORM)
*& 2019-04  DWE  Doppeluebertragung verhindern (ZHR_OT_UEBERTR)
*& 2021-11  DWE  Job-Status ueber Fehlermeldung am Ende
*&---------------------------------------------------------------------*
REPORT zhr_ueberstunden MESSAGE-ID zhr_ot.

INCLUDE zhr_ueberstunden_top.
INCLUDE zhr_ueberstunden_sel.
INCLUDE zhr_ueberstunden_cls.
INCLUDE zhr_ueberstunden_f01.

*----------------------------------------------------------------------*
START-OF-SELECTION.
*----------------------------------------------------------------------*
  CONCATENATE p_per '01' INTO gv_begda.
  CALL FUNCTION 'RP_LAST_DAY_OF_MONTHS'
    EXPORTING
      day_in            = gv_begda
    IMPORTING
      last_day_of_month = gv_endda
    EXCEPTIONS
      OTHERS            = 1.

  PERFORM cats_lesen.
  IF gt_summe IS INITIAL.
    MESSAGE s100 WITH p_per DISPLAY LIKE 'W'.
    RETURN.
  ENDIF.

  LOOP AT gt_summe INTO gs_summe.
    PERFORM mitarbeiter_uebertragen USING gs_summe.
  ENDLOOP.

*----------------------------------------------------------------------*
END-OF-SELECTION.
*----------------------------------------------------------------------*
  PERFORM ausgeben.

* im Job: Fehler sollen den Job rot machen (Anforderung Abrechnung)
  IF gv_fehler > 0 AND sy-batch = 'X'.
    MESSAGE e199 WITH gv_fehler.
  ENDIF.

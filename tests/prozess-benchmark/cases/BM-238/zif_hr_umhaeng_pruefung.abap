INTERFACE zif_hr_umhaeng_pruefung
  PUBLIC.

*----------------------------------------------------------------------*
* Pruefung vor dem Umhaengen eines Mitarbeiters.
* Rueckgabe leer = in Ordnung, sonst Fehlertext fuer das Protokoll.
* Implementierungen werden in ZHR_UMH_PRUEF eingetragen und von
* ZCL_HR_ORG_UMHAENGUNG in der dort gepflegten Reihenfolge gerufen.
*----------------------------------------------------------------------*
  METHODS pruefen
    IMPORTING
      iv_pernr         TYPE persno
      iv_plans         TYPE plans
      iv_stichtag      TYPE datum
    RETURNING
      VALUE(rv_fehler) TYPE string.

ENDINTERFACE.

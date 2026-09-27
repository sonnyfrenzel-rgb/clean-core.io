FUNCTION exit_sapmiwo0_020.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(I_VIQMEL) LIKE  VIQMEL STRUCTURE  VIQMEL
*"     VALUE(I_AKTYP) LIKE  T365-AKTYP
*"  TABLES
*"      T_VIQMFE STRUCTURE  WQMFE
*"  EXCEPTIONS
*"      EXIT_FROM_SAVE
*"----------------------------------------------------------------------
* Erweiterung QQMA0014: Prüfungen vor dem Sichern der Meldung

  INCLUDE zxqqmu20.

ENDFUNCTION.

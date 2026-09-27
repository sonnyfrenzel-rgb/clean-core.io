FUNCTION-POOL zfi_zahlfreigabe MESSAGE-ID zfi_zf.
*----------------------------------------------------------------------*
* Funktionsgruppe ZFI_ZAHLFREIGABE
*
* Vier-Augen-Freigabe von Zahlungsvorschlaegen (F110) vor dem
* Zahlungslauf. Ablauf:
*   1. Z_FI_ZAHLVORSCHLAG_PRUEFEN  - Pruefung des Vorschlags, Ampel
*   2. Z_FI_ZAHLLAUF_FREIGEBEN     - Freigabe durch zweite Person
*   3. Z_FI_ZF_STATUS_UPD          - Verbuchungsbaustein (V1)
* Der Zahlungslauf selbst wird durch den Workflow ZFIZAHLL
* (Ereignis RELEASED) eingeplant - nicht Teil dieser Gruppe.
*
* Revision 2017: Pruefung Bankdatenaenderung (Betrugsfall 11/2016)
*
* Statuswerte ZFI_ZF_PRUEF-STATUS
*   G  gruen          - keine Befunde
*   Y  gelb           - Befunde Limit/CPD, Freigabe nur mit Kommentar
*   R  rot            - Bankdatenaenderung, keine Freigabe moeglich
*   F  freigegeben    - Zahlungslauf wird eingeplant
*   Z  zurueckgewiesen
*
* Nachrichten ZFI_ZF
*   010 Kein Pruefergebnis zu Lauf & &
*   011 Vier-Augen-Prinzip: Pruefer darf nicht freigeben
*   012 Status rot - Freigabe nicht moeglich
*   013 Bei Status gelb ist ein Kommentar Pflicht
*   014 Lauf bereits freigegeben durch &
*   015 Workflow-Ereignis fuer & nicht erzeugt
*   016 Zurueckweisung nur mit Kommentar
*   017 Lauf bereits freigegeben durch &
*   020 Pruefsatz & & nicht gefunden (Verbuchung)
*----------------------------------------------------------------------*
TYPES: BEGIN OF gty_befund,
         lifnr  TYPE lifnr,
         vblnr  TYPE vblnr,
         klasse TYPE c LENGTH 1,     "R = rot, B = Betrag, C = CPD
         text   TYPE char80,
       END OF gty_befund.

DATA: gt_reguh  TYPE STANDARD TABLE OF reguh,
      gs_reguh  TYPE reguh,
      gt_befund TYPE STANDARD TABLE OF gty_befund.

CONSTANTS: gc_gruen     TYPE c LENGTH 1 VALUE 'G',
           gc_gelb      TYPE c LENGTH 1 VALUE 'Y',
           gc_rot       TYPE c LENGTH 1 VALUE 'R',
           gc_freigabe  TYPE c LENGTH 1 VALUE 'F',
           gc_objclas   TYPE cdobjectcl VALUE 'KRED'.

*&---------------------------------------------------------------------*
*& Include MZFM_MVB_TOP - globale Daten
*&---------------------------------------------------------------------*
* Nachrichtenklasse ZFM (Auszug):
*   020 Antrag nicht gefunden        021 Finanzstelle ungültig
*   022 keine Berechtigung            023 erst Verfügbarkeit prüfen
*   024/025 Verfügbarkeit nicht ausreichend / ausreichend
*   026 Nummernkreis                  027 Antrag eingereicht
*   028-031 Entscheidung              034 Mittelvormerkung fehlgeschlagen
* Tabelle ZFM_MVB_KOPF (Antrag auf Mittelvormerkung):
*   ANTRAG      Antragsnummer (Nummernkreisobjekt ZFM_MVB, Intervall 01)
*   FIKRS       Finanzkreis
*   GJAHR       Haushaltsjahr
*   FISTL       Finanzstelle
*   FIPEX       Finanzposition
*   BETRAG      beantragter Betrag, WAERS Währung
*   TEXT        Verwendungszweck
*   STATUS      O / G / R (siehe unten)
*   ERNAM/ERDAT Antragsteller, Einreichungsdatum
*   GENEHM_VON  Entscheider, GENEHM_AM Entscheidungsdatum
*   BELNR       Nummer der Mittelvormerkung (nur bei Genehmigung)
* Tabelle ZFM_MVB_LOG: ein Satz je Statuswechsel (Verbuchung)
* Antragskopf (Dynprofelder 0100/0200 referenzieren GS_KOPF-...)
*   STATUS: O offen (eingereicht), G genehmigt, R abgelehnt
DATA: ok_code       TYPE sy-ucomm,
      gv_ucomm      TYPE sy-ucomm,
      gs_kopf       TYPE zfm_mvb_kopf,
      gv_geprueft   TYPE abap_bool,
      gv_verfuegbar TYPE zfm_betrag,
      gv_antrag     TYPE zfm_mvb_nr.

CONSTANTS: gc_objtype TYPE swo_objtyp VALUE 'ZFMMVB',
           gc_nrobj   TYPE nrobj      VALUE 'ZFM_MVB',
           gc_blart   TYPE kblk-blart VALUE 'ZV'.

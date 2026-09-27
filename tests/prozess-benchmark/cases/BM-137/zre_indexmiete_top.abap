*&---------------------------------------------------------------------*
*& Include ZRE_INDEXMIETE_TOP - Deklarationen Indexmietanpassung
*&---------------------------------------------------------------------*
TABLES: vicncn.

TYPES: BEGIN OF ty_vtr,
         bukrs       TYPE vicncn-bukrs,
         recnnr      TYPE vicncn-recnnr,
         intreno     TYPE vicncn-intreno,
         recntxt     TYPE vicncn-recntxt,
         index_id    TYPE zre_index_id,
         basis_wert  TYPE zre_index_wert_d,
         basis_monat TYPE spmon,
         schwelle    TYPE zre_proz,
         letzte_anp  TYPE d,
         condtype    TYPE vicdcond-condtype,
       END OF ty_vtr,
       BEGIN OF ty_erg,
         bukrs      TYPE vicncn-bukrs,
         recnnr     TYPE vicncn-recnnr,
         intreno    TYPE vicncn-intreno,
         recntxt    TYPE vicncn-recntxt,
         condtype   TYPE vicdcond-condtype,
         index_id   TYPE zre_index_id,
         akt_wert   TYPE zre_index_wert_d,
         proz       TYPE zre_proz,
         miete_alt  TYPE zre_betrag,
         miete_neu  TYPE zre_betrag,
         status     TYPE char1,     "B berechnet, A angepasst, G gesperrt,
                                    "F Fehler, D Druckfehler, S übersprungen
         text       TYPE char80,
       END OF ty_erg.

* Textsymbole: TEXT-001 Auswahl, TEXT-002 Ablauf
* Nachrichtenklasse ZRE: 210 Wirksamkeit nur zum Monatsersten,
*   211 keine Verträge mit Wertsicherung, 212 Formular fehlt,
*   213 keine Mailadresse für den Buchungskreis
SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
PARAMETERS: p_bukrs TYPE vicncn-bukrs OBLIGATORY,
            p_monat TYPE spmon OBLIGATORY,          "Indexmonat
            p_ab    TYPE d OBLIGATORY.              "Wirksam ab
SELECT-OPTIONS: s_recnnr FOR vicncn-recnnr.
SELECTION-SCREEN END OF BLOCK b1.
SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-002.
PARAMETERS: p_test  AS CHECKBOX DEFAULT 'X',
            p_brief AS CHECKBOX DEFAULT 'X'.
SELECTION-SCREEN END OF BLOCK b2.

DATA: gt_vtr   TYPE STANDARD TABLE OF ty_vtr,
      gt_index TYPE SORTED TABLE OF zre_index_wert WITH UNIQUE KEY index_id monat,
      gt_erg   TYPE STANDARD TABLE OF ty_erg.

CONSTANTS: gc_brief_form TYPE tdsfname VALUE 'ZRE_INDEX_BRIEF',
           gc_min_tage   TYPE i VALUE 365.

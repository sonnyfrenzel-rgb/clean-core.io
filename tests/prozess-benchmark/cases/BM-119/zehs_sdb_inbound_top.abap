*----------------------------------------------------------------------*
* Include ZEHS_SDB_INBOUND_TOP - Daten und Selektionsbild
*----------------------------------------------------------------------*
* Ergebnis der Transformation ZEHS_SDB_TO_ABAP (Struktur ZEHS_S_SDB):
*   LIFNR   Lieferant (aus Absender-ID gemappt)
*   MATNR_L Materialnummer des Lieferanten
*   CAS     CAS-Nummer des Hauptbestandteils
*   NAME    Handelsname
*   VERSION Versionsnummer SDB
*   DATUM   Überarbeitungsdatum SDB
*   LGK     Lagerklasse nach TRGS 510 (Abschnitt 7 SDB)
*   WGK     Wassergefährdungsklasse (Abschnitt 15 SDB)
*   HSAETZE H-Sätze (Tabelle)
*
* Gefahrstoffkataster ZEHS_KATASTER: Schlüssel WERKS, LGORT, SUBID
* Aufgaben an den Gefahrstoffbeauftragten: ZEHS_AUFGABE
*----------------------------------------------------------------------*
TYPES: BEGIN OF ty_prot,
         objekt TYPE c LENGTH 60,
         msgty  TYPE symsgty,
         text   TYPE c LENGTH 120,
       END OF ty_prot.

DATA: gt_files TYPE STANDARD TABLE OF eps2fili,
      gs_file  TYPE eps2fili,
      gt_prot  TYPE STANDARD TABLE OF ty_prot,
      gv_dir   TYPE eps2filnam,
      gv_ok    TYPE abap_bool,
      gv_xml   TYPE xstring,
      gv_text  TYPE string.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
PARAMETERS: p_dir   TYPE eps2filnam LOWER CASE
                    DEFAULT '/interface/ehs/sdb/in/',
            p_werks TYPE werks_d OBLIGATORY.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-002.
PARAMETERS: p_test  AS CHECKBOX DEFAULT 'X'.
SELECTION-SCREEN END OF BLOCK b2.

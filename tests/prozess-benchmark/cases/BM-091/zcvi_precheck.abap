*&---------------------------------------------------------------------*
*& Report ZCVI_PRECHECK
*&---------------------------------------------------------------------*
*& Vorbereitung Geschäftspartner-Umstellung (CVI):
*& Kundenstamm auf Datenqualität prüfen, bevor die Synchronisation
*& Kunde -> Geschäftspartner (MDS_LOAD_COCKPIT) läuft.
*& Inaktive Kunden optional zum Löschen vormerken.
*&---------------------------------------------------------------------*
*& 2019-05  PW  Erstellung im Rahmen S/4-Vorprojekt
*& 2019-07  PW  Prüfung USt-Id nur für EU-Länder
*& 2020-02  RB  Aktivitätsprüfung über letzten Verkaufsbeleg
*&---------------------------------------------------------------------*
REPORT zcvi_precheck.

TABLES: kna1.

TYPES: BEGIN OF ty_kna1,
         kunnr TYPE kna1-kunnr,
         name1 TYPE kna1-name1,
         land1 TYPE kna1-land1,
         pstlz TYPE kna1-pstlz,
         stceg TYPE kna1-stceg,
         adrnr TYPE kna1-adrnr,
         ktokd TYPE kna1-ktokd,
       END OF ty_kna1.

TYPES: BEGIN OF ty_issue,
         kunnr TYPE kna1-kunnr,
         cat   TYPE c LENGTH 1,      "E=Fehler W=Warnung I=inaktiv
         text  TYPE c LENGTH 60,
       END OF ty_issue.

DATA: gt_kna1  TYPE STANDARD TABLE OF ty_kna1,
      gt_link  TYPE SORTED TABLE OF cvi_cust_link-customer
                 WITH UNIQUE KEY table_line,
      gt_issue TYPE STANDARD TABLE OF ty_issue,
      gv_limit TYPE datum.

FIELD-SYMBOLS <gs_kna1> TYPE ty_kna1.

SELECT-OPTIONS: s_kunnr FOR kna1-kunnr,
                s_ktokd FOR kna1-ktokd.
PARAMETERS: p_years TYPE i DEFAULT 3,
            p_upd   AS CHECKBOX.

INCLUDE zcvi_precheck_f01.

START-OF-SELECTION.
  gv_limit = sy-datum - p_years * 365.

  SELECT kunnr, name1, land1, pstlz, stceg, adrnr, ktokd
    FROM kna1
    WHERE kunnr IN @s_kunnr
      AND ktokd IN @s_ktokd
      AND loevm = @space
    INTO TABLE @gt_kna1.
  IF gt_kna1 IS INITIAL.
    MESSAGE s001(zcvi).
    RETURN.
  ENDIF.

* bereits umgesetzte Kunden (Geschäftspartner vorhanden) ausblenden
  SELECT customer FROM cvi_cust_link
    FOR ALL ENTRIES IN @gt_kna1
    WHERE customer = @gt_kna1-kunnr
    INTO TABLE @gt_link.

  LOOP AT gt_kna1 ASSIGNING <gs_kna1>.
    READ TABLE gt_link WITH TABLE KEY table_line = <gs_kna1>-kunnr
      TRANSPORTING NO FIELDS.
    IF sy-subrc = 0.
      CONTINUE.
    ENDIF.
    PERFORM check_country  USING <gs_kna1>.
    PERFORM check_address  USING <gs_kna1>.
    PERFORM check_activity USING <gs_kna1>.
  ENDLOOP.

  IF p_upd = 'X'.
    PERFORM apply_fixes.
  ENDIF.

  PERFORM display_alv.

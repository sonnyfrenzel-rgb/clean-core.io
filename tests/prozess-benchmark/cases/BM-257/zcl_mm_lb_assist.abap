*----------------------------------------------------------------------*
* Assistenzklasse der Lieferantenbewertung (ZWD_MM_LIEF_BEWERTUNG)
*
* Kennzahlen je Einteilung (nicht je Bestellposition!):
*   puenktlich  = letzter Wareneingang <= Liefertermin + 2 Tage
*   mengentreu  = WE-Menge >= 95 % der Einteilungsmenge
* Qualitaet: Anteil nicht abgelehnter Pruefloese (Art 01) im Zeitraum
*
* Historie
* 2019-08 BG  Erstellung
* 2020-03 BG  Toleranz Liefertermin 0 -> 2 Tage (Wunsch Einkauf)
* 2021-06 FS  Qualitaetsquote aus QALS/QAVE statt Excel-Upload
* 2022-01 FS  Eskalation per Workflow-Ereignis LFA1.ZBEWERTUNG_C
*----------------------------------------------------------------------*
CLASS zcl_mm_lb_assist DEFINITION
  PUBLIC
  INHERITING FROM cl_wd_component_assistance
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES: BEGIN OF ty_kennzahlen,
             anzahl     TYPE i,
             puenktlich TYPE i,
             mengentreu TYPE i,
           END OF ty_kennzahlen.

    CONSTANTS: gc_toleranz_tage TYPE i VALUE 2,
               gc_toleranz_menge TYPE p LENGTH 3 DECIMALS 2 VALUE '0.95'.

    METHODS lieferkennzahlen
      IMPORTING iv_lifnr        TYPE lifnr
                iv_von          TYPE d
                iv_bis          TYPE d
      RETURNING VALUE(rs_kennz) TYPE ty_kennzahlen.

    METHODS qualitaetsquote
      IMPORTING iv_lifnr         TYPE lifnr
                iv_von           TYPE d
                iv_bis           TYPE d
      RETURNING VALUE(rv_quote)  TYPE zmm_lb_punkte.

    METHODS speichern
      IMPORTING is_bewertung TYPE zmm_lief_bew
      RAISING   zcx_mm_lb.

    METHODS eskalieren
      IMPORTING iv_lifnr TYPE lifnr.
ENDCLASS.



CLASS zcl_mm_lb_assist IMPLEMENTATION.

  METHOD lieferkennzahlen.
*   Einteilungen der Bestellungen des Lieferanten im Zeitraum
    SELECT p~ebeln, p~ebelp, t~etenr, t~eindt, t~menge
      FROM ekko AS k
      INNER JOIN ekpo AS p ON p~ebeln = k~ebeln
      INNER JOIN eket AS t ON t~ebeln = p~ebeln AND t~ebelp = p~ebelp
      WHERE k~lifnr = @iv_lifnr
        AND k~bstyp = 'F'
        AND t~eindt BETWEEN @iv_von AND @iv_bis
        AND p~loekz = @space
        AND p~elikz = @abap_true          "nur endgelieferte Positionen
      INTO TABLE @DATA(lt_eint).

    LOOP AT lt_eint INTO DATA(ls_eint).
      rs_kennz-anzahl = rs_kennz-anzahl + 1.

*     Wareneingaenge (Vorgangsart 1) zur Position
      SELECT MAX( budat ) AS letzter_we, SUM( menge ) AS we_menge
        FROM ekbe
        WHERE ebeln = @ls_eint-ebeln
          AND ebelp = @ls_eint-ebelp
          AND vgabe = '1'
        INTO @DATA(ls_we).

      IF ls_we-letzter_we IS NOT INITIAL AND
         ls_we-letzter_we <= ls_eint-eindt + gc_toleranz_tage.
        rs_kennz-puenktlich = rs_kennz-puenktlich + 1.
      ENDIF.

      IF ls_we-we_menge >= ls_eint-menge * gc_toleranz_menge.
        rs_kennz-mengentreu = rs_kennz-mengentreu + 1.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD qualitaetsquote.
    DATA: lv_lose       TYPE i,
          lv_abgelehnt  TYPE i.

*   Pruefloswesen: Lose zum Wareneingang (Art 01)
    SELECT COUNT(*) FROM qals
      WHERE lifnr = @iv_lifnr
        AND art   = '01'
        AND enstehdat BETWEEN @iv_von AND @iv_bis
      INTO @lv_lose.

    IF lv_lose = 0.
      rv_quote = 100.                  "keine Pruefung = keine Beanstandung
      RETURN.
    ENDIF.

    SELECT COUNT(*) FROM qals AS l
      INNER JOIN qave AS v ON v~prueflos = l~prueflos
      WHERE l~lifnr = @iv_lifnr
        AND l~art   = '01'
        AND l~enstehdat BETWEEN @iv_von AND @iv_bis
        AND v~vbewertung = 'R'
      INTO @lv_abgelehnt.

    rv_quote = ( lv_lose - lv_abgelehnt ) * 100 / lv_lose.
  ENDMETHOD.


  METHOD speichern.
    DATA(ls_db) = is_bewertung.
    ls_db-erfasst_von = sy-uname.
    ls_db-erfasst_am  = sy-datum.

    INSERT zmm_lief_bew FROM ls_db.
    IF sy-subrc <> 0.
*     gleicher Lieferant/Zeitraum schon bewertet -> ueberschreiben
      UPDATE zmm_lief_bew FROM ls_db.
      IF sy-subrc <> 0.
        ROLLBACK WORK.
        RAISE EXCEPTION TYPE zcx_mm_lb
          EXPORTING
            textid = zcx_mm_lb=>speichern_fehler
            lifnr  = is_bewertung-lifnr.
      ENDIF.
    ENDIF.

    COMMIT WORK.
  ENDMETHOD.


  METHOD eskalieren.
    DATA lv_key TYPE swo_typeid.

    lv_key = iv_lifnr.
    CALL FUNCTION 'SAP_WAPI_CREATE_EVENT'
      EXPORTING
        object_type = 'LFA1'
        object_key  = lv_key
        event       = 'ZBEWERTUNG_C'
        commit_work = abap_true.
  ENDMETHOD.

ENDCLASS.

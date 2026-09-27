REPORT zisu_ablupload MESSAGE-ID zisu LINE-SIZE 132.
*----------------------------------------------------------------------*
* Upload Ableseergebnisse der Ablesefirma (CSV) nach IS-U
* Format: Geraet;Zaehlwerk;Ablesedatum;Zaehlerstand;Hinweis
* 2011 Ersterstellung / 2016 Plausi Tagesverbrauch
* 2019 Applog wieder ausgebaut (Performance), Fehler in Liste
*----------------------------------------------------------------------*
TYPES: BEGIN OF ty_satz,
         equnr    TYPE equi-equnr,
         zwnummer TYPE eabl-zwnummer,
         adat_c   TYPE char10,
         stand_c  TYPE char20,
         hinweis  TYPE char40,
         adat     TYPE sy-datum,
         stand    TYPE p LENGTH 13 DECIMALS 3,
       END OF ty_satz,
       BEGIN OF ty_alt,
         adat      TYPE eabl-adat,
         v_zwstand TYPE eabl-v_zwstand,
       END OF ty_alt.

DATA: gt_satz   TYPE STANDARD TABLE OF ty_satz,
      gs_satz   TYPE ty_satz,
      gv_msgno  TYPE symsgno,
      gt_upl    TYPE STANDARD TABLE OF bapieablu,
      gt_ret    TYPE STANDARD TABLE OF bapiret2,
      gv_anz_ok TYPE i,
      gv_anz_f  TYPE i.

PARAMETERS: p_file TYPE rlgrap-filename LOWER CASE OBLIGATORY
                   DEFAULT '/interface/isu/ablesung/in/abl.csv',
            p_tol  TYPE p LENGTH 5 DECIMALS 1 DEFAULT '50.0',
            p_test AS CHECKBOX DEFAULT 'X'.

INCLUDE zisu_ablupload_f01.

START-OF-SELECTION.
  PERFORM datei_lesen.
  IF gt_satz IS INITIAL.
    MESSAGE s010 DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.

  LOOP AT gt_satz INTO gs_satz.
    AT FIRST.
      WRITE: / 'Upload Ablesungen aus', p_file, 'Testlauf:', p_test.
      ULINE.
    ENDAT.

    PERFORM satz_pruefen USING gs_satz CHANGING gv_msgno.
    IF gv_msgno IS NOT INITIAL.
      gv_anz_f = gv_anz_f + 1.
      WRITE: / gs_satz-equnr, gs_satz-adat_c, gs_satz-stand_c,
               'Fehler', gv_msgno.
      CONTINUE.
    ENDIF.

    IF p_test IS INITIAL.
      CLEAR: gt_upl, gt_ret.
      APPEND VALUE #( equipment         = gs_satz-equnr
                      register          = gs_satz-zwnummer
                      readingdateactual = gs_satz-adat
                      readingresult     = gs_satz-stand
                      mtrreadingnote    = gs_satz-hinweis ) TO gt_upl.
      CALL FUNCTION 'BAPI_MTRREADDOC_UPLOAD'
        TABLES
          meterreadingresults = gt_upl
          return              = gt_ret.
      IF line_exists( gt_ret[ type = 'E' ] ).
        CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
        gv_anz_f = gv_anz_f + 1.
        WRITE: / gs_satz-equnr, gs_satz-adat_c, gt_ret[ type = 'E' ]-message.
      ELSE.
        CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
          EXPORTING
            wait = 'X'.
        gv_anz_ok = gv_anz_ok + 1.
      ENDIF.
    ENDIF.

    AT LAST.
      ULINE.
      WRITE: / 'Saetze gelesen:', lines( gt_satz ),
             / 'Fehlerhaft    :', gv_anz_f,
             / 'Hochgeladen   :', gv_anz_ok.
    ENDAT.
  ENDLOOP.

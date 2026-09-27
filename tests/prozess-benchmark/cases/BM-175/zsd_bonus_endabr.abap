REPORT zsd_bonus_endabr MESSAGE-ID zsd_bonus LINE-SIZE 120.
*----------------------------------------------------------------------*
* Endabrechnung abgelaufener Bonusabsprachen einplanen
* Je Absprachenart ein Hintergrundjob mit Standard-Sammelabrechnung
* Voraussetzung: Freigabe durch Vertriebscontrolling (ZSD_BONUS_FRG)
* 2013 Ersterstellung / 2017 Zusatzpruefung je Absprachenart (Exit-Tab.)
*----------------------------------------------------------------------*
TABLES kona.
SELECT-OPTIONS: s_vkorg FOR kona-vkorg OBLIGATORY,
                s_boart FOR kona-boart.
PARAMETERS: p_stich TYPE sy-datum DEFAULT sy-datum OBLIGATORY,
            p_test  AS CHECKBOX DEFAULT 'X'.

TYPES: BEGIN OF ty_abs,
         boart TYPE kona-boart,
         knuma TYPE kona-knuma,
         vkorg TYPE kona-vkorg,
         bonem TYPE kona-bonem,
         datbi TYPE kona-datbi,
       END OF ty_abs.

DATA: gt_abs      TYPE STANDARD TABLE OF ty_abs,
      gs_abs      TYPE ty_abs,
      gr_knuma    TYPE RANGE OF kona-knuma,
      gv_jobname  TYPE tbtcjob-jobname,
      gv_jobcount TYPE tbtcjob-jobcount,
      gv_ok       TYPE abap_bool,
      gv_anz_job  TYPE i.

INCLUDE zsd_bonus_endabr_f01.

START-OF-SELECTION.
  PERFORM absprachen_lesen.
  IF gt_abs IS INITIAL.
    MESSAGE s001.
    RETURN.
  ENDIF.

  SORT gt_abs BY boart knuma.
  LOOP AT gt_abs INTO gs_abs.
    AT NEW boart.
      CLEAR gr_knuma.
    ENDAT.

    PERFORM vorpruefung USING gs_abs CHANGING gv_ok.
    CHECK gv_ok = abap_true.
    APPEND VALUE #( sign = 'I' option = 'EQ' low = gs_abs-knuma ) TO gr_knuma.

    AT END OF boart.
      IF p_test = abap_true.
        PERFORM testliste USING gs_abs-boart.
      ELSEIF gr_knuma IS NOT INITIAL.
        PERFORM job_einplanen USING gs_abs-boart.
      ENDIF.
    ENDAT.
  ENDLOOP.

  IF p_test = abap_false.
    ULINE.
    WRITE: / 'Eingeplante Jobs:', gv_anz_job.
  ENDIF.

REPORT zfi_fxval.
*----------------------------------------------------------------------*
* Fremdwaehrungsbewertung offene Kreditorenposten zum Stichtag
* Buchung je Waehrung auf Korrekturkonto (Bilanz) gegen Kursdiff.
* 2007-12 HBU  Erstellung (Ersatz SAPF100 fuer Konzernbericht)
* 2011-06 HBU  BSAK (nach Stichtag ausgeglichen) ergaenzt
*----------------------------------------------------------------------*
PARAMETERS: p_bukrs TYPE bukrs OBLIGATORY,
            p_stich TYPE sy-datum OBLIGATORY,
            p_budat TYPE budat OBLIGATORY,
            p_kurst TYPE kurst_curr DEFAULT 'M',
            p_aufw  TYPE hkont OBLIGATORY,     " Kursverluste
            p_ertr  TYPE hkont OBLIGATORY,     " Kursgewinne
            p_korr  TYPE hkont OBLIGATORY,     " Korrekturkonto Verbindl.
            p_test  AS CHECKBOX DEFAULT 'X'.

TYPES: BEGIN OF ty_item,
         lifnr TYPE lifnr,
         belnr TYPE belnr_d,
         gjahr TYPE gjahr,
         buzei TYPE buzei,
         shkzg TYPE shkzg,
         waers TYPE waers,
         wrbtr TYPE wrbtr,
         dmbtr TYPE dmbtr,
       END OF ty_item,
       BEGIN OF ty_sum,
         waers TYPE waers,
         diff  TYPE dmbtr,
       END OF ty_sum.

DATA: gv_hwaer  TYPE waers,
      gt_items  TYPE STANDARD TABLE OF ty_item,
      gt_sum    TYPE STANDARD TABLE OF ty_sum,
      gt_norate TYPE SORTED TABLE OF waers WITH UNIQUE KEY table_line,
      gs_sum    TYPE ty_sum,
      gv_objkey TYPE bapiache09-obj_key.

START-OF-SELECTION.
  SELECT SINGLE waers FROM t001 INTO gv_hwaer
    WHERE bukrs = p_bukrs.

* Parallele Bewertung desselben Stichtags verhindern
  CALL FUNCTION 'ENQUEUE_EZFI_FXVAL'
    EXPORTING
      bukrs          = p_bukrs
      stichtag       = p_stich
    EXCEPTIONS
      foreign_lock   = 1
      system_failure = 2
      OTHERS         = 3.
  IF sy-subrc <> 0.
    MESSAGE e398(00) WITH 'Bewertung laeuft bereits, gesperrt von' sy-msgv1.
  ENDIF.

  PERFORM select_items.
  IF gt_items IS INITIAL.
    WRITE / 'Keine offenen Fremdwaehrungsposten zum Stichtag.'.
    RETURN.
  ENDIF.

  PERFORM valuate.

  IF p_test IS INITIAL.
    PERFORM post_differences.
  ENDIF.

  CALL FUNCTION 'DEQUEUE_EZFI_FXVAL'
    EXPORTING
      bukrs    = p_bukrs
      stichtag = p_stich.

* Protokoll
  LOOP AT gt_sum INTO gs_sum.
    WRITE: / gs_sum-waers, gs_sum-diff, gv_hwaer.
  ENDLOOP.

  INCLUDE zfi_fxval_f01.

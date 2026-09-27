REPORT zsd_auftragssperre_op.
*----------------------------------------------------------------------*
* Auftragssperre 07 ("Überfällige Posten") für Kunden setzen, deren
* überfällige offene Posten den Mindestbetrag erreichen.
* 2010-01 FIBU/Vertrieb, Job ZSD_SPERRE_NACHT (täglich 02:00)
*----------------------------------------------------------------------*
TABLES: kna1, bsid.

SELECT-OPTIONS: s_bukrs FOR bsid-bukrs OBLIGATORY,
                s_kunnr FOR kna1-kunnr.
PARAMETERS: p_tage  TYPE i DEFAULT 60,
            p_minbt TYPE bsid-dmbtr DEFAULT '500.00',
            p_test  AS CHECKBOX DEFAULT 'X'.

TYPES: BEGIN OF ty_op,
         kunnr TYPE bsid-kunnr,
         dmbtr TYPE bsid-dmbtr,
         zfbdt TYPE bsid-zfbdt,
         zbd1t TYPE bsid-zbd1t,
       END OF ty_op,
       BEGIN OF ty_sum,
         kunnr  TYPE bsid-kunnr,
         betrag TYPE bsid-dmbtr,
       END OF ty_sum.

DATA: gt_op    TYPE STANDARD TABLE OF ty_op,
      gs_op    TYPE ty_op,
      gt_sum   TYPE STANDARD TABLE OF ty_sum,
      gs_sum   TYPE ty_sum,
      gv_aufsd TYPE kna1-aufsd.

START-OF-SELECTION.
* nur Soll-Posten, keine Sonderhauptbuchvorgänge
  SELECT kunnr dmbtr zfbdt zbd1t FROM bsid INTO TABLE gt_op
    WHERE bukrs IN s_bukrs
      AND kunnr IN s_kunnr
      AND umskz = space
      AND shkzg = 'S'.

  LOOP AT gt_op INTO gs_op.
    CHECK gs_op-zfbdt + gs_op-zbd1t < sy-datum - p_tage.
    gs_sum-kunnr  = gs_op-kunnr.
    gs_sum-betrag = gs_op-dmbtr.
    COLLECT gs_sum INTO gt_sum.
  ENDLOOP.

  LOOP AT gt_sum INTO gs_sum.
    CHECK gs_sum-betrag >= p_minbt.
    SELECT SINGLE aufsd FROM kna1 INTO gv_aufsd WHERE kunnr = gs_sum-kunnr.
    IF gv_aufsd IS NOT INITIAL.
      WRITE: / gs_sum-kunnr, 'bereits gesperrt:', gv_aufsd.
      CONTINUE.
    ENDIF.
    IF p_test = abap_true.
      WRITE: / gs_sum-kunnr, gs_sum-betrag, 'würde gesperrt (Testlauf)'.
      CONTINUE.
    ENDIF.
    CALL FUNCTION 'ENQUEUE_EXKNA1'
      EXPORTING
        kunnr          = gs_sum-kunnr
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    IF sy-subrc <> 0.
      WRITE: / gs_sum-kunnr, 'in Bearbeitung durch', sy-msgv1.
      CONTINUE.
    ENDIF.
    UPDATE kna1 SET aufsd = '07' WHERE kunnr = gs_sum-kunnr.
    CALL FUNCTION 'DEQUEUE_EXKNA1'
      EXPORTING
        kunnr = gs_sum-kunnr.
    WRITE: / gs_sum-kunnr, gs_sum-betrag, 'Auftragssperre 07 gesetzt'.
  ENDLOOP.

  COMMIT WORK.

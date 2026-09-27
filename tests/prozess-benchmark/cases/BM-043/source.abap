PROGRAM zrggbr_co_val.
* Validation Exits CO-Kontierung (Kopie RGGBR000)
* U920: Kostenstelle gesperrt fuer Primaerkosten?  CR-4711
INCLUDE fgbbgd00.
TABLES: cobl.

DATA lv_bkzkp TYPE csks-bkzkp.

FORM u920 USING b_result.
  b_result = b_true.
  CHECK cobl-kostl IS NOT INITIAL.

  SELECT SINGLE bkzkp FROM csks INTO lv_bkzkp
    WHERE kokrs =  cobl-kokrs
      AND kostl =  cobl-kostl
      AND datbi >= cobl-budat
      AND datab <= cobl-budat.
  IF sy-subrc <> 0.
*   Kostenstelle zum Buchungsdatum nicht gueltig
    b_result = b_false.
  ELSEIF lv_bkzkp = 'X'.
    b_result = b_false.
  ENDIF.
ENDFORM.

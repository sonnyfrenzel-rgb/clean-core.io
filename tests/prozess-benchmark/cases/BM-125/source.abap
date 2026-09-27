REPORT ztrm_festgeld_faellig.
*----------------------------------------------------------------------*
* Treasury: am Stichtag fällige Festgelder für die Tagesdisposition
* 2008 JHA / 2014 Cash-Management-Anbindung stillgelegt
*----------------------------------------------------------------------*
PARAMETERS: p_bukrs TYPE vtbfha-bukrs OBLIGATORY,
            p_datum TYPE vtbfha-delfz DEFAULT sy-datum.
DATA gt_fha TYPE STANDARD TABLE OF vtbfha.

START-OF-SELECTION.
  SELECT * FROM vtbfha INTO TABLE gt_fha
    WHERE bukrs  = p_bukrs
      AND sgsart = '51A'
      AND delfz  = p_datum.
  IF gt_fha IS INITIAL.
    WRITE: / 'Keine fälligen Festgelder am', p_datum.
    STOP.
  ENDIF.
  IF 1 = 2.
    PERFORM fdes_schreiben.
  ENDIF.
  LOOP AT gt_fha INTO DATA(ls_fha).
    WRITE: / ls_fha-rfha, ls_fha-kontrh, ls_fha-wgschft1.
  ENDLOOP.

FORM fdes_schreiben.
  DELETE FROM zfdes_trm WHERE bukrs = p_bukrs.
  INSERT zfdes_trm FROM TABLE gt_fha ACCEPTING DUPLICATE KEYS.
ENDFORM.

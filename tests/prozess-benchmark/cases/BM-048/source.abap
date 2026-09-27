REPORT zfi_aa_rbw.
*----------------------------------------------------------------------*
* Restbuchwerte Anlagen - Kandidaten Abgang/Verschrottung
* 2014-11 SBE  Erstellung   /  2019-01 SBE  SALV statt REUSE
*----------------------------------------------------------------------*
TABLES anla.

SELECT-OPTIONS: s_bukrs FOR anla-bukrs OBLIGATORY,
                s_anlkl FOR anla-anlkl.
PARAMETERS: p_gjahr TYPE gjahr OBLIGATORY,
            p_afabe TYPE afabe_d DEFAULT '01',
            p_null  AS CHECKBOX.

TYPES: BEGIN OF ty_raw,
         bukrs TYPE bukrs,
         anln1 TYPE anln1,
         anln2 TYPE anln2,
         anlkl TYPE anlkl,
         txt50 TYPE txa50_anlt,
         aktiv TYPE aktivd,
         kansw TYPE kansw,
         answl TYPE answl,
         knafa TYPE knafa,
         nafag TYPE nafag,
         ksafa TYPE ksafa,
         safag TYPE safag,
         kaafa TYPE kaafa,
         aafag TYPE aafag,
       END OF ty_raw,
       BEGIN OF ty_out,
         bukrs   TYPE bukrs,
         anln1   TYPE anln1,
         anln2   TYPE anln2,
         anlkl   TYPE anlkl,
         txt50   TYPE txa50_anlt,
         ahk     TYPE kansw,
         afa_kum TYPE knafa,
         rbw     TYPE kansw,
         status  TYPE char20,
       END OF ty_out.

DATA: lt_raw TYPE STANDARD TABLE OF ty_raw,
      ls_raw TYPE ty_raw,
      gt_out TYPE STANDARD TABLE OF ty_out,
      ls_out TYPE ty_out.

START-OF-SELECTION.
  SELECT a~bukrs a~anln1 a~anln2 a~anlkl a~txt50 a~aktiv
         c~kansw c~answl c~knafa c~nafag c~ksafa c~safag c~kaafa c~aafag
    FROM anla AS a
    INNER JOIN anlc AS c ON  c~bukrs = a~bukrs
                         AND c~anln1 = a~anln1
                         AND c~anln2 = a~anln2
    INTO CORRESPONDING FIELDS OF TABLE lt_raw
    WHERE a~bukrs IN s_bukrs
      AND a~anlkl IN s_anlkl
      AND a~deakt = '00000000'
      AND c~gjahr = p_gjahr
      AND c~afabe = p_afabe.
  IF sy-subrc <> 0.
    MESSAGE 'Keine aktiven Anlagen selektiert' TYPE 'S' DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.

  LOOP AT lt_raw INTO ls_raw.
    CLEAR ls_out.
    MOVE-CORRESPONDING ls_raw TO ls_out.
    ls_out-ahk     = ls_raw-kansw + ls_raw-answl.
*   AfA-Felder sind negativ gespeichert
    ls_out-afa_kum = ls_raw-knafa + ls_raw-nafag + ls_raw-ksafa
                   + ls_raw-safag + ls_raw-kaafa + ls_raw-aafag.
    ls_out-rbw     = ls_out-ahk + ls_out-afa_kum.

    IF ls_out-rbw <= 0 AND ls_out-ahk > 0.
      ls_out-status = 'voll abgeschrieben'.
    ELSEIF ls_raw-aktiv IS INITIAL.
      ls_out-status = 'nicht aktiviert'.
    ELSE.
      ls_out-status = 'in Nutzung'.
    ENDIF.

    IF p_null = 'X' AND ls_out-rbw > 0.
      CONTINUE.
    ENDIF.
    APPEND ls_out TO gt_out.
  ENDLOOP.

  PERFORM display.

*&---------------------------------------------------------------------*
FORM display.
  DATA: lo_alv TYPE REF TO cl_salv_table,
        lx_msg TYPE REF TO cx_salv_msg.

  TRY.
      cl_salv_table=>factory(
        IMPORTING r_salv_table = lo_alv
        CHANGING  t_table      = gt_out ).
    CATCH cx_salv_msg INTO lx_msg.
      MESSAGE lx_msg TYPE 'E'.
  ENDTRY.
  lo_alv->get_functions( )->set_all( abap_true ).
  lo_alv->display( ).
ENDFORM.

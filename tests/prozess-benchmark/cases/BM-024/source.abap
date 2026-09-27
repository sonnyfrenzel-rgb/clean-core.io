REPORT zmm_lief_sperrliste.
* Gesperrte Lieferanten je Einkaufsorganisation (fuer Audit)
PARAMETERS p_ekorg TYPE lfm1-ekorg OBLIGATORY.

TYPES: BEGIN OF ty_lief,
         lifnr TYPE lfa1-lifnr,
         name1 TYPE lfa1-name1,
         land1 TYPE lfa1-land1,
         sperm TYPE lfm1-sperm,
         sperr TYPE lfa1-sperr,
       END OF ty_lief.
DATA: gt_lief TYPE STANDARD TABLE OF ty_lief,
      go_alv  TYPE REF TO cl_salv_table.

START-OF-SELECTION.
  SELECT a~lifnr a~name1 a~land1 m~sperm a~sperr
    FROM lfa1 AS a INNER JOIN lfm1 AS m ON m~lifnr = a~lifnr
    INTO TABLE gt_lief
    WHERE m~ekorg = p_ekorg
      AND ( m~sperm = 'X' OR a~sperr = 'X' ).
  IF gt_lief IS INITIAL.
    WRITE / 'Keine gesperrten Lieferanten'(001).
    RETURN.
  ENDIF.

  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = go_alv
                              CHANGING  t_table      = gt_lief ).
      go_alv->display( ).
    CATCH cx_salv_msg.
      MESSAGE 'ALV konnte nicht erzeugt werden' TYPE 'E'.
  ENDTRY.

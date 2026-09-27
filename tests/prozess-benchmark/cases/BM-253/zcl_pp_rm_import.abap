CLASS zcl_pp_rm_import DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    DATA: mv_anz_gelesen TYPE i READ-ONLY,
          mv_anz_ok      TYPE i READ-ONLY,
          mv_anz_fehler  TYPE i READ-ONLY.

    METHODS constructor
      IMPORTING iv_datei TYPE string
                iv_test  TYPE abap_bool.
    METHODS ausfuehren.
    METHODS archivieren
      IMPORTING iv_ziel TYPE string.

  PRIVATE SECTION.
    TYPES: BEGIN OF ty_csv,
             aufnr     TYPE aufnr,
             vornr     TYPE vornr,
             gutmenge  TYPE string,
             ausschuss TYPE string,
             meins     TYPE meins,
             ende_kz   TYPE c LENGTH 1,
           END OF ty_csv,
           tt_csv TYPE STANDARD TABLE OF ty_csv WITH EMPTY KEY.

    CONSTANTS gc_paket TYPE i VALUE 50.

    DATA: mv_datei TYPE string,
          mv_test  TYPE abap_bool.

    METHODS verbuche_paket
      IMPORTING it_paket TYPE tt_csv.
    METHODS protokolliere
      IMPORTING iv_text TYPE csequence.
ENDCLASS.



CLASS zcl_pp_rm_import IMPLEMENTATION.

  METHOD constructor.
    mv_datei = iv_datei.
    mv_test  = iv_test.
  ENDMETHOD.


  METHOD ausfuehren.
    DATA: lv_zeile TYPE string,
          ls_csv   TYPE ty_csv,
          lt_paket TYPE tt_csv.

    OPEN DATASET mv_datei FOR INPUT IN TEXT MODE ENCODING UTF-8.
    IF sy-subrc <> 0.
      protokolliere( |Datei { mv_datei } nicht lesbar| ).
      mv_anz_fehler = 1.
      RETURN.
    ENDIF.

    DO.
      READ DATASET mv_datei INTO lv_zeile.
      IF sy-subrc <> 0.
        EXIT.
      ENDIF.
      IF sy-index = 1.
        CONTINUE.                        "Kopfzeile
      ENDIF.

      CLEAR ls_csv.
      SPLIT lv_zeile AT ';' INTO ls_csv-aufnr ls_csv-vornr ls_csv-gutmenge
                                 ls_csv-ausschuss ls_csv-meins ls_csv-ende_kz.
      mv_anz_gelesen = mv_anz_gelesen + 1.

      IF ls_csv-aufnr IS INITIAL OR ls_csv-gutmenge CN '0123456789.'.
        mv_anz_fehler = mv_anz_fehler + 1.
        protokolliere( |Zeile { sy-index }: ungueltig ({ lv_zeile })| ).
        CONTINUE.
      ENDIF.

      ls_csv-aufnr = |{ ls_csv-aufnr ALPHA = IN }|.
      APPEND ls_csv TO lt_paket.

      IF lines( lt_paket ) = gc_paket.
        verbuche_paket( lt_paket ).
        CLEAR lt_paket.
      ENDIF.
    ENDDO.

    CLOSE DATASET mv_datei.

    IF lt_paket IS NOT INITIAL.
      verbuche_paket( lt_paket ).
    ENDIF.
  ENDMETHOD.


  METHOD verbuche_paket.
    MODIFY ENTITIES OF zi_prodrueckmeldung
      ENTITY rueckmeldung
        CREATE FIELDS ( Auftrag Vorgang Gutmenge Ausschuss Mengeneinheit Endrueckmeldung )
        WITH VALUE #( FOR ls_p IN it_paket INDEX INTO lv_idx
                      ( %cid            = |RM{ lv_idx }|
                        Auftrag         = ls_p-aufnr
                        Vorgang         = ls_p-vornr
                        Gutmenge        = ls_p-gutmenge
                        Ausschuss       = COND #( WHEN ls_p-ausschuss IS INITIAL THEN 0
                                                  ELSE ls_p-ausschuss )
                        Mengeneinheit   = ls_p-meins
                        Endrueckmeldung = xsdbool( ls_p-ende_kz = 'X' ) ) )
      MAPPED DATA(ls_mapped)
      FAILED DATA(ls_failed)
      REPORTED DATA(ls_reported).

    IF ls_failed IS NOT INITIAL.
*     ein fehlerhafter Satz verwirft das ganze Paket
      ROLLBACK ENTITIES.
      mv_anz_fehler = mv_anz_fehler + lines( it_paket ).
      LOOP AT ls_reported-rueckmeldung INTO DATA(ls_rep).
        protokolliere( ls_rep-%msg->if_message~get_text( ) ).
      ENDLOOP.
      RETURN.
    ENDIF.

    IF mv_test = abap_true.
      ROLLBACK ENTITIES.
      mv_anz_ok = mv_anz_ok + lines( it_paket ).
      RETURN.
    ENDIF.

    COMMIT ENTITIES
      RESPONSE OF zi_prodrueckmeldung
        FAILED   DATA(ls_failed_late)
        REPORTED DATA(ls_reported_late).
    IF sy-subrc <> 0.
      mv_anz_fehler = mv_anz_fehler + lines( it_paket ).
      LOOP AT ls_reported_late-rueckmeldung INTO DATA(ls_rep_late).
        protokolliere( ls_rep_late-%msg->if_message~get_text( ) ).
      ENDLOOP.
    ELSE.
      mv_anz_ok = mv_anz_ok + lines( it_paket ).
    ENDIF.
  ENDMETHOD.


  METHOD archivieren.
    DATA: lv_ziel  TYPE string,
          lv_zeile TYPE string.

    lv_ziel = |{ iv_ziel }rueckmeldung_{ sy-datum }{ sy-uzeit }.csv|.

    OPEN DATASET lv_ziel FOR OUTPUT IN TEXT MODE ENCODING UTF-8.
    IF sy-subrc <> 0.
      protokolliere( |Archivdatei { lv_ziel } nicht anlegbar - Datei bleibt liegen| ).
      RETURN.
    ENDIF.
    OPEN DATASET mv_datei FOR INPUT IN TEXT MODE ENCODING UTF-8.
    DO.
      READ DATASET mv_datei INTO lv_zeile.
      IF sy-subrc <> 0.
        EXIT.
      ENDIF.
      TRANSFER lv_zeile TO lv_ziel.
    ENDDO.
    CLOSE DATASET: mv_datei, lv_ziel.

    DELETE DATASET mv_datei.
  ENDMETHOD.


  METHOD protokolliere.
*   landet im Joblog
    MESSAGE iv_text TYPE 'S'.
  ENDMETHOD.

ENDCLASS.

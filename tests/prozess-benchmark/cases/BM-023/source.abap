CLASS zcl_im_mb_document IMPLEMENTATION.

  METHOD if_ex_mb_document_badi~mb_document_before_update.
* Verschrottung (551/552) ueber 5.000 EUR nur mit Grund und Kostenstelle
* Anforderung Controlling, Ticket 4711 - 2016
    DATA: ls_mseg  TYPE mseg,
          lv_limit TYPE dmbtr VALUE '5000.00'.

    LOOP AT xmseg INTO ls_mseg.
      CHECK ls_mseg-bwart = '551' OR ls_mseg-bwart = '552'.
      IF ls_mseg-dmbtr > lv_limit.
        IF ls_mseg-grund IS INITIAL OR ls_mseg-kostl IS INITIAL.
          MESSAGE e001(zmm) WITH ls_mseg-matnr ls_mseg-dmbtr.
        ENDIF.
      ENDIF.
    ENDLOOP.

  ENDMETHOD.

ENDCLASS.

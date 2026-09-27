REPORT zre_umsatzmiete.
*----------------------------------------------------------------------*
* RE-FX Umsatzmiete: Jahresabrechnung der umsatzabhängigen Miete
* Umsatzmeldungen der Mieter kommen über das Mieterportal nach ZRE_UMSATZ,
* Staffeln je Vertrag in ZRE_UMS_STAFFEL, Mindestmiete = Kondition Z100
* 2017 AKR  / 2019 AKR Belastungsquote ergänzt
*----------------------------------------------------------------------*
PARAMETERS: p_bukrs TYPE vicncn-bukrs OBLIGATORY,
            p_gjahr TYPE gjahr OBLIGATORY,
            p_upd   AS CHECKBOX.

DATA gt_abr TYPE STANDARD TABLE OF zre_ums_abr.

START-OF-SELECTION.
  SELECT u~recnnr, u~monat, u~umsatz, u~waers, c~intreno
    FROM zre_umsatz AS u
    INNER JOIN vicncn AS c ON c~bukrs = u~bukrs
                          AND c~recnnr = u~recnnr
    WHERE u~bukrs = @p_bukrs
      AND u~gjahr = @p_gjahr
    INTO TABLE @DATA(lt_ums).
  IF sy-subrc <> 0.
    MESSAGE s004(zre) WITH p_bukrs p_gjahr DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.

  LOOP AT lt_ums INTO DATA(ls_ums)
       GROUP BY ( recnnr  = ls_ums-recnnr
                  intreno = ls_ums-intreno
                  waers   = ls_ums-waers ) INTO DATA(ls_key).

    DATA(lv_jahresumsatz) = REDUCE zre_ums_betrag( INIT s = 0
                                                   FOR m IN GROUP ls_key
                                                   NEXT s = s + m-umsatz ).

*   Mindestmiete (Monatsbetrag) aus der Vertragskondition Z100
    SELECT SINGLE unitprice FROM vicdcond
      WHERE intreno       = @ls_key-intreno
        AND condtype      = 'Z100'
        AND condvalidfrom <= @sy-datum
      INTO @DATA(lv_minmiete).
    IF sy-subrc <> 0.
      CONTINUE.   "Vertrag ohne Umsatzmietvereinbarung
    ENDIF.

*   höchster erreichter Staffelsatz
    SELECT MAX( prozent ) FROM zre_ums_staffel
      WHERE recnnr    = @ls_key-recnnr
        AND ab_umsatz <= @lv_jahresumsatz
      INTO @DATA(lv_prozent).

    DATA(lv_miete) = nmax( val1 = lv_jahresumsatz * lv_prozent / 100
                           val2 = lv_minmiete * 12 ).
    TRY.
        DATA(lv_quote) = lv_miete * 100 / lv_jahresumsatz.
      CATCH cx_sy_zerodivide.
        lv_quote = 999.
    ENDTRY.

    APPEND VALUE #( bukrs    = p_bukrs
                    gjahr    = p_gjahr
                    recnnr   = ls_key-recnnr
                    umsatz   = lv_jahresumsatz
                    miete    = lv_miete
                    nachford = lv_miete - lv_minmiete * 12
                    quote    = lv_quote
                    waers    = ls_key-waers ) TO gt_abr.
  ENDLOOP.

  IF p_upd = abap_true.
    MODIFY zre_ums_abr FROM TABLE gt_abr.
    COMMIT WORK.
  ENDIF.

  cl_salv_table=>factory( IMPORTING r_salv_table = DATA(lo_alv)
                          CHANGING  t_table      = gt_abr ).
  lo_alv->display( ).

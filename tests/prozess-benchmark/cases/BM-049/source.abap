FUNCTION z_fi_bte_00001025.
*"----------------------------------------------------------------------
*"  Kopie SAMPLE_INTERFACE_00001025  (FIBF: Produkt ZFI_EUTAX)
*"  IMPORTING
*"     VALUE(I_BKDF) TYPE  BKDF OPTIONAL
*"  TABLES
*"      T_AUSZ1 STRUCTURE  AUSZ1 OPTIONAL
*"      T_AUSZ2 STRUCTURE  AUSZ2 OPTIONAL
*"      T_AUSZ3 STRUCTURE  AUSZ_CLR OPTIONAL
*"      T_BKP1 STRUCTURE  BKP1
*"      T_BKPF STRUCTURE  BKPF
*"      T_BSEC STRUCTURE  BSEC
*"      T_BSED STRUCTURE  BSED
*"      T_BSEG STRUCTURE  BSEG
*"      T_BSET STRUCTURE  BSET
*"      T_BSEU STRUCTURE  BSEU
*"----------------------------------------------------------------------
  DATA: ls_bkpf       TYPE bkpf,
        ls_kred       TYPE bseg,
        ls_bseg       TYPE bseg,
        lv_land       TYPE land1,
        lv_stceg      TYPE stceg,
        lv_xeg        TYPE xegld,
        lv_land_bukrs TYPE land1,
        lv_mwskz      TYPE mwskz.

* nur Kreditorenrechnungen (KR = FI-Rechnung, RE = MM-Rechnungspruefung)
  LOOP AT t_bkpf INTO ls_bkpf WHERE blart = 'KR' OR blart = 'RE'.
    READ TABLE t_bseg INTO ls_kred
      WITH KEY bukrs = ls_bkpf-bukrs
               koart = 'K'.
    IF sy-subrc <> 0.
      CONTINUE.
    ENDIF.

    SELECT SINGLE land1 stceg FROM lfa1 INTO (lv_land, lv_stceg)
      WHERE lifnr = ls_kred-lifnr.
    SELECT SINGLE xegld FROM t005 INTO lv_xeg
      WHERE land1 = lv_land.
    SELECT SINGLE land1 FROM t001 INTO lv_land_bukrs
      WHERE bukrs = ls_bkpf-bukrs.

*   innergemeinschaftlicher Erwerb: Lieferant in anderem EU-Land
    IF lv_xeg = 'X' AND lv_land <> lv_land_bukrs.
      IF lv_stceg IS INITIAL.
        MESSAGE e101(zfi) WITH ls_kred-lifnr.
      ENDIF.

      LOOP AT t_bseg INTO ls_bseg
           WHERE bukrs = ls_bkpf-bukrs
             AND koart = 'S'
             AND mwskz <> space.
        SELECT SINGLE mwskz FROM zfi_eu_mwskz INTO lv_mwskz
          WHERE bukrs = ls_bseg-bukrs
            AND mwskz = ls_bseg-mwskz.
        IF sy-subrc <> 0.
*         MESSAGE w102(zfi) WITH ls_bseg-mwskz.   "bis 2017 nur Warnung
          MESSAGE e102(zfi) WITH ls_bseg-mwskz ls_bseg-buzei.
        ENDIF.
      ENDLOOP.
    ENDIF.
  ENDLOOP.
ENDFUNCTION.

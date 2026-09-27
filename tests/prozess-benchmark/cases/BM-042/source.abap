PROGRAM zrggbs_fi_sub.
* Substitution Exits FI (Kopie RGGBS000)
* U910: Zuordnung fuer Zahlungsbelege vorbelegen  - 2011 AHO
* Titel werden in FORM GET_EXIT_TITLES (Include ZRGGBS_TITLES) gepflegt
INCLUDE fgbbgd00.
TABLES: bkpf, bseg.

DATA lv_xopvw TYPE skb1-xopvw.

FORM u910.
* Nur Kundenzahlungen (DZ) und Lastschriften (DA)
  CHECK bkpf-blart = 'DZ' OR bkpf-blart = 'DA'.

  IF bseg-koart = 'D' AND bseg-zuonr IS INITIAL.
    bseg-zuonr = bkpf-xblnr.
  ELSEIF bseg-koart = 'S'.
    SELECT SINGLE xopvw FROM skb1 INTO lv_xopvw
      WHERE bukrs = bseg-bukrs
        AND saknr = bseg-hkont.
    IF sy-subrc = 0 AND lv_xopvw = 'X'.
*     bseg-zuonr = bkpf-xblnr.   "alt bis 2014
      bseg-zuonr = bkpf-bktxt(18).
    ENDIF.
  ENDIF.
ENDFORM.

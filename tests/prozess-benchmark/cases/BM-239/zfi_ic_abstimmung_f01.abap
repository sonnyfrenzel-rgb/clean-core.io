*&---------------------------------------------------------------------*
*&  Include           ZFI_IC_ABSTIMMUNG_F01
*&  Partner und eigene Salden
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  PARTNER_LESEN
*&---------------------------------------------------------------------*
FORM partner_lesen.
  SELECT partner_bukrs vbund eigene_vbund rfcdest waers
    FROM zfi_ic_partner
    INTO TABLE gt_partner
    WHERE bukrs = p_bukrs
      AND aktiv = abap_true.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  EIGENE_SALDEN
*&---------------------------------------------------------------------*
*       offene Posten Debitoren/Kreditoren mit Partner-Gesellschaft
*       bis Stichtag, je Partner ein Saldo
*----------------------------------------------------------------------*
FORM eigene_salden.
  DATA: ls_partner TYPE ty_partner,
        ls_saldo   TYPE ty_saldo.

  LOOP AT gt_partner INTO ls_partner.
    CLEAR ls_saldo.
    ls_saldo-partner_bukrs = ls_partner-partner_bukrs.

    SELECT SUM( CASE shkzg WHEN 'S' THEN dmbtr ELSE - dmbtr END )
      FROM bsid
      INTO @ls_saldo-eig_ford
      WHERE bukrs  = @p_bukrs
        AND vbund  = @ls_partner-vbund
        AND budat <= @p_datum.

    SELECT SUM( CASE shkzg WHEN 'H' THEN dmbtr ELSE - dmbtr END )
      FROM bsik
      INTO @ls_saldo-eig_verb
      WHERE bukrs  = @p_bukrs
        AND vbund  = @ls_partner-vbund
        AND budat <= @p_datum.

    INSERT ls_saldo INTO TABLE gt_saldo.
  ENDLOOP.
ENDFORM.

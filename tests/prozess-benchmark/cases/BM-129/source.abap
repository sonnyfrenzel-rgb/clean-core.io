REPORT zcoll_p2p_gebrochen LINE-SIZE 120.
*----------------------------------------------------------------------*
* FSCM Collections Management: gebrochene Zahlungszusagen
* Liste für den Collections-Spezialisten, Absprung in die Belegansicht
* 2016 RHE  - ersetzt Auswertung UDM_P2P (zu langsam)
*----------------------------------------------------------------------*
PARAMETERS: p_bukrs TYPE bukrs OBLIGATORY,
            p_tol   TYPE i DEFAULT 3.     "Karenztage nach Zusagedatum

DATA: gv_bukrs TYPE bukrs,
      gv_belnr TYPE belnr_d,
      gv_gjahr TYPE gjahr,
      gv_anz   TYPE i.

TOP-OF-PAGE.
  WRITE: / 'Fall', 20 'Kunde', 32 'Beleg', 45 'Zusage am', 60 'Betrag'.
  ULINE.

START-OF-SELECTION.
  SELECT p~case_guid, c~ext_key, p~bukrs, p~kunnr, p~belnr, p~gjahr,
         p~p2p_date, p~p2p_amount, p~p2p_curr
    FROM udm_p2p_attr AS p
    INNER JOIN scmg_t_case_attr AS c ON c~case_guid = p~case_guid
    WHERE p~bukrs     = @p_bukrs
      AND p~p2p_state = '1'
    INTO TABLE @DATA(lt_p2p).

  LOOP AT lt_p2p INTO DATA(ls_p2p).
    CHECK ls_p2p-p2p_date + p_tol < sy-datum.
*   Posten noch offen? Dann ist die Zusage gebrochen
    SELECT SINGLE wrbtr FROM bsid INTO @DATA(lv_offen)
      WHERE bukrs = @ls_p2p-bukrs
        AND kunnr = @ls_p2p-kunnr
        AND gjahr = @ls_p2p-gjahr
        AND belnr = @ls_p2p-belnr.
    IF sy-subrc <> 0.
      CONTINUE.   "ausgeglichen - Zusage eingehalten
    ENDIF.
    gv_bukrs = ls_p2p-bukrs.
    gv_belnr = ls_p2p-belnr.
    gv_gjahr = ls_p2p-gjahr.
    gv_anz = gv_anz + 1.
    WRITE: / ls_p2p-ext_key, 20 ls_p2p-kunnr, 32 ls_p2p-belnr,
             45 ls_p2p-p2p_date, 60 ls_p2p-p2p_amount CURRENCY ls_p2p-p2p_curr.
    HIDE: gv_bukrs, gv_belnr, gv_gjahr.
  ENDLOOP.
  CLEAR: gv_bukrs, gv_belnr, gv_gjahr.

END-OF-SELECTION.
  WRITE: / gv_anz, 'gebrochene Zahlungszusagen'.

AT LINE-SELECTION.
  CHECK gv_belnr IS NOT INITIAL.
  SET PARAMETER ID 'BUK' FIELD gv_bukrs.
  SET PARAMETER ID 'BLN' FIELD gv_belnr.
  SET PARAMETER ID 'GJR' FIELD gv_gjahr.
  CALL TRANSACTION 'FB03' AND SKIP FIRST SCREEN.
  CLEAR: gv_bukrs, gv_belnr, gv_gjahr.

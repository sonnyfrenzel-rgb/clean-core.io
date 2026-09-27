*&---------------------------------------------------------------------*
*& Include ZSD_CREDIT_RELEASE_F01
*&---------------------------------------------------------------------*
FORM load_worklist.
* kreditgesperrte Auftraege der Verkaufsorganisation, groesster Wert zuerst
  SELECT k~vbeln
    FROM vbak AS k
    INNER JOIN vbuk AS u ON u~vbeln = k~vbeln
    INTO TABLE gt_work
    WHERE k~vkorg = p_vkorg
      AND u~cmgst IN ('B', 'C')
    ORDER BY k~netwr DESCENDING.
  IF sy-subrc = 0.
*   Vorschlag im Dynpro 0100
    gv_vbeln = gt_work[ 1 ].
  ENDIF.
ENDFORM.

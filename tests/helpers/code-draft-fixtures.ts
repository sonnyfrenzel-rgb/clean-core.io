/**
 * Two small programs shaped like the CO and SD cases of the 3.0.10 reviews
 * (roadmap 3.0.12; CO/FI/PP/SD reviews): the guards, declared packed decimals
 * and selection options the code-draft prompt must carry over. Written for the
 * spec, not copied from a customer program.
 */

/** A CO-shaped cost allocation: receivers with quotas, five guards, packed decimals of 2, 3 and 6 places. */
export const CO_ALLOCATION = `REPORT zco_alloc_sim.
TABLES csks.
TYPES: BEGIN OF ty_rcv,
         segment TYPE c LENGTH 4,
         kostl   TYPE kostl,
         quota   TYPE p LENGTH 8 DECIMALS 3,
       END OF ty_rcv.
DATA: gt_rcv    TYPE STANDARD TABLE OF ty_rcv,
      gs_rcv    TYPE ty_rcv,
      gv_amount TYPE p LENGTH 15 DECIMALS 2,
      gv_share  TYPE p LENGTH 15 DECIMALS 2,
      gv_ratio  TYPE p LENGTH 9 DECIMALS 6,
      gv_sum    TYPE p LENGTH 8 DECIMALS 3,
      gv_lines  TYPE i.
PARAMETERS: p_kokrs  TYPE kokrs OBLIGATORY,
            p_gjahr  TYPE gjahr OBLIGATORY,
            p_sender TYPE kostl OBLIGATORY,
            p_test   AS CHECKBOX DEFAULT 'X'.
SELECT-OPTIONS s_kostl FOR csks-kostl NO INTERVALS.

START-OF-SELECTION.
  PERFORM add_receiver USING 'FAC' '0000004711' '60.000'.
  PERFORM add_receiver USING 'IT'  '0000004712' '40.000'.
  IF gt_rcv IS INITIAL.
    MESSAGE e001(zco).
  ENDIF.
  gv_lines = lines( gt_rcv ).
  SORT gt_rcv BY kostl.
  DELETE ADJACENT DUPLICATES FROM gt_rcv COMPARING kostl.
  IF lines( gt_rcv ) <> gv_lines.
    MESSAGE e005(zco).
  ENDIF.
  LOOP AT gt_rcv INTO gs_rcv.
    IF gs_rcv-kostl = p_sender.
      MESSAGE e002(zco) WITH gs_rcv-kostl.
    ENDIF.
    IF gs_rcv-segment <> 'FAC' AND gs_rcv-segment <> 'IT'.
      MESSAGE e003(zco) WITH gs_rcv-segment.
    ENDIF.
    gv_sum = gv_sum + gs_rcv-quota.
  ENDLOOP.
  IF gv_sum > 100.
    MESSAGE e004(zco).
  ENDIF.
  SELECT SINGLE * FROM csks WHERE kokrs = p_kokrs AND kostl = p_sender.
  LOOP AT gt_rcv INTO gs_rcv WHERE kostl IN s_kostl.
    gv_ratio = gs_rcv-quota / 100.
    gv_share = gv_amount * gv_ratio.
    WRITE: / gs_rcv-kostl, gv_share.
  ENDLOOP.

FORM add_receiver USING iv_segment TYPE clike iv_kostl TYPE clike iv_quota TYPE clike.
  gs_rcv-segment = iv_segment.
  gs_rcv-kostl = iv_kostl.
  gs_rcv-quota = iv_quota.
  APPEND gs_rcv TO gt_rcv.
ENDFORM.
`;

/** An SD-shaped repricing: a status precondition, a credit option, a price of 2 places in the old declaration form. */
export const SD_REPRICING = `REPORT zsd_reprice.
TABLES vbak.
DATA: gt_items  TYPE STANDARD TABLE OF vbap,
      gs_item   TYPE vbap,
      gv_net(8) TYPE p DECIMALS 2,
      gv_factor TYPE p LENGTH 5 DECIMALS 4.
SELECT-OPTIONS s_vbeln FOR vbak-vbeln OBLIGATORY.
PARAMETERS: p_credit AS CHECKBOX,
            p_factor TYPE p DECIMALS 4 DEFAULT '1.0000'.

START-OF-SELECTION.
  SELECT * FROM vbap INTO TABLE gt_items WHERE vbeln IN s_vbeln.
  IF sy-subrc <> 0.
    MESSAGE s010(zsd).
    RETURN.
  ENDIF.
  LOOP AT gt_items INTO gs_item.
    CHECK gs_item-abgru IS INITIAL.
    IF p_credit IS INITIAL AND gs_item-netwr < 0.
      CONTINUE.
    ENDIF.
    gv_net = gs_item-netwr * p_factor.
    WRITE: / gs_item-vbeln, gs_item-posnr, gv_net.
  ENDLOOP.
`;

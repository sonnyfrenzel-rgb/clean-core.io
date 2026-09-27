*----------------------------------------------------------------------*
* Include LZMM_GRCONFF01
*----------------------------------------------------------------------*
FORM set_status TABLES ct_status STRUCTURE bdidocstat
                USING  iv_docnum TYPE edi_docnum
                       iv_status TYPE edi_status
                       iv_text   TYPE csequence.
  DATA ls_status TYPE bdidocstat.

  ls_status-docnum = iv_docnum.
  ls_status-status = iv_status.
  ls_status-msgty  = COND #( WHEN iv_status = '53' THEN 'S' ELSE 'E' ).
  ls_status-msgid  = 'ZMM_GR'.
  ls_status-msgno  = '001'.
  ls_status-msgv1  = iv_text.
  ls_status-repid  = sy-repid.
  APPEND ls_status TO ct_status.
ENDFORM.

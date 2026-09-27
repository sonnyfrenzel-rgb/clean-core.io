*----------------------------------------------------------------------*
***INCLUDE LZTV_IDOCF01.
* Statussaetze fuer den IDoc-Eingang (Funktionsgruppe ZTV_IDOC)
*----------------------------------------------------------------------*
FORM set_status USING pv_docnum TYPE edi_docnum
                      pv_status TYPE edi_status
                      pv_text   TYPE clike
                      pv_ref    TYPE clike.
  DATA lv_text TYPE char50.

  lv_text = pv_text.
  CLEAR idoc_status.
  idoc_status-docnum = pv_docnum.
  idoc_status-status = pv_status.
  idoc_status-msgty  = COND #( WHEN pv_status = '51' THEN 'E' ELSE 'S' ).
  idoc_status-msgid  = 'ZTV'.
  idoc_status-msgno  = '100'.
  idoc_status-msgv1  = lv_text.
  idoc_status-msgv2  = pv_ref.
  APPEND idoc_status.
ENDFORM.

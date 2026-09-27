FUNCTION-POOL zpos MESSAGE-ID zpos.
*----------------------------------------------------------------------*
* Funktionsgruppe ZPOS - POS-Eingang Tagesumsaetze der Filialen
* Kassenserver schickt je Filiale/Tag/Kasse ein IDoc ZPOSUMS
*----------------------------------------------------------------------*
TYPES: BEGIN OF ty_pos,
         ean11  TYPE mean-ean11,
         matnr  TYPE mara-matnr,
         menge  TYPE menge_d,
         umsatz TYPE p LENGTH 13 DECIMALS 2,
       END OF ty_pos,
       BEGIN OF ty_sum,
         matnr  TYPE mara-matnr,
         menge  TYPE menge_d,
         umsatz TYPE p LENGTH 13 DECIMALS 2,
       END OF ty_sum.

DATA: gs_kopf   TYPE ze1posk,
      gv_docnum TYPE edi_docnum,
      gt_pos    TYPE STANDARD TABLE OF ty_pos,
      gt_sum    TYPE STANDARD TABLE OF ty_sum,
      gt_fehl   TYPE STANDARD TABLE OF zpos_fehler.

* Statussatz anhaengen: &1 Docnum &2 Status &3 Msgty &4 Msgno &5 Msgv1
DEFINE status_setzen.
  CLEAR idoc_status.
  idoc_status-docnum = &1.
  idoc_status-status = &2.
  idoc_status-msgty  = &3.
  idoc_status-msgid  = 'ZPOS'.
  idoc_status-msgno  = &4.
  idoc_status-msgv1  = &5.
  APPEND idoc_status.
END-OF-DEFINITION.

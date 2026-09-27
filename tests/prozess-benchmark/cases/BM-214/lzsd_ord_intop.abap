FUNCTION-POOL zsd_ord_in.                   "MESSAGE-ID zsd_edi
*----------------------------------------------------------------------*
* Funktionsgruppe ZSD_ORD_IN - EDI-Auftragseingang (ORDERS05, Prozesscode ZORD)
* Handler je Auftragsart des Kunden (Standard / Eil / Konsignation)
*----------------------------------------------------------------------*
* 2012 EDI-Projekt Handel (Partner REWE/EDEKA, Nachbau IDOC_INPUT_ORDERS)
* 2016 KLE  Eilauftraege, Annahmeschluss 14:00
* 2020 KLE  Umbau auf Handlerklassen, Konsignationsauffuellung
*----------------------------------------------------------------------*
TYPES: BEGIN OF ty_item,
         posex TYPE posex,
         kdmat TYPE matnr_ku,
         matnr TYPE matnr,
         menge TYPE kwmeng,
         vrkme TYPE vrkme,
         werks TYPE werks_d,
       END OF ty_item,
       tt_item TYPE STANDARD TABLE OF ty_item WITH DEFAULT KEY,
       BEGIN OF ty_order,
         docnum TYPE edi_docnum,
         sndprn TYPE edi_sndprn,
         bsart  TYPE char4,
         bstkd  TYPE bstkd,
         bstdk  TYPE bstdk,
         kunag  TYPE kunnr,
         kunwe  TYPE kunnr,
         vkorg  TYPE vkorg,
         vtweg  TYPE vtweg,
         spart  TYPE spart,
         vdatu  TYPE edatu_vbak,
         vsbed  TYPE vsbed,
         auart  TYPE auart,
         items  TYPE tt_item,
       END OF ty_order.

CONSTANTS: gc_cutoff    TYPE uzeit VALUE '140000',
           gc_auart_std TYPE auart VALUE 'ZOR',
           gc_auart_kb  TYPE auart VALUE 'KB'.

DATA: gt_status TYPE STANDARD TABLE OF bdidocstat.

INCLUDE lzsd_ord_inc01.                        " Mapper, Handler, Fabrik
INCLUDE lzsd_ord_inf01.                        " Hilfsroutinen

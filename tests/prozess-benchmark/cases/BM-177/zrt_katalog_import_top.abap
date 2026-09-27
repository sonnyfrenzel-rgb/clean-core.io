*&---------------------------------------------------------------------*
*& Include ZRT_KATALOG_IMPORT_TOP
*&---------------------------------------------------------------------*
TYPES: BEGIN OF ty_kat,                  "Katalogzeile nach Transformation
         lief_artnr  TYPE char35,
         ean         TYPE char18,
         bezeichnung TYPE char40,
         warengruppe TYPE char9,
         basis_me    TYPE char3,
         ek_preis    TYPE char15,
         vk_preis    TYPE char15,
         status      TYPE char1,         "N neu, A Aenderung, D Auslauf
       END OF ty_kat,
       tt_kat TYPE STANDARD TABLE OF ty_kat WITH DEFAULT KEY,
       BEGIN OF ty_map,
         quelle       TYPE fieldname,
         ziel         TYPE fieldname,
         konv_klasse  TYPE seoclsname,
         konv_methode TYPE seocpdname,
       END OF ty_map,
       tt_map TYPE STANDARD TABLE OF ty_map WITH DEFAULT KEY,
       BEGIN OF ty_prot,
         lief_artnr TYPE char35,
         matnr      TYPE matnr,
         typ        TYPE symsgty,
         text       TYPE char120,
       END OF ty_prot.

CLASS lcl_mapper DEFINITION DEFERRED.

DATA: gt_kat       TYPE tt_kat,
      gt_map       TYPE tt_map,
      gt_prot      TYPE STANDARD TABLE OF ty_prot,
      gv_start_idx TYPE i,
      go_mapper    TYPE REF TO lcl_mapper.

* Protokollzeile: &1 Lief.-Artikel &2 Artikel &3 Typ &4 Text
DEFINE prot.
  APPEND VALUE #( lief_artnr = &1
                  matnr      = &2
                  typ        = &3
                  text       = &4 ) TO gt_prot.
END-OF-DEFINITION.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
PARAMETERS: p_lifnr TYPE lfa1-lifnr OBLIGATORY,
            p_file  TYPE string LOWER CASE OBLIGATORY,
            p_vkorg TYPE vkorg OBLIGATORY,
            p_vtweg TYPE vtweg OBLIGATORY.
SELECTION-SCREEN END OF BLOCK b1.
SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-002.
PARAMETERS: p_list AS CHECKBOX DEFAULT 'X',
            p_neu  AS CHECKBOX,
            p_test AS CHECKBOX DEFAULT 'X'.
SELECTION-SCREEN END OF BLOCK b2.

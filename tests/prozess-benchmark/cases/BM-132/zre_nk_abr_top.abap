*&---------------------------------------------------------------------*
*& Include ZRE_NK_ABR_TOP - Datendeklarationen Nebenkostenabrechnung
*&---------------------------------------------------------------------*
TYPES: BEGIN OF ty_teiln,
         recnnr   TYPE vicncn-recnnr,
         intreno  TYPE vicncn-intreno,
         kunnr    TYPE kunnr,
         flaeche  TYPE zre_flaeche,
         personen TYPE i,
         von      TYPE d,
         bis      TYPE d,
         basis    TYPE p LENGTH 15 DECIMALS 4,
         kosten   TYPE zre_betrag,
         voraus   TYPE zre_betrag,
         saldo    TYPE zre_betrag,
         belnr    TYPE belnr_d,
         meldung  TYPE bapi_msg,
       END OF ty_teiln.

PARAMETERS: p_ae    TYPE zre_nk_ae-ae_id OBLIGATORY,
            p_gjahr TYPE gjahr OBLIGATORY,
            p_test  AS CHECKBOX DEFAULT 'X'.

DATA: gs_ae     TYPE zre_nk_ae,
      gt_teiln  TYPE STANDARD TABLE OF ty_teiln,
      gv_gesamt TYPE zre_betrag,
      gv_beginn TYPE d,
      gv_ende   TYPE d.

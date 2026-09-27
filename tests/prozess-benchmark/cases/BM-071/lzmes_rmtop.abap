FUNCTION-POOL zmes_rm.                       "MESSAGE-ID zmes
*----------------------------------------------------------------------*
* Funktionsgruppe ZMES_RM - Rueckmeldeschnittstelle MES -> SAP PP
* Aufruf per RFC durch den MES-Adapter (Destination im MES gepflegt)
* 2015-02 SK  Erstellung
* 2018-07 SK  Idempotenz ueber MES-ID (Doppelbuchungen bei Timeouts)
*----------------------------------------------------------------------*
TYPES: BEGIN OF gty_ctx,
         mes_id TYPE zmes_id,
         aufnr  TYPE aufnr,
         vornr  TYPE vornr,
         status TYPE c LENGTH 1,
         text   TYPE bapi_msg,
       END OF gty_ctx.

DATA gs_ctx TYPE gty_ctx.

CONSTANTS: gc_st_ok   TYPE c LENGTH 1 VALUE 'S',
           gc_st_err  TYPE c LENGTH 1 VALUE 'E',
           gc_st_dup  TYPE c LENGTH 1 VALUE 'D',
           gc_st_lock TYPE c LENGTH 1 VALUE 'L'.

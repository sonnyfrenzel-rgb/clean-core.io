REPORT zps_psp_ohne_verantw.
*----------------------------------------------------------------------*
* PSP-Elemente ohne verantwortliche Person, gruppiert je Projekt
* 2009 MBR - Controlling-Anforderung CR-0412
*----------------------------------------------------------------------*
TABLES proj.
TYPES: BEGIN OF ty_psp,
         psphi TYPE prps-psphi,
         posid TYPE prps-posid,
         post1 TYPE prps-post1,
         vernr TYPE prps-vernr,
       END OF ty_psp.
SELECT-OPTIONS s_pspid FOR proj-pspid OBLIGATORY.
DATA: gt_psp TYPE STANDARD TABLE OF ty_psp,
      gs_psp TYPE ty_psp.

START-OF-SELECTION.
  SELECT p~psphi p~posid p~post1 p~vernr
    FROM prps AS p INNER JOIN proj AS j ON j~pspnr = p~psphi
    INTO TABLE gt_psp
    WHERE j~pspid IN s_pspid
      AND p~loevm = space.
  SORT gt_psp BY psphi posid.
  LOOP AT gt_psp INTO gs_psp.
    AT NEW psphi.
      WRITE: / 'Projekt', gs_psp-psphi.
    ENDAT.
    CHECK gs_psp-vernr IS INITIAL.
    WRITE: / gs_psp-posid, gs_psp-post1.
  ENDLOOP.

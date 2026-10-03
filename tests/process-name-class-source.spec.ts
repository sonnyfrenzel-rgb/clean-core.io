/**
 * A class or interface source names itself by its definition (03.10.2026).
 * The process headline read "No program name in this source" for a global
 * class `ZCL_FLIGHT_CONTROLLER`, because only REPORT/PROGRAM/FUNCTION-POOL/
 * CLASS-POOL counted. Every source here is written for this spec.
 *
 * Serverless: a pure function over text.
 */
import { test, expect } from '@playwright/test';
import { deriveBusinessRules } from '../lib/abap/business-rule-set';
import { processNameOf } from '../lib/first-look';

const nameOf = (lines: string[]) => processNameOf(deriveBusinessRules(lines.join('\n')));

test('a class source gets its class name as the process name; a local test class does not win', () => {
  const source = [
    'CLASS ltc_flight DEFINITION DEFERRED.',
    'CLASS zcl_flight_controller DEFINITION PUBLIC FINAL CREATE PUBLIC.',
    '  PUBLIC SECTION.',
    '    METHODS book IMPORTING iv_id TYPE i.',
    'ENDCLASS.',
    'CLASS zcl_flight_controller IMPLEMENTATION.',
    '  METHOD book.',
    '    IF iv_id > 0.',
    "      UPDATE zflight SET booked = 'X' WHERE id = iv_id.",
    '    ENDIF.',
    '  ENDMETHOD.',
    'ENDCLASS.',
  ];
  expect(nameOf(source)).toEqual({ name: 'ZCL_FLIGHT_CONTROLLER' });

  // A local test class written first, without PUBLIC, is not the source's name.
  const withTests = [
    'CLASS ltc_flight DEFINITION FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.',
    '  PRIVATE SECTION.',
    '    METHODS books FOR TESTING.',
    'ENDCLASS.',
    'CLASS lcl_helper DEFINITION.',
    'ENDCLASS.',
    ...source.slice(1),
  ];
  expect(nameOf(withTests)).toEqual({ name: 'ZCL_FLIGHT_CONTROLLER' });
});

test('an interface source gets its interface name; a source that names nothing keeps the fallback', () => {
  expect(nameOf([
    'INTERFACE zif_flight_booking PUBLIC.',
    '  METHODS book IMPORTING iv_id TYPE i.',
    'ENDINTERFACE.',
  ])).toEqual({ name: 'ZIF_FLIGHT_BOOKING' });

  const nothing = nameOf([
    'CLASS zcl_elsewhere DEFINITION LOAD.',
    'DATA gv_total TYPE i.',
    'gv_total = gv_total + 1.',
  ]);
  expect(nothing.name).toBeNull();
  expect(nothing.reason).toContain('names no program');
});

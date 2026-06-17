import { test, expect } from '@playwright/test';
import { parseDeclarations } from '../lib/abap/declaration-parser';
import { detectFindings, summarize } from '../lib/abap/findings-detector';
import type { ClassModel } from '../lib/abap/class-model';

test.describe('ABAP Inheritance & Parser Unit Tests', () => {
  
  test('should parse class definitions and inheritance syntax with backticks and comments', () => {
    const abapCode = `
      * This is a full-line comment
      INTERFACE lif_helper.
        METHODS get_data IMPORTING iv_param TYPE string RETURNING VALUE(rv_res) TYPE string.
      ENDINTERFACE.

      CLASS zcl_base_class DEFINITION ABSTRACT.
        PUBLIC SECTION.
          INTERFACES lif_helper.
          METHODS constructor IMPORTING iv_val TYPE i.
          METHODS process_data ABSTRACT.
      ENDCLASS.

      CLASS zcl_child_class DEFINITION INHERITING FROM zcl_base_class FINAL.
        PUBLIC SECTION.
          METHODS constructor IMPORTING iv_val TYPE i.
          METHODS process_data REDEFINITION.
        PRIVATE SECTION.
          DATA mv_text TYPE string.
          CONSTANTS mc_val TYPE string VALUE \`hello\`. " Constant with backtick
      ENDCLASS.
    `;

    const nodes = parseDeclarations(abapCode, 'zcl_child_class.abap');
    
    expect(nodes.length).toBe(3); // interface, base class, child class
    
    const lifHelper = nodes.find(n => n.key === 'LIF_HELPER')!;
    expect(lifHelper).toBeDefined();
    expect(lifHelper.kind).toBe('interface');
    expect(lifHelper.methods.length).toBe(1);
    expect(lifHelper.methods[0].name).toBe('GET_DATA');

    const baseClass = nodes.find(n => n.key === 'ZCL_BASE_CLASS')!;
    expect(baseClass).toBeDefined();
    expect(baseClass.isAbstract).toBe(true);
    expect(baseClass.superClass).toBeUndefined();
    expect(baseClass.interfaces).toContain('LIF_HELPER');
    expect(baseClass.methods.map(m => m.name)).toContain('PROCESS_DATA');
    expect(baseClass.methods.find(m => m.name === 'PROCESS_DATA')!.isAbstract).toBe(true);

    const childClass = nodes.find(n => n.key === 'ZCL_CHILD_CLASS')!;
    expect(childClass).toBeDefined();
    expect(childClass.isFinal).toBe(true);
    expect(childClass.superClass).toBe('ZCL_BASE_CLASS');
    expect(childClass.methods.find(m => m.name === 'PROCESS_DATA')!.isRedefinition).toBe(true);
  });

  test('should detect findings and summarize support levels correctly', () => {
    // Mock ClassModel representing a resolved hierarchy
    const mockModel: ClassModel = {
      root: 'ZCL_CHILD_CLASS',
      nodes: {
        'ZCL_CHILD_CLASS': {
          key: 'ZCL_CHILD_CLASS', kind: 'class', source: { file: 'child.abap', line: 1 },
          isStandard: false, isAbstract: false, isFinal: true,
          superClass: 'ZCL_BASE_CLASS', interfaces: ['LIF_HELPER'], friends: [],
          methods: [
            {
              name: 'PROCESS_DATA', visibility: 'public', isStatic: false,
              isAbstract: false, isFinal: false, isRedefinition: true,
              isConstructor: false, isClassConstructor: false, params: [], raises: [],
              source: { file: 'child.abap', line: 5 }, origin: 'redefined', definingType: 'ZCL_CHILD_CLASS'
            }
          ],
          attributes: [], events: [], aliases: []
        },
        'ZCL_BASE_CLASS': {
          key: 'ZCL_BASE_CLASS', kind: 'class', source: { file: 'base.abap', line: 1 },
          isStandard: false, isAbstract: true, isFinal: false,
          superClass: undefined, interfaces: [], friends: [], methods: [], attributes: [], events: [], aliases: []
        }
      },
      edges: [
        { from: 'ZCL_CHILD_CLASS', to: 'ZCL_BASE_CLASS', type: 'inherits' }
      ],
      linearization: ['ZCL_CHILD_CLASS', 'ZCL_BASE_CLASS'],
      resolved: false,
      missing: [
        {
          ref: 'LIF_HELPER', kind: 'interface', referencedBy: 'ZCL_CHILD_CLASS',
          at: { file: 'child.abap', line: 3 }, impact: 'blocks-resolution'
        }
      ],
      findings: []
    };

    const sources = [
      {
        file: 'child.abap',
        content: `
          CLASS zcl_child_class DEFINITION INHERITING FROM zcl_base_class.
            * This is a comment containing CL_ABAP_TYPEDESCR which should NOT be flagged
            " Another comment calling SYSTEM-CALL which should NOT be flagged
            PUBLIC SECTION.
              METHODS process_data REDEFINITION.
            PRIVATE SECTION.
              DATA mv_rtti TYPE REF TO cl_abap_typedescr. " Real RTTI reference -> should be flagged
          ENDCLASS.
        `
      }
    ];

    const findings = detectFindings(mockModel, sources);
    
    // Check missing-dependency finding
    const missingDepFinding = findings.find(f => f.construct === 'missing-dependency')!;
    expect(missingDepFinding).toBeDefined();
    expect(missingDepFinding.level).toBe('partial');
    expect(missingDepFinding.location!.line).toBe(3);

    // Check deep-inheritance finding (should be partial since dependency is missing and blocks resolution)
    const inheritanceFinding = findings.find(f => f.construct === 'deep-inheritance')!;
    expect(inheritanceFinding).toBeDefined();
    expect(inheritanceFinding.level).toBe('partial');

    // Check RTTI finding (detected from body text)
    const rttiFinding = findings.find(f => f.construct === 'rtti-dynamic-type')!;
    expect(rttiFinding).toBeDefined();
    expect(rttiFinding.location!.line).toBe(8); // line of mv_rtti definition (1-indexed)

    // Check that comments containing keywords were not flagged
    const kernelFinding = findings.find(f => f.construct === 'kernel-call');
    expect(kernelFinding).toBeUndefined(); // skipped since it was inside a comment

    // Summarize
    const summary = summarize(findings, mockModel);
    expect(summary.blocked).toBe(true);
    expect(summary.signOffRequired).toBe(true);
    expect(summary.overall).toBe('partial');
  });
});

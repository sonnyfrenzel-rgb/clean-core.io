/**
 * The engine-led transformation, Track B (design §6.1, §17): unit plan, ABAP
 * slice, fill markers and splice, the Node.js and RAP scaffolds, the call
 * contract and the trace. Track C (fills, lease, verify) and Track D (the
 * generation screen) import from here.
 *
 * Every module is pure and deterministic — no network, no model, no BPMN map
 * — and runs in a Web Worker or on the server (the page loads it with
 * `import()`, as today's facts readers).
 */

export * from './types';
export { planUnits, readEngineFacts, readContractFields, recordInputOf, fillGuardsOf, estimateFillPrompt, planDigest, rangeWords, camelName, pascalName, guardIdOf, ruleIdOnLine, csvDelimiterOf } from './unit-plan';
export type { EngineFacts, FillPromptEstimate, PlanInput } from './unit-plan';
export { sliceFor } from './abap-slice';
export { MARKER_TAG, NEEDS_ALLOWLIST, bodyGuards, defuseMarkers, findRegions, markerLines, regionHash, regionText, scaffoldDigest, spliceBodies, verifyScaffoldDigest } from './markers';
export { buildNodeScaffold, requiredGuardsOf, ruleRevisionOf, NODE_HELPERS, SCAFFOLD_NODE_MAJOR } from './scaffold-node';
export { assignBaseValues, fitsKind } from './base-values';
export { guardBasisReader, operandsOf } from './guard-basis';
export type { GuardBasis, GuardOperand } from './guard-basis';
export type { NodeScaffoldOptions } from './scaffold-node';
export { buildRapScaffold } from './scaffold-rap';
export type { RapScaffoldOptions } from './scaffold-rap';
export { acceptanceAdapter, baseValueOf, contractModel, engineCaseScope } from './call-contract';
export type { AdapterOptions, ContractModel, EngineCaseScope } from './call-contract';
export { traceOf, traceJson, traceMarkdown, withTrace } from './trace';
export type { TraceOptions } from './trace';

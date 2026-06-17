import type { ConstructType, SupportLevel } from './support-matrix';

export type Visibility = 'public' | 'protected' | 'private';
export type TypeKind = 'class' | 'interface';

export interface SourceRef {
  file: string;
  line?: number;
}

export interface TypeRef {
  raw: string;
  kind: 'value' | 'ref';
  refToType?: string;
}

export interface ParamDef {
  name: string;
  direction: 'importing' | 'exporting' | 'changing' | 'returning';
  optional: boolean;
  defaultValue?: string;
  type: TypeRef;
}

export interface MethodDecl {
  name: string;
  visibility: Visibility;
  isStatic: boolean;
  isAbstract: boolean;
  isFinal: boolean;
  isRedefinition: boolean;
  isConstructor: boolean;
  isClassConstructor: boolean;
  params: ParamDef[];
  raises: string[];
  source: SourceRef;
  // filled by member resolution (phase 2):
  origin?: 'own' | 'inherited' | 'redefined' | 'interface';
  definingType?: string;
  superTarget?: string;
}

export interface AttributeDecl {
  name: string;
  visibility: Visibility;
  isStatic: boolean;
  isReadOnly: boolean;
  isConstant: boolean;
  type: TypeRef;
  source: SourceRef;
}

export interface EventDecl {
  name: string;
  visibility: Visibility;
  isStatic: boolean;
  params: ParamDef[];
  source: SourceRef;
}

export interface AliasDecl {
  alias: string;
  target: string; // "zif_x~method"
  source: SourceRef;
}

export interface ClassNode {
  key: string;
  kind: TypeKind;
  source: SourceRef | null;
  isStandard: boolean;
  isAbstract: boolean;
  isFinal: boolean;
  createVisibility?: Visibility;
  superClass?: string;
  interfaces: string[];
  friends: string[];
  methods: MethodDecl[];
  attributes: AttributeDecl[];
  events: EventDecl[];
  aliases: AliasDecl[];
}

export interface MissingDependency {
  ref: string;
  kind: 'superclass' | 'interface' | 'type-ref' | 'friend';
  referencedBy: string;
  at: SourceRef;
  impact: 'blocks-resolution' | 'reduces-confidence';
}

export interface SupportFinding {
  construct: ConstructType;
  level: SupportLevel;
  title: string;
  detail: string;
  recommendation: string;
  howItWorks: string;        // deep link, from howItWorksUrl(construct)
  location?: SourceRef;
  targetAnchor?: SourceRef;
  confidence?: number;
  requiresSignOff: boolean;
}

export interface ClassModel {
  root: string;
  nodes: Record<string, ClassNode>;
  edges: { from: string; to: string; type: 'inherits' | 'implements' }[];
  linearization: string[];
  resolved: boolean;
  missing: MissingDependency[];
  findings: SupportFinding[];
}

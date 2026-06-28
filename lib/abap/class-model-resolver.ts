import { ClassModel, ClassNode, MissingDependency } from './class-model';
import { parseDeclarations } from './declaration-parser';

export function buildClassModel(
  sources: { file: string; content: string }[]
): ClassModel {
  const allNodes: ClassNode[] = [];
  
  // 1. Parse all declarations from sources
  for (const src of sources) {
    allNodes.push(...parseDeclarations(src.content, src.file));
  }

  const nodesMap: Record<string, ClassNode> = {};
  for (const node of allNodes) {
    nodesMap[node.key] = node;
  }

  // 2. Determine root class
  // If there is LCL_MAIN or MAIN, use it. Otherwise, use the first class, or default to "MAIN"
  let root = 'MAIN';
  if (allNodes.length > 0) {
    const mainNode = allNodes.find(n => n.key === 'LCL_MAIN' || n.key === 'MAIN' || n.key === 'ZCL_MAIN');
    root = mainNode ? mainNode.key : allNodes[0].key;
  }

  // 3. Compute missing dependencies and resolution tree
  const missing: MissingDependency[] = [];
  const edges: { from: string; to: string; type: 'inherits' | 'implements' }[] = [];

  for (const node of allNodes) {
    if (node.superClass) {
      const parent = nodesMap[node.superClass];
      if (!parent && !node.superClass.startsWith('CL_') && !node.superClass.startsWith('CX_') && !node.superClass.startsWith('ZCL_') && !node.superClass.startsWith('ZCX_')) {
        missing.push({
          ref: node.superClass,
          kind: 'superclass',
          referencedBy: node.key,
          at: node.source || { file: 'main.abap', line: 1 },
          impact: 'blocks-resolution'
        });
      } else {
        edges.push({ from: node.key, to: node.superClass, type: 'inherits' });
      }
    }

    for (const iface of node.interfaces) {
      const ifaceNode = nodesMap[iface];
      if (!ifaceNode && !iface.startsWith('IF_') && !iface.startsWith('ZIF_')) {
        missing.push({
          ref: iface,
          kind: 'interface',
          referencedBy: node.key,
          at: node.source || { file: 'main.abap', line: 1 },
          impact: 'reduces-confidence'
        });
      } else {
        edges.push({ from: node.key, to: iface, type: 'implements' });
      }
    }
  }

  // 4. Compute Linearization (Topological Sort of inheritance tree)
  const linearization: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(key: string) {
    if (visited.has(key)) return;
    if (visiting.has(key)) {
      // Circular dependency detected, break
      return;
    }
    visiting.add(key);

    const node = nodesMap[key];
    if (node) {
      if (node.superClass) {
        visit(node.superClass);
      }
      for (const iface of node.interfaces) {
        visit(iface);
      }
    }

    visiting.delete(key);
    visited.add(key);
    linearization.push(key);
  }

  if (nodesMap[root]) {
    visit(root);
  } else {
    for (const node of allNodes) {
      visit(node.key);
    }
  }

  const resolved = missing.filter(m => m.impact === 'blocks-resolution').length === 0;

  return {
    root,
    nodes: nodesMap,
    edges,
    linearization,
    resolved,
    missing,
    findings: []
  };
}

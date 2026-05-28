'use client';

import React, { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Edge,
  Node,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

interface FlowNode {
  id: string;
  name: string;
  type: 'startEvent' | 'endEvent' | 'gateway' | 'task';
  next: string[];
  role?: string;
}

interface ProcessFlowProps {
  flow: FlowNode[];
  onNodeClick?: (nodeId: string) => void;
}

const nodeStyles = {
  startEvent: 'bg-green-50 border-green-500 text-green-900 rounded-full w-12 h-12 flex items-center justify-center text-[10px] font-bold border-2 shadow-sm cursor-pointer hover:scale-105 transition-transform',
  endEvent: 'bg-red-50 border-red-500 text-red-900 rounded-full w-12 h-12 flex items-center justify-center text-[10px] font-bold border-4 shadow-sm cursor-pointer hover:scale-105 transition-transform',
  gateway: 'bg-amber-50 border-amber-500 text-amber-900 rotate-45 w-14 h-14 flex items-center justify-center border-2 shadow-sm cursor-pointer hover:scale-105 transition-transform',
  task: 'bg-white border-blue-200 text-blue-900 rounded-xl px-4 py-3 border-2 shadow-md min-w-[140px] text-center font-bold text-sm cursor-pointer hover:border-green-500 hover:shadow-green-500/10 hover:-translate-y-0.5 transition-all duration-200',
};

const ProcessFlow: React.FC<ProcessFlowProps> = ({ flow, onNodeClick }) => {
  const { nodes, edges } = useMemo(() => {
    if (!flow || !Array.isArray(flow)) return { nodes: [], edges: [] };

    const initialNodes: Node[] = [];
    const initialEdges: Edge[] = [];

    // Simple horizontal layout logic
    const levelMap: Record<string, number> = {};
    const visited = new Set<string>();

    const calculateLevels = (nodeId: string, level: number, depth: number = 0) => {
      if (depth > 50) return; // Safety limit
      if (visited.has(nodeId)) {
        levelMap[nodeId] = Math.max(levelMap[nodeId] || 0, level);
        return;
      }
      visited.add(nodeId);
      levelMap[nodeId] = level;

      const node = flow.find((n) => n.id === nodeId);
      if (node && node.next && Array.isArray(node.next)) {
        node.next.forEach((nextId) => calculateLevels(nextId, level + 1, depth + 1));
      }
    };

    const startNode = flow.find((n) => n.type === 'startEvent') || flow[0];
    if (startNode) {
      calculateLevels(startNode.id, 0);
    }

    // Group nodes by level for vertical spacing
    const nodesByLevel: Record<number, string[]> = {};
    Object.entries(levelMap).forEach(([id, level]) => {
      if (!nodesByLevel[level]) nodesByLevel[level] = [];
      nodesByLevel[level].push(id);
    });

    flow.forEach((nodeData) => {
      const level = levelMap[nodeData.id] || 0;
      const indexInLevel = nodesByLevel[level]?.indexOf(nodeData.id) || 0;
      const levelCount = nodesByLevel[level]?.length || 1;

      const x = level * 250 + 50;
      const y = (indexInLevel - (levelCount - 1) / 2) * 150 + 200;

      initialNodes.push({
        id: nodeData.id,
        data: { label: nodeData.name },
        position: { x, y },
        className: nodeStyles[nodeData.type] || nodeStyles.task,
        style: nodeData.type === 'gateway' ? { transform: 'rotate(-45deg)' } : {},
      });

      if (nodeData.next && Array.isArray(nodeData.next)) {
        nodeData.next.forEach((nextId) => {
          initialEdges.push({
            id: `e-${nodeData.id}-${nextId}`,
            source: nodeData.id,
            target: nextId,
            animated: nodeData.type === 'gateway',
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: '#10b981', // Sleek green accent markers matching our system
            },
            style: { stroke: '#10b981', strokeWidth: 2 },
          });
        });
      }
    });

    return { nodes: initialNodes, edges: initialEdges };
  }, [flow]);

  return (
    <div className="h-[500px] w-full bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={onNodeClick ? (event, node) => onNodeClick(node.id) : undefined}
        fitView
        minZoom={0.2}
        maxZoom={1.5}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
      >
        <Background color="#cbd5e1" gap={20} />
        <Controls />
      </ReactFlow>
    </div>
  );
};

export default ProcessFlow;

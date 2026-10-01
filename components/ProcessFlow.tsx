'use client';

import React, { useMemo } from 'react';
import { processFlowLevels } from './process-flow-levels';
import {
  ReactFlow,
  Background,
  Controls,
  Edge,
  Node,
  MarkerType,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Play, Square, GitFork, Database, User, Server, Lock, Code2 } from 'lucide-react';
import { clsx } from 'clsx';
import CcTag from '@/components/cc/Tag';
import { categoricalChartColor } from '@/lib/chart-colors';

interface FlowNode {
  id: string;
  name: string;
  type: string;
  next: string[];
  role?: string;
}

interface ProcessFlowProps {
  flow: FlowNode[];
  tasks?: any[];
  onNodeClick?: (nodeId: string) => void;
}

/**
 * Colours of the drawing (DESIGN.md §1.8): the element kinds are categories,
 * not states, so they take the categorical palette of `lib/chart-colors.ts`.
 * Green is not a category colour — it means "proven" (ADR-007).
 */
const TASK_COLOR = {
  task: categoricalChartColor(0),
  userTask: categoricalChartColor(1),
  serviceTask: categoricalChartColor(2),
} as const;

const HANDLE = 'w-2 h-2 !bg-cc-field-border border border-cc-surface';
const CAPTION = 'text-[11px] font-semibold text-cc-ink-muted mt-2 max-w-[120px] text-center leading-tight';

// 1. Custom Swimlane Background Node Component
const SwimlaneNode = ({ data }: any) => {
  const LaneIcon = data.label === 'CISO' ? Lock : data.label === 'Developer' ? Code2 : data.label === 'System' ? Server : User;
  return (
    <div className="w-full h-full relative flex items-center select-none pointer-events-none">
      {/* Left role handle/label */}
      <div className="absolute left-4 top-4 flex items-center gap-2 bg-cc-surface px-3 py-1 rounded-cc-row border border-cc-line shadow-cc text-cc-ink pointer-events-auto">
        <LaneIcon className="w-4 h-4 text-cc-ink-muted" aria-hidden />
        <span className="cc-text-label">{data.label}</span>
      </div>
      {/* Lane divider line */}
      <div className="absolute bottom-0 left-0 right-0 border-b border-cc-line w-full"></div>
    </div>
  );
};

// 2. Custom Start Event Component — BPMN: a thin circle.
const StartNode = ({ data }: any) => {
  return (
    <div className="flex flex-col items-center justify-center relative">
      <div className="w-12 h-12 rounded-full bg-cc-surface border-2 border-cc-ink text-cc-ink flex items-center justify-center">
        <Play className="w-5 h-5 ml-1" aria-hidden />
      </div>
      <span className={CAPTION}>{data.label}</span>
      <Handle type="source" position={Position.Right} className={HANDLE} />
    </div>
  );
};

// 3. Custom End Event Component — BPMN: a thick circle.
const EndNode = ({ data }: any) => {
  return (
    <div className="flex flex-col items-center justify-center relative">
      <div className="w-12 h-12 rounded-full bg-cc-surface border-4 border-cc-ink text-cc-ink flex items-center justify-center">
        <Square className="w-4 h-4 fill-current" aria-hidden />
      </div>
      <span className={CAPTION}>{data.label}</span>
      <Handle type="target" position={Position.Left} className={HANDLE} />
    </div>
  );
};

// 4. Custom Gateway Component (diamond)
const GatewayNode = ({ data }: any) => {
  return (
    <div className="flex flex-col items-center justify-center relative w-14 h-14">
      <div className="w-10 h-10 bg-cc-surface border-2 border-cc-ink text-cc-ink flex items-center justify-center rotate-45">
        <div className="-rotate-45 flex items-center justify-center">
          <GitFork className="w-4 h-4" aria-hidden />
        </div>
      </div>
      <span className={clsx(CAPTION, 'absolute top-full left-1/2 -translate-x-1/2 whitespace-nowrap')}>{data.label}</span>
      <Handle type="target" position={Position.Left} style={{ left: 0 }} className={HANDLE} />
      <Handle type="source" position={Position.Right} style={{ right: 0 }} className={HANDLE} />
    </div>
  );
};

// 5. Custom Task Component (Service / User tasks card)
const TaskNode = ({ data }: any) => {
  const isUserTask = data.type === 'userTask';
  const isServiceTask = data.type === 'serviceTask';
  const color = isUserTask ? TASK_COLOR.userTask : isServiceTask ? TASK_COLOR.serviceTask : TASK_COLOR.task;

  let Icon = Server;
  if (isUserTask) Icon = User;
  if (isServiceTask) Icon = Database;

  return (
    <div
      className="bg-cc-surface rounded-cc-row shadow-cc border border-cc-line hover:border-cc-field-border p-3 w-[210px] cursor-pointer flex flex-col justify-between relative min-h-[96px] overflow-hidden"
    >
      {/* Top accent bar: the kind of the task, from the categorical palette */}
      <div aria-hidden className={clsx('absolute top-0 left-0 right-0 h-1', color.bg)}></div>

      {/* Top Meta info */}
      <div className="flex items-center gap-1 mb-2 text-cc-ink-muted">
        <Icon className="w-4 h-4 shrink-0" style={{ color: color.value }} aria-hidden />
        <span className="cc-text-label whitespace-nowrap">{isUserTask ? 'User Task' : isServiceTask ? 'Service Task' : 'Task'}</span>
      </div>

      {/* Title */}
      <h4 className="cc-text-h3 text-cc-ink leading-snug mb-2 truncate" title={data.label}>
        {data.label}
      </h4>

      {/* SAP API / System */}
      {data.systems && data.systems.length > 0 && (
        <div className="mb-2 truncate" title={data.systems[0]}>
          <CcTag>{data.systems[0]}</CcTag>
        </div>
      )}

      {/* Footer info: Role */}
      <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-cc-line">
        <span className="text-[11px] font-medium text-cc-ink-muted font-cc-mono truncate">ID: {data.id}</span>
        <CcTag>{data.role || 'System'}</CcTag>
      </div>

      <Handle type="target" position={Position.Left} className={HANDLE} />
      <Handle type="source" position={Position.Right} className={HANDLE} />
    </div>
  );
};

const nodeTypes = {
  startEvent: StartNode,
  endEvent: EndNode,
  gateway: GatewayNode,
  task: TaskNode,
  serviceTask: TaskNode,
  userTask: TaskNode,
  swimlane: SwimlaneNode,
};

const ProcessFlow: React.FC<ProcessFlowProps> = ({ flow, tasks, onNodeClick }) => {
  const { nodes, edges } = useMemo(() => {
    if (!flow || !Array.isArray(flow)) return { nodes: [], edges: [] };

    const initialNodes: Node[] = [];
    const initialEdges: Edge[] = [];

    // Horizontal layout calculation: longest path from the start (`./process-flow-levels.ts`).
    const startNode = flow.find((n) => n.type === 'startEvent') || flow[0];
    const levelMap: Record<string, number> = startNode ? processFlowLevels(flow, startNode.id) : {};

    // Determine unique roles for swimlanes Y track alignment
    const roles = Array.from(new Set(flow.map(n => n.role || 'System').filter(Boolean)));
    if (roles.length === 0) roles.push('System');

    const roleIndexMap: Record<string, number> = {};
    roles.forEach((role, idx) => {
      roleIndexMap[role] = idx;
    });

    const LANE_HEIGHT = 180;
    const maxLevel = Math.max(...Object.values(levelMap), 0);
    const laneWidth = Math.max(1400, (maxLevel + 1) * 300 + 200);

    // 1. Generate background swimlane nodes
    roles.forEach((role, idx) => {
      initialNodes.push({
        id: `lane-${role}`,
        type: 'swimlane',
        position: { x: -80, y: idx * LANE_HEIGHT },
        data: { label: role },
        style: {
          width: laneWidth,
          height: LANE_HEIGHT,
          pointerEvents: 'none',
          zIndex: -10,
        },
        draggable: false,
        selectable: false,
      });
    });

    // Track duplicate level and role mappings to vertically offset elements if needed
    const levelRoleCounts: Record<string, number> = {};

    // 2. Generate Process Nodes
    flow.forEach((nodeData) => {
      const level = levelMap[nodeData.id] || 0;
      const role = nodeData.role || 'System';
      const key = `${level}-${role}`;
      const indexInLevelAndRole = levelRoleCounts[key] || 0;
      levelRoleCounts[key] = indexInLevelAndRole + 1;

      // X coordinate spaced by levels
      const x = level * 300 + 100;
      
      // Base Y position in the vertical center of the role lane
      const roleIdx = roleIndexMap[role] ?? 0;
      const laneCenterY = roleIdx * LANE_HEIGHT + (LANE_HEIGHT / 2);
      
      // Vertical offsets based on size of node
      let yOffset = -24; // standard for circles/gateways (~48px height)
      if (nodeData.type === 'serviceTask' || nodeData.type === 'userTask' || nodeData.type === 'task') {
        yOffset = -48; // standard for rectangular cards (~96px height)
      }

      // Stagger vertical placement if multiple nodes of same role appear in the same level
      if (indexInLevelAndRole > 0) {
        yOffset += indexInLevelAndRole * 50;
      }

      const y = laneCenterY + yOffset;

      // Extract system dependencies from level 4 specifications
      const matchingTask = tasks?.find(t => t.stepId === nodeData.id);
      const systems = matchingTask?.systems || (nodeData.type === 'serviceTask' ? ['SAP S/4HANA'] : []);

      initialNodes.push({
        id: nodeData.id,
        type: nodeData.type === 'exclusiveGateway' ? 'gateway' : nodeData.type,
        data: { 
          label: nodeData.name, 
          role: role, 
          type: nodeData.type, 
          systems, 
          id: nodeData.id 
        },
        position: { x, y },
      });

      if (nodeData.next && Array.isArray(nodeData.next)) {
        nodeData.next.forEach((nextId) => {
          initialEdges.push({
            id: `e-${nodeData.id}-${nextId}`,
            source: nodeData.id,
            target: nextId,
            animated: nodeData.type === 'gateway' || nodeData.type === 'exclusiveGateway',
            // Sequence flow in ink: a line is not a state and not a category.
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: 'var(--cc-ink-muted)',
            },
            style: { stroke: 'var(--cc-ink-muted)', strokeWidth: 2 },
          });
        });
      }
    });

    return { nodes: initialNodes, edges: initialEdges };
  }, [flow, tasks]);

  return (
    <div className="h-[500px] w-full bg-cc-surface-muted rounded-cc-card border border-cc-line overflow-hidden relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick ? (event, node) => {
          if (!node.id.startsWith('lane-')) {
            onNodeClick(node.id);
          }
        } : undefined}
        fitView
        minZoom={0.2}
        maxZoom={1.5}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
      >
        <Background color="var(--cc-line)" gap={20} />
        <Controls />
      </ReactFlow>
    </div>
  );
};

export default ProcessFlow;

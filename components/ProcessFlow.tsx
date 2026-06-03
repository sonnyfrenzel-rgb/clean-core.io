'use client';

import React, { useMemo } from 'react';
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
import { Play, Square, GitFork, Database, User, Server, Lock, Cpu } from 'lucide-react';
import { clsx } from 'clsx';

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

// 1. Custom Swimlane Background Node Component
const SwimlaneNode = ({ data }: any) => {
  return (
    <div className="w-full h-full relative flex items-center select-none pointer-events-none">
      {/* Left role handle/label */}
      <div className="absolute left-4 top-4 flex items-center gap-2 bg-[#0b1c30]/90 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/10 shadow-lg text-white pointer-events-auto">
        {data.label === 'CISO' && <Lock className="w-3.5 h-3.5 text-rose-400" />}
        {data.label === 'Developer' && <Cpu className="w-3.5 h-3.5 text-cyan-400" />}
        {data.label === 'System' && <Server className="w-3.5 h-3.5 text-emerald-400" />}
        {data.label !== 'CISO' && data.label !== 'Developer' && data.label !== 'System' && <User className="w-3.5 h-3.5 text-purple-400" />}
        <span className="text-[10px] font-black uppercase tracking-widest">{data.label}</span>
      </div>
      {/* Translucent lane divider line */}
      <div className="absolute bottom-0 left-0 right-0 border-b border-slate-200/50 w-full"></div>
    </div>
  );
};

// 2. Custom Start Event Component
const StartNode = ({ data }: any) => {
  return (
    <div className="flex flex-col items-center justify-center relative">
      <div className="w-12 h-12 rounded-full bg-emerald-500/10 border-2 border-emerald-500 text-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-transform duration-150">
        <Play className="w-5 h-5 fill-emerald-500 ml-0.5" />
      </div>
      <span className="text-[10px] font-bold text-slate-600 mt-2 max-w-[120px] text-center leading-tight">{data.label}</span>
      <Handle type="source" position={Position.Right} className="w-2.5 h-2.5 !bg-emerald-500 border border-white" />
    </div>
  );
};

// 3. Custom End Event Component
const EndNode = ({ data }: any) => {
  return (
    <div className="flex flex-col items-center justify-center relative">
      <div className="w-12 h-12 rounded-full bg-rose-500/10 border-4 border-rose-500 text-rose-500 flex items-center justify-center shadow-lg shadow-rose-500/20 hover:scale-105 active:scale-95 transition-transform duration-150">
        <Square className="w-4.5 h-4.5 fill-rose-500" />
      </div>
      <span className="text-[10px] font-bold text-slate-600 mt-2 max-w-[120px] text-center leading-tight">{data.label}</span>
      <Handle type="target" position={Position.Left} className="w-2.5 h-2.5 !bg-rose-500 border border-white" />
    </div>
  );
};

// 4. Custom Gateway Component (diamond)
const GatewayNode = ({ data }: any) => {
  return (
    <div className="flex flex-col items-center justify-center relative w-14 h-14">
      <div className="w-10 h-10 bg-amber-500/10 border-2 border-amber-500 text-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/20 rotate-45 hover:scale-105 active:scale-95 transition-transform duration-150">
        <div className="-rotate-45 flex items-center justify-center">
          <GitFork className="w-4 h-4" />
        </div>
      </div>
      <span className="text-[10px] font-bold text-slate-600 mt-2 max-w-[120px] text-center leading-tight absolute top-full left-1/2 -translate-x-1/2 whitespace-nowrap">{data.label}</span>
      <Handle type="target" position={Position.Left} style={{ left: 0 }} className="w-2.5 h-2.5 !bg-amber-500 border border-white" />
      <Handle type="source" position={Position.Right} style={{ right: 0 }} className="w-2.5 h-2.5 !bg-amber-500 border border-white" />
    </div>
  );
};

// 5. Custom Task Component (Service / User tasks card)
const TaskNode = ({ data }: any) => {
  const isUserTask = data.type === 'userTask';
  const isServiceTask = data.type === 'serviceTask';
  
  let Icon = Server;
  if (isUserTask) Icon = User;
  if (isServiceTask) Icon = Database;

  return (
    <div className={clsx(
      "bg-white rounded-xl shadow-md border-2 p-3.5 w-[210px] hover:scale-[1.02] active:scale-[0.99] transition-all duration-200 cursor-pointer flex flex-col justify-between relative min-h-[95px]",
      isUserTask ? "border-purple-300 hover:border-purple-500 shadow-purple-500/5 hover:shadow-purple-500/10" :
      isServiceTask ? "border-emerald-300 hover:border-emerald-500 shadow-emerald-500/5 hover:shadow-emerald-500/10" :
      "border-blue-300 hover:border-blue-500 shadow-blue-500/5 hover:shadow-blue-500/10"
    )}>
      {/* Top Accent bar */}
      <div className={clsx(
        "absolute top-0 left-0 right-0 h-1 rounded-t-xl",
        isUserTask ? "bg-purple-500" :
        isServiceTask ? "bg-emerald-500" :
        "bg-blue-500"
      )}></div>

      {/* Top Meta info */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-slate-500">
          <Icon className={clsx("w-3.5 h-3.5", isUserTask ? "text-purple-500" : isServiceTask ? "text-emerald-500" : "text-blue-500")} />
          <span className="text-[9px] font-black uppercase tracking-widest">{isUserTask ? 'User Task' : isServiceTask ? 'Service Task' : 'Task'}</span>
        </div>
        {/* SAP API / System Badge */}
        {data.systems && data.systems.length > 0 && (
          <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded text-[8px] font-black font-mono tracking-tight uppercase truncate max-w-[90px]" title={data.systems[0]}>
            {data.systems[0]}
          </span>
        )}
      </div>

      {/* Title */}
      <h4 className="text-xs font-black text-slate-900 leading-snug tracking-tight mb-2 truncate" title={data.label}>
        {data.label}
      </h4>

      {/* Footer info: Role badge */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100">
        <span className="text-[8px] font-bold text-slate-400 font-mono">ID: {data.id}</span>
        <span className={clsx(
          "px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest font-mono",
          isUserTask ? "bg-purple-50 text-purple-600 border border-purple-100" :
          isServiceTask ? "bg-emerald-50 text-emerald-600 border border-emerald-100" :
          "bg-blue-50 text-blue-600 border border-blue-100"
        )}>
          {data.role || 'System'}
        </span>
      </div>

      <Handle type="target" position={Position.Left} className="w-2.5 h-2.5 !bg-slate-300 border-2 border-white hover:scale-125 transition-transform" />
      <Handle type="source" position={Position.Right} className="w-2.5 h-2.5 !bg-slate-300 border-2 border-white hover:scale-125 transition-transform" />
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

    // Horizontal layout calculation
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
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: '#10b981', // Emerald green arrow
            },
            style: { stroke: '#10b981', strokeWidth: 2.5 },
          });
        });
      }
    });

    return { nodes: initialNodes, edges: initialEdges };
  }, [flow, tasks]);

  return (
    <div className="h-[500px] w-full bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden relative shadow-inner">
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
        <Background color="#cbd5e1" gap={20} />
        <Controls />
      </ReactFlow>
    </div>
  );
};

export default ProcessFlow;

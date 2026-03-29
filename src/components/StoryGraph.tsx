'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  Node, Edge, Background, Controls, MiniMap,
  useNodesState, useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { StoryGraph as StoryGraphType } from '@/types/story';

interface Props {
  onNodeClick?: (storyId: string) => void;
}

export default function StoryGraph({ onNodeClick }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/graph')
      .then(r => r.json())
      .then((data: StoryGraphType) => {
        const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6'];

        const flowNodes: Node[] = data.nodes.map((n, i) => ({
          id: n.id,
          position: {
            x: Math.cos((i / data.nodes.length) * 2 * Math.PI) * 300 + 400,
            y: Math.sin((i / data.nodes.length) * 2 * Math.PI) * 200 + 300,
          },
          data: {
            label: (
              <div className="text-xs text-center max-w-24">
                <div className="font-semibold">{n.title.slice(0, 30)}</div>
                <div className="text-gray-500">{n.bookTitle.slice(0, 20)}</div>
              </div>
            ),
          },
          style: {
            background: COLORS[i % COLORS.length],
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: 8,
            fontSize: 11,
          },
        }));

        const flowEdges: Edge[] = data.edges.map((e, i) => ({
          id: `e-${i}`,
          source: e.from,
          target: e.to,
          label: e.topics.slice(0, 1).join(', '),
          style: { stroke: '#94a3b8', strokeWidth: Math.max(1, e.score * 4) },
          labelStyle: { fontSize: 9, fill: '#64748b' },
        }));

        setNodes(flowNodes);
        setEdges(flowEdges);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [setNodes, setEdges]);

  const handleNodeClick = useCallback((_: unknown, node: Node) => {
    onNodeClick?.(node.id);
  }, [onNodeClick]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">Loading graph...</div>;
  }

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-2">
        <p>No story connections yet.</p>
        <p className="text-sm">Add more stories and run analysis to see the graph.</p>
      </div>
    );
  }

  return (
    <div style={{ height: 500 }} className="rounded-xl border border-gray-200 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}

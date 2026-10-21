import React, { useState } from 'react';
import { Crosshair, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { IRCircuit, IRComponent, IRConnection } from '../packages/conversion-core/types';

interface CircuitTopologyCanvasProps {
  circuit: IRCircuit;
}

const WIRE_COLOR_HEX: Record<string, string> = {
  red: '#f43f5e',
  black: '#64748b',
  blue: '#38bdf8',
  green: '#10b981',
  gold: '#f59e0b',
  yellow: '#facc15',
  orange: '#fb923c',
  purple: '#c084fc',
  white: '#e2e8f0',
};

function resolveWireStroke(rawColor: string, status: IRConnection['status']): string {
  if (status === 'rejected') return '#f43f5e';
  if (status === 'unsupported') return '#64748b';
  if (rawColor.startsWith('#')) {
    if (rawColor.toLowerCase() === '#000000') return '#94a3b8';
    return rawColor;
  }
  return WIRE_COLOR_HEX[rawColor.toLowerCase()] || '#06b6d4';
}

export const CircuitTopologyCanvas: React.FC<CircuitTopologyCanvasProps> = ({ circuit }) => {
  const [layoutMode, setLayoutMode] = useState<'normalized' | 'source'>('normalized');
  const [zoom, setZoom] = useState<number>(1);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(
    circuit.components[0]?.id ?? null
  );
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [hoveredConnectionId, setHoveredConnectionId] = useState<string | null>(null);
  const [hoveredComponentId, setHoveredComponentId] = useState<string | null>(null);

  const components = circuit.components;
  const connections = circuit.connections;

  const boxWidth = 184;
  const boxHeight = 96;

  const positions = new Map<string, { x: number; y: number }>();

  if (layoutMode === 'normalized') {
    const cols = Math.max(2, Math.min(3, components.length));
    components.forEach((comp, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const staggerY = col === 1 ? 42 : 0;
      positions.set(comp.id, {
        x: 56 + col * 265,
        y: 52 + row * 170 + staggerY,
      });
    });
  } else {
    const xs = components.map((c) => c.layout.x);
    const ys = components.map((c) => c.layout.y);
    const minX = Math.min(...xs, 0);
    const minY = Math.min(...ys, 0);
    components.forEach((comp, idx) => {
      const normX = 52 + Math.max(0, comp.layout.x - minX) * 1.35;
      const normY = 48 + Math.max(0, comp.layout.y - minY) * 1.15;
      positions.set(comp.id, {
        x: Math.min(620, normX + (idx % 2) * 18),
        y: Math.min(340, normY),
      });
    });
  }

  const rowsCount = Math.ceil(components.length / Math.max(2, Math.min(3, components.length)));
  const svgWidth = 860;
  const svgHeight = Math.max(340, rowsCount * 190 + 90);

  const computedWireGeometry = connections
    .map((conn, idx) => {
      const fromPos = positions.get(conn.from.componentId);
      const toPos = positions.get(conn.to.componentId);
      if (!fromPos || !toPos) return null;

      const dx = Math.abs(fromPos.x - toPos.x);
      const isLongSpan = dx > 320;
      const offset = ((idx % 5) - 2) * 11;
      const x1 = fromPos.x + boxWidth / 2;
      const y1 = isLongSpan ? fromPos.y + boxHeight : fromPos.y + boxHeight / 2 + offset;
      const x2 = toPos.x + boxWidth / 2;
      const y2 = isLongSpan ? toPos.y + boxHeight : toPos.y + boxHeight / 2 + offset;
      const ctrlY = isLongSpan ? Math.max(y1, y2) + 72 : (y1 + y2) / 2 - 38 + offset;

      const badgeX = (x1 + x2) / 2;
      const badgeY = 0.25 * y1 + 0.5 * ctrlY + 0.25 * y2;

      return {
        conn,
        x1,
        y1,
        x2,
        y2,
        ctrlX: (x1 + x2) / 2,
        ctrlY,
        badgeX,
        badgeY,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const activeComponent =
    components.find((c) => c.id === (hoveredComponentId || selectedComponentId)) ??
    components[0];

  const activeConnection = connections.find(
    (c) => c.id === (hoveredConnectionId || selectedConnectionId)
  );

  const attachedConnectionsForActiveComp = activeComponent
    ? connections.filter(
        (c) =>
          c.from.componentId === activeComponent.id || c.to.componentId === activeComponent.id
      )
    : [];

  return (
    <div className="border border-slate-200 bg-white rounded-lg overflow-hidden">
      {/* Top Instrument Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-3">
          <Crosshair className="w-4 h-4 text-cyan-600 shrink-0" aria-hidden="true" />
          <div>
            <h4 className="text-sm font-semibold text-slate-900">
              Interactive Hardware Netlist & Coordinate Stage
            </h4>
            <p className="text-xs text-slate-500">
              Select any component block or signal net on the canvas to inspect pin-level routing.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Zoom Controls */}
          <div className="flex items-center gap-1 border border-slate-200 bg-white rounded-md p-0.5">
            <button
              type="button"
              aria-label="Zoom out topology canvas"
              onClick={() => setZoom((z) => Math.max(0.8, Number((z - 0.1).toFixed(2))))}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
            >
              <ZoomOut className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <span className="px-2 text-xs font-mono tabular-nums text-slate-700">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              aria-label="Zoom in topology canvas"
              onClick={() => setZoom((z) => Math.min(1.4, Number((z + 0.1).toFixed(2))))}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
            >
              <ZoomIn className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Reset canvas zoom"
              onClick={() => setZoom(1)}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          {/* Layout Mode Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-200/75 rounded-md">
            <button
              type="button"
              onClick={() => setLayoutMode('normalized')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                layoutMode === 'normalized'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Normalized Grid
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('source')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                layoutMode === 'source'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Source Coordinates
            </button>
          </div>
        </div>
      </div>

      {/* Split Canvas + Telemetry Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* Left 8 Cols: Obsidian Blueprint Canvas */}
        <div className="lg:col-span-8 relative overflow-x-auto bg-[#07090E] p-4 border-b lg:border-b-0 lg:border-r border-slate-800 cursor-crosshair">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
            className="w-full h-auto min-w-[660px] transition-transform duration-150"
            role="img"
            aria-label="Circuit topology diagram showing components and electrical connections"
          >
            <defs>
              <pattern id="wiremorph-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path
                  d="M 24 0 L 0 0 0 24"
                  fill="none"
                  stroke="rgba(56, 189, 248, 0.07)"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect width={svgWidth} height={svgHeight} fill="url(#wiremorph-grid)" />

            {/* Coordinate Axis Tick Marks */}
            {[0, 200, 400, 600, 800].map((tickX) => (
              <g key={`tick-x-${tickX}`}>
                <line
                  x1={tickX}
                  y1={0}
                  x2={tickX}
                  y2={6}
                  stroke="#334155"
                  strokeWidth={1}
                />
                <text
                  x={tickX + 4}
                  y={12}
                  fill="#475569"
                  fontSize="8.5"
                  fontFamily="JetBrains Mono, monospace"
                >
                  X:{tickX}
                </text>
              </g>
            ))}

            {/* Layer 1: Wire Curves */}
            {computedWireGeometry.map(({ conn, x1, y1, x2, y2, ctrlX, ctrlY }) => {
              const isHighlighted =
                hoveredConnectionId === conn.id ||
                selectedConnectionId === conn.id ||
                hoveredComponentId === conn.from.componentId ||
                hoveredComponentId === conn.to.componentId ||
                selectedComponentId === conn.from.componentId ||
                selectedComponentId === conn.to.componentId;

              const strokeColor = resolveWireStroke(conn.wireColor, conn.status);
              const dashArray =
                conn.status === 'unsupported' || conn.status === 'rejected'
                  ? '5,5'
                  : conn.status === 'approximated'
                    ? '8,3'
                    : undefined;

              return (
                <g
                  key={`wire-${conn.id}`}
                  onMouseEnter={() => setHoveredConnectionId(conn.id)}
                  onMouseLeave={() => setHoveredConnectionId(null)}
                  onClick={() => {
                    setSelectedConnectionId(conn.id);
                    setSelectedComponentId(null);
                  }}
                  className="cursor-pointer"
                >
                  <path
                    d={`M ${x1} ${y1} Q ${ctrlX} ${ctrlY} ${x2} ${y2}`}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={isHighlighted ? 3.2 : 2}
                    strokeDasharray={dashArray}
                    opacity={isHighlighted ? 1 : 0.65}
                  />
                  <circle cx={x1} cy={y1} r={3.5} fill={strokeColor} />
                  <circle cx={x2} cy={y2} r={3.5} fill={strokeColor} />
                </g>
              );
            })}

            {/* Layer 2: Component Nodes */}
            {components.map((comp: IRComponent) => {
              const pos = positions.get(comp.id) ?? { x: 40, y: 40 };
              const isUnsupported =
                comp.mappingStatus === 'unsupported' || comp.mappingStatus === 'rejected';
              const isSelected =
                hoveredComponentId === comp.id || selectedComponentId === comp.id;

              const borderStroke = isUnsupported
                ? '#f59e0b'
                : isSelected
                  ? '#06b6d4'
                  : '#334155';

              return (
                <g
                  key={comp.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onMouseEnter={() => setHoveredComponentId(comp.id)}
                  onMouseLeave={() => setHoveredComponentId(null)}
                  onClick={() => {
                    setSelectedComponentId(comp.id);
                    setSelectedConnectionId(null);
                  }}
                  className="cursor-pointer"
                >
                  <rect
                    width={boxWidth}
                    height={boxHeight}
                    rx={6}
                    fill={isUnsupported ? '#1c1917' : '#0f172a'}
                    stroke={borderStroke}
                    strokeWidth={isSelected ? 2.2 : 1.2}
                  />
                  <rect
                    x={0}
                    y={0}
                    width={boxWidth}
                    height={25}
                    rx={6}
                    fill={isUnsupported ? '#451a03' : isSelected ? '#164e63' : '#1e293b'}
                  />
                  <text
                    x={10}
                    y={16.5}
                    fill="#f8fafc"
                    fontSize="11"
                    fontWeight="600"
                    fontFamily="Plus Jakarta Sans, sans-serif"
                  >
                    {comp.label} ({comp.id})
                  </text>
                  <text
                    x={boxWidth - 8}
                    y={16}
                    textAnchor="end"
                    fill={isUnsupported ? '#fbbf24' : '#22d3ee'}
                    fontSize="9.5"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {comp.mappingStatus}
                  </text>

                  <text
                    x={10}
                    y={44}
                    fill="#94a3b8"
                    fontSize="9.5"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    src: {comp.sourcePartType.slice(0, 22)}
                  </text>
                  <text
                    x={10}
                    y={60}
                    fill="#e2e8f0"
                    fontSize="9.5"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    dst: {(comp.targetPartType || 'UNMAPPED').slice(0, 22)}
                  </text>
                  <text
                    x={10}
                    y={80}
                    fill="#64748b"
                    fontSize="9"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    XY: ({comp.layout.x}, {comp.layout.y}) · ROT: {comp.layout.rotation}°
                  </text>
                </g>
              );
            })}

            {/* Layer 3: Foreground Wire Pin Callout Badges */}
            {computedWireGeometry.map(({ conn, badgeX, badgeY }) => {
              const isHighlighted =
                hoveredConnectionId === conn.id ||
                selectedConnectionId === conn.id ||
                hoveredComponentId === conn.from.componentId ||
                hoveredComponentId === conn.to.componentId;

              return (
                <g
                  key={`badge-${conn.id}`}
                  onMouseEnter={() => setHoveredConnectionId(conn.id)}
                  onMouseLeave={() => setHoveredConnectionId(null)}
                  onClick={() => {
                    setSelectedConnectionId(conn.id);
                    setSelectedComponentId(null);
                  }}
                  className="cursor-pointer"
                >
                  <rect
                    x={badgeX - 70}
                    y={badgeY - 11}
                    width={140}
                    height={20}
                    rx={4}
                    fill="#0b0f19"
                    stroke={isHighlighted ? '#22d3ee' : '#475569'}
                    strokeWidth={1.2}
                  />
                  <text
                    x={badgeX}
                    y={badgeY + 2.5}
                    textAnchor="middle"
                    fill="#f8fafc"
                    fontSize="9.5"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {`${conn.from.componentId}:${conn.from.targetPinId || conn.from.sourcePinId} ↔ ${conn.to.componentId}:${conn.to.targetPinId || conn.to.sourcePinId}`}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Right 4 Cols: Live Selected Element Telemetry Drawer */}
        <div className="lg:col-span-4 bg-slate-900 text-slate-100 p-5 flex flex-col justify-between space-y-4">
          {activeConnection ? (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-cyan-400">
                  Selected Electrical Net
                </div>
                <h5 className="text-base font-bold font-mono text-white mt-1">
                  {activeConnection.from.componentId}:
                  {activeConnection.from.targetPinId || activeConnection.from.sourcePinId} ↔{' '}
                  {activeConnection.to.componentId}:
                  {activeConnection.to.targetPinId || activeConnection.to.sourcePinId}
                </h5>
              </div>

              <div className="border-t border-slate-800 pt-3 space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400">Endpoint A:</span>
                  <span className="text-slate-100">
                    {activeConnection.from.componentLabel} ({activeConnection.from.sourcePinId} →{' '}
                    {activeConnection.from.targetPinId ?? 'UNMAPPED'})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Endpoint B:</span>
                  <span className="text-slate-100">
                    {activeConnection.to.componentLabel} ({activeConnection.to.sourcePinId} →{' '}
                    {activeConnection.to.targetPinId ?? 'UNMAPPED'})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Wire Color:</span>
                  <span className="text-slate-100">{activeConnection.wireColor}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span className="text-cyan-300">{activeConnection.status}</span>
                </div>
                {activeConnection.resolvedViaNet && (
                  <div className="pt-2 text-slate-300 font-sans">
                    Net Path: {activeConnection.resolvedViaNet}
                  </div>
                )}
              </div>
            </div>
          ) : activeComponent ? (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-cyan-400">
                  Active Component Node
                </div>
                <h5 className="text-base font-bold text-white mt-0.5">
                  {activeComponent.label}{' '}
                  <span className="font-mono text-sm text-slate-400">({activeComponent.id})</span>
                </h5>
                <div className="text-xs font-mono text-slate-400 mt-0.5">
                  Source ID: {activeComponent.sourceId} · Status: {activeComponent.mappingStatus}
                </div>
              </div>

              <div className="border-t border-slate-800 pt-3 space-y-1.5 text-xs font-mono">
                <div className="text-slate-400">Source Part Type:</div>
                <div className="text-slate-100 break-all">{activeComponent.sourcePartType}</div>
                <div className="text-slate-400 pt-1">Mapped Target Type:</div>
                <div className="text-cyan-300 break-all">
                  {activeComponent.targetPartType ?? 'UNMAPPED'}
                </div>
                <div className="text-slate-400 pt-1">Canvas Coordinates:</div>
                <div className="text-slate-200 tabular-nums">
                  X: {activeComponent.layout.x} px · Y: {activeComponent.layout.y} px · Rot:{' '}
                  {activeComponent.layout.rotation}°
                </div>
              </div>

              <div className="border-t border-slate-800 pt-3">
                <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">
                  Attached Signal Nets ({attachedConnectionsForActiveComp.length})
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {attachedConnectionsForActiveComp.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedConnectionId(c.id)}
                      className="w-full text-left px-2.5 py-1.5 rounded bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 text-xs font-mono flex items-center justify-between gap-2"
                    >
                      <span className="text-slate-200 truncate">
                        {c.from.componentId}:{c.from.targetPinId || c.from.sourcePinId} ↔{' '}
                        {c.to.componentId}:{c.to.targetPinId || c.to.sourcePinId}
                      </span>
                      <span className="text-cyan-400 shrink-0">{c.wireColor}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400 tabular-nums">
            <span>{components.length} NODES</span>
            <span>·</span>
            <span>{connections.length} NETS</span>
            <span>·</span>
            <span>SCALE {Math.round(zoom * 100)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};

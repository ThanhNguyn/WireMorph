import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Copy,
  Download,
  FileCode2,
  FileText,
  FolderArchive,
  RotateCcw,
  Search,
  XCircle,
} from 'lucide-react';
import {
  ConversionOutcomeStatus,
  ConversionResult,
  DiagnosticCategory,
} from '../packages/conversion-core/types';
import { formatConversionReportMarkdown } from '../packages/conversion-core/pipeline';
import { downloadBinaryFile, downloadTextFile, formatBytes } from '../utils/download';
import { CircuitTopologyCanvas } from './CircuitTopologyCanvas';

interface ConversionPreviewPanelProps {
  result: ConversionResult;
  onReset: () => void;
  onRoundTripConvert: (result: ConversionResult) => void;
}

type PreviewTab = 'connections' | 'components' | 'diagnostics' | 'topology' | 'output';

function renderOutcomeLabel(status: ConversionOutcomeStatus): React.ReactNode {
  switch (status) {
    case 'preserved':
      return (
        <span className="font-mono text-xs font-medium text-emerald-700">
          ● Nominal · Preserved
        </span>
      );
    case 'transformed':
      return (
        <span className="font-mono text-xs font-medium text-blue-700">
          ◆ Mapped · Transformed
        </span>
      );
    case 'approximated':
      return (
        <span className="font-mono text-xs font-medium text-amber-700">
          ▲ Approximated
        </span>
      );
    case 'unsupported':
      return (
        <span className="font-mono text-xs font-medium text-amber-800">
          ▲ Unsupported
        </span>
      );
    case 'rejected':
      return (
        <span className="font-mono text-xs font-medium text-rose-700">
          ✖ Rejected (Error)
        </span>
      );
  }
}

export const ConversionPreviewPanel: React.FC<ConversionPreviewPanelProps> = ({
  result,
  onReset,
  onRoundTripConvert,
}) => {
  const { circuit, report, wokwiJsonString, fritzingArchiveBytes, fritzingFzXmlString } = result;

  const [activeTab, setActiveTab] = useState<PreviewTab>(
    report.metrics.errorsCount > 0 ? 'diagnostics' : 'connections'
  );
  const [connFilter, setConnFilter] = useState<'all' | 'mapped' | 'issues'>('all');
  const [connSearch, setConnSearch] = useState('');
  const [diagFilter, setDiagFilter] = useState<'all' | DiagnosticCategory>('all');
  const [copiedCode, setCopiedCode] = useState(false);

  const filteredConnections = useMemo(() => {
    return circuit.connections.filter((conn) => {
      if (connFilter === 'mapped' && conn.status !== 'preserved' && conn.status !== 'transformed') {
        return false;
      }
      if (
        connFilter === 'issues' &&
        conn.status !== 'unsupported' &&
        conn.status !== 'rejected' &&
        conn.status !== 'approximated'
      ) {
        return false;
      }
      if (connSearch.trim()) {
        const q = connSearch.trim().toLowerCase();
        const hay = `${conn.from.componentLabel} ${conn.from.componentId} ${conn.from.sourcePinId} ${conn.from.targetPinId ?? ''} ${conn.to.componentLabel} ${conn.to.componentId} ${conn.to.sourcePinId} ${conn.to.targetPinId ?? ''} ${conn.status}`.toLowerCase();
        return hay.includes(q);
      }
      return true;
    });
  }, [circuit.connections, connFilter, connSearch]);

  const filteredDiagnostics = useMemo(() => {
    return report.diagnostics.filter((d) =>
      diagFilter === 'all' ? true : d.category === diagFilter
    );
  }, [report.diagnostics, diagFilter]);

  const handleDownloadWokwiJson = () => {
    if (!wokwiJsonString || !report.canExportSafely) return;
    downloadTextFile(wokwiJsonString, 'diagram.json', 'application/json;charset=utf-8');
  };

  const handleDownloadFritzingFzz = () => {
    if (!fritzingArchiveBytes || !report.canExportSafely) return;
    const baseName = circuit.title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'wiremorph_project';
    downloadBinaryFile(fritzingArchiveBytes, `${baseName}.fzz`, 'application/zip');
  };

  const handleDownloadFritzingXml = () => {
    if (!fritzingFzXmlString || !report.canExportSafely) return;
    const baseName = circuit.title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'wiremorph_sketch';
    downloadTextFile(fritzingFzXmlString, `${baseName}.fz`, 'application/xml;charset=utf-8');
  };

  const handleDownloadReportMarkdown = () => {
    const md = formatConversionReportMarkdown(result);
    const baseName = circuit.title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'conversion';
    downloadTextFile(md, `${baseName}_conversion_report.md`, 'text/markdown;charset=utf-8');
  };

  const handleDownloadReportJson = () => {
    const json = JSON.stringify(report, null, 2);
    const baseName = circuit.title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'conversion';
    downloadTextFile(json, `${baseName}_conversion_report.json`, 'application/json;charset=utf-8');
  };

  const handleCopyOutput = async () => {
    const text = wokwiJsonString || fritzingFzXmlString || '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  return (
    <div className="space-y-6">
      {/* Instrument Console Header + Precision Telemetry Readout */}
      <div className="border border-slate-200 bg-white rounded-lg overflow-hidden">
        {/* Obsidian Top Status & Export Action Bar */}
        <div className="bg-[#0B0F19] text-white p-6 border-b border-slate-800">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
                <span className="text-cyan-400">{report.inputFileName}</span>
                <span aria-hidden="true">·</span>
                <span>{formatBytes(report.inputFileSizeBytes)}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {report.inputFormat === 'fritzing'
                    ? 'FRITZING (.FZZ) → WOKWI (DIAGRAM.JSON)'
                    : 'WOKWI (DIAGRAM.JSON) → FRITZING (.FZZ)'}
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                {report.overallStatus === 'success' && (
                  <CheckCircle2
                    className="w-5 h-5 text-emerald-400 shrink-0"
                    aria-hidden="true"
                  />
                )}
                {report.overallStatus === 'completed-with-warnings' && (
                  <AlertTriangle
                    className="w-5 h-5 text-amber-400 shrink-0"
                    aria-hidden="true"
                  />
                )}
                {report.overallStatus === 'rejected' && (
                  <XCircle className="w-5 h-5 text-rose-400 shrink-0" aria-hidden="true" />
                )}
                <h2 className="text-xl font-bold tracking-tight text-white">
                  {report.overallStatus === 'success' &&
                    'Conversion Verified — Ready for Local Export'}
                  {report.overallStatus === 'completed-with-warnings' &&
                    'Conversion Completed with Approximations / Unsupported Elements'}
                  {report.overallStatus === 'rejected' &&
                    'Conversion Blocked by Safety Gate — Review Errors Below'}
                </h2>
              </div>
            </div>

            {/* Export & Round-Trip Controls */}
            <div className="flex flex-wrap items-center gap-2.5">
              {report.outputFormat === 'wokwi' && (
                <button
                  type="button"
                  onClick={handleDownloadWokwiJson}
                  disabled={!report.canExportSafely || !wokwiJsonString}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                  Download diagram.json
                </button>
              )}

              {report.outputFormat === 'fritzing' && (
                <>
                  <button
                    type="button"
                    onClick={handleDownloadFritzingFzz}
                    disabled={!report.canExportSafely || !fritzingArchiveBytes}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
                  >
                    <FolderArchive className="w-4 h-4" aria-hidden="true" />
                    Download .fzz Archive
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadFritzingXml}
                    disabled={!report.canExportSafely || !fritzingFzXmlString}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded-md hover:bg-slate-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    <FileCode2 className="w-4 h-4" aria-hidden="true" />
                    Download .fz XML
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={handleDownloadReportMarkdown}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded-md hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                <FileText className="w-4 h-4" aria-hidden="true" />
                Report (.md)
              </button>

              <button
                type="button"
                onClick={handleDownloadReportJson}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded-md hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                <FileCode2 className="w-4 h-4" aria-hidden="true" />
                Report (.json)
              </button>

              {report.canExportSafely && (
                <button
                  type="button"
                  onClick={() => onRoundTripConvert(result)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-cyan-300 bg-cyan-950/80 border border-cyan-800 rounded-md hover:bg-cyan-900 transition-colors whitespace-nowrap shrink-0"
                >
                  <ArrowLeftRight className="w-4 h-4" aria-hidden="true" />
                  Verify Reverse Round-Trip
                </button>
              )}

              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-300 bg-transparent border border-slate-700 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                Select Another File
              </button>
            </div>
          </div>
        </div>

        {/* 6-Cell Precision Telemetry Readout Grid (Tabular Numerals + Separated Units) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 bg-white">
          <div className="p-4">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
              Components Detected
            </div>
            <div className="mt-1 flex items-baseline">
              <span className="text-2xl font-mono font-bold tabular-nums text-slate-900">
                {report.metrics.totalComponentsDetected}
              </span>
              <span className="text-xs font-mono text-slate-400 ml-1.5">nodes</span>
            </div>
          </div>

          <div className="p-4">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
              Mapped & Verified
            </div>
            <div className="mt-1 flex items-baseline">
              <span className="text-2xl font-mono font-bold tabular-nums text-emerald-700">
                {report.metrics.componentsMapped + report.metrics.componentsApproximated}
              </span>
              <span className="text-xs font-mono text-slate-400 ml-1.5">verified</span>
            </div>
          </div>

          <div className="p-4">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
              Unsupported Parts
            </div>
            <div className="mt-1 flex items-baseline">
              <span className="text-2xl font-mono font-bold tabular-nums text-amber-700">
                {report.metrics.componentsUnsupported}
              </span>
              <span className="text-xs font-mono text-slate-400 ml-1.5">unmapped</span>
            </div>
          </div>

          <div className="p-4">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
              Connections Preserved
            </div>
            <div className="mt-1 flex items-baseline">
              <span className="text-2xl font-mono font-bold tabular-nums text-blue-700">
                {report.metrics.connectionsPreserved + report.metrics.connectionsApproximated}
              </span>
              <span className="text-xs font-mono text-slate-400 ml-1.5">
                / {report.metrics.totalConnectionsDetected} nets
              </span>
            </div>
          </div>

          <div className="p-4">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
              Warnings & Losses
            </div>
            <div className="mt-1 flex items-baseline">
              <span className="text-2xl font-mono font-bold tabular-nums text-amber-700">
                {report.metrics.warningsCount + report.metrics.unsupportedCount}
              </span>
              <span className="text-xs font-mono text-slate-400 ml-1.5">notices</span>
            </div>
          </div>

          <div className="p-4">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500">
              Blocking Errors
            </div>
            <div className="mt-1 flex items-baseline">
              <span
                className={`text-2xl font-mono font-bold tabular-nums ${
                  report.metrics.errorsCount > 0 ? 'text-rose-600' : 'text-slate-900'
                }`}
              >
                {report.metrics.errorsCount}
              </span>
              <span className="text-xs font-mono text-slate-400 ml-1.5">halts</span>
            </div>
          </div>
        </div>
      </div>

      {/* Segmented Inspection Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div
          className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/80 rounded-lg"
          role="tablist"
          aria-label="Conversion inspection views"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'connections'}
            onClick={() => setActiveTab('connections')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums ${
              activeTab === 'connections'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Connections & Pins ({circuit.connections.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'components'}
            onClick={() => setActiveTab('components')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums ${
              activeTab === 'components'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Components & Properties ({circuit.components.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'diagnostics'}
            onClick={() => setActiveTab('diagnostics')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums ${
              activeTab === 'diagnostics'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Diagnostics & Losses ({report.diagnostics.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'topology'}
            onClick={() => setActiveTab('topology')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'topology'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Visual Netlist Map
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'output'}
            onClick={() => setActiveTab('output')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'output'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Generated File & Archive Inspector
          </button>
        </div>
      </div>

      {/* TAB 1: CONNECTIONS & PIN MAPPINGS TABLE */}
      {activeTab === 'connections' && (
        <div className="border border-slate-200 bg-white rounded-lg overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/70">
            <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-md">
              <button
                type="button"
                onClick={() => setConnFilter('all')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  connFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Nets ({circuit.connections.length})
              </button>
              <button
                type="button"
                onClick={() => setConnFilter('mapped')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  connFilter === 'mapped'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Mapped ({report.metrics.connectionsPreserved})
              </button>
              <button
                type="button"
                onClick={() => setConnFilter('issues')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  connFilter === 'issues'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Approximated / Unresolved (
                {report.metrics.connectionsApproximated + report.metrics.connectionsUnsupported})
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <label htmlFor="connection-search-input" className="sr-only">
                Filter connections by component or pin
              </label>
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                id="connection-search-input"
                type="text"
                value={connSearch}
                onChange={(e) => setConnSearch(e.target.value)}
                placeholder="Filter by component or pin..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          {filteredConnections.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-600">
              No electrical connections match the selected filter criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
                    <th className="py-2.5 px-4">Component A</th>
                    <th className="py-2.5 px-4">Pin A (Source → Target)</th>
                    <th className="py-2.5 px-4">Component B</th>
                    <th className="py-2.5 px-4">Pin B (Source → Target)</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Net / Routing Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {filteredConnections.map((conn) => (
                    <tr key={conn.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                        {conn.from.componentLabel}{' '}
                        <span className="font-mono text-slate-500">({conn.from.componentId})</span>
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-800 whitespace-nowrap">
                        <span>{conn.from.pinDisplayName}</span>
                        <span className="text-slate-400 mx-1.5">·</span>
                        <span className="text-slate-600">
                          {conn.from.sourcePinId} → {conn.from.targetPinId ?? 'UNRESOLVED'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                        {conn.to.componentLabel}{' '}
                        <span className="font-mono text-slate-500">({conn.to.componentId})</span>
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-800 whitespace-nowrap">
                        <span>{conn.to.pinDisplayName}</span>
                        <span className="text-slate-400 mx-1.5">·</span>
                        <span className="text-slate-600">
                          {conn.to.sourcePinId} → {conn.to.targetPinId ?? 'UNRESOLVED'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {renderOutcomeLabel(conn.status)}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">
                        {conn.statusNote || conn.resolvedViaNet || `Wire color: ${conn.wireColor}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: DETECTED COMPONENTS & PROPERTY TRANSFORMATIONS */}
      {activeTab === 'components' && (
        <div className="space-y-6">
          <div className="border border-slate-200 bg-white rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70">
              <h3 className="text-sm font-semibold text-slate-900">
                Detected Components & Target Part Mappings
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
                    <th className="py-2.5 px-4">Target ID</th>
                    <th className="py-2.5 px-4">Source ID</th>
                    <th className="py-2.5 px-4">Instance Title</th>
                    <th className="py-2.5 px-4">Source Part Identifier</th>
                    <th className="py-2.5 px-4">Mapped Target Part</th>
                    <th className="py-2.5 px-4">Layout (X, Y, Rot)</th>
                    <th className="py-2.5 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {circuit.components.map((comp) => (
                    <tr key={comp.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">
                        {comp.id}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-600">
                        {comp.sourceId}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-slate-900">{comp.label}</td>
                      <td className="py-2.5 px-4 font-mono text-slate-700">
                        {comp.sourcePartType}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-slate-900">
                        {comp.targetPartType ?? (
                          <span className="text-amber-700">No Verified Mapping</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        ({comp.layout.x}, {comp.layout.y}) · {comp.layout.rotation}°
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {renderOutcomeLabel(comp.mappingStatus)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Property Transformation Audit Table */}
          <div className="border border-slate-200 bg-white rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70">
              <h3 className="text-sm font-semibold text-slate-900">
                Component Property & Attribute Transformations
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Documents how component parameters (resistance values, LED wavelengths, simulation attributes) were normalized or omitted.
              </p>
            </div>
            {report.propertyTransformations.length === 0 ? (
              <div className="p-6 text-xs text-slate-600">
                No component property transformations were required for this circuit.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
                      <th className="py-2.5 px-4">Component</th>
                      <th className="py-2.5 px-4">Source Property</th>
                      <th className="py-2.5 px-4">Source Value</th>
                      <th className="py-2.5 px-4">Target Attribute</th>
                      <th className="py-2.5 px-4">Target Value</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4">Engineering Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {report.propertyTransformations.map((pt, idx) => (
                      <tr key={`${pt.componentId}-${pt.sourceProperty}-${idx}`}>
                        <td className="py-2.5 px-4 font-medium text-slate-900">
                          {pt.componentLabel}{' '}
                          <span className="font-mono text-slate-500">({pt.componentId})</span>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-700">
                          {pt.sourceProperty}
                        </td>
                        <td className="py-2.5 px-4 font-mono tabular-nums text-slate-800">
                          {pt.sourceValue}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-700">
                          {pt.targetProperty}
                        </td>
                        <td className="py-2.5 px-4 font-mono tabular-nums text-slate-900 font-medium">
                          {pt.targetValue}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-700">{pt.status}</td>
                        <td className="py-2.5 px-4 text-slate-600">{pt.note ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: DIAGNOSTICS & CONVERSION LOSS REPORT */}
      {activeTab === 'diagnostics' && (
        <div className="space-y-6">
          <div className="border border-slate-200 bg-white rounded-lg overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
              <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-md">
                <button
                  type="button"
                  onClick={() => setDiagFilter('all')}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                    diagFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({report.diagnostics.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDiagFilter('error')}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                    diagFilter === 'error'
                      ? 'bg-white text-rose-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Errors ({report.metrics.errorsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setDiagFilter('warning')}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                    diagFilter === 'warning'
                      ? 'bg-white text-amber-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Warnings ({report.metrics.warningsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setDiagFilter('unsupported')}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                    diagFilter === 'unsupported'
                      ? 'bg-white text-amber-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Unsupported ({report.metrics.unsupportedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setDiagFilter('info')}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                    diagFilter === 'info'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Informational ({report.metrics.infoCount})
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-200">
              {filteredDiagnostics.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-600">
                  No diagnostics in this category.
                </div>
              ) : (
                filteredDiagnostics.map((diag) => (
                  <div key={diag.id} className="p-4 hover:bg-slate-50/70 transition-colors">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                      <span
                        className={`font-semibold ${
                          diag.category === 'error'
                            ? 'text-rose-700'
                            : diag.category === 'warning'
                              ? 'text-amber-700'
                              : diag.category === 'unsupported'
                                ? 'text-amber-800'
                                : 'text-blue-700'
                        }`}
                      >
                        [{diag.category.toUpperCase()}]
                      </span>
                      <span className="text-slate-700">{diag.code}</span>
                      {diag.sourceIdentifier && (
                        <>
                          <span aria-hidden="true" className="text-slate-400">
                            ·
                          </span>
                          <span className="text-slate-600">source: {diag.sourceIdentifier}</span>
                        </>
                      )}
                      {diag.pinReference && (
                        <>
                          <span aria-hidden="true" className="text-slate-400">
                            ·
                          </span>
                          <span className="text-slate-600">pin: {diag.pinReference}</span>
                        </>
                      )}
                    </div>
                    <h4 className="text-sm font-semibold text-slate-900 mt-1">{diag.title}</h4>
                    <p className="text-xs text-slate-700 mt-1 leading-relaxed">{diag.message}</p>
                    {diag.remediation && (
                      <p className="text-xs text-slate-600 mt-1.5 font-medium">
                        Recommended Action: {diag.remediation}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Omitted / Format-Difference Metadata */}
          <div className="border border-slate-200 bg-white rounded-lg p-4">
            <h4 className="text-sm font-semibold text-slate-900">
              Format Representation Differences & Omitted Metadata
            </h4>
            <ul className="mt-2 space-y-1.5 text-xs text-slate-700 list-disc list-inside">
              {report.omittedMetadata.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* TAB 4: VISUAL TOPOLOGY CANVAS */}
      {activeTab === 'topology' && <CircuitTopologyCanvas circuit={circuit} />}

      {/* TAB 5: GENERATED FILE & ARCHIVE INSPECTOR */}
      {activeTab === 'output' && (
        <div className="space-y-6">
          {result.archiveFileInventory && result.archiveFileInventory.length > 0 && (
            <div className="border border-slate-200 bg-white rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70">
                <h4 className="text-sm font-semibold text-slate-900">
                  Fritzing .fzz ZIP Container File Inventory ({result.archiveFileInventory.length}{' '}
                  entries)
                </h4>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
                      <th className="py-2 px-4">Archive Entry Path</th>
                      <th className="py-2 px-4">Role</th>
                      <th className="py-2 px-4 text-right">Uncompressed Size</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs font-mono tabular-nums">
                    {result.archiveFileInventory.map((entry) => (
                      <tr key={entry.path}>
                        <td className="py-2 px-4 text-slate-900">{entry.path}</td>
                        <td className="py-2 px-4 text-slate-600">
                          {entry.path.endsWith('.fz')
                            ? 'Primary Fritzing XML Sketch'
                            : entry.path.endsWith('.fzp')
                              ? 'Embedded Part Metadata Definition'
                              : entry.path.endsWith('.svg')
                                ? 'Breadboard Vector Graphic'
                                : 'Archive Resource'}
                        </td>
                        <td className="py-2 px-4 text-right text-slate-700">
                          {formatBytes(entry.sizeBytes)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="border border-slate-200 bg-white rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">
                  {report.outputFormat === 'wokwi'
                    ? 'Generated Wokwi diagram.json Output'
                    : 'Generated Fritzing Internal Sketch (.fz XML)'}
                </h4>
              </div>
              {(wokwiJsonString || fritzingFzXmlString) && (
                <button
                  type="button"
                  onClick={handleCopyOutput}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  {copiedCode ? 'Copied to Clipboard' : 'Copy Code'}
                </button>
              )}
            </div>
            {report.canExportSafely && (wokwiJsonString || fritzingFzXmlString) ? (
              <pre className="p-4 bg-[#07090E] text-slate-100 text-xs font-mono overflow-x-auto max-h-[480px] leading-relaxed">
                <code>{wokwiJsonString || fritzingFzXmlString}</code>
              </pre>
            ) : (
              <div className="p-8 text-center text-sm text-rose-700 bg-rose-50/40">
                Code generation was blocked because conversion validation detected blocking errors. Inspect the Diagnostics tab to resolve the errors.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

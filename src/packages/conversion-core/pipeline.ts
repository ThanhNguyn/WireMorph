import {
  ConversionDirection,
  ConversionReport,
  ConversionResult,
  ConversionSummaryMetrics,
  IRCircuit,
} from './types';
import { importFritzingArchive } from '../fritzing-adapter/importer';
import { exportCircuitToFritzingArchive } from '../fritzing-adapter/exporter';
import { importWokwiDiagram } from '../wokwi-adapter/importer';
import { exportCircuitToWokwiJson } from '../wokwi-adapter/exporter';

/**
 * Computes summary metrics and safety evaluation for an `IRCircuit`.
 */
export function buildConversionReport(
  circuit: IRCircuit,
  direction: ConversionDirection
): ConversionReport {
  const totalComponentsDetected = circuit.components.length;
  const componentsMapped = circuit.components.filter(
    (c) => c.mappingStatus === 'preserved' || c.mappingStatus === 'transformed'
  ).length;
  const componentsApproximated = circuit.components.filter(
    (c) => c.mappingStatus === 'approximated'
  ).length;
  const componentsUnsupported = circuit.components.filter(
    (c) => c.mappingStatus === 'unsupported' || c.mappingStatus === 'rejected'
  ).length;

  const totalConnectionsDetected = circuit.connections.length;
  const connectionsPreserved = circuit.connections.filter(
    (c) => c.status === 'preserved' || c.status === 'transformed'
  ).length;
  const connectionsApproximated = circuit.connections.filter(
    (c) => c.status === 'approximated'
  ).length;
  const connectionsUnsupported = circuit.connections.filter(
    (c) => c.status === 'unsupported' || c.status === 'rejected'
  ).length;

  const errorsCount = circuit.diagnostics.filter((d) => d.category === 'error').length;
  const warningsCount = circuit.diagnostics.filter((d) => d.category === 'warning').length;
  const unsupportedCount = circuit.diagnostics.filter((d) => d.category === 'unsupported').length;
  const infoCount = circuit.diagnostics.filter((d) => d.category === 'info').length;

  const usableComponentsCount = componentsMapped + componentsApproximated;
  if (totalComponentsDetected > 0 && usableComponentsCount === 0 && errorsCount === 0) {
    circuit.diagnostics.push({
      id: 'diag-zero-mapped-components',
      category: 'error',
      code: 'ERR_NO_SUPPORTED_COMPONENTS',
      title: 'Zero Supported Components Available for Export',
      message:
        'None of the detected components in the input circuit have verified mappings in the target format. Export is blocked to prevent generating an empty diagram.',
      remediation: 'Inspect the Unsupported Items list and verify part compatibility in the Part Registry.',
    });
  }

  const finalErrorsCount = circuit.diagnostics.filter((d) => d.category === 'error').length;
  const canExportSafely = finalErrorsCount === 0 && usableComponentsCount > 0;

  let overallStatus: ConversionReport['overallStatus'] = 'success';
  if (!canExportSafely) {
    overallStatus = 'rejected';
  } else if (
    warningsCount > 0 ||
    unsupportedCount > 0 ||
    componentsApproximated > 0 ||
    connectionsApproximated > 0
  ) {
    overallStatus = 'completed-with-warnings';
  }

  const omittedMetadata: string[] = [];
  if (direction === 'fritzing-to-wokwi') {
    omittedMetadata.push(
      'Fritzing PCB copper trace geometry and schematic symbol coordinates (Wokwi uses a single unified simulation canvas).'
    );
    for (const pt of circuit.propertyTransformations) {
      if (pt.status === 'omitted') {
        omittedMetadata.push(
          `${pt.componentLabel} (${pt.componentId}): omitted Fritzing property "${pt.sourceProperty}=${pt.sourceValue}".`
        );
      }
    }
  } else {
    omittedMetadata.push(
      'Wokwi orthogonal wire routing bend vectors (approximated as point-to-point Fritzing breadboard wires).'
    );
    for (const pt of circuit.propertyTransformations) {
      if (pt.status === 'omitted') {
        omittedMetadata.push(
          `${pt.componentLabel} (${pt.componentId}): omitted Wokwi simulation attribute "${pt.sourceProperty}=${pt.sourceValue}".`
        );
      }
    }
  }

  const metrics: ConversionSummaryMetrics = {
    totalComponentsDetected,
    componentsMapped,
    componentsApproximated,
    componentsUnsupported,
    totalConnectionsDetected,
    connectionsPreserved,
    connectionsApproximated,
    connectionsUnsupported,
    propertyTransformationsCount: circuit.propertyTransformations.length,
    errorsCount: finalErrorsCount,
    warningsCount,
    unsupportedCount,
    infoCount,
  };

  return {
    timestampIso: new Date().toISOString(),
    direction,
    inputFormat: circuit.sourceFormat,
    outputFormat: circuit.targetFormat,
    inputFileName: circuit.sourceFileName,
    inputFileSizeBytes: circuit.sourceFileSizeBytes,
    overallStatus,
    canExportSafely,
    metrics,
    diagnostics: circuit.diagnostics,
    propertyTransformations: circuit.propertyTransformations,
    omittedMetadata,
  };
}

/**
 * Full end-to-end conversion: Fritzing `.fzz` archive → Intermediate Representation → Wokwi `diagram.json`
 */
export async function convertFritzingToWokwi(
  archiveBytes: Uint8Array | ArrayBuffer,
  fileName: string
): Promise<ConversionResult> {
  const { circuit, archiveFileInventory } = await importFritzingArchive(archiveBytes, fileName);
  const report = buildConversionReport(circuit, 'fritzing-to-wokwi');

  let wokwiJsonString: string | undefined;
  if (report.canExportSafely) {
    try {
      wokwiJsonString = exportCircuitToWokwiJson(circuit);
    } catch (err) {
      report.canExportSafely = false;
      report.overallStatus = 'rejected';
      report.diagnostics.push({
        id: 'diag-wokwi-export-failure',
        category: 'error',
        code: 'ERR_WOKWI_EXPORT_VALIDATION_FAILED',
        title: 'Generated Wokwi JSON Failed Post-Export Validation',
        message: err instanceof Error ? err.message : 'Unknown Wokwi export validation error',
      });
      report.metrics.errorsCount += 1;
    }
  }

  return {
    circuit,
    report,
    wokwiJsonString,
    archiveFileInventory,
  };
}

/**
 * Full end-to-end conversion: Wokwi `diagram.json` → Intermediate Representation → Fritzing `.fzz` archive
 */
export async function convertWokwiToFritzing(
  jsonText: string,
  fileName: string,
  byteLength?: number
): Promise<ConversionResult> {
  const circuit = importWokwiDiagram(jsonText, fileName, byteLength);
  const report = buildConversionReport(circuit, 'wokwi-to-fritzing');

  let fritzingArchiveBytes: Uint8Array | undefined;
  let fritzingFzXmlString: string | undefined;
  let archiveFileInventory: Array<{ path: string; sizeBytes: number }> | undefined;

  if (report.canExportSafely) {
    try {
      const exported = await exportCircuitToFritzingArchive(circuit);
      fritzingArchiveBytes = exported.archiveBytes;
      fritzingFzXmlString = exported.fzXmlString;
      archiveFileInventory = exported.archiveFileInventory;
    } catch (err) {
      report.canExportSafely = false;
      report.overallStatus = 'rejected';
      report.diagnostics.push({
        id: 'diag-fritzing-export-failure',
        category: 'error',
        code: 'ERR_FRITZING_EXPORT_VALIDATION_FAILED',
        title: 'Generated Fritzing .fzz Archive Failed Validation',
        message: err instanceof Error ? err.message : 'Unknown Fritzing export validation error',
      });
      report.metrics.errorsCount += 1;
    }
  }

  return {
    circuit,
    report,
    fritzingArchiveBytes,
    fritzingFzXmlString,
    archiveFileInventory,
  };
}

/**
 * Formats a human-readable Markdown conversion report for engineering documentation and audit trails.
 */
export function formatConversionReportMarkdown(result: ConversionResult): string {
  const { report, circuit } = result;
  const lines: string[] = [
    `# WireMorph Conversion Report`,
    ``,
    `- **Input File**: \`${report.inputFileName}\` (${report.inputFileSizeBytes} bytes)`,
    `- **Direction**: \`${report.inputFormat.toUpperCase()} → ${report.outputFormat.toUpperCase()}\``,
    `- **Status**: \`${report.overallStatus.toUpperCase()}\``,
    `- **Export Safe**: \`${report.canExportSafely ? 'YES' : 'NO'}\``,
    `- **Generated**: ${report.timestampIso}`,
    ``,
    `## 1. Summary Metrics`,
    ``,
    `| Metric | Count |`,
    `|---|---|`,
    `| Total Components Detected | ${report.metrics.totalComponentsDetected} |`,
    `| Components Preserved / Transformed | ${report.metrics.componentsMapped} |`,
    `| Components Approximated | ${report.metrics.componentsApproximated} |`,
    `| Components Unsupported | ${report.metrics.componentsUnsupported} |`,
    `| Total Connections Detected | ${report.metrics.totalConnectionsDetected} |`,
    `| Connections Preserved / Transformed | ${report.metrics.connectionsPreserved} |`,
    `| Connections Approximated | ${report.metrics.connectionsApproximated} |`,
    `| Connections Unsupported / Rejected | ${report.metrics.connectionsUnsupported} |`,
    `| Errors | ${report.metrics.errorsCount} |`,
    `| Warnings | ${report.metrics.warningsCount} |`,
    ``,
    `## 2. Component Mapping Inventory`,
    ``,
    `| Internal ID | Source ID | Label | Source Type | Target Type | Status |`,
    `|---|---|---|---|---|---|`,
    ...circuit.components.map(
      (c) =>
        `| \`${c.id}\` | \`${c.sourceId}\` | ${c.label} | \`${c.sourcePartType}\` | \`${c.targetPartType ?? 'UNMAPPED'}\` | ${c.mappingStatus} |`
    ),
    ``,
    `## 3. Electrical Connections & Pin Mappings`,
    ``,
    `| Component A | Pin A (Source → Target) | Component B | Pin B (Source → Target) | Status | Notes |`,
    `|---|---|---|---|---|---|`,
    ...circuit.connections.map(
      (conn) =>
        `| ${conn.from.componentLabel} (\`${conn.from.componentId}\`) | \`${conn.from.sourcePinId}\` → \`${conn.from.targetPinId ?? 'UNRESOLVED'}\` | ${conn.to.componentLabel} (\`${conn.to.componentId}\`) | \`${conn.to.sourcePinId}\` → \`${conn.to.targetPinId ?? 'UNRESOLVED'}\` | ${conn.status} | ${conn.statusNote ?? conn.resolvedViaNet ?? '-'} |`
    ),
    ``,
    `## 4. Diagnostics`,
    ``,
    ...report.diagnostics.map(
      (d) =>
        `- **[${d.category.toUpperCase()}] \`${d.code}\` — ${d.title}**: ${d.message}${
          d.remediation ? ` *(Remediation: ${d.remediation})*` : ''
        }`
    ),
    ``,
    `## 5. Omitted or Approximated Metadata`,
    ``,
    ...report.omittedMetadata.map((m) => `- ${m}`),
    ``,
  ];

  return lines.join('\n');
}

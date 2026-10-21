/**
 * WireMorph — Format-Independent Circuit Intermediate Representation (IR)
 * Models components, connectors, pins, electrical connections, layout geometry,
 * conversion loss annotations, and structured diagnostics.
 */

export type CircuitFormat = 'fritzing' | 'wokwi';

export type ConversionDirection = 'fritzing-to-wokwi' | 'wokwi-to-fritzing';

export type DiagnosticCategory = 'error' | 'warning' | 'unsupported' | 'info';

export type ConversionOutcomeStatus =
  | 'preserved'
  | 'transformed'
  | 'approximated'
  | 'unsupported'
  | 'rejected';

export interface ConversionDiagnostic {
  id: string;
  category: DiagnosticCategory;
  code: string;
  title: string;
  message: string;
  componentId?: string;
  sourceIdentifier?: string;
  pinReference?: string;
  remediation?: string;
}

export interface PropertyTransformationRecord {
  componentId: string;
  componentLabel: string;
  sourceProperty: string;
  sourceValue: string;
  targetProperty: string;
  targetValue: string;
  status: 'preserved' | 'transformed' | 'approximated' | 'omitted';
  note?: string;
}

export interface IRPin {
  /** Normalized canonical pin ID within the IR (e.g., "D2", "GND.1", "A", "C", "1", "2") */
  canonicalPinId: string;
  /** Original pin/connector identifier in source format (e.g., "connector27" or "D2") */
  sourcePinId: string;
  /** Human-readable pin name (e.g., "GPIO 2 (D2)", "Anode", "Terminal 1") */
  displayName: string;
  /** Electrical group for internally bridged pins (e.g., pushbutton 1.l == 1.r) */
  equivalenceGroup?: string;
}

export interface IRLayoutPosition {
  x: number;
  y: number;
  rotation: number;
  sourceView: 'breadboard' | 'schematic' | 'pcb' | 'wokwi-canvas' | 'synthesized';
  approximated: boolean;
}

export interface CustomPartAsset {
  fileName: string;
  assetType: 'fzp' | 'svg-breadboard' | 'svg-schematic' | 'svg-pcb';
  content: string;
}

export interface IRComponent {
  /** Stable internal identifier within the IR */
  id: string;
  /** Source format identifier (Fritzing modelIndex or Wokwi part id) */
  sourceId: string;
  /** Human-readable instance label or title (e.g., "ESP1", "LED1", "R1") */
  label: string;
  /** Canonical component family ID from part registry, or 'unmapped' */
  canonicalType: string;
  /** Source part reference (Fritzing moduleIdRef or Wokwi part type) */
  sourcePartType: string;
  /** Target part reference once mapped (Wokwi type or Fritzing moduleIdRef) */
  targetPartType?: string;
  /** Key-value properties extracted from source */
  sourceProperties: Record<string, string>;
  /** Transformed properties ready for target format */
  targetProperties: Record<string, string>;
  /** Available pins on this component */
  pins: Record<string, IRPin>;
  /** Layout coordinates and rotation */
  layout: IRLayoutPosition;
  /** Mapping status for this component */
  mappingStatus: ConversionOutcomeStatus;
  /** Notes explaining any approximation or unsupported reason */
  mappingNotes: string[];
}

export interface IRConnectionEndpoint {
  /** Internal IR component ID */
  componentId: string;
  /** Source component ID */
  sourceComponentId: string;
  /** Component display label */
  componentLabel: string;
  /** Source pin/connector ID */
  sourcePinId: string;
  /** Target mapped pin/connector ID */
  targetPinId?: string;
  /** Human-readable pin label */
  pinDisplayName: string;
}

export interface IRConnection {
  id: string;
  from: IRConnectionEndpoint;
  to: IRConnectionEndpoint;
  wireColor: string;
  /** Whether this connection traversed a breadboard strip or wire chain that was resolved */
  resolvedViaNet?: string;
  /** Routing path hints from source (if any) */
  routingHints?: string[];
  status: ConversionOutcomeStatus;
  statusNote?: string;
}

export interface IRCircuit {
  sourceFormat: CircuitFormat;
  targetFormat: CircuitFormat;
  sourceFileName: string;
  sourceFileSizeBytes: number;
  title: string;
  author?: string;
  fritzingVersion?: string;
  wokwiVersion?: number;
  components: IRComponent[];
  connections: IRConnection[];
  customAssets: CustomPartAsset[];
  propertyTransformations: PropertyTransformationRecord[];
  diagnostics: ConversionDiagnostic[];
}

export interface ConversionSummaryMetrics {
  totalComponentsDetected: number;
  componentsMapped: number;
  componentsApproximated: number;
  componentsUnsupported: number;
  totalConnectionsDetected: number;
  connectionsPreserved: number;
  connectionsApproximated: number;
  connectionsUnsupported: number;
  propertyTransformationsCount: number;
  errorsCount: number;
  warningsCount: number;
  unsupportedCount: number;
  infoCount: number;
}

export interface ConversionReport {
  timestampIso: string;
  direction: ConversionDirection;
  inputFormat: CircuitFormat;
  outputFormat: CircuitFormat;
  inputFileName: string;
  inputFileSizeBytes: number;
  overallStatus: 'success' | 'completed-with-warnings' | 'rejected';
  canExportSafely: boolean;
  metrics: ConversionSummaryMetrics;
  diagnostics: ConversionDiagnostic[];
  propertyTransformations: PropertyTransformationRecord[];
  omittedMetadata: string[];
}

export interface ConversionResult {
  circuit: IRCircuit;
  report: ConversionReport;
  /** Populated when converting to Wokwi and validation passes */
  wokwiJsonString?: string;
  /** Populated when converting to Fritzing and validation passes */
  fritzingArchiveBytes?: Uint8Array;
  /** Raw internal .fz XML string generated for Fritzing export inspection */
  fritzingFzXmlString?: string;
  /** List of files inside the Fritzing .fzz archive (imported or generated) */
  archiveFileInventory?: Array<{ path: string; sizeBytes: number }>;
}

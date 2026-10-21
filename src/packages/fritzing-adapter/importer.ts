import JSZip from 'jszip';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import {
  ConversionDiagnostic,
  CustomPartAsset,
  IRCircuit,
  IRComponent,
  IRConnection,
  IRPin,
  PropertyTransformationRecord,
} from '../conversion-core/types';
import {
  findMappingByFritzingModule,
  findPinByFritzingConnector,
  getBreadboardStripNetId,
  isFritzingBreadboardModule,
  isFritzingWireModule,
} from '../part-mappings/registry';

export const MAX_ARCHIVE_COMPRESSED_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 30 * 1024 * 1024; // 30 MB
export const MAX_ARCHIVE_ENTRIES = 250;

interface RawFritzingConnect {
  targetModelIndex: string;
  targetConnectorId: string;
  layer?: string;
}

interface RawFritzingInstance {
  modelIndex: string;
  moduleIdRef: string;
  path: string;
  title: string;
  properties: Record<string, string>;
  x: number;
  y: number;
  rotation: number;
  wireColor?: string;
  hasBreadboardView: boolean;
  hasSchematicOnlyConnections: boolean;
  connectors: Map<string, RawFritzingConnect[]>;
}

function asArray<T>(val: T | T[] | undefined | null): T[] {
  if (val === undefined || val === null) return [];
  return Array.isArray(val) ? val : [val];
}

function parseRotationFromMatrixOrAttr(geo: Record<string, unknown> | undefined): number {
  if (!geo) return 0;
  if (typeof geo['@_rotation'] === 'string' || typeof geo['@_rotation'] === 'number') {
    const r = Number(geo['@_rotation']);
    if (!Number.isNaN(r)) return r;
  }
  // Check <transform m11="..." m12="..." m21="..." m22="..."/>
  const tr = geo.transform as Record<string, unknown> | undefined;
  if (tr) {
    const m11 = Number(tr['@_m11'] ?? 1);
    const m12 = Number(tr['@_m12'] ?? 0);
    if (!Number.isNaN(m11) && !Number.isNaN(m12)) {
      const deg = Math.round((Math.atan2(m12, m11) * 180) / Math.PI);
      return ((deg % 360) + 360) % 360;
    }
  }
  return 0;
}

export interface FritzingImportResult {
  circuit: IRCircuit;
  archiveFileInventory: Array<{ path: string; sizeBytes: number }>;
}

/**
 * Parses a Fritzing `.fzz` ZIP archive (or raw `.fz` XML bytes for internal testing)
 * into the shared WireMorph Intermediate Representation (`IRCircuit`).
 */
export async function importFritzingArchive(
  inputBytes: Uint8Array | ArrayBuffer,
  fileName: string
): Promise<FritzingImportResult> {
  const bytes = inputBytes instanceof Uint8Array ? inputBytes : new Uint8Array(inputBytes);
  const diagnostics: ConversionDiagnostic[] = [];
  const customAssets: CustomPartAsset[] = [];
  const propertyTransformations: PropertyTransformationRecord[] = [];
  const archiveFileInventory: Array<{ path: string; sizeBytes: number }> = [];

  const createEmptyCircuit = (): IRCircuit => ({
    sourceFormat: 'fritzing',
    targetFormat: 'wokwi',
    sourceFileName: fileName,
    sourceFileSizeBytes: bytes.byteLength,
    title: fileName.replace(/\.(fzz|fz)$/i, ''),
    components: [],
    connections: [],
    customAssets,
    propertyTransformations,
    diagnostics,
  });

  if (bytes.byteLength === 0) {
    diagnostics.push({
      id: 'diag-empty-file',
      category: 'error',
      code: 'ERR_FRITZING_EMPTY_FILE',
      title: 'Empty Input File',
      message: `The uploaded file "${fileName}" contains 0 bytes.`,
      remediation: 'Export a non-empty .fzz archive from Fritzing (File → Save As... → Shareable .fzz).',
    });
    return { circuit: createEmptyCircuit(), archiveFileInventory };
  }

  if (bytes.byteLength > MAX_ARCHIVE_COMPRESSED_BYTES) {
    diagnostics.push({
      id: 'diag-file-too-large',
      category: 'error',
      code: 'ERR_FRITZING_ARCHIVE_SIZE_LIMIT',
      title: 'Archive Exceeds Maximum Safe Size',
      message: `File size (${(bytes.byteLength / (1024 * 1024)).toFixed(2)} MB) exceeds the 15 MB browser safety limit.`,
      remediation: 'Remove large unrelated binary attachments from the Fritzing archive before importing.',
    });
    return { circuit: createEmptyCircuit(), archiveFileInventory };
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (err) {
    diagnostics.push({
      id: 'diag-invalid-zip',
      category: 'error',
      code: 'ERR_FRITZING_INVALID_ZIP',
      title: 'Malformed or Corrupted .fzz ZIP Archive',
      message: `Could not open "${fileName}" as a valid ZIP archive (${err instanceof Error ? err.message : 'invalid header'}). Fritzing .fzz files are ZIP containers holding a .fz XML sketch.`,
      remediation: 'Verify that the file is a valid Fritzing .fzz archive and not a corrupted download or renamed text file.',
    });
    return { circuit: createEmptyCircuit(), archiveFileInventory };
  }

  const fileEntries = Object.values(zip.files).filter((entry) => !entry.dir);
  if (fileEntries.length > MAX_ARCHIVE_ENTRIES) {
    diagnostics.push({
      id: 'diag-zip-many-entries',
      category: 'error',
      code: 'ERR_FRITZING_ZIP_ENTRY_LIMIT',
      title: 'Archive Contains Too Many Entries',
      message: `Archive contains ${fileEntries.length} files, exceeding the safety threshold of ${MAX_ARCHIVE_ENTRIES} files.`,
      remediation: 'Inspect the archive for unintended nested folders or zip-bomb payloads.',
    });
    return { circuit: createEmptyCircuit(), archiveFileInventory };
  }

  // Check path traversal and find .fz sketch
  let fzEntry: JSZip.JSZipObject | undefined;
  let totalUncompressedBytes = 0;

  for (const entry of fileEntries) {
    if (entry.name.includes('..') || entry.name.startsWith('/')) {
      diagnostics.push({
        id: `diag-unsafe-path-${entry.name}`,
        category: 'error',
        code: 'ERR_FRITZING_UNSAFE_ARCHIVE_PATH',
        title: 'Unsafe Archive Path Detected',
        message: `Archive entry "${entry.name}" contains relative path traversal or root path characters.`,
        remediation: 'Repackage the .fzz archive using standard Fritzing export.',
      });
      return { circuit: createEmptyCircuit(), archiveFileInventory };
    }

    const contentBytes = await entry.async('uint8array');
    totalUncompressedBytes += contentBytes.byteLength;
    archiveFileInventory.push({ path: entry.name, sizeBytes: contentBytes.byteLength });

    if (totalUncompressedBytes > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
      diagnostics.push({
        id: 'diag-zip-uncompressed-limit',
        category: 'error',
        code: 'ERR_FRITZING_UNCOMPRESSED_LIMIT',
        title: 'Expanded Archive Exceeds Memory Safety Limit',
        message: `Expanded archive content exceeds ${MAX_ARCHIVE_UNCOMPRESSED_BYTES / (1024 * 1024)} MB.`,
        remediation: 'Use a standard Fritzing circuit sketch archive.',
      });
      return { circuit: createEmptyCircuit(), archiveFileInventory };
    }

    if (entry.name.toLowerCase().endsWith('.fz')) {
      fzEntry = entry;
    } else if (entry.name.toLowerCase().endsWith('.fzp')) {
      const fzpText = new TextDecoder('utf-8').decode(contentBytes);
      customAssets.push({
        fileName: entry.name,
        assetType: 'fzp',
        content: fzpText,
      });
    } else if (entry.name.toLowerCase().endsWith('.svg')) {
      const svgText = new TextDecoder('utf-8').decode(contentBytes);
      customAssets.push({
        fileName: entry.name,
        assetType: 'svg-breadboard',
        content: svgText,
      });
    }
  }

  // Parse custom .fzp part connector labels & descriptions if present
  const customConnectorNamesByModule = new Map<string, Map<string, string>>();
  const parsedCustomFzpModules: Array<{ moduleId: string; title: string; refFile: string }> = [];
  const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    allowBooleanAttributes: true,
  });

  for (const asset of customAssets) {
    if (asset.assetType === 'fzp') {
      const validFzp = XMLValidator.validate(asset.content);
      if (validFzp === true) {
        try {
          const parsedFzp = xmlParser.parse(asset.content);
          const mod = parsedFzp?.module;
          const modId = mod?.['@_moduleId'];
          if (typeof modId === 'string') {
            parsedCustomFzpModules.push({
              moduleId: modId,
              title: String(mod?.title || modId),
              refFile: String(mod?.['@_referenceFile'] || asset.fileName),
            });
            const connMap = new Map<string, string>();
            const rawConns = asArray(mod?.connectors?.connector);
            for (const rc of rawConns) {
              const cid = rc?.['@_id'];
              const cname = rc?.['@_name'];
              const cdesc = typeof rc?.description === 'string' || typeof rc?.description === 'number'
                ? String(rc.description).trim()
                : '';
              if (typeof cid === 'string') {
                // Prefer concise pin signal description (e.g., "3V3", "34", "GND") when name is generic "Pin N"
                if (cdesc && (!cname || /^pin\s*\d+$/i.test(String(cname).trim()))) {
                  connMap.set(cid, cdesc);
                } else if (typeof cname === 'string') {
                  connMap.set(cid, cname);
                }
              }
            }
            customConnectorNamesByModule.set(modId, connMap);
          }
        } catch {
          // Ignore non-critical custom fzp parse error; main sketch validation follows
        }
      }
    }
  }

  let fzXmlString = '';
  let fzSourceLabel = fzEntry?.name ?? fileName;

  if (!fzEntry) {
    if (parsedCustomFzpModules.length > 0) {
      // Standalone .fzpz custom Fritzing part archive (e.g. ESP32_DevKitc_V4.fzpz)
      const instancesXml = parsedCustomFzpModules
        .map(
          (m, idx) => `    <instance moduleIdRef="${m.moduleId}" modelIndex="${1001 + idx}" path="${m.refFile}">
      <title>${m.title}</title>
      <views>
        <breadboardView layer="breadboard">
          <geometry z="2.5" x="${100 + idx * 180}" y="80"/>
        </breadboardView>
      </views>
    </instance>`
        )
        .join('\n');
      fzXmlString = `<?xml version="1.0" encoding="UTF-8"?>
<module fritzingVersion="1.0.7">
  <views>
    <view name="breadboardView" backgroundColor="#ffffff" gridSize="0.1in" showGrid="1" alignToGrid="1" viewFromBelow="0"/>
  </views>
  <instances>
${instancesXml}
  </instances>
</module>`;
      diagnostics.push({
        id: 'diag-fzpz-part-package',
        category: 'info',
        code: 'INFO_FRITZING_FZPZ_PART_PACKAGE',
        title: 'Standalone Fritzing Custom Part Package (.fzpz) Loaded',
        message: `Archive "${fileName}" is a Fritzing Custom Part Package containing ${parsedCustomFzpModules.map((m) => m.moduleId).join(', ')}. Loaded in Part Inspection & Wokwi Template mode.`,
      });
    } else {
      diagnostics.push({
        id: 'diag-missing-fz',
        category: 'error',
        code: 'ERR_FRITZING_MISSING_FZ_SKETCH',
        title: 'No .fz Sketch File Found in Archive',
        message: `The ZIP archive "${fileName}" does not contain a Fritzing .fz XML sketch document.`,
        remediation: 'Ensure you exported a complete Fritzing project (.fzz) rather than an empty archive.',
      });
      return { circuit: createEmptyCircuit(), archiveFileInventory };
    }
  } else {
    fzXmlString = await fzEntry.async('string');
    fzSourceLabel = fzEntry.name;
  }

  // Validate .fz XML syntax strictly
  const validationResult = XMLValidator.validate(fzXmlString);
  if (validationResult !== true) {
    diagnostics.push({
      id: 'diag-malformed-xml',
      category: 'error',
      code: 'ERR_FRITZING_MALFORMED_XML',
      title: 'Malformed .fz Sketch XML',
      message: `XML syntax error in "${fzSourceLabel}" at line ${validationResult.err.line}: ${validationResult.err.msg}.`,
      remediation: 'Open and re-save the sketch in Fritzing to repair the XML structure.',
    });
    return { circuit: createEmptyCircuit(), archiveFileInventory };
  }

  const parsedXml = xmlParser.parse(fzXmlString);
  const moduleNode = parsedXml?.module;
  if (!moduleNode || typeof moduleNode !== 'object') {
    diagnostics.push({
      id: 'diag-missing-module-root',
      category: 'error',
      code: 'ERR_FRITZING_INVALID_ROOT',
      title: 'Missing <module> Root Element',
      message: `File "${fzSourceLabel}" is valid XML but does not contain a Fritzing <module> root element.`,
      remediation: 'Verify that the .fz file is an authentic Fritzing sketch document.',
    });
    return { circuit: createEmptyCircuit(), archiveFileInventory };
  }

  const fritzingVersion = String(moduleNode['@_fritzingVersion'] || 'unknown');
  const rawInstances = asArray(moduleNode.instances?.instance);

  if (rawInstances.length === 0) {
    diagnostics.push({
      id: 'diag-no-instances',
      category: 'error',
      code: 'ERR_FRITZING_NO_INSTANCES',
      title: 'No Component Instances Found in Sketch',
      message: `The Fritzing sketch "${fzSourceLabel}" contains 0 <instance> elements.`,
      remediation: 'Add at least one supported electronic component to the breadboard view in Fritzing.',
    });
    return { circuit: createEmptyCircuit(), archiveFileInventory };
  }

  // Extract all instances
  const parsedInstances = new Map<string, RawFritzingInstance>();
  let schematicOnlyWarningIssued = false;

  for (const rawInst of rawInstances) {
    const modelIndex = String(rawInst?.['@_modelIndex'] ?? '').trim();
    const moduleIdRef = String(rawInst?.['@_moduleIdRef'] ?? '').trim();
    const path = String(rawInst?.['@_path'] ?? '').trim();
    const title = String(rawInst?.title ?? modelIndex).trim();

    if (!modelIndex || !moduleIdRef) {
      diagnostics.push({
        id: `diag-missing-instance-id-${Math.random().toString(36).slice(2, 7)}`,
        category: 'error',
        code: 'ERR_FRITZING_MISSING_INSTANCE_ATTR',
        title: 'Component Instance Missing Required Identifier',
        message: `An <instance> tag in "${fzSourceLabel}" is missing either "modelIndex" or "moduleIdRef".`,
        remediation: 'Ensure all <instance> elements specify both modelIndex and moduleIdRef.',
      });
      continue;
    }

    if (parsedInstances.has(modelIndex)) {
      diagnostics.push({
        id: `diag-dup-model-index-${modelIndex}`,
        category: 'error',
        code: 'ERR_FRITZING_DUPLICATE_MODEL_INDEX',
        title: `Duplicate modelIndex "${modelIndex}"`,
        message: `Multiple component instances share modelIndex "${modelIndex}". Fritzing requires unique modelIndex identifiers to resolve connections safely.`,
        sourceIdentifier: modelIndex,
        remediation: 'Assign unique modelIndex numbers to each <instance> in the sketch.',
      });
      continue;
    }

    const properties: Record<string, string> = {};
    for (const prop of asArray(rawInst?.property)) {
      const pName = String(prop?.['@_name'] ?? '').trim();
      const pVal = String(prop?.['@_value'] ?? '').trim();
      if (pName) {
        properties[pName] = pVal;
      }
    }

    const bbView = rawInst?.views?.breadboardView;
    const schView = rawInst?.views?.schematicView;
    const geo = bbView?.geometry || schView?.geometry;
    const x = Number(geo?.['@_x'] ?? 0);
    const y = Number(geo?.['@_y'] ?? 0);
    const rotation = parseRotationFromMatrixOrAttr(geo);
    const wireColor = String(bbView?.wireExtras?.['@_color'] ?? '#10b981');

    const connectors = new Map<string, RawFritzingConnect[]>();
    const rawBbConnectors = asArray(bbView?.connectors?.connector);
    const rawSchConnectors = asArray(schView?.connectors?.connector);

    const hasBreadboardView = Boolean(bbView);
    const hasSchematicOnlyConnections = rawBbConnectors.length === 0 && rawSchConnectors.length > 0;

    if (hasSchematicOnlyConnections && !schematicOnlyWarningIssued) {
      schematicOnlyWarningIssued = true;
      diagnostics.push({
        id: 'diag-schematic-fallback',
        category: 'warning',
        code: 'WARN_FRITZING_SCHEMATIC_FALLBACK',
        title: 'Connections Extracted from Schematic View',
        message:
          'One or more instances lacked breadboardView connector data; WireMorph used schematicView connections and approximated physical layout coordinates.',
      });
    }

    const activeConnectors = rawBbConnectors.length > 0 ? rawBbConnectors : rawSchConnectors;
    for (const conn of activeConnectors) {
      const connectorId = String(conn?.['@_connectorId'] ?? '').trim();
      if (!connectorId) continue;
      const connectsList: RawFritzingConnect[] = [];
      for (const c of asArray(conn?.connects?.connect)) {
        const targetModelIndex = String(c?.['@_modelIndex'] ?? '').trim();
        const targetConnectorId = String(c?.['@_connectorId'] ?? '').trim();
        const layer = String(c?.['@_layer'] ?? '').trim();
        if (targetModelIndex && targetConnectorId) {
          connectsList.push({ targetModelIndex, targetConnectorId, layer });
        }
      }
      connectors.set(connectorId, connectsList);
    }

    parsedInstances.set(modelIndex, {
      modelIndex,
      moduleIdRef,
      path,
      title,
      properties,
      x: Number.isNaN(x) ? 0 : x,
      y: Number.isNaN(y) ? 0 : y,
      rotation,
      wireColor,
      hasBreadboardView,
      hasSchematicOnlyConnections,
      connectors,
    });
  }

  // Classify instances:
  // 1) Wires (WireModuleID)
  // 2) Breadboards (Breadboard-RSR03MB102, Half+Breadboard, etc.)
  // 3) Electronic Components (mapped or unsupported)
  const componentsByModelIndex = new Map<string, IRComponent>();
  const usedWokwiIds = new Set<string>();
  const prefixCounters = new Map<string, number>();

  for (const inst of parsedInstances.values()) {
    if (isFritzingWireModule(inst.moduleIdRef)) {
      continue;
    }
    if (isFritzingBreadboardModule(inst.moduleIdRef)) {
      diagnostics.push({
        id: `diag-breadboard-net-solver-${inst.modelIndex}`,
        category: 'info',
        code: 'INFO_BREADBOARD_NET_RESOLVED',
        title: `Breadboard "${inst.title}" Electrical Strips Resolved`,
        message: `Breadboard instance "${inst.title}" (modelIndex ${inst.modelIndex}, ${inst.moduleIdRef}) was analyzed as an electrical routing substrate: pins sharing 5-hole terminal strips (columns A-E or F-J) or power rails are connected directly in the target netlist.`,
        sourceIdentifier: inst.modelIndex,
      });
      continue;
    }

    const mapping = findMappingByFritzingModule(inst.moduleIdRef, inst.properties, inst.path);
    if (!mapping) {
      const fallbackId = `unmapped_${inst.modelIndex}`;
      const pinsRecord: Record<string, IRPin> = {};
      for (const cid of inst.connectors.keys()) {
        const customName = customConnectorNamesByModule.get(inst.moduleIdRef)?.get(cid);
        pinsRecord[cid] = {
          canonicalPinId: cid,
          sourcePinId: cid,
          displayName: customName || cid,
        };
      }
      const unmappedComp: IRComponent = {
        id: fallbackId,
        sourceId: inst.modelIndex,
        label: inst.title || `Part_${inst.modelIndex}`,
        canonicalType: 'unmapped',
        sourcePartType: inst.moduleIdRef,
        targetPartType: undefined,
        sourceProperties: inst.properties,
        targetProperties: {},
        pins: pinsRecord,
        layout: {
          x: Math.round(inst.x),
          y: Math.round(inst.y),
          rotation: inst.rotation,
          sourceView: inst.hasBreadboardView ? 'breadboard' : 'schematic',
          approximated: true,
        },
        mappingStatus: 'unsupported',
        mappingNotes: [
          `No verified Wokwi mapping exists for Fritzing module "${inst.moduleIdRef}". Component and its attached connections cannot be simulated in Wokwi without a custom chip definition.`,
        ],
      };
      componentsByModelIndex.set(inst.modelIndex, unmappedComp);

      diagnostics.push({
        id: `diag-unsupported-part-${inst.modelIndex}`,
        category: 'unsupported',
        code: 'UNSUPPORTED_FRITZING_PART',
        title: `Unsupported Component: ${inst.title} (${inst.moduleIdRef})`,
        message: `Fritzing part "${inst.title}" with moduleIdRef "${inst.moduleIdRef}" (modelIndex ${inst.modelIndex}) has no verified equivalent in the WireMorph component registry. It will be omitted from the exported Wokwi diagram and documented in the conversion report.`,
        componentId: fallbackId,
        sourceIdentifier: inst.modelIndex,
        remediation:
          'Replace this part with a supported component from the Part Registry or define a custom Wokwi chip after export.',
      });
      continue;
    }

    // Generate clean, deterministic Wokwi ID (e.g., esp1, led1, r1, btn1)
    const count = (prefixCounters.get(mapping.instancePrefix) ?? 0) + 1;
    prefixCounters.set(mapping.instancePrefix, count);
    let candidateId = `${mapping.instancePrefix}${count}`;
    while (usedWokwiIds.has(candidateId)) {
      candidateId = `${mapping.instancePrefix}_${inst.modelIndex}`;
    }
    usedWokwiIds.add(candidateId);

    // Transform properties
    const targetProps: Record<string, string> = {};
    let componentStatus: 'preserved' | 'transformed' | 'approximated' = 'preserved';
    const mappingNotes: string[] = [];

    for (const rule of mapping.propertyRules) {
      const res = rule.toWokwi(inst.properties, inst.moduleIdRef);
      targetProps[rule.wokwiAttrName] = res.value;
      if (res.status === 'approximated') {
        componentStatus = 'approximated';
      } else if (res.status === 'transformed' && componentStatus === 'preserved') {
        componentStatus = 'transformed';
      }
      if (res.note) {
        mappingNotes.push(res.note);
      }
      propertyTransformations.push({
        componentId: candidateId,
        componentLabel: inst.title || candidateId,
        sourceProperty: rule.fritzingPropertyName,
        sourceValue: inst.properties[rule.fritzingPropertyName] ?? '(unspecified)',
        targetProperty: rule.wokwiAttrName,
        targetValue: res.value,
        status: res.status,
        note: res.note,
      });
    }

    // Record omitted Fritzing-only properties (like tolerance, power, package)
    for (const [k, v] of Object.entries(inst.properties)) {
      const handled = mapping.propertyRules.some(
        (r) => r.fritzingPropertyName.toLowerCase() === k.toLowerCase()
      );
      if (!handled && k.toLowerCase() !== 'family') {
        propertyTransformations.push({
          componentId: candidateId,
          componentLabel: inst.title || candidateId,
          sourceProperty: k,
          sourceValue: v,
          targetProperty: '(none)',
          targetValue: 'omitted',
          status: 'omitted',
          note: `Fritzing property "${k}=${v}" is not used by Wokwi simulator part "${mapping.wokwiPartType}".`,
        });
      }
    }

    const pinsRecord: Record<string, IRPin> = {};
    for (const p of mapping.pins) {
      pinsRecord[p.canonicalId] = {
        canonicalPinId: p.canonicalId,
        sourcePinId: p.fritzingConnectorId,
        displayName: p.displayName,
        equivalenceGroup: p.equivalenceGroup,
      };
    }

    const comp: IRComponent = {
      id: candidateId,
      sourceId: inst.modelIndex,
      label: inst.title || candidateId,
      canonicalType: mapping.canonicalType,
      sourcePartType: inst.moduleIdRef,
      targetPartType: mapping.wokwiPartType,
      sourceProperties: inst.properties,
      targetProperties: targetProps,
      pins: pinsRecord,
      layout: {
        x: Math.round(inst.x),
        y: Math.round(inst.y),
        rotation: inst.rotation,
        sourceView: inst.hasBreadboardView ? 'breadboard' : 'schematic',
        approximated: !inst.hasBreadboardView,
      },
      mappingStatus: componentStatus,
      mappingNotes,
    };

    componentsByModelIndex.set(inst.modelIndex, comp);

    diagnostics.push({
      id: `diag-mapped-part-${inst.modelIndex}`,
      category: 'info',
      code: 'INFO_PART_MAPPED',
      title: `Mapped ${inst.title} → ${mapping.wokwiPartType}`,
      message: `Fritzing instance "${inst.title}" (modelIndex ${inst.modelIndex}, module "${inst.moduleIdRef}") mapped to Wokwi "${mapping.wokwiPartType}" (id "${candidateId}").`,
      componentId: candidateId,
      sourceIdentifier: inst.modelIndex,
    });
  }

  // Build Electrical Connectivity Graph to resolve wires and breadboard strips accurately
  // Nodes in the graph are `inst:<modelIndex>:<connectorId>` or `bbnet:<stripId>`
  const adjacency = new Map<string, Set<string>>();
  const edgeColors = new Map<string, string>();

  const addUndirectedEdge = (nodeA: string, nodeB: string, color?: string) => {
    if (!adjacency.has(nodeA)) adjacency.set(nodeA, new Set());
    if (!adjacency.has(nodeB)) adjacency.set(nodeB, new Set());
    adjacency.get(nodeA)!.add(nodeB);
    adjacency.get(nodeB)!.add(nodeA);
    if (color) {
      edgeColors.set(`${nodeA}|${nodeB}`, color);
      edgeColors.set(`${nodeB}|${nodeA}`, color);
    }
  };

  // For wire instances, connector0 and connector1 are electrically joined inside the wire
  for (const inst of parsedInstances.values()) {
    if (isFritzingWireModule(inst.moduleIdRef)) {
      const cKeys = Array.from(inst.connectors.keys());
      if (cKeys.length >= 2) {
        const n0 = `inst:${inst.modelIndex}:${cKeys[0]}`;
        const n1 = `inst:${inst.modelIndex}:${cKeys[1]}`;
        addUndirectedEdge(n0, n1, inst.wireColor);
      } else {
        diagnostics.push({
          id: `diag-dangling-wire-${inst.modelIndex}`,
          category: 'warning',
          code: 'WARN_FRITZING_DANGLING_WIRE',
          title: `Incomplete or Unconnected Wire (${inst.title})`,
          message: `Wire instance "${inst.title}" (modelIndex ${inst.modelIndex}) does not connect two endpoints and was ignored.`,
          sourceIdentifier: inst.modelIndex,
        });
      }
    }
  }

  // Add all <connect> edges from all instances
  for (const inst of parsedInstances.values()) {
    const isBb = isFritzingBreadboardModule(inst.moduleIdRef);
    for (const [connId, targets] of inst.connectors.entries()) {
      const sourceNode = isBb
        ? `bbnet:${getBreadboardStripNetId(inst.modelIndex, connId)}`
        : `inst:${inst.modelIndex}:${connId}`;

      for (const target of targets) {
        const targetInst = parsedInstances.get(target.targetModelIndex);
        if (!targetInst) {
          diagnostics.push({
            id: `diag-missing-target-${inst.modelIndex}-${connId}-${target.targetModelIndex}`,
            category: 'error',
            code: 'ERR_FRITZING_MISSING_TARGET_INSTANCE',
            title: 'Connection References Non-Existent Component Instance',
            message: `Instance "${inst.title}" (modelIndex ${inst.modelIndex}, connector "${connId}") references modelIndex "${target.targetModelIndex}", which does not exist in <instances>.`,
            sourceIdentifier: inst.modelIndex,
            pinReference: connId,
            remediation: 'Repair the broken connection reference in the Fritzing sketch.',
          });
          continue;
        }

        const targetIsBb = isFritzingBreadboardModule(targetInst.moduleIdRef);
        const targetNode = targetIsBb
          ? `bbnet:${getBreadboardStripNetId(targetInst.modelIndex, target.targetConnectorId)}`
          : `inst:${targetInst.modelIndex}:${target.targetConnectorId}`;

        const wireColor = isFritzingWireModule(inst.moduleIdRef)
          ? inst.wireColor
          : isFritzingWireModule(targetInst.moduleIdRef)
            ? targetInst.wireColor
            : undefined;

        addUndirectedEdge(sourceNode, targetNode, wireColor);
      }
    }
  }

  // Check if any wire has an unconnected endpoint (dangling wire)
  for (const inst of parsedInstances.values()) {
    if (isFritzingWireModule(inst.moduleIdRef)) {
      for (const [connId, targets] of inst.connectors.entries()) {
        if (targets.length === 0) {
          diagnostics.push({
            id: `diag-open-wire-end-${inst.modelIndex}-${connId}`,
            category: 'warning',
            code: 'WARN_FRITZING_UNCONNECTED_WIRE_END',
            title: `Dangling Wire Endpoint on ${inst.title}`,
            message: `Wire "${inst.title}" (modelIndex ${inst.modelIndex}) has an unconnected terminal (${connId}).`,
            sourceIdentifier: inst.modelIndex,
            pinReference: connId,
          });
        }
      }
    }
  }

  // Helper to check if a graph node is a wire or breadboard routing substrate
  const isRoutingNode = (nodeId: string): boolean => {
    if (nodeId.startsWith('bbnet:')) return true;
    if (nodeId.startsWith('inst:')) {
      const [, mIdx] = nodeId.split(':');
      const inst = parsedInstances.get(mIdx);
      return Boolean(inst && isFritzingWireModule(inst.moduleIdRef));
    }
    return false;
  };

  const connections: IRConnection[] = [];
  let connectionSeq = 1;
  const emittedPairs = new Set<string>();

  const emitConnectionBetweenEndpoints = (
    epA: { modelIndex: string; connectorId: string; component: IRComponent },
    epB: { modelIndex: string; connectorId: string; component: IRComponent },
    netColor: string,
    traversedLabels: string[]
  ) => {
    if (epA.modelIndex === epB.modelIndex && epA.connectorId === epB.connectorId) {
      return;
    }
    const key1 = `${epA.modelIndex}:${epA.connectorId}|${epB.modelIndex}:${epB.connectorId}`;
    const key2 = `${epB.modelIndex}:${epB.connectorId}|${epA.modelIndex}:${epA.connectorId}`;
    if (emittedPairs.has(key1) || emittedPairs.has(key2)) {
      return;
    }
    emittedPairs.add(key1);

    const resolvedFrom = resolveComponentPinEndpoint(
      epA.component,
      epA.connectorId,
      customConnectorNamesByModule.get(epA.component.sourcePartType),
      diagnostics
    );
    const resolvedTo = resolveComponentPinEndpoint(
      epB.component,
      epB.connectorId,
      customConnectorNamesByModule.get(epB.component.sourcePartType),
      diagnostics
    );

    let connStatus: IRConnection['status'] = 'preserved';
    let statusNote: string | undefined;

    if (
      epA.component.mappingStatus === 'unsupported' ||
      epB.component.mappingStatus === 'unsupported'
    ) {
      connStatus = 'unsupported';
      statusNote = `Connected to unsupported component (${
        epA.component.mappingStatus === 'unsupported' ? epA.component.label : epB.component.label
      }). Omitted from Wokwi diagram.`;
    } else if (!resolvedFrom.targetPinId || !resolvedTo.targetPinId) {
      connStatus = 'rejected';
      statusNote =
        'Ambiguous or unmapped connector ID on a supported component; connection cannot be guessed safely.';
    } else if (traversedLabels.length > 0) {
      connStatus = 'transformed';
      statusNote = `Resolved across ${traversedLabels.slice(0, 3).join(' → ')}.`;
    }

    connections.push({
      id: `conn_${connectionSeq++}`,
      from: resolvedFrom,
      to: resolvedTo,
      wireColor: netColor,
      resolvedViaNet: traversedLabels.length > 0 ? traversedLabels.join(', ') : undefined,
      status: connStatus,
      statusNote,
    });
  };

  // 1) Collect direct component-to-component connections (no intermediate wire or breadboard)
  for (const [nodeA, neighbors] of adjacency.entries()) {
    if (isRoutingNode(nodeA) || !nodeA.startsWith('inst:')) continue;
    const [, mIdxA, cIdA] = nodeA.split(':');
    const compA = componentsByModelIndex.get(mIdxA);
    if (!compA) continue;

    for (const nodeB of neighbors) {
      if (isRoutingNode(nodeB) || !nodeB.startsWith('inst:')) continue;
      const [, mIdxB, cIdB] = nodeB.split(':');
      const compB = componentsByModelIndex.get(mIdxB);
      if (!compB) continue;

      const rawColor = edgeColors.get(`${nodeA}|${nodeB}`);
      emitConnectionBetweenEndpoints(
        { modelIndex: mIdxA, connectorId: cIdA, component: compA },
        { modelIndex: mIdxB, connectorId: cIdB, component: compB },
        rawColor ? normalizeWireColorToWokwi(rawColor) : 'green',
        []
      );
    }
  }

  // 2) Traverse each connected wire/breadboard routing subgraph, treating component pins as leaf terminals
  const visitedRoutingNodes = new Set<string>();

  for (const startNode of adjacency.keys()) {
    if (!isRoutingNode(startNode) || visitedRoutingNodes.has(startNode)) continue;

    const queue: string[] = [startNode];
    visitedRoutingNodes.add(startNode);
    const leafEndpointsMap = new Map<
      string,
      { modelIndex: string; connectorId: string; component: IRComponent }
    >();
    const traversedIntermediateLabels = new Set<string>();
    let netColor = 'green';

    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (curr.startsWith('bbnet:')) {
        traversedIntermediateLabels.add(curr.replace(/^bbnet:BB_\d+_/, 'Breadboard '));
      } else if (curr.startsWith('inst:')) {
        const [, mIdx] = curr.split(':');
        const inst = parsedInstances.get(mIdx);
        if (inst && isFritzingWireModule(inst.moduleIdRef)) {
          traversedIntermediateLabels.add(`Wire ${inst.title}`);
          if (inst.wireColor) netColor = normalizeWireColorToWokwi(inst.wireColor);
        }
      }

      const neighbors = adjacency.get(curr) ?? new Set();
      for (const nxt of neighbors) {
        const edgeCol = edgeColors.get(`${curr}|${nxt}`);
        if (edgeCol) netColor = normalizeWireColorToWokwi(edgeCol);

        if (isRoutingNode(nxt)) {
          if (!visitedRoutingNodes.has(nxt)) {
            visitedRoutingNodes.add(nxt);
            queue.push(nxt);
          }
        } else if (nxt.startsWith('inst:')) {
          const [, mIdx, cId] = nxt.split(':');
          const comp = componentsByModelIndex.get(mIdx);
          if (comp) {
            leafEndpointsMap.set(`${mIdx}:${cId}`, {
              modelIndex: mIdx,
              connectorId: cId,
              component: comp,
            });
          }
        }
      }
    }

    const endpoints = Array.from(leafEndpointsMap.values());
    if (endpoints.length >= 2) {
      const anchor = endpoints[0];
      const labels = Array.from(traversedIntermediateLabels);
      for (let i = 1; i < endpoints.length; i++) {
        emitConnectionBetweenEndpoints(anchor, endpoints[i], netColor, labels);
      }
    }
  }

  const circuit: IRCircuit = {
    sourceFormat: 'fritzing',
    targetFormat: 'wokwi',
    sourceFileName: fileName,
    sourceFileSizeBytes: bytes.byteLength,
    title: fileName.replace(/\.(fzz|fzpz|fz)$/i, ''),
    fritzingVersion,
    components: Array.from(componentsByModelIndex.values()),
    connections,
    customAssets,
    propertyTransformations,
    diagnostics,
  };

  return { circuit, archiveFileInventory };
}

function resolveComponentPinEndpoint(
  component: IRComponent,
  connectorId: string,
  customPartConnectors: Map<string, string> | undefined,
  diagnostics: ConversionDiagnostic[]
): IRConnection['from'] {
  if (component.mappingStatus === 'unsupported') {
    const customLabel = customPartConnectors?.get(connectorId) || connectorId;
    return {
      componentId: component.id,
      sourceComponentId: component.sourceId,
      componentLabel: component.label,
      sourcePinId: connectorId,
      targetPinId: undefined,
      pinDisplayName: customLabel,
    };
  }

  const mapping = findMappingByFritzingModule(
    component.sourcePartType,
    component.sourceProperties
  );
  if (!mapping) {
    return {
      componentId: component.id,
      sourceComponentId: component.sourceId,
      componentLabel: component.label,
      sourcePinId: connectorId,
      targetPinId: undefined,
      pinDisplayName: connectorId,
    };
  }

  // Try direct connector match or custom part connector name/description alias match
  let pinDef = findPinByFritzingConnector(mapping, connectorId, component.sourcePartType);
  if (!pinDef && customPartConnectors?.has(connectorId)) {
    const customPinName = customPartConnectors.get(connectorId)!;
    pinDef = findPinByFritzingConnector(mapping, customPinName, component.sourcePartType);
  }

  if (!pinDef) {
    diagnostics.push({
      id: `diag-unresolved-pin-${component.id}-${connectorId}`,
      category: 'error',
      code: 'ERR_FRITZING_UNRESOLVED_CONNECTOR',
      title: `Unresolved Pin "${connectorId}" on ${component.label}`,
      message: `Connector "${connectorId}" on component "${component.label}" (${component.sourcePartType}) is not in the verified pin mapping table for "${mapping.wokwiPartType}". WireMorph refuses to guess unknown electrical connections.`,
      componentId: component.id,
      sourceIdentifier: component.sourceId,
      pinReference: connectorId,
      remediation: `Verify the connector ID in the Fritzing part definition (.fzp). Valid connectors for ${mapping.displayName}: ${mapping.pins
        .slice(0, 6)
        .map((p) => `${p.fritzingConnectorId} (${p.wokwiPinName})`)
        .join(', ')}...`,
    });
    return {
      componentId: component.id,
      sourceComponentId: component.sourceId,
      componentLabel: component.label,
      sourcePinId: connectorId,
      targetPinId: undefined,
      pinDisplayName: `${connectorId} (Unresolved)`,
    };
  }

  return {
    componentId: component.id,
    sourceComponentId: component.sourceId,
    componentLabel: component.label,
    sourcePinId: connectorId,
    targetPinId: pinDef.wokwiPinName,
    pinDisplayName: pinDef.displayName,
  };
}

function normalizeWireColorToWokwi(rawColor: string): string {
  const lower = rawColor.trim().toLowerCase();
  if (
    lower.includes('red') ||
    lower === '#ff0000' ||
    lower === '#dc2626' ||
    lower === '#cc0000' ||
    lower === '#cc1414' ||
    lower === '#dc3545'
  ) {
    return 'red';
  }
  if (
    lower.includes('black') ||
    lower === '#000000' ||
    lower === '#1e293b' ||
    lower === '#343a40' ||
    lower === '#404040'
  ) {
    return 'black';
  }
  if (
    lower.includes('blue') ||
    lower === '#0000ff' ||
    lower === '#2563eb' ||
    lower === '#418dd9' ||
    lower === '#007bff'
  ) {
    return 'blue';
  }
  if (
    lower.includes('yellow') ||
    lower === '#ffff00' ||
    lower === '#eab308' ||
    lower === '#ffc107' ||
    lower === '#fff800'
  ) {
    return 'gold';
  }
  if (lower.includes('orange') || lower === '#f97316') return 'orange';
  if (lower.includes('purple') || lower === '#9333ea') return 'purple';
  if (lower.includes('white') || lower === '#ffffff') return 'white';
  return 'green';
}

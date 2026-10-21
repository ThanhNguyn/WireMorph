import {
  ConversionDiagnostic,
  IRCircuit,
  IRComponent,
  IRConnection,
  IRPin,
  PropertyTransformationRecord,
} from '../conversion-core/types';
import {
  findMappingByWokwiType,
  findPinByWokwiPinName,
  getBreadboardStripNetId,
} from '../part-mappings/registry';

export interface WokwiPartJson {
  type: string;
  id: string;
  top?: number;
  left?: number;
  rotate?: number;
  hide?: boolean;
  attrs?: Record<string, string>;
}

export type WokwiConnectionTuple = [string, string, string?, string[]?];

export interface WokwiDiagramJson {
  version: number;
  author?: string;
  editor?: string;
  parts: WokwiPartJson[];
  connections: WokwiConnectionTuple[];
  dependencies?: Record<string, string>;
}

function isWokwiBreadboardType(type: string): boolean {
  const lower = type.trim().toLowerCase();
  return lower.startsWith('wokwi-breadboard');
}

/**
 * Normalizes Wokwi breadboard pin names like "12t.a".."12t.e" or "12b.f".."12b.j" or "tp.1"
 * into standard breadboard strip net identifiers.
 */
function resolveWokwiBreadboardNet(partId: string, pinName: string): string {
  const clean = pinName.trim();
  // Wokwi breadboards use e.g. "1t.a".."1t.e" (top half a-e) and "1b.f".."1b.j" (bottom half f-j)
  const wokwiHalfMatch = /^(\d{1,2})[tb]\.([a-jA-J])$/.exec(clean);
  if (wokwiHalfMatch) {
    const row = wokwiHalfMatch[1];
    const col = wokwiHalfMatch[2].toUpperCase();
    const side = ['A', 'B', 'C', 'D', 'E'].includes(col) ? 'ABCDE' : 'FGHIJ';
    return `BB_${partId}_ROW_${row}_${side}`;
  }
  return getBreadboardStripNetId(partId, clean);
}

/**
 * Parses and strictly validates a Wokwi `diagram.json` file into the shared `IRCircuit` representation.
 */
export function importWokwiDiagram(
  jsonText: string,
  fileName: string,
  byteLength?: number
): IRCircuit {
  const sizeBytes = byteLength ?? new TextEncoder().encode(jsonText).byteLength;
  const diagnostics: ConversionDiagnostic[] = [];
  const propertyTransformations: PropertyTransformationRecord[] = [];

  const createEmptyCircuit = (): IRCircuit => ({
    sourceFormat: 'wokwi',
    targetFormat: 'fritzing',
    sourceFileName: fileName,
    sourceFileSizeBytes: sizeBytes,
    title: fileName.replace(/\.json$/i, ''),
    components: [],
    connections: [],
    customAssets: [],
    propertyTransformations,
    diagnostics,
  });

  if (!jsonText || jsonText.trim() === '') {
    diagnostics.push({
      id: 'diag-wokwi-empty',
      category: 'error',
      code: 'ERR_WOKWI_EMPTY_FILE',
      title: 'Empty diagram.json Input',
      message: `The uploaded file "${fileName}" is empty.`,
      remediation: 'Provide a non-empty Wokwi diagram.json file.',
    });
    return createEmptyCircuit();
  }

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(jsonText);
  } catch (err) {
    diagnostics.push({
      id: 'diag-wokwi-malformed-json',
      category: 'error',
      code: 'ERR_WOKWI_MALFORMED_JSON',
      title: 'Malformed JSON in diagram.json',
      message: `Could not parse "${fileName}" as valid JSON (${err instanceof Error ? err.message : 'syntax error'}).`,
      remediation: 'Check for trailing commas, unquoted keys, or truncated JSON brackets.',
    });
    return createEmptyCircuit();
  }

  if (!parsedRaw || typeof parsedRaw !== 'object' || Array.isArray(parsedRaw)) {
    diagnostics.push({
      id: 'diag-wokwi-root-not-object',
      category: 'error',
      code: 'ERR_WOKWI_INVALID_SCHEMA',
      title: 'Root JSON Element Must Be an Object',
      message: 'A valid Wokwi diagram.json must be a top-level JSON object containing "version", "parts", and "connections".',
      remediation: 'Check the Wokwi diagram.json specification at https://docs.wokwi.com/diagram-format.',
    });
    return createEmptyCircuit();
  }

  const doc = parsedRaw as Record<string, unknown>;
  if (!Array.isArray(doc.parts) || !Array.isArray(doc.connections)) {
    diagnostics.push({
      id: 'diag-wokwi-missing-arrays',
      category: 'error',
      code: 'ERR_WOKWI_MISSING_REQUIRED_ARRAYS',
      title: 'Missing Required "parts" or "connections" Arrays',
      message: `The JSON document "${fileName}" does not contain valid "parts" and "connections" arrays.`,
      remediation: 'Ensure the file is a Wokwi diagram.json rather than wokwi.toml or package.json.',
    });
    return createEmptyCircuit();
  }

  const version = typeof doc.version === 'number' ? doc.version : 1;
  const author = typeof doc.author === 'string' ? doc.author : 'WireMorph User';

  if (doc.parts.length === 0) {
    diagnostics.push({
      id: 'diag-wokwi-no-parts',
      category: 'error',
      code: 'ERR_WOKWI_EMPTY_PARTS',
      title: 'No Components Defined in diagram.json',
      message: `The "parts" array in "${fileName}" is empty.`,
      remediation: 'Add at least one component to the Wokwi diagram before converting.',
    });
    return createEmptyCircuit();
  }

  const componentsById = new Map<string, IRComponent>();
  const breadboardPartIds = new Set<string>();

  for (let i = 0; i < doc.parts.length; i++) {
    const rawPart = doc.parts[i] as Record<string, unknown>;
    const partId = typeof rawPart?.id === 'string' ? rawPart.id.trim() : '';
    const partType = typeof rawPart?.type === 'string' ? rawPart.type.trim() : '';

    if (!partId || !partType) {
      diagnostics.push({
        id: `diag-wokwi-invalid-part-${i}`,
        category: 'error',
        code: 'ERR_WOKWI_MISSING_PART_ID_OR_TYPE',
        title: `Part at Index ${i} Missing "id" or "type"`,
        message: `Every entry in "parts" must define string "id" and "type" fields.`,
        remediation: 'Provide valid id and type strings for all parts in diagram.json.',
      });
      continue;
    }

    if (componentsById.has(partId) || breadboardPartIds.has(partId)) {
      diagnostics.push({
        id: `diag-wokwi-dup-id-${partId}`,
        category: 'error',
        code: 'ERR_WOKWI_DUPLICATE_PART_ID',
        title: `Duplicate Part ID "${partId}"`,
        message: `Multiple components in diagram.json share the identifier "${partId}". Wokwi requires every part ID to be unique.`,
        sourceIdentifier: partId,
        remediation: `Rename one of the duplicate "${partId}" entries and update its connections.`,
      });
      continue;
    }

    if (isWokwiBreadboardType(partType)) {
      breadboardPartIds.add(partId);
      diagnostics.push({
        id: `diag-wokwi-breadboard-${partId}`,
        category: 'info',
        code: 'INFO_WOKWI_BREADBOARD_RESOLVED',
        title: `Wokwi Breadboard "${partId}" Terminal Strips Analyzed`,
        message: `Wokwi breadboard "${partId}" (${partType}) connections will be resolved across 5-hole terminal strips and power rails into Fritzing nets.`,
        sourceIdentifier: partId,
      });
      continue;
    }

    const top = typeof rawPart.top === 'number' ? rawPart.top : 100 + i * 60;
    const left = typeof rawPart.left === 'number' ? rawPart.left : 100 + i * 80;
    const rotate = typeof rawPart.rotate === 'number' ? rawPart.rotate : 0;

    const rawAttrs =
      rawPart.attrs && typeof rawPart.attrs === 'object' && !Array.isArray(rawPart.attrs)
        ? (rawPart.attrs as Record<string, unknown>)
        : {};
    const sourceProperties: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawAttrs)) {
      if (v !== undefined && v !== null) {
        sourceProperties[k] = String(v);
      }
    }

    const mapping = findMappingByWokwiType(partType);
    if (!mapping) {
      const unmappedComp: IRComponent = {
        id: partId,
        sourceId: partId,
        label: partId,
        canonicalType: 'unmapped',
        sourcePartType: partType,
        targetPartType: undefined,
        sourceProperties,
        targetProperties: {},
        pins: {},
        layout: {
          x: Math.round(left),
          y: Math.round(top),
          rotation: rotate,
          sourceView: 'wokwi-canvas',
          approximated: true,
        },
        mappingStatus: 'unsupported',
        mappingNotes: [
          `No verified Fritzing part mapping exists for Wokwi type "${partType}".`,
        ],
      };
      componentsById.set(partId, unmappedComp);

      diagnostics.push({
        id: `diag-wokwi-unsupported-${partId}`,
        category: 'unsupported',
        code: 'UNSUPPORTED_WOKWI_PART',
        title: `Unsupported Wokwi Component: ${partId} (${partType})`,
        message: `Wokwi component "${partId}" of type "${partType}" is not in the verified WireMorph mapping registry and will be omitted from the exported Fritzing .fzz project.`,
        componentId: partId,
        sourceIdentifier: partId,
        remediation: 'See the Part Registry for supported Wokwi component types.',
      });
      continue;
    }

    // Transform Wokwi attrs -> Fritzing properties
    const targetProperties: Record<string, string> = {
      family: mapping.canonicalType,
    };
    let compStatus: 'preserved' | 'transformed' | 'approximated' = 'preserved';
    const mappingNotes: string[] = [];

    for (const rule of mapping.propertyRules) {
      const res = rule.toFritzing(sourceProperties);
      targetProperties[rule.fritzingPropertyName] = res.value;
      if (res.status === 'approximated') {
        compStatus = 'approximated';
      } else if (res.status === 'transformed' && compStatus === 'preserved') {
        compStatus = 'transformed';
      }
      if (res.note) mappingNotes.push(res.note);
      propertyTransformations.push({
        componentId: partId,
        componentLabel: partId,
        sourceProperty: rule.wokwiAttrName,
        sourceValue: sourceProperties[rule.wokwiAttrName] ?? '(default)',
        targetProperty: rule.fritzingPropertyName,
        targetValue: res.value,
        status: res.status,
        note: res.note,
      });
    }

    // Check for omitted Wokwi simulation attributes (e.g., bounce, key, gamma, fps)
    for (const [k, v] of Object.entries(sourceProperties)) {
      const handled = mapping.propertyRules.some(
        (r) => r.wokwiAttrName.toLowerCase() === k.toLowerCase()
      );
      if (!handled) {
        propertyTransformations.push({
          componentId: partId,
          componentLabel: partId,
          sourceProperty: k,
          sourceValue: v,
          targetProperty: '(none)',
          targetValue: 'omitted',
          status: 'omitted',
          note: `Wokwi simulator attribute "${k}=${v}" has no Fritzing hardware equivalent and was omitted.`,
        });
      }
    }

    const pinsRecord: Record<string, IRPin> = {};
    for (const p of mapping.pins) {
      pinsRecord[p.canonicalId] = {
        canonicalPinId: p.canonicalId,
        sourcePinId: p.wokwiPinName,
        displayName: p.displayName,
        equivalenceGroup: p.equivalenceGroup,
      };
    }

    const comp: IRComponent = {
      id: partId,
      sourceId: partId,
      label: partId,
      canonicalType: mapping.canonicalType,
      sourcePartType: partType,
      targetPartType: mapping.primaryFritzingModuleId,
      sourceProperties,
      targetProperties,
      pins: pinsRecord,
      layout: {
        x: Math.round(left),
        y: Math.round(top),
        rotation: rotate,
        sourceView: 'wokwi-canvas',
        approximated: false,
      },
      mappingStatus: compStatus,
      mappingNotes,
    };

    componentsById.set(partId, comp);

    diagnostics.push({
      id: `diag-wokwi-mapped-${partId}`,
      category: 'info',
      code: 'INFO_WOKWI_PART_MAPPED',
      title: `Mapped ${partId} (${partType}) → ${mapping.primaryFritzingModuleId}`,
      message: `Wokwi part "${partId}" (${partType}) mapped to Fritzing module "${mapping.primaryFritzingModuleId}".`,
      componentId: partId,
      sourceIdentifier: partId,
    });
  }

  // Parse connections and resolve any breadboard-mediated nets
  const connections: IRConnection[] = [];
  const bbNetEndpoints = new Map<
    string,
    Array<{ partId: string; pinName: string; color: string }>
  >();
  let routingHintsWarningIssued = false;

  for (let i = 0; i < doc.connections.length; i++) {
    const rawConn = doc.connections[i];
    if (!Array.isArray(rawConn) || rawConn.length < 2) {
      diagnostics.push({
        id: `diag-wokwi-bad-conn-tuple-${i}`,
        category: 'error',
        code: 'ERR_WOKWI_INVALID_CONNECTION_TUPLE',
        title: `Malformed Connection Entry at Index ${i}`,
        message: `Connection at index ${i} must be a tuple of at least [sourceEndpoint, targetEndpoint].`,
        remediation: 'Format each connection as ["partA:pinA", "partB:pinB", "color", []].',
      });
      continue;
    }

    const epA = String(rawConn[0] ?? '').trim();
    const epB = String(rawConn[1] ?? '').trim();
    const wireColor = typeof rawConn[2] === 'string' && rawConn[2].trim() ? rawConn[2].trim() : 'green';
    const routingHints = Array.isArray(rawConn[3]) ? rawConn[3].map(String) : [];

    if (routingHints.length > 0 && !routingHintsWarningIssued) {
      routingHintsWarningIssued = true;
      diagnostics.push({
        id: 'diag-wokwi-routing-hints',
        category: 'warning',
        code: 'WARN_WOKWI_WIRE_ROUTING_APPROXIMATED',
        title: 'Wokwi Orthogonal Wire Routing Hints Approximated',
        message:
          'Wokwi orthogonal wire bend instructions (e.g. ["v10", "h20"]) are specific to Wokwi canvas geometry; Fritzing export preserves electrical endpoints and wire colors using direct point-to-point breadboard wires.',
      });
    }

    const parsedA = parseWokwiEndpoint(epA, i, diagnostics);
    const parsedB = parseWokwiEndpoint(epB, i, diagnostics);
    if (!parsedA || !parsedB) continue;

    // Handle Wokwi built-in virtual simulator endpoints (e.g., "$serialMonitor:RX", "$serialMonitor:TX")
    if (parsedA.partId.startsWith('$') || parsedB.partId.startsWith('$')) {
      const physicalEp = parsedA.partId.startsWith('$') ? parsedB : parsedA;
      const virtualEp = parsedA.partId.startsWith('$') ? parsedA : parsedB;
      if (!physicalEp.partId.startsWith('$')) {
        const physComp = componentsById.get(physicalEp.partId);
        if (physComp) {
          resolveWokwiPinToFritzingConnector(physComp, physicalEp.pinName, diagnostics);
        }
      }
      if (!diagnostics.some((d) => d.code === 'INFO_WOKWI_VIRTUAL_SERIAL_MONITOR')) {
        diagnostics.push({
          id: 'diag-wokwi-virtual-serial-monitor',
          category: 'info',
          code: 'INFO_WOKWI_VIRTUAL_SERIAL_MONITOR',
          title: `Wokwi Virtual Endpoint (${virtualEp.partId}) Omitted in Physical Sketch`,
          message: `Virtual simulator connection "${epA} ↔ ${epB}" (${virtualEp.partId}) is a Wokwi UART monitor construct with no physical Fritzing part equivalent and was omitted from the breadboard netlist.`,
          sourceIdentifier: virtualEp.partId,
        });
      }
      continue;
    }

    // Check if either endpoint is a breadboard
    const aIsBb = breadboardPartIds.has(parsedA.partId);
    const bIsBb = breadboardPartIds.has(parsedB.partId);

    if (aIsBb && !bIsBb) {
      const netId = resolveWokwiBreadboardNet(parsedA.partId, parsedA.pinName);
      if (!bbNetEndpoints.has(netId)) bbNetEndpoints.set(netId, []);
      bbNetEndpoints.get(netId)!.push({
        partId: parsedB.partId,
        pinName: parsedB.pinName,
        color: wireColor,
      });
      continue;
    }
    if (bIsBb && !aIsBb) {
      const netId = resolveWokwiBreadboardNet(parsedB.partId, parsedB.pinName);
      if (!bbNetEndpoints.has(netId)) bbNetEndpoints.set(netId, []);
      bbNetEndpoints.get(netId)!.push({
        partId: parsedA.partId,
        pinName: parsedA.pinName,
        color: wireColor,
      });
      continue;
    }
    if (aIsBb && bIsBb) {
      continue;
    }

    const builtConn = buildWokwiIRConnection(
      `conn_${i + 1}`,
      parsedA,
      parsedB,
      wireColor,
      routingHints,
      undefined,
      componentsById,
      diagnostics
    );
    if (builtConn) {
      connections.push(builtConn);
    }
  }

  // Materialize connections resolved across Wokwi breadboard strips
  let bbConnSeq = 1;
  for (const [netId, eps] of bbNetEndpoints.entries()) {
    if (eps.length >= 2) {
      const anchor = eps[0];
      for (let j = 1; j < eps.length; j++) {
        const peer = eps[j];
        const builtConn = buildWokwiIRConnection(
          `conn_bb_${bbConnSeq++}`,
          { partId: anchor.partId, pinName: anchor.pinName },
          { partId: peer.partId, pinName: peer.pinName },
          peer.color || anchor.color,
          [],
          netId,
          componentsById,
          diagnostics
        );
        if (builtConn) {
          connections.push(builtConn);
        }
      }
    }
  }

  return {
    sourceFormat: 'wokwi',
    targetFormat: 'fritzing',
    sourceFileName: fileName,
    sourceFileSizeBytes: sizeBytes,
    title: fileName.replace(/\.json$/i, ''),
    author,
    wokwiVersion: version,
    components: Array.from(componentsById.values()),
    connections,
    customAssets: [],
    propertyTransformations,
    diagnostics,
  };
}

function parseWokwiEndpoint(
  rawEndpoint: string,
  connIndex: number,
  diagnostics: ConversionDiagnostic[]
): { partId: string; pinName: string } | undefined {
  const colonIdx = rawEndpoint.indexOf(':');
  if (colonIdx <= 0 || colonIdx === rawEndpoint.length - 1) {
    diagnostics.push({
      id: `diag-wokwi-invalid-endpoint-${connIndex}-${rawEndpoint}`,
      category: 'error',
      code: 'ERR_WOKWI_INVALID_ENDPOINT_SYNTAX',
      title: `Invalid Connection Endpoint Syntax "${rawEndpoint}"`,
      message: `Connection endpoint "${rawEndpoint}" at index ${connIndex} does not match the required "partId:pinName" format.`,
      pinReference: rawEndpoint,
      remediation: 'Format every Wokwi connection endpoint as "partId:pinName" (for example, "esp1:D2").',
    });
    return undefined;
  }
  return {
    partId: rawEndpoint.slice(0, colonIdx).trim(),
    pinName: rawEndpoint.slice(colonIdx + 1).trim(),
  };
}

function buildWokwiIRConnection(
  connId: string,
  epA: { partId: string; pinName: string },
  epB: { partId: string; pinName: string },
  wireColor: string,
  routingHints: string[],
  resolvedViaNet: string | undefined,
  componentsById: Map<string, IRComponent>,
  diagnostics: ConversionDiagnostic[]
): IRConnection | undefined {
  const compA = componentsById.get(epA.partId);
  const compB = componentsById.get(epB.partId);

  if (!compA) {
    diagnostics.push({
      id: `diag-wokwi-missing-part-${connId}-${epA.partId}`,
      category: 'error',
      code: 'ERR_WOKWI_DANGLING_CONNECTION_PART',
      title: `Connection References Unknown Part "${epA.partId}"`,
      message: `Connection "${epA.partId}:${epA.pinName}" → "${epB.partId}:${epB.pinName}" references part "${epA.partId}", which does not exist in the "parts" array.`,
      sourceIdentifier: epA.partId,
      pinReference: `${epA.partId}:${epA.pinName}`,
      remediation: `Add part "${epA.partId}" to "parts" or remove the dangling connection.`,
    });
    return undefined;
  }

  if (!compB) {
    diagnostics.push({
      id: `diag-wokwi-missing-part-${connId}-${epB.partId}`,
      category: 'error',
      code: 'ERR_WOKWI_DANGLING_CONNECTION_PART',
      title: `Connection References Unknown Part "${epB.partId}"`,
      message: `Connection "${epA.partId}:${epA.pinName}" → "${epB.partId}:${epB.pinName}" references part "${epB.partId}", which does not exist in the "parts" array.`,
      sourceIdentifier: epB.partId,
      pinReference: `${epB.partId}:${epB.pinName}`,
      remediation: `Add part "${epB.partId}" to "parts" or remove the dangling connection.`,
    });
    return undefined;
  }

  const fromResolved = resolveWokwiPinToFritzingConnector(compA, epA.pinName, diagnostics);
  const toResolved = resolveWokwiPinToFritzingConnector(compB, epB.pinName, diagnostics);

  let status: IRConnection['status'] = 'preserved';
  let statusNote: string | undefined;

  if (compA.mappingStatus === 'unsupported' || compB.mappingStatus === 'unsupported') {
    status = 'unsupported';
    statusNote = `Connected to unsupported component (${
      compA.mappingStatus === 'unsupported' ? compA.label : compB.label
    }). Omitted from Fritzing sketch.`;
  } else if (!fromResolved.targetPinId || !toResolved.targetPinId) {
    status = 'rejected';
    statusNote = 'Unresolved Wokwi pin name on a supported component; connection rejected.';
  } else if (resolvedViaNet) {
    status = 'transformed';
    statusNote = `Resolved across Wokwi breadboard net ${resolvedViaNet}.`;
  } else if (routingHints.length > 0) {
    status = 'approximated';
    statusNote = `Wokwi wire bend path [${routingHints.join(', ')}] approximated as direct Fritzing wire.`;
  }

  return {
    id: connId,
    from: fromResolved,
    to: toResolved,
    wireColor,
    resolvedViaNet,
    routingHints,
    status,
    statusNote,
  };
}

function resolveWokwiPinToFritzingConnector(
  comp: IRComponent,
  wokwiPinName: string,
  diagnostics: ConversionDiagnostic[]
): IRConnection['from'] {
  if (comp.mappingStatus === 'unsupported') {
    return {
      componentId: comp.id,
      sourceComponentId: comp.sourceId,
      componentLabel: comp.label,
      sourcePinId: wokwiPinName,
      targetPinId: undefined,
      pinDisplayName: wokwiPinName,
    };
  }

  const mapping = findMappingByWokwiType(comp.sourcePartType);
  if (!mapping) {
    return {
      componentId: comp.id,
      sourceComponentId: comp.sourceId,
      componentLabel: comp.label,
      sourcePinId: wokwiPinName,
      targetPinId: undefined,
      pinDisplayName: wokwiPinName,
    };
  }

  const pinDef = findPinByWokwiPinName(mapping, wokwiPinName);
  if (!pinDef) {
    diagnostics.push({
      id: `diag-wokwi-unresolved-pin-${comp.id}-${wokwiPinName}`,
      category: 'error',
      code: 'ERR_WOKWI_UNRESOLVED_PIN',
      title: `Invalid or Unmapped Pin "${wokwiPinName}" on ${comp.label}`,
      message: `Pin "${wokwiPinName}" on Wokwi component "${comp.label}" (${comp.sourcePartType}) is not a valid documented pin in the WireMorph mapping table.`,
      componentId: comp.id,
      sourceIdentifier: comp.sourceId,
      pinReference: `${comp.id}:${wokwiPinName}`,
      remediation: `Valid pins for ${mapping.wokwiPartType}: ${mapping.pins
        .slice(0, 8)
        .map((p) => p.wokwiPinName)
        .join(', ')}`,
    });
    return {
      componentId: comp.id,
      sourceComponentId: comp.sourceId,
      componentLabel: comp.label,
      sourcePinId: wokwiPinName,
      targetPinId: undefined,
      pinDisplayName: `${wokwiPinName} (Invalid)`,
    };
  }

  return {
    componentId: comp.id,
    sourceComponentId: comp.sourceId,
    componentLabel: comp.label,
    sourcePinId: wokwiPinName,
    targetPinId: pinDef.fritzingConnectorId,
    pinDisplayName: pinDef.displayName,
  };
}

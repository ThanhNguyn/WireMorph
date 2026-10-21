import JSZip from 'jszip';
import { XMLValidator } from 'fast-xml-parser';
import { IRCircuit, IRComponent } from '../conversion-core/types';
import {
  ComponentMappingDefinition,
  findMappingByWokwiType,
  PART_MAPPING_REGISTRY,
} from '../part-mappings/registry';

export interface FritzingExportResult {
  archiveBytes: Uint8Array;
  fzXmlString: string;
  archiveFileInventory: Array<{ path: string; sizeBytes: number }>;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates a valid, self-contained Fritzing `.fzp` XML part definition for an exported component.
 */
function buildFritzingPartFzpXml(mapping: ComponentMappingDefinition): string {
  const connectorsXml = mapping.pins
    .map(
      (pin) => `    <connector id="${escapeXml(pin.fritzingConnectorId)}" type="male" name="${escapeXml(pin.displayName)}">
      <description>${escapeXml(pin.displayName)} (Wokwi: ${escapeXml(pin.wokwiPinName)})</description>
      <views>
        <breadboardView>
          <p layer="breadboard" svgId="${escapeXml(pin.fritzingConnectorId)}pin"/>
        </breadboardView>
        <schematicView>
          <p layer="schematic" svgId="${escapeXml(pin.fritzingConnectorId)}pin"/>
        </schematicView>
        <pcbView>
          <p layer="copper0" svgId="${escapeXml(pin.fritzingConnectorId)}pin"/>
        </pcbView>
      </views>
    </connector>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<module fritzingVersion="0.9.10" moduleId="${escapeXml(mapping.primaryFritzingModuleId)}">
  <version>1</version>
  <author>WireMorph Circuit Converter</author>
  <title>${escapeXml(mapping.displayName)}</title>
  <label>${escapeXml(mapping.instancePrefix.toUpperCase())}</label>
  <date>2026-10-20</date>
  <tags>
    <tag>WireMorph</tag>
    <tag>${escapeXml(mapping.category)}</tag>
  </tags>
  <properties>
    <property name="family">${escapeXml(mapping.canonicalType)}</property>
    <property name="wokwiEquivalent">${escapeXml(mapping.wokwiPartType)}</property>
  </properties>
  <views>
    <breadboardView>
      <layers image="breadboard/${escapeXml(mapping.canonicalType)}_breadboard.svg">
        <layer layerId="breadboard"/>
      </layers>
    </breadboardView>
    <schematicView>
      <layers image="breadboard/${escapeXml(mapping.canonicalType)}_breadboard.svg">
        <layer layerId="schematic"/>
      </layers>
    </schematicView>
    <pcbView>
      <layers image="breadboard/${escapeXml(mapping.canonicalType)}_breadboard.svg">
        <layer layerId="copper0"/>
      </layers>
    </pcbView>
  </views>
  <connectors>
${connectorsXml}
  </connectors>
</module>`;
}

/**
 * Generates a valid breadboard SVG graphic with matching connector `<circle id="connectorXpin"/>` anchors
 * so Fritzing can render and snap wires to every pin on the exported part.
 */
function buildFritzingBreadboardSvg(mapping: ComponentMappingDefinition): string {
  const pinCount = mapping.pins.length;
  const cols = Math.ceil(pinCount / 2);
  const width = Math.max(120, cols * 24 + 40);
  const height = 96;

  const pinElements = mapping.pins
    .map((pin, idx) => {
      const isTopRow = idx >= cols;
      const colIndex = isTopRow ? idx - cols : idx;
      const cx = 24 + colIndex * 24;
      const cy = isTopRow ? 14 : height - 14;
      return `    <circle id="${escapeXml(pin.fritzingConnectorId)}pin" cx="${cx}" cy="${cy}" r="4" fill="#94a3b8" stroke="#475569" stroke-width="1.5"/>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}px" height="${height}px" viewBox="0 0 ${width} ${height}">
  <g id="breadboard">
    <rect x="4" y="4" width="${width - 8}" height="${height - 8}" rx="6" fill="#1e293b" stroke="#334155" stroke-width="2"/>
    <text x="${width / 2}" y="${height / 2 + 4}" fill="#f8fafc" font-family="monospace" font-size="11" text-anchor="middle">${escapeXml(mapping.displayName)}</text>
${pinElements}
  </g>
</svg>`;
}

/**
 * Exports a validated `IRCircuit` into a real Fritzing `.fzz` ZIP archive containing:
 * - `<sketchName>.fz` XML sketch with `<module>`, `<views>`, `<instances>`, `<breadboardView>`, `<schematicView>`, and `<WireModuleID>` instances.
 * - `part.<canonicalType>.fzp` and `svg.breadboard.<canonicalType>_breadboard.svg` resources for each mapped component family.
 * Verifies the generated `.fzz` by extracting and validating all XML documents before returning.
 */
export async function exportCircuitToFritzingArchive(
  circuit: IRCircuit
): Promise<FritzingExportResult> {
  const supportedComponents = circuit.components.filter(
    (c) => c.mappingStatus !== 'unsupported' && c.mappingStatus !== 'rejected' && Boolean(c.targetPartType)
  );

  // Assign deterministic numeric modelIndex to each exported component
  const modelIndexByComponentId = new Map<string, number>();
  let nextModelIndex = 100;
  for (const comp of supportedComponents) {
    modelIndexByComponentId.set(comp.id, nextModelIndex++);
  }

  // Filter valid connections whose endpoints are both supported and have targetPinId
  const validConnections = circuit.connections.filter(
    (conn) =>
      conn.status !== 'unsupported' &&
      conn.status !== 'rejected' &&
      Boolean(conn.from.targetPinId) &&
      Boolean(conn.to.targetPinId) &&
      modelIndexByComponentId.has(conn.from.componentId) &&
      modelIndexByComponentId.has(conn.to.componentId)
  );

  // Build per-component connector -> connected wires map
  // In Fritzing sketches, each wire is also an <instance moduleIdRef="WireModuleID" modelIndex="...">
  // that bridges endpoint A (connector0) and endpoint B (connector1), and the components themselves
  // also record the <connect> to both the wire and the peer component in <breadboardView> and <schematicView>.
  const componentConnectionsMap = new Map<
    string,
    Map<string, Array<{ targetModelIndex: number; targetConnectorId: string }>>
  >();

  const registerConnect = (
    compId: string,
    connectorId: string,
    targetModelIndex: number,
    targetConnectorId: string
  ) => {
    if (!componentConnectionsMap.has(compId)) {
      componentConnectionsMap.set(compId, new Map());
    }
    const pinMap = componentConnectionsMap.get(compId)!;
    if (!pinMap.has(connectorId)) {
      pinMap.set(connectorId, []);
    }
    pinMap.get(connectorId)!.push({ targetModelIndex, targetConnectorId });
  };

  const wireInstancesXml: string[] = [];

  for (let i = 0; i < validConnections.length; i++) {
    const conn = validConnections[i];
    const wireModelIndex = 5000 + i;
    const fromModelIndex = modelIndexByComponentId.get(conn.from.componentId)!;
    const toModelIndex = modelIndexByComponentId.get(conn.to.componentId)!;
    const fromConnectorId = conn.from.targetPinId!;
    const toConnectorId = conn.to.targetPinId!;

    // Connect Component A <-> Wire (connector0) and Wire (connector1) <-> Component B
    registerConnect(conn.from.componentId, fromConnectorId, wireModelIndex, 'connector0');
    registerConnect(conn.to.componentId, toConnectorId, wireModelIndex, 'connector1');

    const compA = supportedComponents.find((c) => c.id === conn.from.componentId);
    const compB = supportedComponents.find((c) => c.id === conn.to.componentId);
    const x1 = compA?.layout.x ?? 100;
    const y1 = compA?.layout.y ?? 100;
    const x2 = (compB?.layout.x ?? 260) - x1;
    const y2 = (compB?.layout.y ?? 180) - y1;

    wireInstancesXml.push(`    <instance moduleIdRef="WireModuleID" modelIndex="${wireModelIndex}" path=":/resources/parts/core/wire.fzp">
      <title>Wire${i + 1}</title>
      <views>
        <breadboardView layer="breadboardWire">
          <geometry z="3.5" x="${x1}" y="${y1}" x1="0" y1="0" x2="${x2}" y2="${y2}" wireFlags="64"/>
          <wireExtras mils="22.2222" color="${escapeXml(conn.wireColor || '#10b981')}" opacity="1"/>
          <connectors>
            <connector connectorId="connector0" layer="breadboardWire">
              <connects>
                <connect connectorId="${escapeXml(fromConnectorId)}" modelIndex="${fromModelIndex}" layer="breadboard"/>
              </connects>
            </connector>
            <connector connectorId="connector1" layer="breadboardWire">
              <connects>
                <connect connectorId="${escapeXml(toConnectorId)}" modelIndex="${toModelIndex}" layer="breadboard"/>
              </connects>
            </connector>
          </connectors>
        </breadboardView>
        <schematicView layer="schematicTrace">
          <geometry z="3.5" x="${x1}" y="${y1}" x1="0" y1="0" x2="${x2}" y2="${y2}" wireFlags="64"/>
          <wireExtras mils="22.2222" color="${escapeXml(conn.wireColor || '#10b981')}" opacity="1"/>
          <connectors>
            <connector connectorId="connector0" layer="schematicTrace">
              <connects>
                <connect connectorId="${escapeXml(fromConnectorId)}" modelIndex="${fromModelIndex}" layer="schematic"/>
              </connects>
            </connector>
            <connector connectorId="connector1" layer="schematicTrace">
              <connects>
                <connect connectorId="${escapeXml(toConnectorId)}" modelIndex="${toModelIndex}" layer="schematic"/>
              </connects>
            </connector>
          </connectors>
        </schematicView>
      </views>
    </instance>`);
  }

  // Build component <instance> XML blocks
  const componentInstancesXml = supportedComponents.map((comp: IRComponent) => {
    const modelIndex = modelIndexByComponentId.get(comp.id)!;
    const mapping = PART_MAPPING_REGISTRY.find((m) => m.canonicalType === comp.canonicalType) ||
      findMappingByWokwiType(comp.sourcePartType);

    const modulePath = mapping?.fritzingModulePath ?? `part.${comp.canonicalType}.fzp`;
    const propsXml = Object.entries(comp.targetProperties)
      .map(
        ([k, v]) => `      <property name="${escapeXml(k)}" value="${escapeXml(v)}"/>`
      )
      .join('\n');

    const pinMap: Map<string, Array<{ targetModelIndex: number; targetConnectorId: string }>> =
      componentConnectionsMap.get(comp.id) ?? new Map();
    const bbConnectorsXml = Array.from(pinMap.entries())
      .map(([connectorId, targets]) => {
        const connectsXml = targets
          .map(
            (t) =>
              `                <connect connectorId="${escapeXml(t.targetConnectorId)}" modelIndex="${t.targetModelIndex}" layer="breadboardWire"/>`
          )
          .join('\n');
        return `            <connector connectorId="${escapeXml(connectorId)}" layer="breadboard">
              <connects>
${connectsXml}
              </connects>
            </connector>`;
      })
      .join('\n');

    const schConnectorsXml = Array.from(pinMap.entries())
      .map(([connectorId, targets]) => {
        const connectsXml = targets
          .map(
            (t) =>
              `                <connect connectorId="${escapeXml(t.targetConnectorId)}" modelIndex="${t.targetModelIndex}" layer="schematicTrace"/>`
          )
          .join('\n');
        return `            <connector connectorId="${escapeXml(connectorId)}" layer="schematic">
              <connects>
${connectsXml}
              </connects>
            </connector>`;
      })
      .join('\n');

    return `    <instance moduleIdRef="${escapeXml(comp.targetPartType!)}" modelIndex="${modelIndex}" path="${escapeXml(modulePath)}">
${propsXml ? `${propsXml}\n` : ''}      <title>${escapeXml(comp.label)}</title>
      <views>
        <breadboardView layer="breadboard">
          <geometry z="2.5" x="${comp.layout.x}" y="${comp.layout.y}" rotation="${comp.layout.rotation}"/>
          <connectors>
${bbConnectorsXml}
          </connectors>
        </breadboardView>
        <schematicView layer="schematic">
          <geometry z="2.5" x="${comp.layout.x}" y="${comp.layout.y}" rotation="${comp.layout.rotation}"/>
          <connectors>
${schConnectorsXml}
          </connectors>
        </schematicView>
      </views>
    </instance>`;
  });

  const fzXmlString = `<?xml version="1.0" encoding="UTF-8"?>
<module fritzingVersion="0.9.10">
  <views>
    <view name="breadboardView" backgroundColor="#f8fafc" gridSize="0.1in" showGrid="1" alignToGrid="1" viewFromBelow="0"/>
    <view name="schematicView" backgroundColor="#ffffff" gridSize="0.1in" showGrid="1" alignToGrid="1" viewFromBelow="0"/>
    <view name="pcbView" backgroundColor="#1e293b" gridSize="0.1in" showGrid="1" alignToGrid="1" viewFromBelow="0"/>
  </views>
  <instances>
${componentInstancesXml.join('\n')}
${wireInstancesXml.join('\n')}
  </instances>
</module>`;

  // Validate generated .fz XML immediately
  const xmlValid = XMLValidator.validate(fzXmlString);
  if (xmlValid !== true) {
    throw new Error(`Generated Fritzing .fz XML failed validation: ${xmlValid.err.msg}`);
  }

  // Assemble the .fzz ZIP archive with sketch.fz + part definitions (.fzp) + breadboard SVGs (.svg)
  const zip = new JSZip();
  const baseSketchName =
    circuit.title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'wiremorph_converted_sketch';
  const sketchFileName = `${baseSketchName}.fz`;
  zip.file(sketchFileName, fzXmlString);

  const includedCanonicalTypes = new Set<string>();
  for (const comp of supportedComponents) {
    if (!includedCanonicalTypes.has(comp.canonicalType)) {
      includedCanonicalTypes.add(comp.canonicalType);
      const mapping = PART_MAPPING_REGISTRY.find((m) => m.canonicalType === comp.canonicalType);
      if (mapping) {
        const fzpContent = buildFritzingPartFzpXml(mapping);
        const svgContent = buildFritzingBreadboardSvg(mapping);
        zip.file(`part.${mapping.canonicalType}.fzp`, fzpContent);
        zip.file(`svg.breadboard.${mapping.canonicalType}_breadboard.svg`, svgContent);
      }
    }
  }

  const archiveBytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  // Self-verify by re-opening the generated .fzz ZIP archive and validating its contents
  const verifyZip = await JSZip.loadAsync(archiveBytes);
  const verifyFz = verifyZip.file(sketchFileName);
  if (!verifyFz) {
    throw new Error('Archive verification failed: generated .fz sketch missing from .fzz archive.');
  }
  const verifyFzString = await verifyFz.async('string');
  if (XMLValidator.validate(verifyFzString) !== true) {
    throw new Error('Archive verification failed: extracted .fz XML is invalid.');
  }

  const archiveFileInventory: Array<{ path: string; sizeBytes: number }> = [];
  for (const entry of Object.values(verifyZip.files)) {
    if (!entry.dir) {
      const b = await entry.async('uint8array');
      archiveFileInventory.push({ path: entry.name, sizeBytes: b.byteLength });
    }
  }

  return {
    archiveBytes,
    fzXmlString,
    archiveFileInventory,
  };
}

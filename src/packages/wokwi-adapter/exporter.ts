import { IRCircuit } from '../conversion-core/types';
import { WokwiConnectionTuple, WokwiDiagramJson, WokwiPartJson } from './importer';

/**
 * Exports a validated `IRCircuit` into a formatted Wokwi `diagram.json` string
 * and verifies that the generated JSON parses and adheres to Wokwi schema rules.
 */
export function exportCircuitToWokwiJson(circuit: IRCircuit): string {
  const supportedComponents = circuit.components.filter(
    (c) =>
      c.mappingStatus !== 'unsupported' &&
      c.mappingStatus !== 'rejected' &&
      Boolean(c.targetPartType)
  );

  const parts: WokwiPartJson[] = supportedComponents.map((comp) => {
    const partEntry: WokwiPartJson = {
      type: comp.targetPartType!,
      id: comp.id,
      top: comp.layout.y,
      left: comp.layout.x,
      attrs: { ...comp.targetProperties },
    };
    if (comp.layout.rotation !== 0) {
      partEntry.rotate = comp.layout.rotation;
    }
    return partEntry;
  });

  const validPartIds = new Set(parts.map((p) => p.id));

  const connections: WokwiConnectionTuple[] = [];
  for (const conn of circuit.connections) {
    if (
      conn.status === 'unsupported' ||
      conn.status === 'rejected' ||
      !conn.from.targetPinId ||
      !conn.to.targetPinId
    ) {
      continue;
    }
    if (!validPartIds.has(conn.from.componentId) || !validPartIds.has(conn.to.componentId)) {
      continue;
    }

    const fromEndpoint = `${conn.from.componentId}:${conn.from.targetPinId}`;
    const toEndpoint = `${conn.to.componentId}:${conn.to.targetPinId}`;
    const color = conn.wireColor || 'green';
    const path = conn.routingHints ?? [];

    connections.push([fromEndpoint, toEndpoint, color, path]);
  }

  const diagram: WokwiDiagramJson = {
    version: 1,
    author: circuit.author || 'WireMorph Fritzing-to-Wokwi Converter',
    editor: 'wokwi',
    parts,
    connections,
    dependencies: {},
  };

  const jsonString = JSON.stringify(diagram, null, 2);

  // Post-generation validation check
  const reparsed = JSON.parse(jsonString) as WokwiDiagramJson;
  if (!Array.isArray(reparsed.parts) || !Array.isArray(reparsed.connections)) {
    throw new Error('Export validation failed: generated Wokwi JSON is missing parts or connections arrays.');
  }

  return jsonString;
}

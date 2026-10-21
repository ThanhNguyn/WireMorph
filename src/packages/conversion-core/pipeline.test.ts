import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { XMLValidator } from 'fast-xml-parser';
import {
  convertFritzingToWokwi,
  convertWokwiToFritzing,
  formatConversionReportMarkdown,
} from './pipeline';
import {
  buildEsp32V4AdcPwmFzzArchive,
  buildFzzArchiveFromXml,
  getEsp32LedBlinkFzXml,
  getFritzingAmbiguousPinFzXml,
  getFritzingUnsupportedPartFzXml,
  getResistorPushbuttonBreadboardFzXml,
  getWokwiMultiSensorDiagramJson,
} from '../fixtures/circuits';
import {
  findMappingByFritzingModule,
  findMappingByWokwiType,
  normalizeResistanceToOhms,
  PART_MAPPING_REGISTRY,
} from '../part-mappings/registry';

test('1. Component and Pin Mapping Registry covers all core ESP32 training parts (30-pin V1 and 38-pin V4)', () => {
  assert.ok(PART_MAPPING_REGISTRY.length >= 9);

  const espMapping = findMappingByFritzingModule('ESP32-DevKitC-30P-ModuleID');
  assert.ok(espMapping);
  assert.equal(espMapping.wokwiPartType, 'wokwi-esp32-devkit-v1');
  assert.equal(espMapping.pins.length, 30);

  const espV4Mapping = findMappingByFritzingModule('ESP32_DevKitc_V4_1');
  assert.ok(espV4Mapping);
  assert.equal(espV4Mapping.wokwiPartType, 'board-esp32-devkit-c-v4');
  assert.equal(espV4Mapping.pins.length, 38);

  const ledMapping = findMappingByWokwiType('wokwi-led');
  assert.ok(ledMapping);
  assert.equal(ledMapping.primaryFritzingModuleId, '5mm-LED-Red-ModuleID');

  assert.equal(normalizeResistanceToOhms('220Ω').ohmsString, '220');
  assert.equal(normalizeResistanceToOhms('4.7kΩ').ohmsString, '4700');
  assert.equal(normalizeResistanceToOhms('10k').ohmsString, '10000');
  assert.equal(normalizeResistanceToOhms('1MΩ').ohmsString, '1000000');
});

test('2. Fritzing (.fzz) -> Wokwi (diagram.json): Minimal ESP32 + LED + 220Ω Resistor Blink circuit', async () => {
  const fzzBytes = await buildFzzArchiveFromXml(getEsp32LedBlinkFzXml(), 'esp32_led_blink.fz');
  const result = await convertFritzingToWokwi(fzzBytes, 'esp32_led_blink.fzz');

  assert.equal(result.report.canExportSafely, true);
  assert.equal(result.report.overallStatus, 'success');
  assert.equal(result.report.metrics.totalComponentsDetected, 3);
  assert.equal(result.report.metrics.componentsMapped, 3);
  assert.equal(result.report.metrics.connectionsPreserved, 3);
  assert.ok(result.wokwiJsonString);

  const wokwiDoc = JSON.parse(result.wokwiJsonString);
  assert.equal(wokwiDoc.version, 1);
  assert.equal(wokwiDoc.parts.length, 3);
  assert.equal(wokwiDoc.connections.length, 3);

  // Verify exact mapped Wokwi part types and attributes
  const espPart = wokwiDoc.parts.find((p: { type: string }) => p.type === 'wokwi-esp32-devkit-v1');
  const rPart = wokwiDoc.parts.find((p: { type: string }) => p.type === 'wokwi-resistor');
  const ledPart = wokwiDoc.parts.find((p: { type: string }) => p.type === 'wokwi-led');

  assert.ok(espPart);
  assert.ok(rPart);
  assert.equal(rPart.attrs.value, '220');
  assert.ok(ledPart);
  assert.equal(ledPart.attrs.color, 'red');

  // Verify topological pin endpoints
  const flatConns = wokwiDoc.connections.map((c: string[]) => `${c[0]}<->${c[1]}`).join(' | ');
  assert.ok(flatConns.includes('esp1:D2') && flatConns.includes('r1:1'));
  assert.ok(flatConns.includes('r1:2') && flatConns.includes('led1:A'));
  assert.ok(flatConns.includes('led1:C') && flatConns.includes('esp1:GND.1'));
});

test('3. Breadboard 5-hole strip net solver: Resistor + Pushbutton + LED on Breadboard', async () => {
  const fzzBytes = await buildFzzArchiveFromXml(
    getResistorPushbuttonBreadboardFzXml(),
    'breadboard_io.fz'
  );
  const result = await convertFritzingToWokwi(fzzBytes, 'breadboard_io.fzz');

  assert.equal(result.report.canExportSafely, true);
  assert.equal(result.report.metrics.totalComponentsDetected, 4); // ESP1, BTN1, R_PULLDOWN, LED_STATUS
  assert.ok(result.report.metrics.connectionsPreserved >= 4);

  // Verify that pin12A (BTN1 connector2 -> 2.l), pin12C (R_PULLDOWN connector0 -> 1), and pin12E (Wire_Sense -> ESP1 connector11 -> D14)
  // were electrically joined across BB_10_ROW_12_ABCDE!
  const wokwiDoc = JSON.parse(result.wokwiJsonString!);
  const endpoints = wokwiDoc.connections.flatMap((c: string[]) => [c[0], c[1]]);
  assert.ok(endpoints.includes('btn1:2.l'));
  assert.ok(endpoints.includes('r1:1'));
  assert.ok(endpoints.includes('esp1:D14'));
});

test('4. Wokwi (diagram.json) -> Fritzing (.fzz): Multi-sensor IoT diagram produces valid extractable .fzz archive', async () => {
  const wokwiJson = getWokwiMultiSensorDiagramJson();
  const result = await convertWokwiToFritzing(wokwiJson, 'diagram.json');

  assert.equal(result.report.canExportSafely, true);
  assert.equal(result.report.metrics.totalComponentsDetected, 6);
  assert.equal(result.report.metrics.componentsMapped, 6);
  assert.ok(result.fritzingArchiveBytes);
  assert.ok(result.fritzingFzXmlString);

  // Extract generated .fzz archive and validate .fz XML + embedded .fzp + .svg part files
  const zip = await JSZip.loadAsync(result.fritzingArchiveBytes);
  const fileNames = Object.keys(zip.files);
  assert.ok(fileNames.some((n) => n.endsWith('.fz')));
  assert.ok(fileNames.some((n) => n.endsWith('.fzp')));
  assert.ok(fileNames.some((n) => n.endsWith('.svg')));

  for (const name of fileNames) {
    if (name.endsWith('.fz') || name.endsWith('.fzp') || name.endsWith('.svg')) {
      const xmlStr = await zip.file(name)!.async('string');
      assert.equal(XMLValidator.validate(xmlStr), true, `Expected valid XML in archive entry ${name}`);
    }
  }

  // Verify round-trip loss reporting for Wokwi wire routing bend instructions and simulation attributes
  assert.ok(
    result.report.diagnostics.some((d) => d.code === 'WARN_WOKWI_WIRE_ROUTING_APPROXIMATED')
  );
  assert.ok(result.report.omittedMetadata.length > 0);
});

test('5. Bidirectional Round-Trip: Fritzing (.fzz) -> Wokwi (diagram.json) -> Fritzing (.fzz) -> Wokwi', async () => {
  const initialFzz = await buildFzzArchiveFromXml(getEsp32LedBlinkFzXml(), 'blink.fz');
  const step1 = await convertFritzingToWokwi(initialFzz, 'blink.fzz');
  assert.equal(step1.report.canExportSafely, true);

  // Convert generated Wokwi JSON back into a Fritzing .fzz archive
  const step2 = await convertWokwiToFritzing(step1.wokwiJsonString!, 'diagram.json');
  assert.equal(step2.report.canExportSafely, true);
  assert.ok(step2.fritzingArchiveBytes);

  // Convert the regenerated .fzz archive back to Wokwi JSON and verify topological equivalence
  const step3 = await convertFritzingToWokwi(step2.fritzingArchiveBytes!, 'roundtrip.fzz');
  assert.equal(step3.report.canExportSafely, true);
  assert.equal(step3.report.metrics.componentsMapped, 3);
  assert.equal(step3.report.metrics.connectionsPreserved, 3);
});

test('6. Unsupported Component Diagnostic: Partial circuit preserves supported parts and flags unsupported', async () => {
  const fzzBytes = await buildFzzArchiveFromXml(
    getFritzingUnsupportedPartFzXml(),
    'partial_bmp280.fz'
  );
  const result = await convertFritzingToWokwi(fzzBytes, 'partial_bmp280.fzz');

  assert.equal(result.report.canExportSafely, true);
  assert.equal(result.report.overallStatus, 'completed-with-warnings');
  assert.equal(result.report.metrics.totalComponentsDetected, 3);
  assert.equal(result.report.metrics.componentsMapped, 2);
  assert.equal(result.report.metrics.componentsUnsupported, 1);
  assert.equal(result.report.metrics.unsupportedCount, 1);

  const md = formatConversionReportMarkdown(result);
  assert.ok(md.includes('BMP280_BARO'));
  assert.ok(md.includes('UNSUPPORTED_FRITZING_PART'));
});

test('7. Safety Gate: Unresolved / Ambiguous Connector ID is rejected and blocks export', async () => {
  const fzzBytes = await buildFzzArchiveFromXml(
    getFritzingAmbiguousPinFzXml(),
    'ambiguous_pin.fz'
  );
  const result = await convertFritzingToWokwi(fzzBytes, 'ambiguous_pin.fzz');

  assert.equal(result.report.canExportSafely, false);
  assert.equal(result.report.overallStatus, 'rejected');
  assert.equal(result.wokwiJsonString, undefined);
  assert.ok(
    result.report.diagnostics.some((d) => d.code === 'ERR_FRITZING_UNRESOLVED_CONNECTOR')
  );
});

test('8. Error Handling: Malformed XML, Malformed JSON, Invalid ZIP, Duplicate IDs, and Dangling References', async () => {
  // 8a. Invalid ZIP bytes
  const invalidZipBytes = new TextEncoder().encode('NOT_A_VALID_PK_ZIP_HEADER');
  const badZipRes = await convertFritzingToWokwi(invalidZipBytes, 'corrupt.fzz');
  assert.equal(badZipRes.report.canExportSafely, false);
  assert.ok(badZipRes.report.diagnostics.some((d) => d.code === 'ERR_FRITZING_INVALID_ZIP'));

  // 8b. ZIP without .fz file
  const emptyZip = new JSZip();
  emptyZip.file('readme.txt', 'no fz file here');
  const noFzBytes = await emptyZip.generateAsync({ type: 'uint8array' });
  const noFzRes = await convertFritzingToWokwi(noFzBytes, 'missing_sketch.fzz');
  assert.equal(noFzRes.report.canExportSafely, false);
  assert.ok(noFzRes.report.diagnostics.some((d) => d.code === 'ERR_FRITZING_MISSING_FZ_SKETCH'));

  // 8c. Malformed XML inside .fzz
  const malformedXmlBytes = await buildFzzArchiveFromXml(
    '<module fritzingVersion="0.9.10"><instances><instance modelIndex="1"></instances>',
    'broken.fz'
  );
  const badXmlRes = await convertFritzingToWokwi(malformedXmlBytes, 'broken.fzz');
  assert.equal(badXmlRes.report.canExportSafely, false);
  assert.ok(badXmlRes.report.diagnostics.some((d) => d.code === 'ERR_FRITZING_MALFORMED_XML'));

  // 8d. Malformed Wokwi JSON
  const badJsonRes = await convertWokwiToFritzing('{ "version": 1, "parts": [ ', 'broken.json');
  assert.equal(badJsonRes.report.canExportSafely, false);
  assert.ok(badJsonRes.report.diagnostics.some((d) => d.code === 'ERR_WOKWI_MALFORMED_JSON'));

  // 8e. Duplicate Wokwi part IDs and dangling connection reference
  const dupAndDanglingJson = JSON.stringify({
    version: 1,
    parts: [
      { type: 'wokwi-led', id: 'led1', top: 0, left: 0 },
      { type: 'wokwi-led', id: 'led1', top: 20, left: 20 },
    ],
    connections: [['led1:A', 'missing_esp:D2', 'green', []]],
  });
  const dupRes = await convertWokwiToFritzing(dupAndDanglingJson, 'dup.json');
  assert.equal(dupRes.report.canExportSafely, false);
  assert.ok(dupRes.report.diagnostics.some((d) => d.code === 'ERR_WOKWI_DUPLICATE_PART_ID'));
  assert.ok(dupRes.report.diagnostics.some((d) => d.code === 'ERR_WOKWI_DANGLING_CONNECTION_PART'));
});

test('9. Week 5 Custom Part (ESP32_DevKitc_V4_1 38-Pin) + Potentiometer + $serialMonitor bidirectional conversion', async () => {
  // 9a. Fritzing .fzz with embedded part.ESP32_DevKitc_V4_1.fzp -> Wokwi diagram.json
  const v4Fzz = await buildEsp32V4AdcPwmFzzArchive();
  const fwd = await convertFritzingToWokwi(v4Fzz, 'bai3a_adc1_filter_ledc.fzz');
  assert.equal(fwd.report.canExportSafely, true);
  assert.equal(fwd.report.overallStatus, 'success');
  assert.equal(fwd.report.metrics.componentsMapped, 4);
  assert.equal(fwd.report.metrics.connectionsPreserved, 6);

  const wokwiDoc = JSON.parse(fwd.wokwiJsonString!);
  assert.ok(wokwiDoc.parts.some((p: { type: string }) => p.type === 'board-esp32-devkit-c-v4'));
  assert.ok(wokwiDoc.parts.some((p: { type: string }) => p.type === 'wokwi-potentiometer'));

  // 9b. Wokwi diagram.json with board-esp32-devkit-c-v4 and $serialMonitor virtual connections -> Fritzing .fzz -> Wokwi
  const week5WokwiJson = JSON.stringify({
    version: 1,
    author: '',
    editor: 'wokwi',
    parts: [
      { type: 'board-esp32-devkit-c-v4', id: 'esp', top: 0, left: 0, attrs: {} },
      { type: 'wokwi-led', id: 'led1', top: -90, left: 170, attrs: { color: 'red' } },
      { type: 'wokwi-resistor', id: 'r1', top: -40, left: 120, rotate: 90, attrs: { value: '220' } },
      { type: 'wokwi-pushbutton', id: 'btn1', top: 90, left: 170, attrs: { color: 'green' } },
    ],
    connections: [
      ['esp:TX', '$serialMonitor:RX', ''],
      ['esp:RX', '$serialMonitor:TX', ''],
      ['esp:2', 'r1:1', 'green', []],
      ['r1:2', 'led1:A', 'green', []],
      ['led1:C', 'esp:GND.1', 'black', []],
      ['esp:4', 'btn1:1.l', 'blue', []],
      ['btn1:2.l', 'esp:GND.1', 'black', []],
    ],
    dependencies: {},
  });

  const rev = await convertWokwiToFritzing(week5WokwiJson, 'week5_bai1a_diagram.json');
  assert.equal(rev.report.canExportSafely, true);
  assert.equal(rev.report.metrics.componentsMapped, 4);
  assert.equal(rev.report.metrics.connectionsPreserved, 5);
  assert.ok(
    rev.report.diagnostics.some((d) => d.code === 'INFO_WOKWI_VIRTUAL_SERIAL_MONITOR')
  );

  const rtWokwi = await convertFritzingToWokwi(rev.fritzingArchiveBytes!, 'week5_bai1a_rt.fzz');
  assert.equal(rtWokwi.report.canExportSafely, true);
  assert.equal(rtWokwi.report.metrics.componentsMapped, 4);
  assert.equal(rtWokwi.report.metrics.connectionsPreserved, 5);
});

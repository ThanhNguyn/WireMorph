import React, { useRef, useState } from 'react';
import {
  ArrowRight,
  Cpu,
  Download,
  FileCode2,
  FileUp,
  FolderArchive,
  Play,
} from 'lucide-react';
import {
  ConversionDirection,
  ConversionResult,
} from './packages/conversion-core/types';
import {
  convertFritzingToWokwi,
  convertWokwiToFritzing,
} from './packages/conversion-core/pipeline';
import {
  loadSampleFixturePayload,
  SAMPLE_FIXTURES,
  SampleFixtureMeta,
} from './packages/fixtures/circuits';
import { PART_MAPPING_REGISTRY } from './packages/part-mappings/registry';
import { downloadBinaryFile, downloadTextFile } from './utils/download';
import { ConversionPreviewPanel } from './components/ConversionPreviewPanel';
import { PartRegistryView } from './components/PartRegistryView';
import { LimitationsAndGuideView } from './components/LimitationsAndGuideView';

type ActiveSection = 'workspace' | 'registry' | 'limitations' | 'platformio-guide';

const FIXTURE_TELEMETRY_PREVIEW: Record<
  string,
  {
    nodes: string[];
    nets: Array<{ from: string; to: string; signal: string }>;
    summaryNote: string;
  }
> = {
  'esp32-led-blink': {
    nodes: [
      'ESP1 · ESP32-DevKitC-30P → wokwi-esp32-devkit-v1',
      'R1 · ResistorModuleID (220Ω) → wokwi-resistor (220)',
      'LED1 · 5mm-LED-Red → wokwi-led (red)',
    ],
    nets: [
      { from: 'esp1:D2 (connector27)', to: 'r1:1 (connector0)', signal: 'GPIO2_DRIVE' },
      { from: 'r1:2 (connector1)', to: 'led1:A (connector1)', signal: 'CURRENT_LIM' },
      { from: 'led1:C (connector0)', to: 'esp1:GND.1 (connector13)', signal: 'GND_RETURN' },
    ],
    summaryNote: '3/3 components mapped · 3/3 nets preserved · 0 losses',
  },
  'resistor-pushbutton-io': {
    nodes: [
      'ESP1 · ESP32-DevKitC-30P → wokwi-esp32-devkit-v1',
      'BTN1 · Tactile-Pushbutton → wokwi-pushbutton',
      'R_PULLDOWN · ResistorModuleID (10kΩ) → wokwi-resistor (10000)',
      'LED_STATUS · 5mm-LED-Green → wokwi-led (green)',
    ],
    nets: [
      { from: 'esp1:3V3', to: 'btn1:1.l', signal: 'VCC_3V3' },
      { from: 'btn1:2.l', to: 'esp1:D14 & r1:1 (via BB Row 12A–12E)', signal: 'SENSE_NODE' },
      { from: 'esp1:D4', to: 'led1:A', signal: 'STATUS_OUT' },
    ],
    summaryNote: '4/4 components mapped · Breadboard Row 12A–12E strip resolved',
  },
  'wokwi-multi-sensor-iot': {
    nodes: [
      'esp1 · wokwi-esp32-devkit-v1 → ESP32-DevKitC-30P',
      'dht1 · wokwi-dht22 → DHT22-Humidity-Temperature',
      'oled1 · board-ssd1306 → SSD1306-OLED-I2C',
      'btn1 · wokwi-pushbutton → Tactile-Pushbutton',
      'led1 + r1 · wokwi-led + wokwi-resistor',
    ],
    nets: [
      { from: 'esp1:D15', to: 'dht1:SDA (connector1)', signal: 'ONEWIRE_DATA' },
      { from: 'esp1:D22 / D21', to: 'oled1:SCL / SDA', signal: 'I2C_BUS' },
      { from: 'esp1:D2', to: 'r1:1 → led1:A', signal: 'ACTUATOR_LED' },
    ],
    summaryNote: '6/6 components exported into extractable .fzz ZIP with .fz + .fzp + .svg',
  },
  'esp32-v4-adc-pwm': {
    nodes: [
      'ESP32 DevKitC V4 · ESP32_DevKitc_V4_1.fzp → board-esp32-devkit-c-v4',
      'RV1 · 3234DFDC00PotentiometerModuleID (10kΩ) → wokwi-potentiometer',
      'R1 · ResistorModuleID (220Ω) → wokwi-resistor (220)',
      'D1 · 5mmColorLEDModuleID → wokwi-led (red)',
    ],
    nets: [
      { from: 'pot1:SIG (connector1)', to: 'esp1:34 (connector4)', signal: 'ADC1_CH6_IN' },
      { from: 'esp1:18 (connector29)', to: 'r1:1 → led1:A', signal: 'LEDC_PWM_OUT' },
      { from: 'pot1:VCC / GND', to: 'esp1:3V3 / GND.1', signal: 'PWR_RAILS' },
    ],
    summaryNote: '4/4 components mapped (38-pin custom .fzp) · 6/6 nets preserved · 0 losses',
  },
  'fritzing-unsupported-part': {
    nodes: [
      'ESP1 · ESP32-DevKitC-30P → wokwi-esp32-devkit-v1',
      'LED_WARN · 5mm-LED-Yellow → wokwi-led (yellow)',
      'BMP280_BARO · Bosch-BMP280-Breakout → UNSUPPORTED',
    ],
    nets: [
      { from: 'esp1:D2', to: 'led1:A', signal: 'PRESERVED_NET' },
      { from: 'esp1:GND.1', to: 'led1:C', signal: 'PRESERVED_NET' },
      { from: 'esp1:D22', to: 'BMP280:connector_scl', signal: 'OMITTED_UNSUPPORTED' },
    ],
    summaryNote: '2/3 components mapped · 1 unsupported part explicitly reported',
  },
  'fritzing-ambiguous-pin': {
    nodes: [
      'ESP1 · ESP32-DevKitC-30P → wokwi-esp32-devkit-v1',
      'LED1 · 5mm-LED-Red → wokwi-led (red)',
    ],
    nets: [
      {
        from: 'ESP1:connector99_ambiguous',
        to: 'LED1:connector1',
        signal: 'HALTS_SAFETY_GATE',
      },
    ],
    summaryNote: 'Export blocked by safety gate (ERR_FRITZING_UNRESOLVED_CONNECTOR)',
  },
};

export default function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('workspace');
  const [direction, setDirection] = useState<ConversionDirection>('fritzing-to-wokwi');
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null);
  const [selectedFixturePreviewId, setSelectedFixturePreviewId] =
    useState<string>('esp32-led-blink');
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleLoadFixture = async (fixtureId: string) => {
    setIsProcessing(true);
    setUploadError(null);
    setActiveSection('workspace');
    setSelectedFixturePreviewId(fixtureId);
    try {
      const payload = await loadSampleFixturePayload(fixtureId);
      setDirection(payload.meta.direction);
      if (payload.meta.direction === 'fritzing-to-wokwi' && payload.binaryBytes) {
        const res = await convertFritzingToWokwi(payload.binaryBytes, payload.meta.fileName);
        setConversionResult(res);
      } else if (payload.meta.direction === 'wokwi-to-fritzing' && payload.jsonText) {
        const res = await convertWokwiToFritzing(payload.jsonText, payload.meta.fileName);
        setConversionResult(res);
      }
      window.scrollTo({ top: 0 });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to load circuit fixture.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadRawFixture = async (fixture: SampleFixtureMeta) => {
    const payload = await loadSampleFixturePayload(fixture.id);
    if (payload.binaryBytes) {
      downloadBinaryFile(payload.binaryBytes, fixture.fileName, 'application/zip');
    } else if (payload.jsonText) {
      downloadTextFile(payload.jsonText, fixture.fileName, 'application/json;charset=utf-8');
    }
  };

  const handleFileSelected = async (file: File) => {
    setIsProcessing(true);
    setUploadError(null);
    setActiveSection('workspace');

    try {
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.fzz') || lowerName.endsWith('.fzpz') || lowerName.endsWith('.zip')) {
        setDirection('fritzing-to-wokwi');
        const arrayBuffer = await file.arrayBuffer();
        const res = await convertFritzingToWokwi(new Uint8Array(arrayBuffer), file.name);
        setConversionResult(res);
      } else if (lowerName.endsWith('.json')) {
        setDirection('wokwi-to-fritzing');
        const text = await file.text();
        const res = await convertWokwiToFritzing(text, file.name, file.size);
        setConversionResult(res);
      } else {
        if (direction === 'fritzing-to-wokwi') {
          const arrayBuffer = await file.arrayBuffer();
          const res = await convertFritzingToWokwi(new Uint8Array(arrayBuffer), file.name);
          setConversionResult(res);
        } else {
          const text = await file.text();
          const res = await convertWokwiToFritzing(text, file.name, file.size);
          setConversionResult(res);
        }
      }
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Unexpected error while reading uploaded file.'
      );
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRoundTripConvert = async (currentResult: ConversionResult) => {
    setIsProcessing(true);
    setUploadError(null);
    try {
      if (currentResult.report.outputFormat === 'wokwi' && currentResult.wokwiJsonString) {
        setDirection('wokwi-to-fritzing');
        const rtRes = await convertWokwiToFritzing(
          currentResult.wokwiJsonString,
          'roundtrip_diagram.json'
        );
        setConversionResult(rtRes);
      } else if (
        currentResult.report.outputFormat === 'fritzing' &&
        currentResult.fritzingArchiveBytes
      ) {
        setDirection('fritzing-to-wokwi');
        const rtRes = await convertFritzingToWokwi(
          currentResult.fritzingArchiveBytes,
          'roundtrip_project.fzz'
        );
        setConversionResult(rtRes);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Round-trip conversion failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await handleFileSelected(file);
    }
  };

  const activePreviewFixture =
    SAMPLE_FIXTURES.find((f) => f.id === selectedFixturePreviewId) ?? SAMPLE_FIXTURES[0];
  const activePreviewDetails =
    FIXTURE_TELEMETRY_PREVIEW[activePreviewFixture.id] ??
    FIXTURE_TELEMETRY_PREVIEW['esp32-led-blink'];

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] bg-engineering-grid text-slate-900">
      {/* Top Bar Contract: Zone 1 (Wordmark) — Zone 2 (4 Single-Line Nav Links) — Zone 3 (1 Primary Action) */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-[1280px] mx-auto flex flex-wrap md:flex-nowrap items-center justify-between gap-x-6 gap-y-2 px-4 sm:px-6 py-3">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#workspace"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('workspace');
            }}
            className="text-lg font-display font-bold tracking-tight text-slate-950 whitespace-nowrap shrink-0"
          >
            WireMorph
          </a>

          {/* Zone 2: 4 concise single-line navigation links */}
          <nav
            aria-label="Primary Navigation"
            className="order-3 md:order-2 w-full md:w-auto flex items-center gap-5 sm:gap-7 text-xs sm:text-sm font-medium text-slate-600 overflow-x-auto pt-1 md:pt-0 border-t md:border-t-0 border-slate-100"
          >
            <button
              type="button"
              onClick={() => setActiveSection('workspace')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeSection === 'workspace'
                  ? 'border-blue-600 text-slate-950 font-semibold'
                  : 'border-transparent hover:text-slate-950'
              }`}
            >
              Workspace
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('registry')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeSection === 'registry'
                  ? 'border-blue-600 text-slate-950 font-semibold'
                  : 'border-transparent hover:text-slate-950'
              }`}
            >
              Part Registry
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('limitations')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeSection === 'limitations'
                  ? 'border-blue-600 text-slate-950 font-semibold'
                  : 'border-transparent hover:text-slate-950'
              }`}
            >
              Limitations
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('platformio-guide')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeSection === 'platformio-guide'
                  ? 'border-blue-600 text-slate-950 font-semibold'
                  : 'border-transparent hover:text-slate-950'
              }`}
            >
              PlatformIO Guide
            </button>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="order-2 md:order-3 flex items-center shrink-0">
            {conversionResult ? (
              <button
                type="button"
                onClick={() => setConversionResult(null)}
                className="px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                New Conversion
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleLoadFixture('esp32-led-blink')}
                className="px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
              >
                Load ESP32 Blink Demo
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1280px] w-full mx-auto px-4 sm:px-6 py-8">
        {activeSection === 'workspace' && (
          <div className="space-y-8">
            {/* Asymmetric 12-Column Split Console when no file is active */}
            {!conversionResult && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                  {/* Left 7 Columns: Intake Console & Direction Selector */}
                  <div className="lg:col-span-7 border border-slate-200 bg-white rounded-lg p-6 sm:p-7 flex flex-col justify-between">
                    <div className="space-y-5">
                      <div className="space-y-2">
                        <div className="text-xs font-mono text-slate-500 tabular-nums">
                          Fritzing (.fzz) ↔ Wokwi (diagram.json) · 100% Client-Side Engine ·{' '}
                          {PART_MAPPING_REGISTRY.length} Verified Component Families
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-950 tracking-tight text-balance">
                          Precision Electronic Circuit Converter for ESP32 & PlatformIO
                        </h1>
                        <p className="text-sm text-slate-600 leading-relaxed">
                          Transfer hardware schematics between Fritzing breadboard archives (
                          <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                            .fzz
                          </code>
                          ) and Wokwi simulation projects (
                          <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                            diagram.json
                          </code>
                          ) with deterministic breadboard strip resolution and full conversion loss
                          accounting.
                        </p>
                      </div>

                      {/* Segmented Direction Switcher */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => setDirection('fritzing-to-wokwi')}
                          className={`p-4 rounded-lg border text-left transition-colors ${
                            direction === 'fritzing-to-wokwi'
                              ? 'border-blue-600 bg-blue-50/50'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-900 flex items-center gap-2">
                              <FolderArchive
                                className="w-4 h-4 text-blue-600 shrink-0"
                                aria-hidden="true"
                              />
                              Fritzing → Wokwi
                            </span>
                            <span className="text-xs font-mono text-slate-500">.fzz → .json</span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                            Extracts <code className="font-mono">.fzz</code> ZIP, resolves{' '}
                            <code className="font-mono">.fz</code> XML & breadboard strips into
                            Wokwi JSON.
                          </p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setDirection('wokwi-to-fritzing')}
                          className={`p-4 rounded-lg border text-left transition-colors ${
                            direction === 'wokwi-to-fritzing'
                              ? 'border-blue-600 bg-blue-50/50'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-900 flex items-center gap-2">
                              <FileCode2
                                className="w-4 h-4 text-blue-600 shrink-0"
                                aria-hidden="true"
                              />
                              Wokwi → Fritzing
                            </span>
                            <span className="text-xs font-mono text-slate-500">.json → .fzz</span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                            Packages a real Fritzing <code className="font-mono">.fzz</code> archive
                            with verified <code className="font-mono">.fz</code>,{' '}
                            <code className="font-mono">.fzp</code>, and{' '}
                            <code className="font-mono">.svg</code> files.
                          </p>
                        </button>
                      </div>

                      {/* Tactile File Intake Dropzone */}
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragActive(true);
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDragActive(false);
                        }}
                        onDrop={handleDrop}
                        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                          dragActive
                            ? 'border-blue-600 bg-blue-50/50'
                            : 'border-slate-300 bg-slate-50/70 hover:border-slate-400'
                        }`}
                      >
                        <input
                          ref={fileInputRef}
                          id="circuit-file-upload"
                          type="file"
                          accept=".fzz,.fzpz,.fz,.json,.zip"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileSelected(file);
                          }}
                          className="sr-only"
                        />
                        <FileUp
                          className="w-7 h-7 text-slate-500 mx-auto mb-2.5"
                          aria-hidden="true"
                        />
                        <h2 className="text-sm font-bold text-slate-900">
                          {direction === 'fritzing-to-wokwi'
                            ? 'Drop a Fritzing Project Archive (.fzz) or Browse Local Disk'
                            : 'Drop a Wokwi Diagram File (diagram.json) or Browse Local Disk'}
                        </h2>
                        <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
                          Zero server uploads or cloud telemetry. Archives are validated and
                          converted locally in browser memory.
                        </p>
                        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                          <label
                            htmlFor="circuit-file-upload"
                            className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                          >
                            Select Circuit File ({direction === 'fritzing-to-wokwi' ? '.fzz' : '.json'})
                          </label>
                        </div>

                        {isProcessing && (
                          <div className="mt-3 text-xs font-mono text-blue-700">
                            Parsing archive and verifying topological netlist...
                          </div>
                        )}

                        {uploadError && (
                          <div className="mt-3 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2 inline-block">
                            {uploadError}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 4-Stage Pipeline Architecture Strip */}
                    <div className="mt-6 pt-4 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <div className="font-mono text-[11px] text-blue-700 font-semibold">
                          01. Archive & AST
                        </div>
                        <div className="text-slate-600 mt-0.5">ZIP safety & strict XML/JSON</div>
                      </div>
                      <div>
                        <div className="font-mono text-[11px] text-blue-700 font-semibold">
                          02. Netlist Solver
                        </div>
                        <div className="text-slate-600 mt-0.5">5-hole strip & wire graph</div>
                      </div>
                      <div>
                        <div className="font-mono text-[11px] text-blue-700 font-semibold">
                          03. Part Registry
                        </div>
                        <div className="text-slate-600 mt-0.5">Pin & unit normalization</div>
                      </div>
                      <div>
                        <div className="font-mono text-[11px] text-blue-700 font-semibold">
                          04. Safety Gate
                        </div>
                        <div className="text-slate-600 mt-0.5">Post-export verification</div>
                      </div>
                    </div>
                  </div>

                  {/* Right 5 Columns: Dark Obsidian Hardware Fixture Telemetry Bench */}
                  <div className="lg:col-span-5 border border-slate-800 bg-[#0B0F19] text-slate-100 rounded-lg p-6 flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
                          <span className="text-xs font-mono uppercase tracking-wider text-cyan-400">
                            Hardware Reference Bench
                          </span>
                        </div>
                        <span className="text-xs font-mono text-slate-400 tabular-nums">
                          {activePreviewFixture.fileName}
                        </span>
                      </div>

                      {/* Quick Selector Buttons for the 5 Reference Circuits */}
                      <div className="space-y-1.5">
                        <div className="text-xs text-slate-400">
                          Select a verified circuit fixture to preview its netlist topology:
                        </div>
                        <div className="grid grid-cols-1 gap-1.5 pt-1">
                          {SAMPLE_FIXTURES.map((fix) => {
                            const isSelected = fix.id === activePreviewFixture.id;
                            return (
                              <button
                                key={fix.id}
                                type="button"
                                onClick={() => setSelectedFixturePreviewId(fix.id)}
                                className={`w-full text-left px-3 py-2 rounded border text-xs transition-colors flex items-center justify-between gap-2 ${
                                  isSelected
                                    ? 'border-cyan-500/80 bg-cyan-950/40 text-white'
                                    : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:bg-slate-900 hover:text-white'
                                }`}
                              >
                                <span className="font-medium truncate">{fix.title}</span>
                                <span
                                  className={`font-mono text-[11px] shrink-0 ${
                                    fix.expectedOutcome === 'clean'
                                      ? 'text-emerald-400'
                                      : fix.expectedOutcome === 'warnings-unsupported'
                                        ? 'text-amber-400'
                                        : 'text-rose-400'
                                  }`}
                                >
                                  {fix.expectedOutcome === 'clean'
                                    ? '● Nominal'
                                    : fix.expectedOutcome === 'warnings-unsupported'
                                      ? '▲ Partial'
                                      : '✖ Safety Halt'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Live Netlist Telemetry Preview of Selected Fixture */}
                      <div className="border border-slate-800 bg-[#07090E] rounded-md p-3.5 space-y-3 font-mono text-xs">
                        <div>
                          <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">
                            Detected Component Nodes
                          </div>
                          <ul className="space-y-1 text-slate-200">
                            {activePreviewDetails.nodes.map((n, idx) => (
                              <li key={idx} className="truncate">
                                {n}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="border-t border-slate-800/90 pt-2.5">
                          <div className="text-[11px] uppercase tracking-wider text-slate-400 mb-1">
                            Primary Signal Routing
                          </div>
                          <ul className="space-y-1 text-cyan-300">
                            {activePreviewDetails.nets.map((net, idx) => (
                              <li key={idx} className="flex items-center justify-between gap-2">
                                <span className="truncate">
                                  {net.from} → {net.to}
                                </span>
                                <span className="text-slate-400 shrink-0">{net.signal}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 mt-4 border-t border-slate-800 space-y-3">
                      <div className="text-xs font-mono text-slate-300">
                        {activePreviewDetails.summaryNote}
                      </div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => handleLoadFixture(activePreviewFixture.id)}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-cyan-400 rounded-md hover:bg-cyan-300 transition-colors whitespace-nowrap shrink-0"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                          Inspect Full Conversion
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadRawFixture(activePreviewFixture)}
                          aria-label={`Download raw source file ${activePreviewFixture.fileName}`}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded-md hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
                        >
                          <Download className="w-3.5 h-3.5" aria-hidden="true" />
                          Raw {activePreviewFixture.fileName}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Active Conversion Preview */}
            {conversionResult && (
              <ConversionPreviewPanel
                result={conversionResult}
                onReset={() => setConversionResult(null)}
                onRoundTripConvert={handleRoundTripConvert}
              />
            )}

            {/* All 5 Verified Reference Circuit Cards */}
            <section aria-labelledby="fixtures-heading" className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                <div>
                  <h2
                    id="fixtures-heading"
                    className="text-lg font-display font-bold text-slate-950"
                  >
                    Verified Reference Circuits & Diagnostic Test Fixtures
                  </h2>
                  <p className="text-xs text-slate-600">
                    Inspect real <code className="font-mono">.fzz</code> ZIP archives and{' '}
                    <code className="font-mono">diagram.json</code> projects immediately, or
                    download the raw source files to test local upload and desktop tooling.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {SAMPLE_FIXTURES.map((fixture) => (
                  <div
                    key={fixture.id}
                    className="border border-slate-200 bg-white rounded-lg p-5 flex flex-col justify-between gap-4 hover:border-slate-300 transition-colors"
                  >
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono text-slate-500">
                        <span>{fixture.fileName}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={
                            fixture.expectedOutcome === 'clean'
                              ? 'text-emerald-700 font-medium'
                              : fixture.expectedOutcome === 'warnings-unsupported'
                                ? 'text-amber-700 font-medium'
                                : 'text-rose-700 font-medium'
                          }
                        >
                          {fixture.expectedOutcome === 'clean'
                            ? '● Verified Clean'
                            : fixture.expectedOutcome === 'warnings-unsupported'
                              ? '▲ Partial / Unsupported Demo'
                              : '✖ Safety Gate Rejection Demo'}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">{fixture.title}</h3>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {fixture.description}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleLoadFixture(fixture.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Play className="w-3.5 h-3.5" aria-hidden="true" />
                        Inspect Conversion
                        <ArrowRight className="w-3 h-3" aria-hidden="true" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownloadRawFixture(fixture)}
                        aria-label={`Download raw source file ${fixture.fileName}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors whitespace-nowrap shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        Source File
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeSection === 'registry' && (
          <PartRegistryView
            onSelectFixture={(fixtureId) => {
              handleLoadFixture(fixtureId);
            }}
          />
        )}

        {activeSection === 'limitations' && <LimitationsAndGuideView mode="limitations" />}

        {activeSection === 'platformio-guide' && (
          <LimitationsAndGuideView mode="platformio-guide" />
        )}
      </main>

      {/* Quiet Engineering Footer */}
      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-[1280px] mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div>
            WireMorph — Open-Source Fritzing (.fzz) ↔ Wokwi (diagram.json) Circuit Converter
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveSection('registry')}
              className="hover:text-slate-900 transition-colors"
            >
              Supported Components
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setActiveSection('limitations')}
              className="hover:text-slate-900 transition-colors"
            >
              Known Limitations
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setActiveSection('platformio-guide')}
              className="hover:text-slate-900 transition-colors"
            >
              PlatformIO Workflow
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
